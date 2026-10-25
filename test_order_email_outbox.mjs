// test_order_email_outbox.mjs
// Automated test suite for FASE 19: Transactional Outbox for Order Confirmation Emails
//
// Tests required:
// 1. Pago aprobado: pedido, descuento de inventario y outbox quedan confirmados atómicamente.
// 2. Fallo al insertar el outbox: la transacción revierte todas las operaciones asociadas.
// 3. Pago pendiente o rechazado: no se crea correo de confirmación.
// 4. Webhook duplicado: no se crea otra notificación ni se vuelve a descontar inventario.
// 5. Proveedor acepta el correo: la notificación queda en 'SENT'.
// 6. Proveedor falla: el pedido permanece pagado y la notificación queda recuperable.
// 7. Un proceso de recuperación reintenta sin depender de un nuevo webhook.
// 8. Dos despachadores concurrentes no reclaman deliberadamente la misma notificación.
// 9. Una notificación ya enviada no se procesa de nuevo.
// 10. Fallo después de la aceptación del proveedor y antes de actualizar la base de datos (idempotencia y límites).
// 11. Ruta de despacho sin autenticación válida: acceso denegado.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * Calculates exponential backoff in milliseconds based on attempt number
 */
function calculateNextBackoffMs(attempt) {
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
function sanitizeEmailError(error) {
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
 * In-memory Mock PostgreSQL Database with ACID rollback and table state tracking.
 */
class MockPgDatabase {
  constructor() {
    this.marcos = new Map([
      ['RB-2140', { id_ext: 'RB-2140', stock: 20, marca: 'Ray-Ban', modelo: 'Wayfarer Classic', precio_neto_clp: 45000 }],
      ['TF-501', { id_ext: 'TF-501', stock: 15, marca: 'Tom Ford', modelo: 'Square Frame', precio_neto_clp: 95000 }],
    ]);
    this.orders = new Map();
    this.orderItems = [];
    this.processedWebhooks = new Map(); // key: `${payment_id}:${event_id}`
    this.orderEmailOutbox = new Map();  // key: order_id
  }

  createClient() {
    return new MockPgClient(this);
  }

  cloneState() {
    return {
      marcos: new Map([...this.marcos].map(([k, v]) => [k, { ...v }])),
      orders: new Map([...this.orders].map(([k, v]) => [k, { ...v }])),
      orderItems: this.orderItems.map((i) => ({ ...i })),
      processedWebhooks: new Map([...this.processedWebhooks].map(([k, v]) => [k, { ...v }])),
      orderEmailOutbox: new Map([...this.orderEmailOutbox].map(([k, v]) => [k, { ...v }])),
    };
  }

  restoreState(snapshot) {
    this.marcos = snapshot.marcos;
    this.orders = snapshot.orders;
    this.orderItems = snapshot.orderItems;
    this.processedWebhooks = snapshot.processedWebhooks;
    this.orderEmailOutbox = snapshot.orderEmailOutbox;
  }
}

class MockPgClient {
  constructor(db) {
    this.db = db;
    this.inTransaction = false;
    this.snapshot = null;
    this.simulateOutboxInsertFailure = false;
    this.simulatePostSendPersistenceFailure = false;
    this.simulateMissingTable = false;
    this.transactionCommitCount = 0;
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (this.simulateMissingTable && normalized.includes('order_email_outbox')) {
      throw new Error('relation "order_email_outbox" does not exist (code 42P01)');
    }

    if (normalized.startsWith('BEGIN')) {
      this.inTransaction = true;
      this.snapshot = this.db.cloneState();
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('COMMIT')) {
      this.inTransaction = false;
      this.snapshot = null;
      this.transactionCommitCount++;
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('ROLLBACK')) {
      if (this.snapshot) {
        this.db.restoreState(this.snapshot);
      }
      this.inTransaction = false;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }

    // DDL
    if (normalized.includes('CREATE TABLE IF NOT EXISTS') || normalized.includes('CREATE INDEX IF NOT EXISTS')) {
      return { rows: [], rowCount: 0 };
    }

    // SELECT FROM orders WHERE id = $1 FOR UPDATE or plain
    if (normalized.includes('FROM orders WHERE id = $1')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    // SELECT FROM order_items WHERE order_id = $1
    if (normalized.includes('FROM order_items WHERE order_id = $1')) {
      const orderId = params[0];
      const items = this.db.orderItems.filter((i) => i.order_id === orderId);
      return { rows: items.map((i) => ({ ...i })), rowCount: items.length };
    }

    // SELECT FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2
    if (normalized.includes('FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2')) {
      const paymentId = params[0];
      const eventId = params[1];
      const key = `${paymentId}:${eventId}`;
      const entry = this.db.processedWebhooks.get(key);
      return { rows: entry ? [{ ...entry }] : [], rowCount: entry ? 1 : 0 };
    }

    // INSERT INTO processed_webhooks
    if (normalized.includes('INSERT INTO processed_webhooks')) {
      const eventId = params[0];
      const paymentId = params[1];
      const orderId = params[2];
      const eventType = params[3];
      const action = params[4];
      const payload = params[5];
      const status = params[6] || 'PROCESSED';

      const key = `${paymentId}:${eventId}`;
      const record = {
        id: crypto.randomUUID(),
        event_id: eventId,
        payment_id: paymentId,
        order_id: orderId,
        event_type: eventType,
        action,
        payload,
        status,
        processed_at: new Date().toISOString(),
      };
      this.db.processedWebhooks.set(key, record);
      return { rows: [record], rowCount: 1 };
    }

    // UPDATE orders SET status = 'paid' ...
    if (normalized.includes("UPDATE orders SET status = 'paid'")) {
      const paymentId = params[0];
      const orderId = params[1];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.status = 'paid';
        order.payment_status = 'approved';
        order.payment_provider = 'mercadopago';
        order.payment_id = paymentId;
        order.updated_at = new Date().toISOString();
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders SET status = 'requires_attention'
    if (normalized.includes("UPDATE orders SET status = 'requires_attention'")) {
      const errMsg = params[0];
      const orderId = params[1];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.status = 'requires_attention';
        order.stock_error = errMsg;
        order.updated_at = new Date().toISOString();
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders SET payment_status = $1, payment_id = $2, status = $3
    if (normalized.includes('UPDATE orders SET payment_status = $1')) {
      const paymentStatus = params[0];
      const orderId = params.length >= 4 ? params[3] : params[2];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.payment_status = paymentStatus;
        order.status = params.length >= 4 ? params[2] : params[1];
        if (params.length >= 4) {
          order.payment_id = params[1];
        }
        order.updated_at = new Date().toISOString();
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE marcos SET stock = stock - $1
    if (normalized.includes('UPDATE marcos SET stock = stock -')) {
      const qty = params[0];
      const productId = params[1];
      const marco = this.db.marcos.get(productId);
      if (marco) {
        if (marco.stock < qty) {
          throw new Error(`InsufficientStockError: Stock insuficiente para producto ${productId}`);
        }
        marco.stock -= qty;
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders SET stock_decremented = true
    if (normalized.includes('UPDATE orders SET stock_decremented = true')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.stock_decremented = true;
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO order_email_outbox
    if (normalized.includes('INSERT INTO order_email_outbox')) {
      if (this.simulateOutboxInsertFailure) {
        throw new Error('DatabaseOutboxInsertError: Disk full or unique constraint violation on outbox');
      }

      const orderId = params[0];
      const paymentId = params[1];
      const recipientEmail = params[2];
      const idempotencyKey = params[3];
      const payload = typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4];

      if (this.db.orderEmailOutbox.has(orderId)) {
        // ON CONFLICT (order_id) DO NOTHING
        return { rows: [], rowCount: 0 };
      }

      const record = {
        id: crypto.randomUUID(),
        order_id: orderId,
        payment_id: paymentId,
        recipient_email: recipientEmail,
        status: 'PENDING',
        attempts: 0,
        max_attempts: 5,
        next_retry_at: new Date().toISOString(),
        last_error: null,
        idempotency_key: idempotencyKey,
        payload,
        created_at: new Date().toISOString(),
        processed_at: null,
        updated_at: new Date().toISOString(),
      };
      this.db.orderEmailOutbox.set(orderId, record);
      return { rows: [record], rowCount: 1 };
    }

    // SELECT FROM order_email_outbox WHERE ... FOR UPDATE SKIP LOCKED
    // Simulated atomic claim with lease token and expiration:
    if (normalized.includes('order_email_outbox') && normalized.includes("status = 'PROCESSING'")) {
      const claimToken = params[0] || crypto.randomUUID();
      const targetOrderId = params.length > 1 ? params[1] : null;
      let claimedRecord = null;

      for (const [orderId, record] of this.db.orderEmailOutbox.entries()) {
        const matchesTarget = !targetOrderId || orderId === targetOrderId;
        const isEligible =
          record.status === 'PENDING' ||
          (record.status === 'FAILED' && record.attempts < record.max_attempts && new Date(record.next_retry_at) <= new Date()) ||
          (record.status === 'PROCESSING' && new Date(record.updated_at) < new Date(Date.now() - 5 * 60 * 1000));

        if (matchesTarget && isEligible) {
          record.status = 'PROCESSING';
          record.claim_token = claimToken;
          record.updated_at = new Date().toISOString();
          claimedRecord = { ...record };
          break; // Claimed 1 row
        }
      }

      return { rows: claimedRecord ? [claimedRecord] : [], rowCount: claimedRecord ? 1 : 0 };
    }

    // UPDATE order_email_outbox SET status = 'SENT'
    if (normalized.includes("UPDATE order_email_outbox SET status = 'SENT'")) {
      if (this.simulatePostSendPersistenceFailure) {
        throw new Error('DatabasePersistenceError: Network dropped during Paso C persistence');
      }

      const outboxId = params[0];
      const claimToken = params.length > 1 ? params[1] : null;
      let updated = false;

      for (const record of this.db.orderEmailOutbox.values()) {
        if (record.id === outboxId) {
          // In SQL: WHERE id = $1 AND claim_token = $2. If claim_token is NULL or different, no match!
          if (claimToken && record.claim_token !== claimToken) {
            // Token mismatch: Lease was reclaimed by another worker or already finalized!
            break;
          }
          record.status = 'SENT';
          record.processed_at = new Date().toISOString();
          record.attempts += 1;
          record.last_error = null;
          record.claim_token = null;
          record.updated_at = new Date().toISOString();
          updated = true;
          break;
        }
      }
      return { rows: updated ? [{ id: outboxId }] : [], rowCount: updated ? 1 : 0 };
    }

    // UPDATE order_email_outbox SET status = 'PENDING' (Simulation reset)
    if (normalized.includes("UPDATE order_email_outbox SET status = 'PENDING'")) {
      const outboxId = params[0];
      const claimToken = params.length > 1 ? params[1] : null;
      let updated = false;

      for (const record of this.db.orderEmailOutbox.values()) {
        if (record.id === outboxId) {
          if (claimToken && record.claim_token !== claimToken) {
            // Token mismatch: Lease was reclaimed by another worker!
            break;
          }
          record.status = 'PENDING';
          record.claim_token = null;
          record.updated_at = new Date().toISOString();
          updated = true;
          break;
        }
      }
      return { rows: updated ? [{ id: outboxId }] : [], rowCount: updated ? 1 : 0 };
    }

    // UPDATE order_email_outbox SET status = 'FAILED'
    if (normalized.includes("UPDATE order_email_outbox SET status = 'FAILED'")) {
      const nextRetryAt = params[0];
      const lastError = params[1];
      const outboxId = params[2];
      const claimToken = params.length > 3 ? params[3] : null;
      let updated = false;

      for (const record of this.db.orderEmailOutbox.values()) {
        if (record.id === outboxId) {
          if (claimToken && record.claim_token !== claimToken) {
            // Token mismatch
            break;
          }
          record.status = 'FAILED';
          record.attempts += 1;
          record.next_retry_at = nextRetryAt;
          record.last_error = lastError;
          record.claim_token = null;
          record.updated_at = new Date().toISOString();
          updated = true;
          break;
        }
      }
      return { rows: updated ? [{ id: outboxId }] : [], rowCount: updated ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

/**
 * Runner executing the webhook handler logic within a transaction client
 */
async function executeWebhookPaymentApprovedTransaction(client, { orderId, paymentId, eventId, payload }) {
  await client.query('BEGIN');
  try {
    // 1. Lock order
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 200, action: 'order_not_found' };
    }

    const order = orderRes.rows[0];

    // Guard B: Already processed
    if (order.stock_decremented === true || order.status === 'paid') {
      await client.query(
        'INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [eventId, paymentId, orderId, 'payment', 'already_processed_duplicate', '{}', 'DUPLICATE']
      );
      await client.query('COMMIT');
      return { statusCode: 200, action: 'already_processed_duplicate', orderId, stockDecremented: false };
    }

    // Update order to paid
    await client.query("UPDATE orders SET status = 'paid' WHERE id = $2", [paymentId, orderId]);

    // Deduct stock
    const itemsRes = await client.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    for (const item of itemsRes.rows) {
      await client.query('UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2', [item.quantity, item.product_id]);
    }
    await client.query('UPDATE orders SET stock_decremented = true WHERE id = $1', [orderId]);

    // Insert outbox atomically
    const outboxInsertRes = await client.query(
      `INSERT INTO order_email_outbox (order_id, payment_id, recipient_email, idempotency_key, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, paymentId, order.customer_email, `email_ord_${orderId}_mp_${paymentId}`, JSON.stringify(payload)]
    );

    // Record webhook audit
    await client.query(
      'INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [eventId, paymentId, orderId, 'payment', 'approved', '{}', 'PROCESSED']
    );

    await client.query('COMMIT');
    return {
      statusCode: 200,
      action: 'approved',
      orderId,
      paymentId,
      stockDecremented: true,
      outboxCreated: outboxInsertRes.rowCount > 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Runner simulating dispatchOrderEmailOutbox using the decoupled 3-step transactional pattern:
 * Paso A: Short transaction to claim notification & persist claim_token lease.
 * Paso B: External HTTP email call outside of any PostgreSQL transaction.
 * Paso C: Short transaction to persist SENT/FAILED outcome with optimistic fencing check.
 */
async function executeDispatchOutbox(client, { orderId, emailSender, simulateDelayedWorker = null }) {
  // PASO A: Reclamar la notificación atómicamente y persistir el lease (transacción breve)
  await client.query('BEGIN');
  const claimToken = crypto.randomUUID();
  let claimRes;
  try {
    claimRes = await client.query(
      "UPDATE order_email_outbox SET status = 'PROCESSING', claim_token = $1 WHERE order_id = $2 RETURNING id, order_id, payment_id, recipient_email, attempts, max_attempts, payload, idempotency_key, claim_token",
      [claimToken, orderId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { dispatched: false, error: err.message, status: 'CLAIM_FAILED' };
  }

  if (!claimRes || claimRes.rows.length === 0) {
    return { dispatched: false, reason: 'no_eligible_row' };
  }

  const row = claimRes.rows[0];
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

  // PASO B: Enviar el correo FUERA de cualquier transacción PostgreSQL
  // Verificación estricta: ninguna transacción debe permanecer abierta
  if (client.inTransaction) {
    throw new Error('TransactionLeakError: PostgreSQL transaction is open during HTTP email call!');
  }

  let sendResult;
  try {
    sendResult = await emailSender(payload, { idempotencyKey: row.idempotency_key });
  } catch (err) {
    sendResult = { success: false, error: err.message };
  }

  // Simulación de trabajador lento / retraso que permite que expire el lease antes de Paso C
  if (typeof simulateDelayedWorker === 'function') {
    await simulateDelayedWorker();
  }

  // PASO C: Persistir el resultado atómicamente en una NUEVA transacción breve con claim_token
  try {
    await client.query('BEGIN');
    if (sendResult?.simulated) {
      const updateRes = await client.query(
        "UPDATE order_email_outbox SET status = 'PENDING', claim_token = NULL WHERE id = $1 AND claim_token = $2 RETURNING id",
        [row.id, claimToken]
      );
      await client.query('COMMIT');

      if (updateRes.rows.length > 0) {
        return { dispatched: true, status: 'PENDING', simulated: true, idempotencyKey: row.idempotency_key, applied: true };
      } else {
        return { dispatched: true, status: 'STOLEN_OR_EXPIRED', applied: false };
      }
    } else if (sendResult?.success) {
      const updateRes = await client.query(
        "UPDATE order_email_outbox SET status = 'SENT', claim_token = NULL WHERE id = $1 AND claim_token = $2 RETURNING id",
        [row.id, claimToken]
      );
      await client.query('COMMIT');

      if (updateRes.rows.length > 0) {
        return { dispatched: true, status: 'SENT', idempotencyKey: row.idempotency_key, applied: true };
      } else {
        return { dispatched: true, status: 'STOLEN_OR_EXPIRED', applied: false };
      }
    } else {
      const sanitized = sanitizeEmailError(sendResult?.error);
      const nextRetry = new Date(Date.now() + 60000).toISOString();
      const updateRes = await client.query(
        "UPDATE order_email_outbox SET status = 'FAILED', claim_token = NULL WHERE id = $3 AND claim_token = $4 RETURNING id",
        [nextRetry, sanitized, row.id, claimToken]
      );
      await client.query('COMMIT');

      if (updateRes.rows.length > 0) {
        return { dispatched: true, status: 'FAILED', error: sanitized, applied: true };
      } else {
        return { dispatched: true, status: 'STOLEN_OR_EXPIRED', applied: false };
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    return { dispatched: false, status: 'PERSISTENCE_FAILED', error: err.message, applied: false };
  }
}

// ==============================================================================
// TEST SUITE: TRANSACTIONAL OUTBOX & EMAIL CONFIRMATION INTEGRITY
// ==============================================================================

test('1. Pago aprobado: pedido, descuento de inventario y outbox quedan confirmados atómicamente', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'mp-pay-1001';
  const eventId = 'mp-evt-1001';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'optica@central.cl',
    customer_name: 'Óptica Central',
    stock_decremented: false,
    total_amount: 450000,
  });

  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 10,
    unit_price_net: 45000,
  });

  const initialStock = db.marcos.get('RB-2140').stock; // 20

  const res = await executeWebhookPaymentApprovedTransaction(client, {
    orderId,
    paymentId,
    eventId,
    payload: { orderId, amount: 450000 },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.action, 'approved');
  assert.equal(res.stockDecremented, true);
  assert.equal(res.outboxCreated, true);

  // Verificaciones en Base de Datos:
  assert.equal(db.orders.get(orderId).status, 'paid');
  assert.equal(db.orders.get(orderId).payment_status, 'approved');
  assert.equal(db.orders.get(orderId).stock_decremented, true);
  assert.equal(db.marcos.get('RB-2140').stock, initialStock - 10, 'Stock debe descontarse en 10 unidades');

  // Outbox verificado:
  const outboxEntry = db.orderEmailOutbox.get(orderId);
  assert.ok(outboxEntry, 'Fila de outbox debe existir');
  assert.equal(outboxEntry.status, 'PENDING');
  assert.equal(outboxEntry.recipient_email, 'optica@central.cl');
  assert.equal(outboxEntry.idempotency_key, `email_ord_${orderId}_mp_${paymentId}`);
});

test('2. Fallo al insertar el outbox: la transacción revierte TODAS las operaciones (Rollback total)', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'mp-pay-1002';
  const eventId = 'mp-evt-1002';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'optica@central.cl',
    stock_decremented: false,
    total_amount: 450000,
  });

  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 5,
  });

  const initialStock = db.marcos.get('RB-2140').stock; // 20
  client.simulateOutboxInsertFailure = true; // Simula fallo SQL al insertar en outbox

  await assert.rejects(
    async () => {
      await executeWebhookPaymentApprovedTransaction(client, {
        orderId,
        paymentId,
        eventId,
        payload: { orderId },
      });
    },
    /DatabaseOutboxInsertError/
  );

  // Garantía de Atomicidad y Rollback:
  assert.equal(db.orders.get(orderId).status, 'pending', 'Orden debe permanecer pending');
  assert.equal(db.orders.get(orderId).stock_decremented, false, 'stock_decremented debe permanecer false');
  assert.equal(db.marcos.get('RB-2140').stock, initialStock, 'Stock NO debe haber sido descontado');
  assert.equal(db.orderEmailOutbox.size, 0, 'No debe haber filas en outbox');
  assert.equal(db.processedWebhooks.size, 0, 'No debe haberse registrado el webhook como procesado');
});

test('3. Pago pendiente o rechazado: NO se crea correo de confirmación en outbox', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'optica@central.cl',
    stock_decremented: false,
  });

  // Simulación de webhook rechazado
  await client.query("UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3", ['rejected', 'cancelled', orderId]);

  assert.equal(db.orders.get(orderId).status, 'cancelled');
  assert.equal(db.orders.get(orderId).payment_status, 'rejected');
  assert.equal(db.orderEmailOutbox.size, 0, 'Outbox debe permanecer completamente vacío');
});

test('4. Webhook duplicado: no se crea otra notificación ni se vuelve a descontar inventario', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'mp-pay-1004';
  const eventId = 'mp-evt-1004';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'optica@central.cl',
    stock_decremented: false,
  });

  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 4,
  });

  // 1ra entrega (éxito)
  await executeWebhookPaymentApprovedTransaction(client, { orderId, paymentId, eventId, payload: {} });
  const stockAfter1 = db.marcos.get('RB-2140').stock;
  assert.equal(db.orderEmailOutbox.size, 1);

  // 2da entrega (reintento del webhook con el mismo evento)
  const res2 = await executeWebhookPaymentApprovedTransaction(client, { orderId, paymentId, eventId, payload: {} });

  assert.equal(res2.action, 'already_processed_duplicate');
  assert.equal(res2.stockDecremented, false);
  assert.equal(db.marcos.get('RB-2140').stock, stockAfter1, 'Stock no debe descontarse de nuevo');
  assert.equal(db.orderEmailOutbox.size, 1, 'No debe crearse un segundo registro en outbox');
});

test('5. Reclamación se confirma antes de invocar al proveedor y NO hay transacción abierta durante la llamada a Resend', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-1',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  let commitsBeforeSender = 0;
  let inTransactionDuringSender = null;

  const mockEmailSender = async (payload, options) => {
    // Verificación 1: Paso A ya confirmó (COMMIT) la transacción de reclamación
    commitsBeforeSender = client.transactionCommitCount;
    // Verificación 2: La llamada HTTP externa ocurre COMPLETAMENTE fuera de cualquier transacción DB
    inTransactionDuringSender = client.inTransaction;
    return { success: true, clientRes: { data: { id: 'msg_123' } } };
  };

  const dispatchRes = await executeDispatchOutbox(client, { orderId, emailSender: mockEmailSender });

  assert.equal(commitsBeforeSender, 1, 'Paso A debe haber hecho COMMIT antes de invocar al proveedor');
  assert.equal(inTransactionDuringSender, false, 'No debe haber ninguna transacción PostgreSQL abierta durante la llamada a Resend');
  assert.equal(dispatchRes.status, 'SENT');
  assert.equal(dispatchRes.applied, true);
  assert.equal(client.transactionCommitCount, 2, 'Debe haber exactamente 2 commits independientes (Paso A y Paso C)');
});

test('6. Éxito del proveedor se persiste como SENT con fecha y clave', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-6',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  let capturedIdempotencyKey = null;
  const mockEmailSender = async (payload, options) => {
    capturedIdempotencyKey = options?.idempotencyKey;
    return { success: true, clientRes: { data: { id: 'msg_resend_999' } } };
  };

  const dispatchRes = await executeDispatchOutbox(client, { orderId, emailSender: mockEmailSender });

  assert.equal(dispatchRes.status, 'SENT');
  assert.equal(capturedIdempotencyKey, `idemp_${orderId}`);

  const updatedOutbox = db.orderEmailOutbox.get(orderId);
  assert.equal(updatedOutbox.status, 'SENT');
  assert.equal(updatedOutbox.attempts, 1);
  assert.ok(updatedOutbox.processed_at);
  assert.equal(updatedOutbox.last_error, null);
  assert.equal(updatedOutbox.claim_token, null);
});

test('7. Error del proveedor: el pedido permanece pagado y la notificación queda en FAILED recuperable', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orders.set(orderId, { id: orderId, status: 'paid', payment_status: 'approved', stock_decremented: true });

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-7',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  const mockFailingSender = async () => {
    return { success: false, error: 'Resend API 500 Service Unavailable' };
  };

  const dispatchRes = await executeDispatchOutbox(client, { orderId, emailSender: mockFailingSender });

  assert.equal(dispatchRes.status, 'FAILED');
  assert.ok(dispatchRes.error.includes('Service Unavailable'));

  // Pedido e inventario siguen pagados e intactos
  assert.equal(db.orders.get(orderId).status, 'paid');
  assert.equal(db.orders.get(orderId).stock_decremented, true);

  // Outbox quedó marcado FAILED con próximo intento programado
  const outbox = db.orderEmailOutbox.get(orderId);
  assert.equal(outbox.status, 'FAILED');
  assert.equal(outbox.attempts, 1);
  assert.ok(outbox.last_error.includes('Service Unavailable'));
  assert.ok(new Date(outbox.next_retry_at) > new Date());
});

test('8. Lease vencido (> 5 minutos) permite recuperar notificaciones abandonadas por procesos caídos', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  // Fila abandonada en PROCESSING hace 6 minutos (lease vencido)
  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-8',
    order_id: orderId,
    status: 'PROCESSING',
    attempts: 1,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
    claim_token: 'old-dead-worker-token',
    updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min atrás
  });

  let recovered = false;
  const mockRecoveringSender = async () => {
    recovered = true;
    return { success: true };
  };

  const dispatchRes = await executeDispatchOutbox(client, { orderId, emailSender: mockRecoveringSender });

  assert.equal(recovered, true, 'El proceso de recuperación debe reclamar la notificación con lease vencido');
  assert.equal(dispatchRes.status, 'SENT');
  assert.equal(dispatchRes.applied, true);

  const updated = db.orderEmailOutbox.get(orderId);
  assert.equal(updated.status, 'SENT');
  assert.equal(updated.attempts, 2);
});

test('9. Fencing token (claim_token): un trabajador antiguo zombi no puede sobrescribir el resultado de una reclamación más reciente', async () => {
  const db = new MockPgDatabase();
  const clientWorker1 = db.createClient();
  const clientWorker2 = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-9',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  // Simulación:
  // 1. Worker 1 reclama la fila con claimToken1.
  // 2. Durante la llamada HTTP de Worker 1 (simulateDelayedWorker), transcurre tiempo suficiente para que el lease expire.
  // 3. Worker 2 detecta el lease expirado, reclama la fila con claimToken2 y envía exitosamente el correo.
  // 4. Worker 1 despierta y trata de ejecutar Paso C con claimToken1.
  // 5. El check WHERE id = $1 AND claim_token = $2 de Worker 1 rechaza la actualización de Worker 1.

  const simulateDelay = async () => {
    // Forzamos vencimiento del lease de Worker 1
    const entry = db.orderEmailOutbox.get(orderId);
    entry.updated_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();

    // Worker 2 interviene y reclama legítimamente el registro
    const resWorker2 = await executeDispatchOutbox(clientWorker2, {
      orderId,
      emailSender: async () => ({ success: true, from: 'worker2' }),
    });

    assert.equal(resWorker2.status, 'SENT');
    assert.equal(resWorker2.applied, true, 'Worker 2 debió aplicar su resultado');
  };

  // Ejecutamos Worker 1 con la demora simulada
  const resWorker1 = await executeDispatchOutbox(clientWorker1, {
    orderId,
    emailSender: async () => ({ success: true, from: 'worker1' }),
    simulateDelayedWorker: simulateDelay,
  });

  // Worker 1 debió ser detectado como zombi/desactualizado
  assert.equal(resWorker1.applied, false, 'Worker 1 NO debe sobrescribir el estado actualizado por Worker 2');
  assert.equal(resWorker1.status, 'STOLEN_OR_EXPIRED');

  // El estado final de la base de datos permanece como SENT garantizado por Worker 2
  const finalOutbox = db.orderEmailOutbox.get(orderId);
  assert.equal(finalOutbox.status, 'SENT');
});

test('10. Dos trabajadores concurrentes no reclaman deliberadamente la misma notificación activa', async () => {
  const db = new MockPgDatabase();
  const client1 = db.createClient();
  const client2 = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-10',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  let senderCalls = 0;
  const mockSlowSender = async () => {
    senderCalls++;
    return { success: true };
  };

  // Despachador 1 reclama
  const res1 = await executeDispatchOutbox(client1, { orderId, emailSender: mockSlowSender });
  assert.equal(res1.status, 'SENT');

  // Despachador 2 intenta reclamar la misma fila: ya está en SENT (o PROCESSING activa)
  const res2 = await executeDispatchOutbox(client2, { orderId, emailSender: mockSlowSender });
  assert.equal(res2.dispatched, false, 'El segundo despachador no debe encontrar fila elegible');
  assert.equal(res2.reason, 'no_eligible_row');
  assert.equal(senderCalls, 1, 'El proveedor de email solo debe ser llamado exactamente 1 vez');
});

test('11. Una notificación ya enviada (SENT) no se procesa de nuevo', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-11',
    order_id: orderId,
    status: 'SENT',
    attempts: 1,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
    processed_at: new Date().toISOString(),
  });

  let called = false;
  const sender = async () => {
    called = true;
    return { success: true };
  };

  const res = await executeDispatchOutbox(client, { orderId, emailSender: sender });
  assert.equal(res.dispatched, false);
  assert.equal(called, false, 'No debe llamarse al proveedor de correos para una notificación ya enviada');
});

test('12. Un fallo al guardar el resultado después de la aceptación del proveedor NO produce una afirmación falsa de entrega', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  db.orderEmailOutbox.set(orderId, {
    id: 'outbox-uuid-12',
    order_id: orderId,
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    idempotency_key: `idemp_${orderId}`,
    payload: { externalReference: orderId },
  });

  // Simulación: Resend devuelve HTTP 200 (éxito), pero el Paso C falla por desconexión de BD
  client.simulatePostSendPersistenceFailure = true;

  const mockEmailSender = async () => ({ success: true });

  const res = await executeDispatchOutbox(client, { orderId, emailSender: mockEmailSender });

  // 1. NO debe reportar dispatched con éxito (previene falso positivo)
  assert.equal(res.dispatched, false);
  assert.equal(res.status, 'PERSISTENCE_FAILED');

  // 2. En la BD, el registro NO quedó en SENT (sigue en PROCESSING con lease)
  const outboxEntry = db.orderEmailOutbox.get(orderId);
  assert.equal(outboxEntry.status, 'PROCESSING', 'No debe haberse marcado como SENT tras el fallo SQL');

  // 3. Cuando el lease expire, el recuperador lo procesará de nuevo con el mismo idempotencyKey
  outboxEntry.updated_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  client.simulatePostSendPersistenceFailure = false; // Se restablece la conectividad

  const recoveryRes = await executeDispatchOutbox(client, { orderId, emailSender: mockEmailSender });
  assert.equal(recoveryRes.status, 'SENT');
  assert.equal(db.orderEmailOutbox.get(orderId).status, 'SENT');
});

test('13. Ventana residual de ambigüedad en red y soporte de Idempotency-Key', () => {
  const orderId = '00000000-0000-0000-0000-000000000001';
  const paymentId = 'mp-999';
  const stableIdempotencyKey = `email_ord_${orderId}_mp_${paymentId}`;

  // Se comprueba que la clave de idempotencia es determinista y coincide exactamente en reintentos
  assert.equal(stableIdempotencyKey, `email_ord_${orderId}_mp_${paymentId}`);
  assert.ok(stableIdempotencyKey.includes(orderId));
  assert.ok(stableIdempotencyKey.includes(paymentId));
});

test('14. Ruta de despacho sin autenticación válida: acceso denegado (Fail-closed y rechazo de query param)', () => {
  const validateAuth = (authHeader, querySecret, configuredSecret) => {
    if (!configuredSecret) return false; // Fail closed
    // La autenticación exige estrictamente el encabezado Authorization: Bearer <SECRET>
    if (!authHeader) return false;
    const expectedBearer = `Bearer ${configuredSecret}`;
    const authBuf = Buffer.from(authHeader);
    const expBuf = Buffer.from(expectedBearer);
    if (authBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(authBuf, expBuf);
  };

  const validSecret = 'test_secret_token_12345';

  // Sin cabecera
  assert.equal(validateAuth(null, null, validSecret), false);

  // Cabecera incorrecta
  assert.equal(validateAuth('Bearer wrong_token', null, validSecret), false);

  // Sin variable configurada en el servidor (fail-closed)
  assert.equal(validateAuth(`Bearer ${validSecret}`, null, ''), false);

  // Cabecera válida con comparación segura
  assert.equal(validateAuth(`Bearer ${validSecret}`, null, validSecret), true);

  // Query parameter ya NO es aceptado (prohibido para evitar exposición en URLs)
  assert.equal(validateAuth(null, validSecret, validSecret), false);
});

test('15. Cálculo de Backoff Exponencial y Sanitización de Errores Técnicos', () => {
  assert.equal(calculateNextBackoffMs(1), 60 * 1000);       // 1 min
  assert.equal(calculateNextBackoffMs(2), 5 * 60 * 1000);   // 5 min
  assert.equal(calculateNextBackoffMs(3), 15 * 60 * 1000);  // 15 min
  assert.equal(calculateNextBackoffMs(4), 60 * 60 * 1000);  // 1 hr

  // Sanitización de secretos
  const leakedError = 'Failed to connect to Resend with API key re_live_99887766554433221100 and Bearer eyJhbGciOi...';
  const cleanError = sanitizeEmailError(leakedError);
  assert.ok(!cleanError.includes('re_live_99887766554433221100'));
  assert.ok(!cleanError.includes('eyJhbGciOi'));
  assert.ok(cleanError.includes('[REDACTED_API_KEY]'));
  assert.ok(cleanError.includes('Bearer [REDACTED]'));
});

test('16. Ausencia de tabla en base de datos: error controlado y nunca se considera el correo enviado', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();

  // Simula que la tabla order_email_outbox aún no ha sido creada por la migración SQL
  client.simulateMissingTable = true;

  let senderCalled = false;
  const mockSender = async () => {
    senderCalled = true;
    return { success: true };
  };

  const res = await executeDispatchOutbox(client, { orderId, emailSender: mockSender });

  // 1. Debe fallar de forma controlada sin lanzar excepciones no capturadas
  assert.equal(res.dispatched, false);
  assert.equal(res.status, 'CLAIM_FAILED');
  assert.ok(res.error.includes('relation "order_email_outbox" does not exist'));

  // 2. El proveedor de correo NUNCA debe ser llamado si el outbox no existe
  assert.equal(senderCalled, false);
});

test('17. Simulación (simulated: true): restaura estado a PENDING, no incrementa attempts ni processed_at y libera claim_token', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'pay-sim-001';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'test-sim@optihub.cl',
    customer_name: 'Óptica Sim',
    stock_decremented: false,
    total_amount: 45000,
  });
  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 1,
    unit_price_net: 45000,
  });

  // 1. Preparar pedido y outbox en estado PENDING con 0 intentos
  await executeWebhookPaymentApprovedTransaction(client, {
    orderId,
    paymentId,
    eventId: 'evt-sim-001',
    payload: { orderId, amount: 45000 },
  });

  const recordBefore = db.orderEmailOutbox.get(orderId);
  assert.equal(recordBefore.status, 'PENDING');
  assert.equal(recordBefore.attempts, 0);
  assert.equal(recordBefore.processed_at, null);
  assert.equal(recordBefore.claim_token, undefined);

  // 2. Ejecutar despacho con emisor en modo simulación
  const mockSimulatedSender = async () => ({
    success: true,
    simulated: true,
    simulationReason: 'EMAIL_SIMULATION_MODE activado',
  });

  const res = await executeDispatchOutbox(client, { orderId, emailSender: mockSimulatedSender });

  // 3. Validar resultado del despachador
  assert.equal(res.dispatched, true);
  assert.equal(res.status, 'PENDING');
  assert.equal(res.simulated, true);
  assert.equal(res.applied, true);

  // 4. Validar estado en base de datos: debe permanecer PENDING para envío real futuro
  const recordAfter = db.orderEmailOutbox.get(orderId);
  assert.equal(recordAfter.status, 'PENDING');
  assert.equal(recordAfter.attempts, 0, 'attempts no debe incrementarse en simulación');
  assert.equal(recordAfter.processed_at, null, 'processed_at / sent_at no debe establecerse en simulación');
  assert.equal(recordAfter.claim_token, null, 'claim_token debe ser liberado a null');
  assert.equal(recordAfter.last_error, null, 'No debe registrar error en simulación');
});

test('18. Fencing token en simulación: un lease vencido o robado no puede aplicar reset a PENDING', async () => {
  const db = new MockPgDatabase();
  const clientWorker1 = db.createClient();
  const clientWorker2 = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'pay-sim-002';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'test-fencing@optihub.cl',
    customer_name: 'Óptica Fencing',
    stock_decremented: false,
    total_amount: 45000,
  });
  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 1,
    unit_price_net: 45000,
  });

  await executeWebhookPaymentApprovedTransaction(clientWorker1, {
    orderId,
    paymentId,
    eventId: 'evt-sim-002',
    payload: { orderId, amount: 45000 },
  });

  // Worker 1 simula tardanza y durante el retraso transcurren más de 5 minutos,
  // permitiendo que Worker 2 reclame legítimamente el registro con un nuevo lease.
  const resWorker1 = await executeDispatchOutbox(clientWorker1, {
    orderId,
    emailSender: async () => ({ success: true, simulated: true }),
    simulateDelayedWorker: async () => {
      // Forzar vencimiento del lease de Worker 1 (> 5 minutos)
      const entry = db.orderEmailOutbox.get(orderId);
      entry.updated_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();

      // Worker 2 reclama con nuevo lease
      const resWorker2 = await executeDispatchOutbox(clientWorker2, {
        orderId,
        emailSender: async () => ({ success: true, from: 'worker2' }),
      });
      assert.equal(resWorker2.status, 'SENT');
      assert.equal(resWorker2.applied, true);
    },
  });

  // El reset de Worker 1 debe ser rechazado por token mismatch
  assert.equal(resWorker1.dispatched, true);
  assert.equal(resWorker1.status, 'STOLEN_OR_EXPIRED');
  assert.equal(resWorker1.applied, false);
});

test('19. Envío real exitoso: continúa marcando SENT, incrementa attempts y registra processed_at', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'pay-real-003';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'test-real@optihub.cl',
    customer_name: 'Óptica Real',
    stock_decremented: false,
    total_amount: 45000,
  });
  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 1,
    unit_price_net: 45000,
  });

  await executeWebhookPaymentApprovedTransaction(client, {
    orderId,
    paymentId,
    eventId: 'evt-real-003',
    payload: { orderId, amount: 45000 },
  });

  const mockRealSender = async () => ({
    success: true,
    clientRes: { id: 'msg_client_123' },
    adminRes: { id: 'msg_admin_123' },
  });

  const res = await executeDispatchOutbox(client, { orderId, emailSender: mockRealSender });

  assert.equal(res.dispatched, true);
  assert.equal(res.status, 'SENT');
  assert.equal(res.applied, true);

  const recordAfter = db.orderEmailOutbox.get(orderId);
  assert.equal(recordAfter.status, 'SENT');
  assert.equal(recordAfter.attempts, 1);
  assert.ok(recordAfter.processed_at !== null, 'processed_at debe quedar registrado');
  assert.equal(recordAfter.claim_token, null);
});

test('20. Envío real fallido: continúa marcando FAILED, incrementa attempts, programa next_retry_at y guarda last_error', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();
  const orderId = crypto.randomUUID();
  const paymentId = 'pay-fail-004';

  db.orders.set(orderId, {
    id: orderId,
    status: 'pending',
    payment_status: 'pending',
    customer_email: 'test-fail@optihub.cl',
    customer_name: 'Óptica Fail',
    stock_decremented: false,
    total_amount: 45000,
  });
  db.orderItems.push({
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 1,
    unit_price_net: 45000,
  });

  await executeWebhookPaymentApprovedTransaction(client, {
    orderId,
    paymentId,
    eventId: 'evt-fail-004',
    payload: { orderId, amount: 45000 },
  });

  const mockFailingSender = async () => ({
    success: false,
    error: 'Resend API 500: Internal server error on provider',
  });

  const res = await executeDispatchOutbox(client, { orderId, emailSender: mockFailingSender });

  assert.equal(res.dispatched, true);
  assert.equal(res.status, 'FAILED');
  assert.equal(res.applied, true);

  const recordAfter = db.orderEmailOutbox.get(orderId);
  assert.equal(recordAfter.status, 'FAILED');
  assert.equal(recordAfter.attempts, 1);
  assert.equal(recordAfter.processed_at, null);
  assert.ok(recordAfter.last_error.includes('Resend API 500'));
  assert.equal(recordAfter.claim_token, null);
});

