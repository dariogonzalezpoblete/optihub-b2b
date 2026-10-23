// frontend/app/api/mercadopago/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';
import {
  evaluateWebhookPaymentTransition,
  isValidUuid,
  resolveCancelledOrderIncidentUpdateOutcome,
} from '@/lib/checkoutWebhookAndResult';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';

export async function POST(req: NextRequest) {
  try {
    const envGuard = checkBusinessMutationAllowed('mercadopago_webhook');
    if (!envGuard.allowed) {
      console.warn(`[Webhook] ${envGuard.reason}`);
      return NextResponse.json(
        {
          error: envGuard.reason,
          code: 'PREVIEW_MUTATION_BLOCKED',
          environment: envGuard.environment,
        },
        { status: 403 }
      );
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (!supabaseUrl || !supabaseServiceKey || !mpAccessToken || !mpWebhookSecret) {
      console.error('[Webhook] Missing required server configuration (Supabase or Mercado Pago secrets)');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // 1️⃣ Extract required headers & parameters (query params first, body fallback)
    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');

    let dataId = req.nextUrl.searchParams.get('data.id') || req.nextUrl.searchParams.get('id');
    let type = req.nextUrl.searchParams.get('type') || req.nextUrl.searchParams.get('topic');

    if (!dataId || !type) {
      try {
        const clonedBody = await req.clone().json();
        if (!dataId && clonedBody?.data?.id) {
          dataId = String(clonedBody.data.id);
        }
        if (!type && (clonedBody?.type || clonedBody?.topic)) {
          type = String(clonedBody.type || clonedBody.topic);
        }
      } catch {
        // Ignore JSON body parse errors when query params are used
      }
    }

    if (type && type !== 'payment') {
      return NextResponse.json({ message: 'ACK. Event ignored' }, { status: 200 });
    }

    if (!xSignature || !xRequestId || !dataId) {
      console.warn('[Webhook] Missing validation headers or data.id');
      return NextResponse.json({ error: 'Bad Request: Missing validation parameters' }, { status: 400 });
    }

    if (type !== 'payment') {
      return NextResponse.json({ message: 'ACK. Event ignored' }, { status: 200 });
    }

    // 2️⃣ Signature validation using official SDK
    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret: mpWebhookSecret
      });
    } catch (e) {
      console.error('[Webhook] Invalid signature', e);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3️⃣ Server‑to‑server fetch of the payment from Mercado Pago API
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const paymentClient = new Payment(client);
    let paymentData: {
      id?: string | number;
      status?: string;
      external_reference?: string | null;
      transaction_amount?: number | string | null;
      currency_id?: string | null;
    };
    try {
      paymentData = await paymentClient.get({ id: dataId });
    } catch (mpError: unknown) {
      const errMsg = mpError instanceof Error ? mpError.message : String(mpError);
      console.error(`[Webhook] Error retrieving payment ${dataId}:`, errMsg);
      return NextResponse.json({ error: 'Error communicating with Mercado Pago' }, { status: 502 });
    }

    // 4️⃣ Extract and validate external_reference before querying DB
    const externalReference = paymentData?.external_reference;
    if (!externalReference) {
      console.warn(`[Webhook] Payment ${paymentData?.id} missing external_reference`);
      return NextResponse.json({ message: 'ACK. No external_reference' }, { status: 200 });
    }
    if (!isValidUuid(externalReference)) {
      console.warn(`[Webhook] Invalid external_reference UUID: ${externalReference}`);
      return NextResponse.json({ message: 'ACK. Invalid external_reference' }, { status: 200 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, currency, status, payment_status, payment_id, stock_decremented, stock_error, notes')
      .eq('id', externalReference)
      .single();

    if (orderError || !order) {
      console.warn(`[Webhook] Order not found for external_reference ${externalReference}`);
      return NextResponse.json({ message: 'ACK. Order not found' }, { status: 200 });
    }

    // 5️⃣ Evaluate deterministic transition (validates currency, amount, cancelled-order guard, and non-approved states)
    const decision = evaluateWebhookPaymentTransition({
      order,
      payment: {
        id: paymentData.id ?? dataId,
        status: paymentData.status ?? '',
        external_reference: externalReference,
        transaction_amount: paymentData.transaction_amount,
        currency_id: paymentData.currency_id,
      },
    });

    if (decision.action === 'reject') {
      console.error(
        `[Webhook] Validation failed (${decision.reason}) for order ${order.id} and payment ${paymentData.id}`
      );
      return NextResponse.json({ error: decision.error }, { status: decision.httpStatus });
    }

    if (decision.action === 'ignore_ack') {
      console.info(`[Webhook] ${decision.message}`);
      return NextResponse.json(
        {
          message: decision.message,
          reason: decision.reason,
          ...(decision.rpcEquivalentResult ? { result: decision.rpcEquivalentResult } : {}),
        },
        { status: 200 }
      );
    }

    // 6️⃣ Defence-in-depth: Late approved payment on a cancelled order (protects even before Migration 011 is applied)
    if (decision.action === 'record_cancelled_order_paid_incident') {
      if (decision.alreadyProcessed || !decision.updateFields) {
        console.info(
          `[Webhook] Reintento de notificación para orden ${order.id} con incidencia de stock/conciliación pendiente de resolución.`,
          decision.rpcEquivalentResult
        );
        return NextResponse.json(
          {
            message: 'ACK. Order has a pending incident under review',
            result: decision.rpcEquivalentResult,
          },
          { status: 200 }
        );
      }

      const { data: updatedOrder, error: updateErr } = await supabaseAdmin
        .from('orders')
        .update(decision.updateFields)
        .eq('id', order.id)
        .eq('status', 'cancelled')
        .or(`payment_id.is.null,payment_id.eq.${decision.updateFields.payment_id}`)
        .select('id, status, payment_status, payment_id, stock_decremented, stock_error')
        .maybeSingle();

      let rereadOrder = null;
      let rereadError = null;
      if (!updateErr && !updatedOrder) {
        const reread = await supabaseAdmin
          .from('orders')
          .select('id, status, payment_status, payment_id, stock_decremented, stock_error')
          .eq('id', order.id)
          .maybeSingle();
        rereadOrder = reread.data;
        rereadError = reread.error;
      }

      const resolution = resolveCancelledOrderIncidentUpdateOutcome({
        orderId: order.id,
        paymentId: decision.updateFields.payment_id,
        updatedOrder,
        updateError: updateErr,
        rereadOrder,
        rereadError,
        rpcEquivalentResult: decision.rpcEquivalentResult,
      });

      if (resolution.httpStatus !== 200) {
        console.error('[Webhook] Error or unresolved race recording cancelled-order payment incident:', {
          orderId: order.id,
          paymentId: paymentData.id,
          updateErr,
          rereadError,
        });
        return NextResponse.json(resolution.responseBody, { status: resolution.httpStatus });
      }

      if (resolution.emitCriticalAlert) {
        console.warn(
          `[Webhook] [ALERTA OPERACIONAL CRÍTICA] Pago ${paymentData.id} aprobado recibido para la orden cancelada/reemplazada ${order.id}. Stock NO descontado. Orden guardada en 'requires_attention' para conciliación o reembolso.`,
          { orderId: order.id, paymentId: paymentData.id, result: resolution.responseBody.result }
        );
      } else {
        console.info(
          `[Webhook] Concurrent resolution for cancelled-order incident on order ${order.id} (payment ${paymentData.id}):`,
          resolution.responseBody
        );
      }

      return NextResponse.json(resolution.responseBody, { status: 200 });
    }

    // 7️⃣ Non-approved valid transitions (pending/in_process, rejected/cancelled, refunded/charged_back)
    if (decision.action === 'update_order_non_approved') {
      let query = supabaseAdmin
        .from('orders')
        .update(decision.updateFields)
        .eq('id', order.id);

      if (decision.reason === 'payment_pending' || decision.reason === 'payment_rejected') {
        query = query.neq('payment_status', 'approved');
      } else if (decision.reason === 'payment_refunded') {
        query = query.eq('payment_status', 'approved');
      }

      const { error: updateError } = await query;
      if (updateError) {
        console.error(`[Webhook] Error updating order ${order.id} for ${decision.reason}:`, updateError);
        return NextResponse.json({ error: 'Internal Server Error updating order state' }, { status: 502 });
      }

      console.info(`[Webhook] Updated order ${order.id} for ${decision.reason} (payment ${paymentData.id})`);
      return NextResponse.json({
        message: `ACK. Order updated (${decision.reason})`,
        reason: decision.reason
      }, { status: 200 });
    }

    // 8️⃣ Approved payment on active order -> Call transactional RPC process_approved_mp_payment
    interface ApprovedPaymentRpcResult {
      success?: boolean;
      code?: string;
      error?: string;
      [key: string]: unknown;
    }
    let rpcResult: ApprovedPaymentRpcResult | null = null;
    try {
      const { data, error } = await supabaseAdmin.rpc('process_approved_mp_payment', {
        p_order_id: externalReference,
        p_payment_id: String(paymentData.id)
      });
      rpcResult = (data ?? null) as ApprovedPaymentRpcResult | null;
      if (error) throw error;
    } catch (rpcError: unknown) {
      const errMsg = rpcError instanceof Error ? rpcError.message : String(rpcError);
      console.error('[Webhook] RPC error processing payment', errMsg);
      // Propagate as 5xx so Mercado Pago can retry
      return NextResponse.json({ error: 'Internal Server Error processing payment' }, { status: 502 });
    }

    // 9️⃣ Interpret RPC response
    if (rpcResult?.code === 'invalid_parameters') {
      console.error('[Webhook] Invalid parameters rejected by RPC:', rpcResult);
      return NextResponse.json({ error: 'Bad Request: Invalid payment parameters', result: rpcResult }, { status: 400 });
    }

    if (rpcResult?.code === 'cancelled_order_paid_requires_attention') {
      console.warn(
        `[Webhook] [ALERTA OPERACIONAL CRÍTICA] Pago ${paymentData.id} aprobado recibido para la orden cancelada/reemplazada ${order.id}. Stock NO descontado. Orden guardada en 'requires_attention' para conciliación o reembolso.`,
        { orderId: order.id, paymentId: paymentData.id, result: rpcResult }
      );
      return NextResponse.json({
        message: 'ACK. Payment recorded for cancelled order; stock skipped, requires manual attention/refund',
        result: rpcResult
      }, { status: 200 });
    }

    if (rpcResult?.code === 'stock_failed_requires_attention') {
      console.warn(
        `[Webhook] [ALERTA OPERACIONAL] Pago ${paymentData.id} aprobado para la orden ${order.id}, pero falló el descuento de inventario. Orden guardada en 'requires_attention'.`,
        { orderId: order.id, paymentId: paymentData.id, error: rpcResult.error }
      );
      return NextResponse.json({
        message: 'ACK. Payment recorded but stock reduction failed (requires manual attention)',
        result: rpcResult
      }, { status: 200 });
    }

    if (rpcResult?.code === 'incident_pending') {
      console.info(
        `[Webhook] Reintento de notificación para orden ${order.id} con incidencia de stock/conciliación pendiente de resolución.`,
        rpcResult
      );
      return NextResponse.json({
        message: 'ACK. Order has a pending incident under review',
        result: rpcResult
      }, { status: 200 });
    }

    const successCodes = ['processed', 'idempotent', 'payment_duplicate', 'payment_conflict', 'order_not_found', 'cancelled_order_paid_requires_attention'];
    if (rpcResult?.success || (rpcResult?.code && successCodes.includes(rpcResult.code))) {
      console.info(`[Webhook] RPC processed payment ${paymentData.id} for order ${order.id}`, rpcResult);
      return NextResponse.json({ message: 'ACK. Payment processed', result: rpcResult }, { status: 200 });
    } else {
      console.error('[Webhook] Unexpected RPC failure', rpcResult);
      return NextResponse.json({ error: 'Internal Server Error processing payment' }, { status: 502 });
    }
  } catch (error: unknown) {
    console.error('[Webhook] Unexpected internal error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
