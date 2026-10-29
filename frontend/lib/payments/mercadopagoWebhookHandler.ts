// frontend/lib/payments/mercadopagoWebhookHandler.ts
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import {
  withTransaction,
  isPoolConnectionError,
  isTransientConcurrencyError,
} from '../db/postgres';
import { deductStockForOrderAtomic } from '../inventory/inventoryService';
import {
  isValidUuid,
  evaluateWebhookPaymentTransition,
} from '../checkoutWebhookAndResult';
import {
  createOrderEmailOutboxRecord,
  dispatchOrderEmailOutbox,
  sanitizeEmailError,
} from './orderEmailOutboxService';
import { sendOrderConfirmationEmails, type OrderEmailPayload, type OrderItemEmail, type BillingEmailData } from '../email';
import { checkBusinessMutationAllowed, getRuntimeEnvironment } from '../env/runtimeEnv';
import {
  getMercadoPagoAccessToken,
  isMercadoPagoSandboxMode,
} from '../mercadopago';

/**
 * Result structure of processing a webhook event
 */
export interface WebhookProcessingResult {
  statusCode: number;
  body: {
    message?: string;
    error?: string;
    action?: string;
    alreadyProcessed?: boolean;
    orderId?: string;
    paymentId?: string;
    stockStatus?: string;
    outboxCreated?: boolean;
    details?: unknown;
    code?: string;
    environment?: string;
  };
}

/**
 * Extracted webhook request parameters
 */
export interface WebhookRequestParams {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  type?: string | null;
  bodyPayload?: unknown;
}

/**
 * Fetches the payment data from Mercado Pago API with transient error retries
 */
export async function fetchMercadoPagoPayment(paymentId: string, accessToken: string) {
  const mpConfig = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });

  const paymentClient = new Payment(mpConfig);

  let attempts = 0;
  const maxAttempts = 2;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      return await paymentClient.get({ id: paymentId });
    } catch (err: unknown) {
      console.warn(`[MP Webhook] Fallo consultando pago ${paymentId} en MP (intento ${attempts}/${maxAttempts}):`, err);
      if (attempts >= maxAttempts) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, 400));
    }
  }
}

/**
 * Searches Mercado Pago API for the most relevant payment associated with an order's external_reference.
 */
export async function searchMercadoPagoPaymentByOrder(orderId: string, accessToken: string) {
  const mpConfig = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });

  const paymentClient = new Payment(mpConfig);
  const searchRes: any = await paymentClient.search({
    options: {
      external_reference: orderId,
    },
  });

  const results: any[] = Array.isArray(searchRes?.results) ? searchRes.results : [];
  if (results.length === 0) {
    return null;
  }

  // Prioritize approved payments first, then in_process/pending, then most recent
  const approved = results.find((p) => String(p?.status || '').toLowerCase() === 'approved');
  if (approved) return approved;

  const pending = results.find((p) =>
    ['pending', 'in_process', 'authorized', 'in_mediation'].includes(String(p?.status || '').toLowerCase())
  );
  if (pending) return pending;

  return results[results.length - 1];
}

/**
 * Utility for test/development fixtures to initialize the processed_webhooks table.
 * In production, schema DDL is managed exclusively via SQL migrations (supabase_migration_003 / 011)
 * and is never executed inside the transactional webhook hot-path (MEDIO-01).
 */
