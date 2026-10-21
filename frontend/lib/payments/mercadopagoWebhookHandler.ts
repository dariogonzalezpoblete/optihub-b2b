// frontend/lib/payments/mercadopagoWebhookHandler.ts
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';
import { PoolClient } from 'pg';
import { withTransaction, executeQuery } from '../db/postgres';
import { deductStockForOrderAtomic } from '../inventory/inventoryService';
import { isValidUuid } from '../checkoutWebhookAndResult';

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
    details?: unknown;
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
 * Ensures the processed_webhooks audit table exists in PostgreSQL
 */
async function ensureAuditTableExists(client: PoolClient): Promise<void> {
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
  options?: { bypassSignature?: boolean; customClient?: PoolClient }
): Promise<WebhookProcessingResult> {
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
  if (!mpAccessToken) {
    console.error('[MP Webhook] MP_ACCESS_TOKEN is not configured on the server');
    return {
      statusCode: 500,
      body: { error: 'Internal Server Error: Missing Mercado Pago credentials.' },
    };
  }

  let paymentData: any;
  try {
    paymentData = await fetchMercadoPagoPayment(dataId, mpAccessToken);
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
    await ensureAuditTableExists(client);

    // 4.1 Check if this exact payment event was already recorded in processed_webhooks
    const auditCheck = await client.query(
      `SELECT id, status, action FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2`,
      [String(dataId), eventId]
    );

    if (auditCheck.rows.length > 0) {
      console.info(`[MP Webhook] Event ${eventId} for payment ${dataId} was already processed previously (audit log hit).`);
      return {
        statusCode: 200,
        body: {
          message: 'ACK. Webhook event already processed.',
          alreadyProcessed: true,
          orderId: externalReference,
          paymentId: String(dataId),
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
         VALUES ($1, $2, NULL, $3, 'order_not_found', $4, 'IGNORED')`,
        [eventId, String(dataId), type || 'payment', JSON.stringify(bodyPayload || paymentData)]
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

    // 4.4 Process Status Transitions
    if (paymentStatus === 'approved') {
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
           VALUES ($1, $2, $3, $4, 'cancelled_order_paid_incident', $5, 'PROCESSED')`,
          [eventId, String(dataId), order.id, type || 'payment', JSON.stringify(bodyPayload || paymentData)]
        );

        return {
          statusCode: 200,
          body: {
            message: 'ACK. Payment recorded for cancelled order; stock skipped, requires manual attention.',
            action: 'record_cancelled_order_paid_incident',
            orderId: order.id,
            paymentId: String(dataId),
            stockStatus: 'skipped',
          },
        };
      }

      // Guard B: Already processed order (Idempotency)
      if (order.stock_decremented === true || order.status === 'paid' || order.status === 'preparing') {
        await client.query(
          `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
           VALUES ($1, $2, $3, $4, 'already_processed_duplicate', $5, 'DUPLICATE')
           ON CONFLICT (payment_id, event_id) DO NOTHING`,
          [eventId, String(dataId), order.id, type || 'payment', JSON.stringify(bodyPayload || paymentData)]
        );

        return {
          statusCode: 200,
          body: {
            message: 'ACK. Order already paid and stock already decremented.',
            alreadyProcessed: true,
            orderId: order.id,
            paymentId: String(dataId),
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
          await deductStockForOrderAtomic(order.id, client);
          stockStatus = 'decremented';
        } catch (stockErr: unknown) {
          console.error(`[MP Webhook] Stock deduction failed for order ${order.id}:`, stockErr);
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

      // Record successful event in processed_webhooks audit table
      await client.query(
        `INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status)
         VALUES ($1, $2, $3, $4, 'approved', $5, 'PROCESSED')`,
        [eventId, String(dataId), order.id, type || 'payment', JSON.stringify(bodyPayload || paymentData)]
      );

      return {
        statusCode: 200,
        body: {
          message: 'ACK. Payment approved, order updated, stock decremented, audit recorded.',
          action: 'approved',
          orderId: order.id,
          paymentId: String(dataId),
          stockStatus,
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
      newOrderStatus = 'refunded';
    }

    if (order.payment_status !== 'approved') {
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
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSED')`,
      [eventId, String(dataId), order.id, type || 'payment', paymentStatus, JSON.stringify(bodyPayload || paymentData)]
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

  if (options?.customClient) {
    return runTransaction(options.customClient);
  }

  return withTransaction(runTransaction);
}
