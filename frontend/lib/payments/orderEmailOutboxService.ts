// frontend/lib/payments/orderEmailOutboxService.ts
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction, executeQuery } from '../db/postgres';
import { sendOrderConfirmationEmails } from '../email';
import type { OrderEmailPayload, OrderItemEmail, BillingEmailData } from '../email';

export interface EmailOutboxRow {
  id: string;
  order_id: string;
  payment_id: string;
  recipient_email: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  last_error: string | null;
  idempotency_key: string;
  payload: OrderEmailPayload;
  claim_token?: string | null;
  created_at: string;
  processed_at: string | null;
  updated_at: string;
}

export interface DispatchOutboxResult {
  processedCount: number;
  sentCount: number;
  failedCount: number;
  simulatedCount?: number;
  details: Array<{
    outboxId: string;
    orderId: string;
    status: 'SENT' | 'FAILED' | 'PENDING';
    attempts: number;
    error?: string;
    simulated?: boolean;
  }>;
}

/**
 * Utility for test fixtures and local development scripts only.
 * NEVER invoked in production hot-paths to prevent DDL lock contention (ACCESS EXCLUSIVE)
 * and schema permission conflicts. Schema evolution is managed via SQL migrations.
 */
export async function ensureEmailOutboxTableExists(client: PoolClient): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS public.order_email_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
      next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT,
      idempotency_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      claim_token UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uniq_order_email_outbox_order_id UNIQUE (order_id)
    );

    ALTER TABLE public.order_email_outbox ADD COLUMN IF NOT EXISTS claim_token UUID;

    CREATE INDEX IF NOT EXISTS idx_order_email_outbox_dispatch 
    ON public.order_email_outbox (status, next_retry_at) 
    WHERE status IN ('PENDING', 'FAILED');

    CREATE INDEX IF NOT EXISTS idx_order_email_outbox_order_id 
    ON public.order_email_outbox (order_id);

    CREATE INDEX IF NOT EXISTS idx_order_email_outbox_payment_id 
    ON public.order_email_outbox (payment_id);
  `;
  await client.query(ddl);
}

/**
 * Calculates exponential backoff in milliseconds based on attempt number
 */
export function calculateNextBackoffMs(attempt: number): number {
  const backoffs = [
    60 * 1000,        // Attempt 1: 1 min
    5 * 60 * 1000,    // Attempt 2: 5 min
    15 * 60 * 1000,   // Attempt 3: 15 min
    60 * 60 * 1000,   // Attempt 4: 1 hour
  ];
  return backoffs[attempt - 1] || 60 * 60 * 1000;
}

/**
 * Sanitizes technical error messages to prevent leakage of credentials or sensitive internals
 */
export function sanitizeEmailError(error: unknown): string {
  if (!error) return 'Unknown email provider error';
  let message = error instanceof Error ? error.message : String(error);

  // Strip tokens, API keys, passwords and bearer patterns
  message = message.replace(/(re_[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_API_KEY]');
  message = message.replace(/(Bearer\s+[a-zA-Z0-9_.-]+)/gi, 'Bearer [REDACTED]');
  message = message.replace(/(password|secret|token)=[^&\s;]+/gi, '$1=[REDACTED]');
  message = message.replace(/\s+/g, ' ').trim();

  return message.slice(0, 500);
}

/**
 * Builds the immutable snapshot from persisted order data and inserts it into order_email_outbox
 * within an existing PostgreSQL transaction.
 *
 * MUST run within the same transaction that updates order to 'paid' and decrements inventory.
 */
export async function createOrderEmailOutboxRecord(
  client: PoolClient,
  orderId: string,
  paymentId: string
): Promise<{ created: boolean; outboxId?: string; recipientEmail?: string }> {
  // 1. Fetch persisted order row
  const orderRes = await client.query(
    `SELECT id, subtotal_net, tax_amount, total_amount, currency,
            customer_name, customer_email, customer_phone,
            business_name, business_rut, billing_address,
            shipping_address, shipping_region, shipping_commune, notes
     FROM orders
     WHERE id = $1`,
    [orderId]
  );

  if (orderRes.rows.length === 0) {
    throw new Error(`[EmailOutbox] Order ${orderId} not found when creating email outbox record.`);
  }

  const order = orderRes.rows[0];

  // 2. Fetch persisted order items
  const itemsRes = await client.query(
    `SELECT product_id, sku, product_name, brand_name, unit_price_net, quantity, subtotal_net
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const rawItems = itemsRes.rows || [];
  const items: OrderItemEmail[] = rawItems.map((item: any) => ({
    id_ext: item.product_id || item.sku || '',
    marca: item.brand_name || 'Armazón',
    modelo: item.product_name || item.sku || '',
    cantidad: Number(item.quantity || 1),
    precio_unitario_neto: Number(item.unit_price_net || 0),
    subtotal_neto: Number(item.subtotal_net || 0),
  }));

  const totalUnits = items.reduce((sum, i) => sum + i.cantidad, 0);
  const recipientEmail = (order.customer_email || 'contacto@optihub.cl').trim().toLowerCase();

  const billing: BillingEmailData = {
    razon_social: (order.business_name || order.customer_name || 'Óptica Cliente').trim(),
    rut: (order.business_rut || 'Sin RUT').trim(),
    giro: 'Comercialización de artículos ópticos',
    contacto_nombre: (order.customer_name || 'Encargado de Óptica').trim(),
    contacto_telefono: (order.customer_phone || '').trim(),
    contacto_email: recipientEmail,
    direccion: (order.billing_address || order.shipping_address || 'Dirección no especificada').trim(),
    comuna: (order.shipping_commune || '').trim(),
    region: (order.shipping_region || '').trim(),
    instrucciones_entrega: order.notes || undefined,
  };

  const payload: OrderEmailPayload = {
    externalReference: order.id,
    paymentId: String(paymentId),
    items,
    billing,
    totals: {
      totalUnits,
      montoNeto: Math.round(Number(order.subtotal_net || 0)),
      montoIva: Math.round(Number(order.tax_amount || 0)),
      montoTotal: Math.round(Number(order.total_amount || 0)),
    },
  };

  const idempotencyKey = `email_ord_${order.id}_mp_${paymentId}`;

  // 3. Insert into order_email_outbox atomically
  const insertRes = await client.query(
    `INSERT INTO order_email_outbox (
       order_id,
       payment_id,
       recipient_email,
       status,
       idempotency_key,
       payload,
       next_retry_at
     ) VALUES ($1, $2, $3, 'PENDING', $4, $5, NOW())
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [order.id, String(paymentId), recipientEmail, idempotencyKey, JSON.stringify(payload)]
  );

  if (insertRes.rows.length === 0) {
    // Already created previously for this order (idempotency constraint)
    return { created: false, recipientEmail };
  }

  return {
    created: true,
    outboxId: insertRes.rows[0].id,
    recipientEmail,
  };
}

/**
 * Claims and dispatches pending or retrying outbox email notifications.
 *
 * Guarantees:
 * 1. Atomic row claiming via FOR UPDATE SKIP LOCKED (or lease claiming) to prevent concurrent duplicate sends.
 * 2. Provider acceptance required before marking SENT.
 * 3. Exponential backoff and maximum retry limits on failure.
 * 4. Completely isolated from payment state and inventory deduction.
 */
export async function dispatchOrderEmailOutbox(options?: {
  orderId?: string;
  limit?: number;
  customClient?: PoolClient;
  emailSender?: typeof sendOrderConfirmationEmails;
}): Promise<DispatchOutboxResult> {
  const maxLimit = Math.max(1, Math.min(options?.limit || 10, 50));
  const sender = options?.emailSender || sendOrderConfirmationEmails;

  // Helper executing a short, independent transaction.
  // If customClient is provided (e.g. tests or caller-managed), runs within that client.
  // In production runtime, uses withTransaction to acquire a connection, BEGIN, COMMIT, and release immediately.
  const executeShortTx = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    if (options?.customClient) {
      return fn(options.customClient);
    }
    return withTransaction(fn);
  };

  const result: DispatchOutboxResult = {
    processedCount: 0,
    sentCount: 0,
    failedCount: 0,
    simulatedCount: 0,
    details: [],
  };

  for (let i = 0; i < maxLimit; i++) {
    // -------------------------------------------------------------------------
    // PASO A: Reclamar la notificación atómicamente y persistir el lease
    // Se ejecuta dentro de una transacción breve y se confirma (COMMIT)
    // antes de realizar cualquier llamada externa por red.
    // -------------------------------------------------------------------------
    const claimToken = crypto.randomUUID();
    let claimedRow: {
      id: string;
      order_id: string;
      payment_id: string;
      recipient_email: string;
      attempts: number;
      max_attempts: number;
      payload: any;
      idempotency_key: string;
      claim_token: string;
    } | null = null;

    try {
      claimedRow = await executeShortTx(async (client) => {
        let claimQuery: string;
        let claimParams: any[];

        if (options?.orderId) {
          claimQuery = `
            UPDATE order_email_outbox
            SET status = 'PROCESSING',
                claim_token = $1,
                updated_at = NOW()
            WHERE id = (
              SELECT id FROM order_email_outbox
              WHERE (
                status = 'PENDING'
                OR (status = 'FAILED' AND attempts < max_attempts AND next_retry_at <= NOW())
                OR (status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes')
              )
              AND order_id = $2
              ORDER BY created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING id, order_id, payment_id, recipient_email, attempts, max_attempts, payload, idempotency_key, claim_token
          `;
          claimParams = [claimToken, options.orderId];
        } else {
          claimQuery = `
            UPDATE order_email_outbox
            SET status = 'PROCESSING',
                claim_token = $1,
                updated_at = NOW()
            WHERE id = (
              SELECT id FROM order_email_outbox
              WHERE (
                status = 'PENDING'
                OR (status = 'FAILED' AND attempts < max_attempts AND next_retry_at <= NOW())
                OR (status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes')
              )
              ORDER BY created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING id, order_id, payment_id, recipient_email, attempts, max_attempts, payload, idempotency_key, claim_token
          `;
          claimParams = [claimToken];
        }

        const claimRes = await client.query(claimQuery, claimParams);
        if (claimRes.rows.length === 0) {
          return null;
        }

        return claimRes.rows[0];
      });
    } catch (claimErr) {
      console.error('[Outbox Dispatch] Error claiming notification from outbox:', claimErr);
      break;
    }

    if (!claimedRow) {
      // No more eligible rows to dispatch
      break;
    }

    const outboxId = claimedRow.id;
    const currentAttempts = Number(claimedRow.attempts || 0);
    const maxAttempts = Number(claimedRow.max_attempts || 5);
    const payload: OrderEmailPayload =
      typeof claimedRow.payload === 'string' ? JSON.parse(claimedRow.payload) : claimedRow.payload;
    const idempotencyKey = claimedRow.idempotency_key;

    result.processedCount++;

    // -------------------------------------------------------------------------
    // PASO B: Enviar el correo fuera de cualquier transacción PostgreSQL
    // No se mantiene abierta ninguna transacción ni conexión de BD durante el HTTP.
    // -------------------------------------------------------------------------
    let sendSuccess = false;
    let isSimulated = false;
    let errorMsg: string | undefined = undefined;

    try {
      const sendResult = await sender(payload, { idempotencyKey });
      isSimulated = Boolean((sendResult as any)?.simulated);

      if (sendResult?.success) {
        sendSuccess = true;
      } else {
        sendSuccess = false;
        errorMsg = sendResult?.error || 'Provider rejected email sending request';
      }
    } catch (err: unknown) {
      sendSuccess = false;
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // -------------------------------------------------------------------------
    // PASO C: Persistir el resultado atómicamente en una nueva transacción breve
    // Se valida WHERE id = $1 AND claim_token = $2 para evitar que un proceso
    // cuyo lease expiró sobrescriba el estado de una ejecución más reciente.
    // -------------------------------------------------------------------------
    try {
      await executeShortTx(async (client) => {
        if (isSimulated) {
          // El emisor ejecutó en modo simulación (EMAIL_SIMULATION_MODE o ausencia de credencial).
          // 1. No establecer status = 'SENT'.
          // 2. No incrementar attempts.
          // 3. No actualizar processed_at.
          // 4. No registrar error ni aplicar backoff.
          // 5. Liberar el claim_token y restaurar status a 'PENDING' para futuro despacho real.
          const updateRes = await client.query(
            `UPDATE order_email_outbox
             SET status = 'PENDING',
                 claim_token = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND claim_token = $2
             RETURNING id`,
            [outboxId, claimToken]
          );

          if (updateRes.rows.length > 0) {
            result.simulatedCount = (result.simulatedCount || 0) + 1;
            result.details.push({
              outboxId,
              orderId: claimedRow!.order_id,
              status: 'PENDING',
              attempts: currentAttempts,
              simulated: true,
            });
          } else {
            console.warn(
              `[Outbox Dispatch] Lease expired or stolen for outbox item ${outboxId}. Simulation reset to PENDING not applied.`
            );
          }
        } else if (sendSuccess) {
          const updateRes = await client.query(
            `UPDATE order_email_outbox
             SET status = 'SENT',
                 processed_at = NOW(),
                 attempts = attempts + 1,
                 last_error = NULL,
                 claim_token = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND claim_token = $2
             RETURNING id`,
            [outboxId, claimToken]
          );

          if (updateRes.rows.length > 0) {
            result.sentCount++;
            result.details.push({
              outboxId,
              orderId: claimedRow!.order_id,
              status: 'SENT',
              attempts: currentAttempts + 1,
            });
          } else {
            console.warn(
              `[Outbox Dispatch] Lease expired or stolen for outbox item ${outboxId}. Result 'SENT' not applied.`
            );
          }
        } else {
          const nextAttempts = currentAttempts + 1;
          const sanitizedErr = sanitizeEmailError(errorMsg);
          const backoffMs = calculateNextBackoffMs(nextAttempts);
          const nextRetryDate = new Date(Date.now() + backoffMs).toISOString();

          const updateRes = await client.query(
            `UPDATE order_email_outbox
             SET status = 'FAILED',
                 attempts = attempts + 1,
                 next_retry_at = $1,
                 last_error = $2,
                 claim_token = NULL,
                 updated_at = NOW()
             WHERE id = $3 AND claim_token = $4
             RETURNING id`,
            [nextRetryDate, sanitizedErr, outboxId, claimToken]
          );

          if (updateRes.rows.length > 0) {
            result.failedCount++;
            result.details.push({
              outboxId,
              orderId: claimedRow!.order_id,
              status: 'FAILED',
              attempts: nextAttempts,
              error: sanitizedErr,
            });
          } else {
            console.warn(
              `[Outbox Dispatch] Lease expired or stolen for outbox item ${outboxId}. Result 'FAILED' not applied.`
            );
          }
        }
      });
    } catch (persistErr) {
      console.error(
        `[Outbox Dispatch] Error persisting dispatch outcome for outbox item ${outboxId}:`,
        persistErr
      );
      // En caso de fallo de persistencia tras éxito del proveedor, la notificación
      // conserva su lease en PROCESSING y su idempotency_key permitirá reintentar
      // de forma segura cuando el lease expire, sin generar afirmación falsa de éxito.
    }
  }

  return result;
}