export async function ensureAuditTableExists(client: PoolClient): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS public.processed_webhooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      action TEXT,
      payload JSONB,
      status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSED', 'FAILED', 'IGNORED', 'DUPLICATE')),
      error_message TEXT,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_processed_webhooks_payment_event 
    ON public.processed_webhooks (payment_id, event_id);
  `;
  await client.query(ddl);
}

/**
 * Checks whether a direct PostgreSQL connection string is configured for pg.Pool.
 */
function hasDirectPostgresConnectionConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.PGHOST
  );
}

/**
 * Ensures an `order_email_outbox` record exists for an approved order and dispatches
 * the confirmation email via Resend using the Supabase Service Role client (when direct
 * pg.Pool is not configured).
 */
export async function ensureOrderEmailOutboxViaSupabaseAdmin(
  supabaseAdmin: any,
  orderId: string,
  paymentId: string
): Promise<{ outboxCreated: boolean; sent: boolean; simulated?: boolean }> {
  try {
    const { data: existingOutbox } = await supabaseAdmin
      .from('order_email_outbox')
      .select('id, status, attempts, payload, idempotency_key')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existingOutbox && existingOutbox.status === 'SENT') {
      return { outboxCreated: false, sent: true };
    }

    let outboxId = existingOutbox?.id;
    let payload: OrderEmailPayload | null = existingOutbox?.payload || null;
    let idempotencyKey = existingOutbox?.idempotency_key || `email_ord_${orderId}_mp_${paymentId}`;
    let outboxCreated = false;

    if (!existingOutbox) {
      const { data: fullOrder } = await supabaseAdmin
        .from('orders')
        .select(
          'id, subtotal_net, tax_amount, total_amount, currency, customer_name, customer_email, customer_phone, business_name, business_rut, billing_address, shipping_address, shipping_region, shipping_commune, notes'
        )
        .eq('id', orderId)
        .maybeSingle();

      if (!fullOrder) {
        return { outboxCreated: false, sent: false };
      }

      const { data: rawItems } = await supabaseAdmin
        .from('order_items')
        .select('product_id, sku, product_name, brand_name, unit_price_net, quantity, subtotal_net')
        .eq('order_id', orderId);

      const items: OrderItemEmail[] = (rawItems || []).map((item: any) => ({
        id_ext: item.product_id || item.sku || '',
        marca: item.brand_name || 'Armazón',
        modelo: item.product_name || item.sku || '',
        cantidad: Number(item.quantity || 1),
        precio_unitario_neto: Number(item.unit_price_net || 0),
        subtotal_neto: Number(item.subtotal_net || 0),
      }));

      const totalUnits = items.reduce((sum, i) => sum + i.cantidad, 0);
      const recipientEmail = (fullOrder.customer_email || 'contacto@optihub.cl').trim().toLowerCase();

      const billing: BillingEmailData = {
        razon_social: (fullOrder.business_name || fullOrder.customer_name || 'Óptica Cliente').trim(),
        rut: (fullOrder.business_rut || 'Sin RUT').trim(),
        giro: 'Comercialización de artículos ópticos',
        contacto_nombre: (fullOrder.customer_name || 'Encargado de Óptica').trim(),
        contacto_telefono: (fullOrder.customer_phone || '').trim(),
        contacto_email: recipientEmail,
        direccion: (fullOrder.billing_address || fullOrder.shipping_address || 'Dirección no especificada').trim(),
        comuna: (fullOrder.shipping_commune || '').trim(),
        region: (fullOrder.shipping_region || '').trim(),
        instrucciones_entrega: fullOrder.notes || undefined,
      };

      payload = {
        externalReference: fullOrder.id,
        paymentId: String(paymentId),
        items,
        billing,
        totals: {
          totalUnits,
          montoNeto: Math.round(Number(fullOrder.subtotal_net || 0)),
          montoIva: Math.round(Number(fullOrder.tax_amount || 0)),
          montoTotal: Math.round(Number(fullOrder.total_amount || 0)),
        },
      };

      const { data: insertedOutbox } = await supabaseAdmin
        .from('order_email_outbox')
        .upsert(
          {
            order_id: fullOrder.id,
            payment_id: String(paymentId),
            recipient_email: recipientEmail,
            status: 'PENDING',
            idempotency_key: idempotencyKey,
            payload,
            next_retry_at: new Date().toISOString(),
          },
          { onConflict: 'order_id', ignoreDuplicates: true }
        )
        .select('id')
        .maybeSingle();

      outboxId = insertedOutbox?.id;
      outboxCreated = Boolean(outboxId);
    }

    if (!payload) {
      return { outboxCreated, sent: false };
    }

    const sendRes = await sendOrderConfirmationEmails(payload, { idempotencyKey });
    const isSimulated = Boolean((sendRes as any)?.simulated);

    if (outboxId) {
      if (isSimulated) {
        await supabaseAdmin
          .from('order_email_outbox')
          .update({
            status: 'PENDING',
            claim_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outboxId);
      } else if (sendRes?.success) {
        await supabaseAdmin
          .from('order_email_outbox')
          .update({
            status: 'SENT',
            processed_at: new Date().toISOString(),
            attempts: Number(existingOutbox?.attempts || 0) + 1,
            last_error: null,
            claim_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outboxId);
      } else {
        await supabaseAdmin
          .from('order_email_outbox')
          .update({
            status: 'FAILED',
            attempts: Number(existingOutbox?.attempts || 0) + 1,
            last_error: sanitizeEmailError(sendRes?.error),
            claim_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outboxId);
      }
    }

    return {
      outboxCreated,
      sent: Boolean(sendRes?.success && !isSimulated),
      simulated: isSimulated,
    };
  } catch (err) {
    console.warn('[MP Supabase Reconcile] Error gestionando order_email_outbox:', err);
    return { outboxCreated: false, sent: false };
  }
}

/**
 * Processes and reconciles a verified Mercado Pago payment against Supabase using
 * the Supabase Service Role client and atomic RPCs (`process_approved_mp_payment`).
 * Used when direct pg.Pool DATABASE_URL is not configured and by `/api/mercadopago/verify-payment`.
 */
export async function reconcilePaymentViaSupabaseAdmin({
  paymentData,
  eventId,
  eventType = 'payment',
  bodyPayload,
}: {
  paymentData: any;
  eventId: string;
  eventType?: string;
  bodyPayload?: unknown;
}): Promise<WebhookProcessingResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: {
        error: 'Internal Server Error: Missing Supabase service role configuration.',
        code: 'MISSING_SUPABASE_CONFIG',
      },
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const dataId = String(paymentData?.id || '').trim();
  const externalReference = String(paymentData?.external_reference || '').trim();
  const paymentStatus = String(paymentData?.status || '').toLowerCase();
  const paymentAmount = Number(paymentData?.transaction_amount || 0);
  const paymentCurrency = String(paymentData?.currency_id || 'CLP').toUpperCase();

  if (!externalReference || !isValidUuid(externalReference)) {
    return {
      statusCode: 200,
      body: { message: 'ACK. Ignored due to missing or invalid external_reference UUID.' },
    };
  }

  // Helper to record webhook audit log non-fatally if processed_webhooks exists
  const recordWebhookAudit = async (
    orderIdVal: string | null,
    actionVal: string,
    statusVal: 'PROCESSED' | 'FAILED' | 'IGNORED' | 'DUPLICATE'
  ) => {
    try {
      await supabaseAdmin.from('processed_webhooks').upsert(
        {
          event_id: eventId,
          payment_id: dataId,
          order_id: orderIdVal,
          event_type: eventType,
          action: actionVal,
          payload: bodyPayload || paymentData,
          status: statusVal,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'payment_id,event_id', ignoreDuplicates: true }
      );
    } catch (auditErr) {
      console.warn('[MP Supabase Reconcile] No se pudo registrar en processed_webhooks:', auditErr);
    }
  };

  // 1. Check idempotency in processed_webhooks
  try {
    const { data: existingAudit } = await supabaseAdmin
      .from('processed_webhooks')
      .select('id, status, action')
      .eq('payment_id', dataId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingAudit) {
      return {
        statusCode: 200,
        body: {
          message: 'ACK. Webhook event already processed.',
          alreadyProcessed: true,
          action: existingAudit.action || 'already_processed_duplicate',
          orderId: externalReference,
          paymentId: dataId,
          stockStatus: existingAudit.action === 'approved_stock_failed' ? 'failed' : 'skipped',
          outboxCreated: false,
        },
      };
    }
  } catch {
    // Table might not exist yet in some environments; continue to order-level idempotency checks
  }

  // 2. Fetch order from Supabase
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, status, payment_status, payment_id, total_amount, currency, stock_decremented, stock_error, notes')
    .eq('id', externalReference)
    .maybeSingle();

  if (orderErr) {
    console.error('[MP Supabase Reconcile] Error fetching order:', orderErr);
    return {
      statusCode: 503,
      body: {
        error: 'Service Unavailable: Error querying order in Supabase.',
        code: 'SUPABASE_QUERY_ERROR',
      },
    };
  }

  if (!order) {
    await recordWebhookAudit(null, 'order_not_found', 'IGNORED');
    return {
      statusCode: 200,
      body: { message: 'ACK. Order not found.' },
    };
  }

  // 3. Currency and Amount validation
  if (paymentCurrency !== 'CLP') {
    return {
      statusCode: 400,
      body: { error: `Currency mismatch: expected CLP, received ${paymentCurrency}` },
    };
  }

  const orderTotal = Math.round(Number(order.total_amount));
  if (orderTotal > 0 && Math.abs(orderTotal - Math.round(paymentAmount)) > 10) {
    return {
      statusCode: 400,
      body: { error: `Amount mismatch: order total is ${orderTotal}, payment amount is ${paymentAmount}` },
    };
  }

  // 4. Evaluate deterministic transition
  const decision = evaluateWebhookPaymentTransition({
    order: {
      ...order,
      total_amount: orderTotal,
      currency: 'CLP',
    },
    payment: {
      id: dataId,
      status: paymentStatus,
      external_reference: externalReference,
      transaction_amount: orderTotal,
      currency_id: 'CLP',
    },
  });

  if (decision.action === 'reject') {
    return {
      statusCode: decision.httpStatus,
      body: { error: decision.error, code: decision.reason },
    };
  }

  if (decision.action === 'ignore_ack') {
    const isConflict = decision.reason === 'payment_conflict';
    await recordWebhookAudit(
      order.id,
      isConflict ? 'payment_conflict' : 'already_processed_duplicate',
      isConflict ? 'IGNORED' : 'DUPLICATE'
    );
    return {
      statusCode: 200,
      body: {
        message: decision.message,
        action: isConflict ? 'payment_conflict' : 'already_processed_duplicate',
        code: isConflict ? 'payment_conflict' : undefined,
        alreadyProcessed: true,
        orderId: order.id,
        paymentId: dataId,
        stockStatus: 'skipped',
        outboxCreated: false,
      },
    };
  }

  if (decision.action === 'record_cancelled_order_paid_incident') {
    if (!decision.alreadyProcessed && decision.updateFields) {
      await supabaseAdmin
        .from('orders')
        .update({
          ...decision.updateFields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
    }
    const actionName =
      decision.rpcEquivalentResult.code === 'incident_pending'
        ? 'incident_pending'
        : 'cancelled_order_paid_incident';
    await recordWebhookAudit(order.id, actionName, decision.alreadyProcessed ? 'DUPLICATE' : 'PROCESSED');
    return {
      statusCode: 200,
      body: {
        message: decision.rpcEquivalentResult.message,
        action:
          actionName === 'cancelled_order_paid_incident'
            ? 'record_cancelled_order_paid_incident'
            : 'incident_pending',
        alreadyProcessed: decision.alreadyProcessed,
        orderId: order.id,
        paymentId: dataId,
        stockStatus: decision.rpcEquivalentResult.stock_status,
        outboxCreated: false,
      },
    };
  }

  if (decision.action === 'call_approved_rpc') {
    // Invoke atomic PostgreSQL RPC process_approved_mp_payment
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_approved_mp_payment', {
      p_order_id: order.id,
      p_payment_id: dataId,
    });

    if (rpcErr) {
      const isMissingRpc =
        rpcErr.code === '42883' ||
        rpcErr.code === 'PGRST202' ||
        /process_approved_mp_payment/i.test(String(rpcErr.message || ''));

      if (!isMissingRpc) {
        console.error('[MP Supabase Reconcile] Error en RPC process_approved_mp_payment:', rpcErr);
        return {
          statusCode: 500,
          body: {
            error: 'Internal Server Error: Failed to process approved payment in Supabase.',
            code: 'WEBHOOK_TRANSACTION_ERROR',
          },
        };
      }

      // Fallback when migration 011 RPC is not present: update order & call decrement_stock_for_order
      let stockStatus: 'decremented' | 'failed' | 'skipped' = 'skipped';
      if (!order.stock_decremented) {
        const { error: stockErr } = await supabaseAdmin.rpc('decrement_stock_for_order', {
          p_order_id: order.id,
        });
        if (stockErr) {
          stockStatus = 'failed';
          await supabaseAdmin
            .from('orders')
            .update({
              payment_id: dataId,
              payment_status: 'approved',
              payment_provider: 'mercadopago',
              status: 'requires_attention',
              stock_decremented: false,
              stock_error: stockErr.message || 'Error al descontar inventario',
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);
        } else {
          stockStatus = 'decremented';
          await supabaseAdmin
            .from('orders')
            .update({
              payment_id: dataId,
              payment_status: 'approved',
              payment_provider: 'mercadopago',
              status: 'preparing',
              stock_decremented: true,
              stock_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);
        }
      }

      let outboxCreated = false;
      if (stockStatus !== 'failed') {
        const outboxRes = await ensureOrderEmailOutboxViaSupabaseAdmin(supabaseAdmin, order.id, dataId);
        outboxCreated = outboxRes.outboxCreated;
      }

      const auditAction = stockStatus === 'failed' ? 'approved_stock_failed' : 'approved';
      await recordWebhookAudit(order.id, auditAction, 'PROCESSED');

      return {
        statusCode: 200,
        body: {
          message:
            stockStatus === 'failed'
              ? 'ACK. Payment approved, but stock deduction failed; order moved to requires_attention.'
              : 'ACK. Payment approved, order updated, stock decremented, audit recorded.',
          action: auditAction,
          orderId: order.id,
          paymentId: dataId,
          stockStatus,
          outboxCreated,
        },
      };
    }

    // Ensure payment_provider is set to mercadopago
    await supabaseAdmin
      .from('orders')
      .update({ payment_provider: 'mercadopago' })
      .eq('id', order.id);

    const rpcCode = String(rpcRes?.code || 'processed');
    const stockStatus = String(rpcRes?.stock_status || (rpcCode === 'processed' ? 'decremented' : 'skipped'));
    const alreadyProcessed = Boolean(rpcRes?.already_processed);
    const auditAction = stockStatus === 'failed' ? 'approved_stock_failed' : 'approved';

    let outboxCreated = false;
    if (stockStatus !== 'failed') {
      const outboxRes = await ensureOrderEmailOutboxViaSupabaseAdmin(supabaseAdmin, order.id, dataId);
      outboxCreated = outboxRes.outboxCreated;
    }

    await recordWebhookAudit(order.id, auditAction, alreadyProcessed ? 'DUPLICATE' : 'PROCESSED');

    return {
      statusCode: 200,
      body: {
        message:
          stockStatus === 'failed'
            ? 'ACK. Payment approved, but stock deduction failed; order moved to requires_attention.'
            : 'ACK. Payment approved, order updated, stock decremented, audit recorded.',
        action: auditAction,
        alreadyProcessed,
        orderId: order.id,
        paymentId: dataId,
        stockStatus,
        outboxCreated,
      },
    };
  }

  // Non-approved transition (pending, in_process, rejected, cancelled, refunded)
  if (decision.action === 'update_order_non_approved') {
    await supabaseAdmin
      .from('orders')
      .update({
        ...decision.updateFields,
        payment_id: dataId,
        payment_provider: 'mercadopago',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
  }

  await recordWebhookAudit(order.id, paymentStatus, 'PROCESSED');

  return {
    statusCode: 200,
    body: {
      message: `ACK. Order updated for payment status "${paymentStatus}".`,
      action: paymentStatus,
      orderId: order.id,
      paymentId: dataId,
    },
  };
}

/**
 * Main idempotent processor for Mercado Pago Webhooks.
 *
 * Guarantees:
 * 1. Cryptographic signature verification.
 * 2. Idempotency check via processed_webhooks audit table.
 * 3. PostgreSQL transaction (BEGIN / COMMIT / ROLLBACK) or Supabase RPC atomic execution.
 * 4. Row-level locking on orders (SELECT ... FOR UPDATE).
 * 5. Atomic stock deduction and audit ledger recording without double deductions.
 */
export async function processMercadoPagoWebhookEvent(
  params: WebhookRequestParams,
  options?: {
    bypassSignature?: boolean;
    customClient?: PoolClient;
    customPaymentFetcher?: (paymentId: string) => Promise<any>;
    emailSender?: typeof sendOrderConfirmationEmails;
    allowInTest?: boolean;
  }
): Promise<WebhookProcessingResult> {
  // 0. Environment isolation guard: Preview deployments must not process mutations on shared DB
  const envGuard = checkBusinessMutationAllowed('mercadopago_webhook', options);
  if (!envGuard.allowed) {
    console.warn(`[MP Webhook] ${envGuard.reason}`);
    return {
      statusCode: 403,
      body: {
        error: envGuard.reason,
        code: 'PREVIEW_MUTATION_BLOCKED',
        environment: envGuard.environment,
      },
    };
  }

  const { xSignature, xRequestId, dataId, type, bodyPayload } = params;
  const mpAccessToken = getMercadoPagoAccessToken();
  const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;

  // 1. Basic event filtering
  if (type && type !== 'payment' && type !== 'payment.created' && type !== 'payment.updated') {
    return {
      statusCode: 200,
      body: { message: `ACK. Event "${type}" ignored (only payments processed).` },
    };
  }

  if (!dataId) {
    return {
      statusCode: 400,
      body: { error: 'Bad Request: Missing data.id for payment event.' },
    };
  }

  // 2. Cryptographic signature validation
  if (!options?.bypassSignature) {
    if (!xSignature || !xRequestId) {
      console.warn('[MP Webhook] Missing x-signature or x-request-id headers');
      return {
        statusCode: 401,
        body: { error: 'Unauthorized: Missing webhook signature headers.' },
      };
    }

    if (!mpWebhookSecret) {
      // If running in Sandbox (TEST- token) without MP_WEBHOOK_SECRET configured yet,
      // allow fallback to server-to-server verification via MP API (`fetchMercadoPagoPayment`).
      // El modo permisivo solo es válido si el entorno de ejecución es identificado de forma fiable como
      // local (development/test). En production, preview o entorno desconocido el secreto es obligatorio,
      // aunque MP_SANDBOX_MODE esté activo.
      const runtimeEnv = getRuntimeEnvironment();
      const unsignedSandboxAllowed =
        (runtimeEnv === 'development' || runtimeEnv === 'test') && isMercadoPagoSandboxMode(mpAccessToken);
      if (!unsignedSandboxAllowed) {
        console.error('[MP Webhook] MP_WEBHOOK_SECRET is not configured on the server');
        return {
          statusCode: 500,
          body: { error: 'Internal Server Error: Missing webhook configuration.' },
        };
      }
      console.warn('[MP Webhook] MP_WEBHOOK_SECRET ausente en modo Sandbox; verificando pago server-to-server contra API de Mercado Pago.');
    } else {
      try {
        WebhookSignatureValidator.validate({
          xSignature,
          xRequestId,
          dataId,
          secret: mpWebhookSecret,
        });
      } catch (sigError) {
        console.error('[MP Webhook] Invalid webhook signature:', sigError);
        return {
          statusCode: 401,
          body: { error: 'Unauthorized: Invalid webhook signature.' },
        };
      }
    }
  }

  // 3. Fetch verified payment data from Mercado Pago API
  if (!options?.customPaymentFetcher && !mpAccessToken) {
    console.error('[MP Webhook] MP_ACCESS_TOKEN is not configured on the server');
    return {
      statusCode: 500,
      body: { error: 'Internal Server Error: Missing Mercado Pago credentials.' },
    };
  }

  let paymentData: any;
  try {
    paymentData = options?.customPaymentFetcher
      ? await options.customPaymentFetcher(dataId)
      : await fetchMercadoPagoPayment(dataId, mpAccessToken!);
  } catch (fetchErr: unknown) {
    console.error(`[MP Webhook] Error fetching payment ${dataId} from Mercado Pago:`, fetchErr);
    // Return 502 so Mercado Pago will retry delivery
    return {
      statusCode: 502,
      body: { error: 'Bad Gateway: Error communicating with Mercado Pago API.' },
    };
  }

  const externalReference = paymentData?.external_reference;
  const paymentStatus = String(paymentData?.status || '').toLowerCase();
  const paymentAmount = Number(paymentData?.transaction_amount || 0);
  const paymentCurrency = String(paymentData?.currency_id || 'CLP').toUpperCase();
  const eventId = xRequestId || `evt_${dataId}_${paymentStatus}`;

  if (!externalReference || !isValidUuid(externalReference)) {
    console.warn(`[MP Webhook] Payment ${dataId} has missing or non-UUID external_reference: ${externalReference}`);
    return {
      statusCode: 200,
      body: { message: 'ACK. Ignored due to missing or invalid external_reference UUID.' },
    };
  }

  // If no customClient is injected and no direct PostgreSQL connection string (DATABASE_URL) is configured,
  // execute the transactional reconciliation through Supabase Admin + RPC (`process_approved_mp_payment`).
  if (!options?.customClient && !hasDirectPostgresConnectionConfigured()) {
    return reconcilePaymentViaSupabaseAdmin({
      paymentData,
      eventId,
      eventType: type || 'payment',
      bodyPayload,
    });
  }

  // 4. PostgreSQL Transactional Idempotent Processing
  const runTransaction = async (client: PoolClient): Promise<WebhookProcessingResult> => {
    // 4.1 Check if this exact payment event was already recorded in processed_webhooks
    const auditCheck = await client.query(
      `SELECT id, status, action FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2`,
      [String(dataId), eventId]
    );

    if (auditCheck.rows.length > 0) {
      const priorAudit = auditCheck.rows[0];
      console.info(`[MP Webhook] Event ${eventId} for payment ${dataId} was already processed previously (audit log hit).`);
      return {
        statusCode: 200,
        body: {
          message: 'ACK. Webhook event already processed.',
          alreadyProcessed: true,
          action: priorAudit.action || 'already_processed_duplicate',
          orderId: externalReference,
          paymentId: String(dataId),
          stockStatus: priorAudit.action === 'approved_stock_failed' ? 'failed' : 'skipped',
          outboxCreated: false,
        },
      };
    }

    // 4.2 Lock the order row pessimistically to prevent race conditions across parallel webhook deliveries
    const orderQuery = `
      SELECT id, status, payment_status, payment_id, total_amount, currency, stock_decremented, stock_error, notes
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `;
    const orderResult = await client.query(orderQuery, [externalReference]);

    if (orderResult.rows.length === 0) {
      console.warn(`[MP Webhook] Order ${externalReference} not found in database.`);
      // Record in audit table as IGNORED
      await client.query(
        `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (payment_id, event_id) DO NOTHING`,
        [
          eventId,
          String(dataId),
          null,
          type || 'payment',
          'order_not_found',
          JSON.stringify(bodyPayload || paymentData),
          'IGNORED',
        ]
      );
      return {
        statusCode: 200,
        body: { message: 'ACK. Order not found.' },
      };
    }

    const order = orderResult.rows[0];

    // 4.3 Currency and Amount Integrity Verification
    if (paymentCurrency !== 'CLP') {
      console.error(`[MP Webhook] Currency mismatch for order ${order.id}: expected CLP, received ${paymentCurrency}`);
      return {
        statusCode: 400,
        body: { error: `Currency mismatch: expected CLP, received ${paymentCurrency}` },
      };
    }

    const orderTotal = Math.round(Number(order.total_amount));
    if (orderTotal > 0 && Math.abs(orderTotal - Math.round(paymentAmount)) > 10) {
      console.error(
        `[MP Webhook] Amount mismatch for order ${order.id}: order total is ${orderTotal}, payment amount is ${paymentAmount}`
      );
      return {
        statusCode: 400,
        body: { error: `Amount mismatch: order total is ${orderTotal}, payment amount is ${paymentAmount}` },
      };
    }

    // 4.3b Payment ID Conflict Safeguard (ALTO-01):
    const existingPaymentId = order.payment_id ? String(order.payment_id).trim() : '';
    if (existingPaymentId !== '' && existingPaymentId !== String(dataId).trim()) {
      console.warn(
        `[MP Webhook] Payment ID conflict on order ${order.id}: existing payment_id=${existingPaymentId}, incoming dataId=${dataId}. Ignoring mutation.`
      );
      await client.query(
        `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (payment_id, event_id) DO NOTHING`,
        [
          eventId,
          String(dataId),
          order.id,
          type || 'payment',
          'payment_conflict',
          JSON.stringify(bodyPayload || paymentData),
          'IGNORED',
        ]
      );
      return {
        statusCode: 200,
        body: {
          message: `ACK. Order already associated with payment ${existingPaymentId}; conflicting payment ${dataId} recorded for audit.`,
          action: 'payment_conflict',
          code: 'payment_conflict',
          alreadyProcessed: true,
          orderId: order.id,
          paymentId: String(dataId),
          stockStatus: 'skipped',
          outboxCreated: false,
        },
      };
    }

    // 4.4 Process Status Transitions
    if (paymentStatus === 'approved') {
      // Guard A0 (ALTO-01): Order is already in requires_attention
      if (order.status === 'requires_attention') {
        const alreadyApproved = order.payment_status === 'approved';
        if (!alreadyApproved) {
          const incidentNote = `[INCIDENCIA]: Pago aprobado ${dataId} recibido sobre orden en estado requires_attention. Stock NO descontado. Requiere conciliación manual.`;
          const combinedNotes = order.notes ? `${order.notes}\n${incidentNote}` : incidentNote;

          await client.query(
            `UPDATE orders
             SET payment_id = $1,
                 payment_status = 'approved',
                 status = 'requires_attention',
                 stock_decremented = false,
                 notes = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [String(dataId), combinedNotes, order.id]
          );
        }

        await client.query(
          `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (payment_id, event_id) DO NOTHING`,
          [
            eventId,
            String(dataId),
            order.id,
            type || 'payment',
            'incident_pending',
            JSON.stringify(bodyPayload || paymentData),
            alreadyApproved ? 'DUPLICATE' : 'PROCESSED',
          ]
        );

        return {
          statusCode: 200,
          body: {
            message: 'ACK. Order is in requires_attention state; stock deduction and email outbox skipped.',
            action: 'incident_pending',
            alreadyProcessed: alreadyApproved,
            orderId: order.id,
            paymentId: String(dataId),
            stockStatus: order.stock_error ? 'failed' : 'skipped',
            outboxCreated: false,
          },
        };
      }

      // Guard A: Late approved payment on cancelled or replaced order
      if (order.status === 'cancelled') {
        const incidentNote = `[INCIDENCIA]: Pago aprobado ${dataId} recibido sobre orden cancelada/reemplazada. Stock NO descontado. Requiere conciliación manual o reembolso.`;
        const combinedNotes = order.notes ? `${order.notes}\n${incidentNote}` : incidentNote;

        await client.query(
          `UPDATE orders
           SET payment_id = $1,
               payment_status = 'approved',
               status = 'requires_attention',
               stock_decremented = false,
               stock_error = NULL,
               notes = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [String(dataId), combinedNotes, order.id]
        );

        await client.query(
          `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (payment_id, event_id) DO NOTHING`,
          [
            eventId,
            String(dataId),
            order.id,
            type || 'payment',
            'cancelled_order_paid_incident',
            JSON.stringify(bodyPayload || paymentData),
            'PROCESSED',
          ]
        );

        return {
          statusCode: 200,
          body: {
            message: 'ACK. Payment recorded for cancelled order; stock skipped, requires manual attention.',
            action: 'record_cancelled_order_paid_incident',
            orderId: order.id,
            paymentId: String(dataId),
            stockStatus: 'skipped',
            outboxCreated: false,
          },
        };
      }

      // Guard B: Already processed or terminal post-payment order
      if (
        order.stock_decremented === true ||
        order.payment_status === 'refunded' ||
        ['paid', 'preparing', 'shipped', 'delivered', 'refunded'].includes(order.status)
      ) {
        await client.query(
          `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (payment_id, event_id) DO NOTHING`,
          [
            eventId,
            String(dataId),
            order.id,
            type || 'payment',
            'already_processed_duplicate',
            JSON.stringify(bodyPayload || paymentData),
            'DUPLICATE',
          ]
        );

        return {
          statusCode: 200,
          body: {
            message: 'ACK. Order already processed or in terminal post-payment state.',
            action: 'already_processed_duplicate',
            alreadyProcessed: true,
            orderId: order.id,
            paymentId: String(dataId),
            stockStatus: 'skipped',
            outboxCreated: false,
          },
        };
      }

      // Guard C: Normal Approved Payment Transition
      await client.query(
        `UPDATE orders
         SET status = 'paid',
             payment_status = 'approved',
             payment_provider = 'mercadopago',
             payment_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [String(dataId), order.id]
      );

      let stockStatus = 'skipped';
      if (!order.stock_decremented) {
        try {
          await client.query('SAVEPOINT sp_webhook_stock_deduction');
          await deductStockForOrderAtomic(order.id, client);
          await client.query('RELEASE SAVEPOINT sp_webhook_stock_deduction');
          stockStatus = 'decremented';
        } catch (stockErr: unknown) {
          await client.query('ROLLBACK TO SAVEPOINT sp_webhook_stock_deduction');
          await client.query('RELEASE SAVEPOINT sp_webhook_stock_deduction');

          if (isTransientConcurrencyError(stockErr) || isPoolConnectionError(stockErr)) {
            throw stockErr;
          }

          console.error(`[MP Webhook] Deterministic stock deduction failure for order ${order.id}:`, stockErr);
          stockStatus = 'failed';
          const errMsg = stockErr instanceof Error ? stockErr.message : String(stockErr);
          await client.query(
            `UPDATE orders
             SET status = 'requires_attention',
                 stock_error = $1,
                 notes = COALESCE(notes || E'\n', '') || '[FALLO_STOCK]: ' || $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [errMsg, order.id]
          );
        }
      }

      let outboxCreated = false;
      if (stockStatus !== 'failed') {
        const outboxRes = await createOrderEmailOutboxRecord(client, order.id, String(dataId));
        outboxCreated = outboxRes.created;
      }

      const auditAction = stockStatus === 'failed' ? 'approved_stock_failed' : 'approved';
      const responseMessage =
        stockStatus === 'failed'
          ? 'ACK. Payment approved, but stock deduction failed; order moved to requires_attention.'
          : 'ACK. Payment approved, order updated, stock decremented, audit recorded.';

      await client.query(
        `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (payment_id, event_id) DO NOTHING`,
        [
          eventId,
          String(dataId),
          order.id,
          type || 'payment',
          auditAction,
          JSON.stringify(bodyPayload || paymentData),
          'PROCESSED',
        ]
      );

      return {
        statusCode: 200,
        body: {
          message: responseMessage,
          action: auditAction,
          orderId: order.id,
          paymentId: String(dataId),
          stockStatus,
          outboxCreated,
        },
      };
    }

    // 4.5 Non-approved transitions (pending, in_process, rejected, cancelled, refunded)
    let newPaymentStatus = 'pending';
    let newOrderStatus = order.status;

    if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
      newPaymentStatus = 'rejected';
    } else if (paymentStatus === 'refunded' || paymentStatus === 'charged_back') {
      newPaymentStatus = 'refunded';
      newOrderStatus = order.status === 'requires_attention' ? 'requires_attention' : 'refunded';
    }

    const isRefundTransition = newPaymentStatus === 'refunded';
    const canApplyNonApprovedUpdate =
      isRefundTransition ||
      (order.status === 'pending' &&
        order.payment_status !== 'approved' &&
        order.payment_status !== 'refunded');

    if (canApplyNonApprovedUpdate) {
      await client.query(
        `UPDATE orders
         SET payment_status = $1,
             payment_id = $2,
             status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [newPaymentStatus, String(dataId), newOrderStatus, order.id]
      );
    }

    await client.query(
      `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (payment_id, event_id) DO NOTHING`,
      [
        eventId,
        String(dataId),
        order.id,
        type || 'payment',
        paymentStatus,
        JSON.stringify(bodyPayload || paymentData),
        'PROCESSED',
      ]
    );

    return {
      statusCode: 200,
      body: {
        message: `ACK. Order updated for payment status "${paymentStatus}".`,
        action: paymentStatus,
        orderId: order.id,
        paymentId: String(dataId),
      },
    };
  };

  let result: WebhookProcessingResult;
  try {
    if (options?.customClient) {
      await options.customClient.query('BEGIN');
      try {
        result = await runTransaction(options.customClient);
        await options.customClient.query('COMMIT');
      } catch (txErr) {
        await options.customClient.query('ROLLBACK');
        throw txErr;
      }
    } else {
      result = await withTransaction(runTransaction);
    }
  } catch (txError: unknown) {
    console.error(`[MP Webhook] Transaction failed for payment ${dataId} (order ${externalReference}):`, txError);
    if (isPoolConnectionError(txError)) {
      return {
        statusCode: 503,
        body: {
          error: 'Service Unavailable: Database connection pool error. Retry later.',
          code: 'DATABASE_POOL_UNAVAILABLE',
        },
      };
    }
    if (isTransientConcurrencyError(txError)) {
      return {
        statusCode: 503,
        body: {
          error: 'Service Unavailable: Transient database concurrency conflict. Retry later.',
          code: 'TRANSIENT_CONCURRENCY_CONFLICT',
        },
      };
    }
    return {
      statusCode: 500,
      body: {
        error: 'Internal Server Error: Transactional webhook processing failed.',
        code: 'WEBHOOK_TRANSACTION_ERROR',
      },
    };
  }

  // 5. Post-commit immediate dispatch optimization (best effort, non-blocking)
  const shouldDispatchOutbox =
    result.statusCode === 200 &&
    Boolean(result.body?.orderId) &&
    result.body?.stockStatus !== 'failed' &&
    (result.body?.outboxCreated === true ||
      (result.body?.alreadyProcessed === true &&
        result.body?.action !== 'incident_pending' &&
        result.body?.action !== 'payment_conflict' &&
        result.body?.action !== 'approved_stock_failed'));

  if (shouldDispatchOutbox && result.body?.orderId) {
    try {
      await dispatchOrderEmailOutbox({
        orderId: result.body.orderId,
        customClient: options?.customClient,
        emailSender: options?.emailSender,
      });
    } catch (dispatchErr) {
      console.warn(
        `[MP Webhook] Immediate outbox dispatch failed for order ${result.body.orderId} (will be retried by outbox recovery process):`,
        dispatchErr
      );
    }
  }

  return result;
}
