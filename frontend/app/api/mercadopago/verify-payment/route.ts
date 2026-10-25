import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMercadoPagoAccessToken } from '@/lib/mercadopago';
import { isValidUuid } from '@/lib/checkoutWebhookAndResult';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';
import {
  fetchMercadoPagoPayment,
  searchMercadoPagoPaymentByOrder,
  reconcilePaymentViaSupabaseAdmin,
  ensureOrderEmailOutboxViaSupabaseAdmin,
} from '@/lib/payments/mercadopagoWebhookHandler';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * POST /api/mercadopago/verify-payment
 *
 * Endpoint de verificación server-to-server invocado por /checkout/resultado
 * al regresar desde Mercado Pago (Sandbox o Producción).
 *
 * Seguridad y consistencia:
 * 1. NUNCA confía en el parámetro `status` de la URL para aprobar una orden.
 * 2. Si la orden ya consta aprobada en Supabase, devuelve su estado inmediatamente.
 * 3. Si la orden sigue pendiente y Mercado Pago retornó `payment_id`/`collection_id`
 *    (o si se busca por `external_reference = orderId`), consulta el pago directamente
 *    contra la API oficial de Mercado Pago (`GET /v1/payments/{id}`) con el Access Token
 *    del servidor (`MP_TEST_ACCESS_TOKEN` / `MP_ACCESS_TOKEN`).
 * 4. Valida que `payment.external_reference === orderId`, moneda CLP y monto exacto,
 *    y ejecuta la reconciliación idempotente en Supabase (`reconcilePaymentViaSupabaseAdmin`).
 */
export async function POST(req: NextRequest) {
  try {
    const mutationGuard = checkBusinessMutationAllowed('mercadopago_verify_payment');
    if (!mutationGuard.allowed) {
      if (mutationGuard.response) {
        return mutationGuard.response;
      }
      return NextResponse.json(
        {
          error: mutationGuard.reason || 'Operación no permitida en este entorno.',
          environment: mutationGuard.environment,
        },
        { status: 403 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuración de Supabase incompleta en el servidor.' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || body?.ref || body?.external_reference || '').trim();
    const rawPaymentId = String(body?.paymentId || body?.payment_id || body?.collectionId || body?.collection_id || '').trim();

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: 'Identificador de orden inválido (se requiere UUID válido).' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Leer estado actual de la orden en Supabase
    const { data: currentOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, payment_status, payment_id, total_amount, currency, stock_decremented, stock_error')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) {
      console.error('[MP Verify Payment] Error consultando orden en Supabase:', orderErr);
      return NextResponse.json(
        { error: 'No se pudo consultar el estado de la orden.' },
        { status: 502 }
      );
    }

    if (!currentOrder) {
      return NextResponse.json(
        { verified: false, order: null, reason: 'order_not_found' },
        { status: 404 }
      );
    }

    // 2. Si la orden ya está aprobada y en estado procesado activo, asegurar outbox de notificación y retornar de inmediato
    const currentPayStatus = String(currentOrder.payment_status || '').toLowerCase();
    const currentOrderStatus = String(currentOrder.status || '').toLowerCase();
    if (
      currentPayStatus === 'approved' &&
      ['paid', 'preparing', 'shipped', 'delivered', 'requires_attention'].includes(currentOrderStatus)
    ) {
      if (currentOrderStatus !== 'requires_attention' && currentOrder.payment_id) {
        await ensureOrderEmailOutboxViaSupabaseAdmin(
          supabaseAdmin,
          currentOrder.id,
          String(currentOrder.payment_id)
        );
      }
      return NextResponse.json({
        verified: true,
        alreadyProcessed: true,
        order: currentOrder,
      });
    }

    // 3. Consultar directamente a Mercado Pago API si tenemos token configurado
    const mpAccessToken = getMercadoPagoAccessToken();
    if (!mpAccessToken) {
      return NextResponse.json({
        verified: true,
        order: currentOrder,
        reason: 'missing_mp_token',
      });
    }

    const sanitizedPaymentId =
      rawPaymentId && rawPaymentId !== 'null' && rawPaymentId !== 'undefined' && /^\d+$/.test(rawPaymentId)
        ? rawPaymentId
        : '';

    let mpPayment = null;

    if (sanitizedPaymentId) {
      try {
        const fetched = await fetchMercadoPagoPayment(sanitizedPaymentId, mpAccessToken);
        // Verificar que el pago pertenezca efectivamente a esta orden
        if (fetched && String(fetched.external_reference || '').trim() === orderId) {
          mpPayment = fetched;
        } else if (fetched) {
          console.warn(
            `[MP Verify Payment] El payment_id ${sanitizedPaymentId} pertenece a external_reference=${fetched.external_reference}, no a orderId=${orderId}`
          );
        }
      } catch (fetchErr) {
        console.warn('[MP Verify Payment] No se pudo obtener pago por ID directo, intentando búsqueda por external_reference:', fetchErr);
      }
    }

    if (!mpPayment) {
      mpPayment = await searchMercadoPagoPaymentByOrder(orderId, mpAccessToken);
    }

    if (!mpPayment || !mpPayment.id) {
      return NextResponse.json({
        verified: true,
        order: currentOrder,
        reason: 'no_mp_payment_found_yet',
      });
    }

    // 4. Reconciliar estado de forma atómica e idempotente en Supabase
    const reconcileResult = await reconcilePaymentViaSupabaseAdmin({
      paymentData: mpPayment,
      eventId: `return-verify-${mpPayment.id}`,
      eventType: 'payment.return_verification',
    });

    // 5. Releer la orden actualizada desde Supabase para entregar el estado definitivo al frontend
    const { data: updatedOrder } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, status, payment_status, payment_id, total_amount, currency, stock_decremented, stock_error')
      .eq('id', orderId)
      .maybeSingle();

    return NextResponse.json({
      verified: true,
      order: updatedOrder || currentOrder,
      reconciliation: reconcileResult.body,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno verificando el pago';
    console.error('[MP Verify Payment] Error inesperado:', message);
    return NextResponse.json(
      { error: 'Error interno al verificar el estado del pago.' },
      { status: 500 }
    );
  }
}
