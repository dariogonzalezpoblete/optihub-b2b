// frontend/lib/payments/mercadopagoWebhookHandler.ts
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';
import type { PoolClient } from 'pg';
import {
  withTransaction,
  isPoolConnectionError,
  isTransientConcurrencyError,
} from '../db/postgres';
import { deductStockForOrderAtomic } from '../inventory/inventoryService';
import { isValidUuid } from '../checkoutWebhookAndResult';
import {
  createOrderEmailOutboxRecord,
  dispatchOrderEmailOutbox,
} from './orderEmailOutboxService';
import type { sendOrderConfirmationEmails } from '../email';
import { checkBusinessMutationAllowed } from '../env/runtimeEnv';

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
async function fetchMercadoPagoPayment(paymentId: string, accessToken: string) {
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
 * Main idempotent processor for Mercado Pago Webhooks.
 *
 * Guarantees:
 * 1. Cryptographic signature verification.
 * 2. Idempotency check via processed_webhooks audit table.
 * 3. PostgreSQL transaction (BEGIN / COMMIT / ROLLBACK).
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
  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
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
      console.error('[MP Webhook] MP_WEBHOOK_SECRET is not configured on the server');
      return {
        statusCode: 500,
        body: { error: 'Internal Server Error: Missing webhook configuration.' },
      };
    }

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
    // If the order is already associated with a different payment_id, never overwrite payment_id,
    // never deduct stock a second time, and never enqueue another confirmation email.
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
      // Guard A0 (ALTO-01): Order is already in requires_attention (from a prior incident or stock failure).
      // Never fall through to Guard C ('paid'), never deduct stock, and never create an email outbox record.
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

      // Guard B: Already processed or terminal post-payment order (Idempotency & Terminal State Protection)
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
      // Update order to paid & approved
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

      // Decrement stock atomically if not yet decremented
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

          // MEDIO-02: Transient concurrency/locking errors (40P01, 40001, 55P03) or pool/connection
          // failures must NOT permanently degrade the order to requires_attention or commit processed_webhooks.
          // Rethrow to roll back the entire outer transaction so Mercado Pago retries the webhook.
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

      // Create email outbox record atomically within the transaction
      // ONLY if stock deduction did not fail and order was not moved to requires_attention
      let outboxCreated = false;
      if (stockStatus !== 'failed') {
        const outboxRes = await createOrderEmailOutboxRecord(client, order.id, String(dataId));
        outboxCreated = outboxRes.created;
      }

      // BAJO-02: Distinguish normal approval from approval with stock failure in audit log and response
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
  // Completely isolated from transaction: failures or network timeouts here
  // CANNOT revert the committed payment, inventory deduction, or outbox record.
  // BAJO-02: Only attempt immediate outbox dispatch when an outbox record was created or on
  // duplicate delivery of an already-paid order, and NEVER when stock deduction failed or an incident is pending.
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
