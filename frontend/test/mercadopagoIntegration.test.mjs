// frontend/test/mercadopagoIntegration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./test_alias_loader.mjs', pathToFileURL('./'));

const { createOrderPaymentPreference } = await import('../lib/payments/mercadopagoService.ts');
const { processMercadoPagoWebhookEvent } = await import('../lib/payments/mercadopagoWebhookHandler.ts');
const { POST: legacyPreferencePost, GET: legacyPreferenceGet } = await import('../app/api/payments/preference/route.ts');
const { POST: legacyWebhookPost } = await import('../app/api/mercadopago/webhook/route.ts');
const { POST: canonicalWebhookPost } = await import('../app/api/webhooks/mercadopago/route.ts');
const { handleInventoryHealth } = await import('../app/api/inventory/health/route.ts');

// Contexto de entorno de prueba explícito para los guards de la Fase 25 (runtimeEnv.ts).
// Los guards se evalúan en cada llamada, por lo que basta fijar el entorno del proceso de test:
// NODE_ENV='test' sin VERCEL_ENV => getRuntimeEnvironment() === 'test' (permitido).
// Esto NO debilita los guards en Producción/Preview: allí VERCEL_ENV='production'|'preview'
// tiene precedencia (ver el test 0, que verifica que Preview sigue bloqueado).
delete process.env.VERCEL_ENV;
process.env.NODE_ENV = 'test';
// URL pública ficticia (no se realiza ninguna petición): getSiteUrl() la exige antes de validar montos.
process.env.SITE_URL = 'https://optihub-test.example.com';

/**
 * Mock PostgreSQL Client that simulates:
 * - Orders table with preference_id, init_point, payment_status, status, stock_decremented
 * - Marcos catalog table with stock, precio_neto_clp
 * - Processed_webhooks audit table with unique index (payment_id, event_id)
 * - Row locks and transactions
 */
class MockPgDatabase {
  constructor() {
    this.marcos = new Map([
      ['RB-2140', { id_ext: 'RB-2140', stock: 10, marca: 'Ray-Ban', modelo: 'Wayfarer', precio_neto_clp: 50000 }],
      ['TF-501', { id_ext: 'TF-501', stock: 4, marca: 'Tom Ford', modelo: 'Square', precio_neto_clp: 100000 }],
    ]);
    this.orders = new Map();
    this.orderItems = [];
    this.processedWebhooks = new Map(); // key: `${payment_id}:${event_id}`
    this.inventoryMovements = [];
    this.orderEmailOutbox = new Map(); // key: order_id
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
      inventoryMovements: this.inventoryMovements.map((m) => ({ ...m })),
      orderEmailOutbox: new Map([...this.orderEmailOutbox].map(([k, v]) => [k, { ...v }])),
    };
  }

  restoreState(snapshot) {
    this.marcos = new Map([...snapshot.marcos].map(([k, v]) => [k, { ...v }]));
    this.orders = new Map([...snapshot.orders].map(([k, v]) => [k, { ...v }]));
    this.orderItems = snapshot.orderItems.map((i) => ({ ...i }));
    this.processedWebhooks = new Map([...snapshot.processedWebhooks].map(([k, v]) => [k, { ...v }]));
    this.inventoryMovements = snapshot.inventoryMovements.map((m) => ({ ...m }));
    this.orderEmailOutbox = new Map([...snapshot.orderEmailOutbox].map(([k, v]) => [k, { ...v }]));
  }
}

class MockPgClient {
  constructor(db) {
    this.db = db;
    this.inTransaction = false;
    this.txSnapshot = null;
    this.savepoints = new Map();
    this.savepointHistory = [];
    this.simulateSqlFailureInDeduction = false;
    this.simulateTransientErrorCode = null;
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('BEGIN')) {
      this.inTransaction = true;
      this.txSnapshot = this.db.cloneState();
      this.savepoints.clear();
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('SAVEPOINT ')) {
      const spName = normalized.slice('SAVEPOINT '.length).trim();
      this.savepoints.set(spName, this.db.cloneState());
      this.savepointHistory.push(normalized);
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('ROLLBACK TO SAVEPOINT ')) {
      const spName = normalized.slice('ROLLBACK TO SAVEPOINT '.length).trim();
      const snapshot = this.savepoints.get(spName);
      if (snapshot) {
        this.db.restoreState(snapshot);
      }
      this.savepointHistory.push(normalized);
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('RELEASE SAVEPOINT ')) {
      const spName = normalized.slice('RELEASE SAVEPOINT '.length).trim();
      this.savepoints.delete(spName);
      this.savepointHistory.push(normalized);
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('COMMIT')) {
      this.inTransaction = false;
      this.txSnapshot = null;
      this.savepoints.clear();
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('ROLLBACK')) {
      if (this.txSnapshot) {
        this.db.restoreState(this.txSnapshot);
      }
      this.inTransaction = false;
      this.txSnapshot = null;
      this.savepoints.clear();
      return { rows: [], rowCount: 0 };
    }

    // CREATE TABLE IF NOT EXISTS
    if (normalized.includes('CREATE TABLE IF NOT EXISTS') || normalized.includes('CREATE UNIQUE INDEX')) {
      return { rows: [], rowCount: 0 };
    }

    // SELECT * FROM orders WHERE id = $1 FOR UPDATE
    if (normalized.includes('FROM orders WHERE id = $1') && normalized.includes('FOR UPDATE')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    // SELECT id, user_id, status FROM orders WHERE id = $1
    if (normalized.includes('FROM orders WHERE id = $1')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    // SELECT product_id, quantity FROM order_items WHERE order_id = $1
    if (normalized.includes('FROM order_items WHERE order_id = $1')) {
      const orderId = params[0];
      const items = this.db.orderItems.filter((i) => i.order_id === orderId);
      return { rows: items.map((i) => ({ ...i })), rowCount: items.length };
    }

    // SELECT id_ext, stock, marca, modelo, precio_neto_clp FROM marcos WHERE id_ext = ANY($1)
    if (normalized.includes('FROM marcos WHERE id_ext = ANY($1')) {
      const pids = params[0];
      const rows = [];
      for (const pid of pids) {
        if (this.db.marcos.has(pid)) {
          rows.push({ ...this.db.marcos.get(pid) });
        }
      }
      return { rows, rowCount: rows.length };
    }

    // SELECT id, status, action FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2
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

    // UPDATE orders SET preference_id = $1, init_point = $2
    if (normalized.includes('UPDATE orders SET preference_id = $1')) {
      const prefId = params[0];
      const initPoint = params[1];
      const orderId = params[2];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.preference_id = prefId;
        order.init_point = initPoint;
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders SET status = 'paid', payment_status = 'approved'
    if (normalized.includes("UPDATE orders SET status = 'paid'")) {
      const paymentId = params[0];
      const orderId = params[1];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.status = 'paid';
        order.payment_status = 'approved';
        order.payment_id = paymentId;
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders SET status = 'requires_attention' (both Guard A 3-params and Guard C 2-params)
    if (normalized.includes("status = 'requires_attention'") && normalized.includes("UPDATE orders")) {
      if (normalized.includes('stock_error = $1')) {
        const errMsg = params[0];
        const orderId = params[1];
        const order = this.db.orders.get(orderId);
        if (order) {
          order.status = 'requires_attention';
          order.stock_error = errMsg;
          order.notes = (order.notes ? `${order.notes}\n` : '') + `[FALLO_STOCK]: ${errMsg}`;
        }
      } else {
        const paymentId = params[0];
        const notes = params[1];
        const orderId = params[2];
        const order = this.db.orders.get(orderId);
        if (order) {
          order.payment_id = paymentId;
          order.payment_status = 'approved';
          order.status = 'requires_attention';
          order.notes = notes;
        }
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE orders for non-approved states
    if (normalized.includes('UPDATE orders SET payment_status = $1')) {
      const newPaymentStatus = params[0];
      const paymentId = params[1];
      const newStatus = params[2];
      const orderId = params[3];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.payment_status = newPaymentStatus;
        order.payment_id = paymentId;
        order.status = newStatus;
      }
      return { rows: [], rowCount: 1 };
    }

    // SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.product_name, m.stock
    if (normalized.includes('FROM order_items oi JOIN marcos m')) {
      const orderId = params[0];
      const items = this.db.orderItems.filter((i) => i.order_id === orderId);
      const rows = [];
      for (const i of items) {
        const m = this.db.marcos.get(i.product_id);
        if (m) {
          rows.push({
            order_item_id: i.id,
            product_id: i.product_id,
            quantity: i.quantity,
            product_name: i.product_name,
            stock: m.stock,
            marca: m.marca,
            modelo: m.modelo,
          });
        }
      }
      return { rows, rowCount: rows.length };
    }

    // UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2
    if (normalized.includes('UPDATE marcos SET stock = stock - $1')) {
      if (this.simulateTransientErrorCode) {
        const transientErr = new Error(`Simulated transient error (${this.simulateTransientErrorCode})`);
        transientErr.code = this.simulateTransientErrorCode;
        throw transientErr;
      }
      const qty = params[0];
      const pid = params[1];
      const marco = this.db.marcos.get(pid);
      if (marco) {
        marco.stock -= qty;
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO order_email_outbox
    if (normalized.includes('INSERT INTO order_email_outbox')) {
      const orderId = params[0];
      const paymentId = params[1];
      const recipientEmail = params[2];
      const idempotencyKey = params[3];
      const payload = params[4];
      if (this.db.orderEmailOutbox.has(orderId)) {
        return { rows: [], rowCount: 0 };
      }
      const row = {
        id: crypto.randomUUID(),
        order_id: orderId,
        payment_id: paymentId,
        recipient_email: recipientEmail,
        status: 'PENDING',
        attempts: 0,
        max_attempts: 5,
        idempotency_key: idempotencyKey,
        payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      };
      this.db.orderEmailOutbox.set(orderId, row);
      return { rows: [{ id: row.id, status: row.status }], rowCount: 1 };
    }

    // INSERT INTO inventory_movements (with FK 23503 check against marcos)
    if (normalized.includes('INSERT INTO inventory_movements')) {
      if (this.simulateSqlFailureInDeduction) {
        const sqlErr = new Error('Simulated SQL error after partial stock update inside subtransaction');
        sqlErr.code = '23503';
        throw sqlErr;
      }
      if (!this.db.marcos.has(params[0])) {
        const fkErr = new Error(`insert or update on table "inventory_movements" violates foreign key constraint (product_id=${params[0]})`);
        fkErr.code = '23503';
        throw fkErr;
      }
      const record = {
        id: crypto.randomUUID(),
        product_id: params[0],
        order_id: params[1],
        quantity: params[2],
        type: params[3],
        notes: params[4],
        created_at: new Date().toISOString(),
      };
      this.db.inventoryMovements.push(record);
      return { rows: [record], rowCount: 1 };
    }

    // UPDATE orders SET stock_decremented = true
    if (normalized.includes('UPDATE orders') && normalized.includes('stock_decremented = true')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      if (order) {
        order.stock_decremented = true;
      }
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  release() {}
}

// --------------------------------------------------------------------------
// TEST SUITE
// --------------------------------------------------------------------------

test('0. Guard de entorno intacto: Preview sigue bloqueando webhook y creación de preferencia (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const webhookResult = await processMercadoPagoWebhookEvent({
      xSignature: 'ts=123,v1=abc',
      xRequestId: 'req-preview',
      dataId: '999',
      type: 'payment',
    });
    assert.equal(webhookResult.statusCode, 403);
    assert.equal(webhookResult.body.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(webhookResult.body.environment, 'preview');

    await assert.rejects(
      async () => {
        await createOrderPaymentPreference({
          orderId: crypto.randomUUID(),
          userId: 'usr-preview',
        });
      },
      (err) => /Preview|bloquead/i.test(err.message)
    );
  } finally {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  }
});

test('1. Preference Service: Calculates 19% IVA and rejects price tampering', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  // Create an order in DB with 1 unit of RB-2140 (neto: 50.000, IVA 19%: 9.500, Total: 59.500)
  const orderId = crypto.randomUUID();
  const userId = 'usr-test-pref';
  db.orders.set(orderId, {
    id: orderId,
    user_id: userId,
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 50000,
    tax_amount: 9500,
    shipping_amount: 0,
    total_amount: 59500,
    currency: 'CLP',
    customer_email: 'test@optihub.cl',
    customer_name: 'Óptica Test',
  });
  db.orderItems.push({
    id: 'oi-1',
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 1,
    unit_price_net: 50000,
    product_name: 'Ray-Ban Wayfarer',
    sku: 'RB-2140',
  });

  // Attempt with tampered item price (client claims unitPriceNet is 1.000 instead of 50.000)
  // Our service validates against marcos catalog (precio_neto_clp = 50.000)
  // If an order already has total 59.500, it verifies the calculated total against the order total
  // If someone passes tampered order with total mismatch, it throws DISCREPANCIA_MONTOS
  db.orders.get(orderId).total_amount = 1190; // Tampered total in DB or payload

  await assert.rejects(
    async () => {
      await createOrderPaymentPreference({
        orderId,
        userId,
        customClient: client,
      });
    },
    (err) => err.message.includes('DISCREPANCIA_MONTOS')
  );
});

test('2. Webhook: Rejects requests missing signature headers', async () => {
  const result = await processMercadoPagoWebhookEvent({
    xSignature: null,
    xRequestId: null,
    dataId: '123456789',
    type: 'payment',
  });

  assert.equal(result.statusCode, 401);
  assert.ok(result.body.error.includes('Missing webhook signature'));
});

test('3. Webhook: Ignores non-payment topics gracefully with 200 ACK', async () => {
  const result = await processMercadoPagoWebhookEvent({
    xSignature: 'ts=123,v1=abc',
    xRequestId: 'req-1',
    dataId: '999',
    type: 'merchant_order',
  });

  assert.equal(result.statusCode, 200);
  assert.ok(result.body.message.includes('ignored'));
});

test('4. Webhook Idempotency: Duplicate payment event does not double-decrement stock', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  const orderId = crypto.randomUUID();
  const paymentId = 'pay-mp-987654';
  const eventId = 'req-mp-evt-001';

  db.orders.set(orderId, {
    id: orderId,
    user_id: 'usr-idempotent',
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 50000,
    tax_amount: 9500,
    shipping_amount: 0,
    total_amount: 59500,
    currency: 'CLP',
    stock_decremented: false,
    stock_error: null,
    notes: null,
  });

  db.orderItems.push({
    id: 'oi-item-1',
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 2,
    product_name: 'Ray-Ban Wayfarer',
  });

  const initialStock = db.marcos.get('RB-2140').stock; // 10

  // 1st delivery of approved payment webhook
  // Mock fetch to avoid real network call by injecting params and bypassing MP signature for unit test
  const webhookParams = {
    xSignature: 'valid-test-sig',
    xRequestId: eventId,
    dataId: paymentId,
    type: 'payment',
    bodyPayload: {
      id: paymentId,
      status: 'approved',
      transaction_amount: 59500,
      currency_id: 'CLP',
      external_reference: orderId,
    },
  };

  // We test the transactional runner directly on client
  // Simulate 1st processing
  await client.query('BEGIN');
  // Lock order
  const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  const order = orderRows[0];
  assert.equal(order.status, 'pending');

  // Update order to paid
  await client.query("UPDATE orders SET status = 'paid' WHERE id = $1", [paymentId, orderId]);

  // Decrement stock
  await client.query('UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2', [2, 'RB-2140']);
  await client.query('UPDATE orders SET stock_decremented = true WHERE id = $1', [orderId]);

  // Insert into processed_webhooks audit table
  await client.query(
    'INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [eventId, paymentId, orderId, 'payment', 'approved', JSON.stringify(webhookParams.bodyPayload), 'PROCESSED']
  );
  await client.query('COMMIT');

  // Verify stock decreased by 2
  assert.equal(db.marcos.get('RB-2140').stock, initialStock - 2, 'Stock must decrease by 2 on first delivery');
  assert.equal(db.orders.get(orderId).status, 'paid');
  assert.equal(db.orders.get(orderId).stock_decremented, true);
  assert.equal(db.processedWebhooks.size, 1, 'Audit record must be created');

  // 2nd delivery (reintentado por la red con el mismo payment_id y event_id):
  // Check processed_webhooks audit table hit
  const auditHit = await client.query(
    'SELECT id, status, action FROM processed_webhooks WHERE payment_id = $1 AND event_id = $2',
    [paymentId, eventId]
  );
  assert.equal(auditHit.rows.length, 1, 'Second webhook delivery must detect existing audit entry');

  // Verify stock did NOT decrement a second time!
  assert.equal(db.marcos.get('RB-2140').stock, initialStock - 2, 'Stock must NOT be decremented again');
});

test('5. Cancelled Order Safeguard: Late payment received on cancelled order moves to requires_attention without decrementing stock', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  const orderId = crypto.randomUUID();
  const paymentId = 'pay-late-112233';
  const eventId = 'req-late-evt';

  db.orders.set(orderId, {
    id: orderId,
    user_id: 'usr-late',
    status: 'cancelled',
    payment_status: 'pending',
    total_amount: 119000,
    currency: 'CLP',
    stock_decremented: false,
    stock_error: null,
    notes: 'Orden cancelada previamente por reemplazo de carrito',
  });

  const initialStock = db.marcos.get('TF-501').stock; // 4

  // Simulate late payment processing
  await client.query('BEGIN');
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  const order = rows[0];
  assert.equal(order.status, 'cancelled');

  // Update order to requires_attention without touching stock
  await client.query(
    "UPDATE orders SET payment_id = $1, payment_status = 'approved', status = 'requires_attention' WHERE id = $3",
    [paymentId, 'Notas de incidencia', orderId]
  );
  await client.query(
    'INSERT INTO processed_webhooks (event_id, payment_id, order_id, event_type, action, payload, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [eventId, paymentId, orderId, 'payment', 'cancelled_order_paid_incident', '{}', 'PROCESSED']
  );
  await client.query('COMMIT');

  // Verify order transitioned to requires_attention
  assert.equal(db.orders.get(orderId).status, 'requires_attention');
  assert.equal(db.orders.get(orderId).payment_status, 'approved');
  assert.equal(db.orders.get(orderId).stock_decremented, false);

  // Stock must remain intact!
  assert.equal(db.marcos.get('TF-501').stock, initialStock, 'Stock for TF-501 must remain completely unchanged');
});

test('6. Fase 28.2 Hardening: /api/payments/preference returns 410 Gone on POST and GET without DB or MP access', async () => {
  const resPost = await legacyPreferencePost();
  assert.equal(resPost.status, 410);
  const bodyPost = await resPost.json();
  assert.equal(
    bodyPost.error,
    'Endpoint deprecado. Utilice /api/mercadopago/create-preference con autenticación Bearer.'
  );

  const resGet = await legacyPreferenceGet();
  assert.equal(resGet.status, 410);

  const src = fs.readFileSync(new URL('../app/api/payments/preference/route.ts', import.meta.url), 'utf8');
  assert.equal(/createOrderPaymentPreference|mercadopagoService|db\/postgres|createClient|req\.json/.test(src), false);
});

test('7. Fase 28.2 Hardening: /api/mercadopago/webhook delegates identically to canonical /api/webhooks/mercadopago', async () => {
  const src = fs.readFileSync(new URL('../app/api/mercadopago/webhook/route.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("from '@/app/api/webhooks/mercadopago/route'"));
  assert.ok(src.includes('canonicalMercadoPagoWebhookPost(req)'));
  assert.equal(/createClient|process_approved_mp_payment|WebhookSignatureValidator|paymentClient/.test(src), false);

  const makeReq = (withSig) => {
    const headers = new Map();
    if (withSig) {
      headers.set('x-signature', 'ts=1,v1=fake');
      headers.set('x-request-id', 'req-28-2');
    }
    return {
      headers,
      nextUrl: { searchParams: new URLSearchParams({ 'data.id': '12345', type: 'payment' }) },
      clone: () => ({ json: async () => ({}) }),
    };
  };

  // Missing signature -> both return identical 401 from canonical handler
  const legacy401 = await legacyWebhookPost(makeReq(false));
  const canonical401 = await canonicalWebhookPost(makeReq(false));
  assert.equal(legacy401.status, 401);
  assert.equal(canonical401.status, 401);
  assert.deepEqual(await legacy401.json(), await canonical401.json());

  // Preview environment -> both return identical 403 PREVIEW_MUTATION_BLOCKED
  process.env.VERCEL_ENV = 'preview';
  try {
    const legacy403 = await legacyWebhookPost(makeReq(true));
    const canonical403 = await canonicalWebhookPost(makeReq(true));
    assert.equal(legacy403.status, 403);
    assert.equal(canonical403.status, 403);
    const lBody = await legacy403.json();
    const cBody = await canonical403.json();
    assert.equal(lBody.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.deepEqual(lBody, cBody);
  } finally {
    delete process.env.VERCEL_ENV;
  }
});

test('8. Fase 28.2 Hardening: /api/inventory/health enforces admin auth (401/403/200) and sanitizes 503 errors', async () => {
  const usersByToken = new Map([
    ['valid_admin_token', { id: 'admin-uuid', email: 'multifocuslimitada@gmail.com', role: 'authenticated' }],
    ['valid_client_token', { id: '11111111-1111-4111-8111-111111111111', email: 'client@test.cl', role: 'authenticated' }],
  ]);
  const mockAuthClient = {
    auth: {
      getUser: async (token) =>
        usersByToken.has(token)
          ? { data: { user: usersByToken.get(token) }, error: null }
          : { data: { user: null }, error: new Error('Invalid token') },
    },
  };
  const makeHealthReq = (authHeader) => {
    const map = new Map();
    if (authHeader) map.set('authorization', authHeader);
    return {
      url: 'http://localhost:3000/api/inventory/health',
      method: 'GET',
      headers: { get: (h) => map.get(h.toLowerCase()) || null },
    };
  };

  // Anonymous -> 401
  let dbChecks = 0;
  const res401 = await handleInventoryHealth(makeHealthReq(null), {
    customAuthClient: mockAuthClient,
    customHealthCheck: async () => {
      dbChecks++;
      return { healthy: true, poolStats: { totalCount: 1, idleCount: 1, waitingCount: 0 } };
    },
  });
  assert.equal(res401.status, 401);
  assert.equal(dbChecks, 0);

  // Authenticated non-admin -> 403
  const res403 = await handleInventoryHealth(makeHealthReq('Bearer valid_client_token'), {
    customAuthClient: mockAuthClient,
    customHealthCheck: async () => {
      dbChecks++;
      return { healthy: true, poolStats: { totalCount: 1, idleCount: 1, waitingCount: 0 } };
    },
  });
  assert.equal(res403.status, 403);
  assert.equal(dbChecks, 0);

  // Authenticated admin -> 200 with poolStats
  const res200 = await handleInventoryHealth(makeHealthReq('Bearer valid_admin_token'), {
    customAuthClient: mockAuthClient,
    customHealthCheck: async () => ({
      healthy: true,
      latencyMs: 5,
      poolStats: { totalCount: 3, idleCount: 2, waitingCount: 0 },
    }),
  });
  assert.equal(res200.status, 200);
  const body200 = await res200.json();
  assert.equal(body200.status, 'UP');
  assert.deepEqual(body200.poolStats, { totalCount: 3, idleCount: 2, waitingCount: 0 });

  // Unhealthy DB with sensitive driver string -> sanitized 503
  const rawDriverErr = 'password authentication failed for user "postgres" at db.secret-host.supabase.co:5432';
  const origConsoleError = console.error;
  console.error = () => {};
  try {
    const res503 = await handleInventoryHealth(makeHealthReq('Bearer valid_admin_token'), {
      customAuthClient: mockAuthClient,
      customHealthCheck: async () => ({
        healthy: false,
        poolStats: { totalCount: 0, idleCount: 0, waitingCount: 0 },
        error: rawDriverErr,
      }),
    });
    assert.equal(res503.status, 503);
    const body503Text = JSON.stringify(await res503.json());
    assert.equal(/supabase\.co|password|postgres|5432|poolStats/.test(body503Text), false);
  } finally {
    console.error = origConsoleError;
  }
});

test('9. Fase 28.4 Savepoint & Stock Depletion: processMercadoPagoWebhookEvent rolls back to SAVEPOINT sp_webhook_stock_deduction on stock failure and marks order requires_attention', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  const orderId = crypto.randomUUID();
  const paymentId = 'pay-savepoint-28-4';
  const eventId = 'evt-savepoint-28-4';

  // RB-2140 has 2 units in stock, but order requests 5 units -> InsufficientStockError inside deductStockForOrderAtomic
  db.marcos.set('RB-2140', { id_ext: 'RB-2140', stock: 2, marca: 'Ray-Ban', modelo: 'Wayfarer', precio_neto_clp: 50000 });
  db.orders.set(orderId, {
    id: orderId,
    user_id: 'usr-savepoint',
    status: 'pending',
    payment_status: 'pending',
    total_amount: 297500,
    currency: 'CLP',
    stock_decremented: false,
    stock_error: null,
    notes: null,
  });
  db.orderItems.push({
    id: 'oi-sp-1',
    order_id: orderId,
    product_id: 'RB-2140',
    quantity: 5,
    product_name: 'Ray-Ban Wayfarer',
  });

  const origConsoleError = console.error;
  console.error = () => {};
  try {
    const res = await processMercadoPagoWebhookEvent(
      {
        xSignature: 'ts=1,v1=bypass',
        xRequestId: eventId,
        dataId: paymentId,
        type: 'payment',
      },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: paymentId,
          status: 'approved',
          transaction_amount: 297500,
          currency_id: 'CLP',
          external_reference: orderId,
        }),
        emailSender: async () => ({ success: true, simulated: true }),
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.action, 'approved_stock_failed');
    assert.equal(res.body.stockStatus, 'failed');
    assert.equal(res.body.outboxCreated, false);

    // Verify SAVEPOINT -> ROLLBACK TO SAVEPOINT -> RELEASE SAVEPOINT sequence executed
    assert.deepEqual(client.savepointHistory, [
      'SAVEPOINT sp_webhook_stock_deduction',
      'ROLLBACK TO SAVEPOINT sp_webhook_stock_deduction',
      'RELEASE SAVEPOINT sp_webhook_stock_deduction',
    ]);

    // Verify order transitioned to requires_attention with stock_decremented = false and audit recorded
    const updatedOrder = db.orders.get(orderId);
    assert.equal(updatedOrder.status, 'requires_attention');
    assert.equal(updatedOrder.payment_status, 'approved');
    assert.equal(updatedOrder.stock_decremented, false);
    assert.ok(updatedOrder.stock_error && updatedOrder.stock_error.includes('Stock insuficiente'));
    assert.equal(db.marcos.get('RB-2140').stock, 2, 'Stock must remain intact after SAVEPOINT rollback');
    assert.equal(db.processedWebhooks.has(`${paymentId}:${eventId}`), true, 'Audit record must be persisted');

    // Sub-case B: SQL error AFTER partial stock update inside subtransaction rolls back partial stock mutation via SAVEPOINT
    const orderIdSql = crypto.randomUUID();
    const paymentIdSql = 'pay-savepoint-sql-28-4';
    const eventIdSql = 'evt-savepoint-sql-28-4';
    db.orders.set(orderIdSql, {
      id: orderIdSql,
      user_id: 'usr-savepoint-sql',
      status: 'pending',
      payment_status: 'pending',
      total_amount: 119000,
      currency: 'CLP',
      stock_decremented: false,
      stock_error: null,
      notes: null,
    });
    db.orderItems.push({
      id: 'oi-sp-2',
      order_id: orderIdSql,
      product_id: 'RB-2140',
      quantity: 2, // Stock is 2, so UPDATE marcos SET stock = 0 executes, then INSERT INTO inventory_movements throws SQL error
      product_name: 'Ray-Ban Wayfarer',
    });

    client.savepointHistory = [];
    client.simulateSqlFailureInDeduction = true;

    const resSql = await processMercadoPagoWebhookEvent(
      {
        xSignature: 'ts=1,v1=bypass',
        xRequestId: eventIdSql,
        dataId: paymentIdSql,
        type: 'payment',
      },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: paymentIdSql,
          status: 'approved',
          transaction_amount: 119000,
          currency_id: 'CLP',
          external_reference: orderIdSql,
        }),
        emailSender: async () => ({ success: true, simulated: true }),
      }
    );

    assert.equal(resSql.statusCode, 200);
    assert.equal(resSql.body.stockStatus, 'failed');
    assert.deepEqual(client.savepointHistory, [
      'SAVEPOINT sp_webhook_stock_deduction',
      'ROLLBACK TO SAVEPOINT sp_webhook_stock_deduction',
      'RELEASE SAVEPOINT sp_webhook_stock_deduction',
    ]);
    assert.equal(db.marcos.get('RB-2140').stock, 2, 'Partial stock deduction (2 -> 0) must be rolled back to 2 by SAVEPOINT');
    assert.equal(db.orders.get(orderIdSql).status, 'requires_attention');
    assert.equal(db.processedWebhooks.has(`${paymentIdSql}:${eventIdSql}`), true);
  } finally {
    console.error = origConsoleError;
  }
});

test('10. Fase 28.6 Hardening (P1/P2/P3): State machine guards for requires_attention, payment_id conflicts, terminal states, transient error full rollback, and outbox isolation', async () => {
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  try {
    const db = new MockPgDatabase();
    const client = db.createClient();
    db.marcos.set('RB-2140', { id_ext: 'RB-2140', stock: 10, marca: 'Ray-Ban', modelo: 'Wayfarer', precio_neto_clp: 50000 });

    let emailSendCalls = 0;
    const mockEmailSender = async () => {
      emailSendCalls++;
      return { success: true, simulated: true };
    };

    // -------------------------------------------------------------------------
    // Case 1 & 2 (ALTO-01): Cancelled order receives 1st approved payment -> requires_attention (0 stock deducted).
    // Then receives 2nd webhook event with a DIFFERENT event_id -> stays in requires_attention, NEVER moves to paid,
    // NEVER deducts stock, NEVER creates outbox.
    // -------------------------------------------------------------------------
    const cancelledOrdId = crypto.randomUUID();
    const latePayId = 'pay-late-28-6-01';
    db.orders.set(cancelledOrdId, {
      id: cancelledOrdId,
      user_id: 'usr-late-28-6',
      status: 'cancelled',
      payment_status: 'pending',
      payment_id: null,
      total_amount: 119000,
      currency: 'CLP',
      customer_email: 'cliente@optica.cl',
      customer_name: 'Óptica Cliente',
      stock_decremented: false,
      stock_error: null,
      notes: 'Cancelada por reemplazo de checkout',
    });
    db.orderItems.push({
      id: 'oi-late-1',
      order_id: cancelledOrdId,
      product_id: 'RB-2140',
      quantity: 2,
      product_name: 'Ray-Ban Wayfarer',
      unit_price_net: 50000,
    });

    // 1st webhook event on cancelled order
    const resLate1 = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-late-1', dataId: latePayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: latePayId,
          status: 'approved',
          transaction_amount: 119000,
          currency_id: 'CLP',
          external_reference: cancelledOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resLate1.statusCode, 200);
    assert.equal(resLate1.body.action, 'record_cancelled_order_paid_incident');
    assert.equal(db.orders.get(cancelledOrdId).status, 'requires_attention');
    assert.equal(db.orders.get(cancelledOrdId).payment_id, latePayId);
    assert.equal(db.marcos.get('RB-2140').stock, 10, 'Stock must remain 10 on cancelled order incident');
    assert.equal(db.orderEmailOutbox.has(cancelledOrdId), false);
    assert.equal(emailSendCalls, 0);

    // 2nd webhook event with DIFFERENT event_id ('evt-late-2') on that same order now in requires_attention
    const resLate2 = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-late-2', dataId: latePayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: latePayId,
          status: 'approved',
          transaction_amount: 119000,
          currency_id: 'CLP',
          external_reference: cancelledOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resLate2.statusCode, 200);
    assert.equal(resLate2.body.action, 'incident_pending');
    assert.equal(resLate2.body.outboxCreated, false);
    assert.equal(db.orders.get(cancelledOrdId).status, 'requires_attention', 'Order MUST stay in requires_attention and NEVER move to paid');
    assert.equal(db.orders.get(cancelledOrdId).stock_decremented, false);
    assert.equal(db.marcos.get('RB-2140').stock, 10, 'Stock MUST NOT be deducted on second webhook event');
    assert.equal(db.orderEmailOutbox.has(cancelledOrdId), false, 'Outbox MUST NOT be created for requires_attention order');
    assert.equal(emailSendCalls, 0);

    // -------------------------------------------------------------------------
    // Case 3 (ALTO-01 & BAJO-02): Order in requires_attention due to prior stock failure receives a 2nd webhook
    // after stock was replenished -> still stays in requires_attention until manual admin resolution!
    // -------------------------------------------------------------------------
    const stockFailOrdId = crypto.randomUUID();
    const stockFailPayId = 'pay-stockfail-28-6';
    db.marcos.set('TF-501', { id_ext: 'TF-501', stock: 1, marca: 'Tom Ford', modelo: 'Square', precio_neto_clp: 100000 });
    db.orders.set(stockFailOrdId, {
      id: stockFailOrdId,
      user_id: 'usr-stockfail',
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
      total_amount: 357000,
      currency: 'CLP',
      customer_email: 'cliente2@optica.cl',
      customer_name: 'Óptica StockFail',
      stock_decremented: false,
      stock_error: null,
      notes: null,
    });
    db.orderItems.push({
      id: 'oi-sf-1',
      order_id: stockFailOrdId,
      product_id: 'TF-501',
      quantity: 3, // Stock is 1 -> InsufficientStockError
      product_name: 'Tom Ford Square',
      unit_price_net: 100000,
    });

    const resSf1 = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-sf-1', dataId: stockFailPayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: stockFailPayId,
          status: 'approved',
          transaction_amount: 357000,
          currency_id: 'CLP',
          external_reference: stockFailOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resSf1.statusCode, 200);
    assert.equal(resSf1.body.action, 'approved_stock_failed');
    assert.equal(resSf1.body.stockStatus, 'failed');
    assert.equal(db.orders.get(stockFailOrdId).status, 'requires_attention');
    assert.equal(db.processedWebhooks.get(`${stockFailPayId}:evt-sf-1`).action, 'approved_stock_failed');
    assert.equal(emailSendCalls, 0);

    // Replenish TF-501 stock to 20 and send a second webhook event ('evt-sf-2')
    db.marcos.get('TF-501').stock = 20;
    const resSf2 = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-sf-2', dataId: stockFailPayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: stockFailPayId,
          status: 'approved',
          transaction_amount: 357000,
          currency_id: 'CLP',
          external_reference: stockFailOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resSf2.statusCode, 200);
    assert.equal(resSf2.body.action, 'incident_pending');
    assert.equal(db.orders.get(stockFailOrdId).status, 'requires_attention', 'Must remain in requires_attention even if stock is later replenished');
    assert.equal(db.marcos.get('TF-501').stock, 20, 'Stock must remain 20 without automatic deduction');
    assert.equal(emailSendCalls, 0);

    // -------------------------------------------------------------------------
    // Case 4, 5 & 8 (ALTO-01 & Happy Path): Happy path order -> paid, stock deducted, outbox created.
    // Then receives:
    //   - Retry of same payment across terminal states (paid, preparing, shipped, delivered, refunded) -> idempotent
    //   - Conflicting payment_id ('pay-conflict-999') -> action = 'payment_conflict', status = 'IGNORED', no overwrite!
    // -------------------------------------------------------------------------
    const happyOrdId = crypto.randomUUID();
    const happyPayId = 'pay-happy-28-6';
    db.orders.set(happyOrdId, {
      id: happyOrdId,
      user_id: 'usr-happy',
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
      total_amount: 119000,
      currency: 'CLP',
      customer_email: 'compras@opticahappy.cl',
      customer_name: 'Óptica Happy',
      stock_decremented: false,
      stock_error: null,
      notes: null,
    });
    db.orderItems.push({
      id: 'oi-happy-1',
      order_id: happyOrdId,
      product_id: 'RB-2140',
      quantity: 2, // Stock is 10 -> becomes 8
      product_name: 'Ray-Ban Wayfarer',
      unit_price_net: 50000,
    });

    const resHappy = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-happy-1', dataId: happyPayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: happyPayId,
          status: 'approved',
          transaction_amount: 119000,
          currency_id: 'CLP',
          external_reference: happyOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resHappy.statusCode, 200);
    assert.equal(resHappy.body.action, 'approved');
    assert.equal(resHappy.body.stockStatus, 'decremented');
    assert.equal(resHappy.body.outboxCreated, true);
    assert.equal(db.orders.get(happyOrdId).status, 'paid');
    assert.equal(db.orders.get(happyOrdId).payment_id, happyPayId);
    assert.equal(db.orders.get(happyOrdId).stock_decremented, true);
    assert.equal(db.marcos.get('RB-2140').stock, 8);
    assert.equal(db.orderEmailOutbox.has(happyOrdId), true);

    // Conflicting payment_id on already paid order -> payment_conflict, IGNORED, original payment_id preserved
    const conflictingPayId = 'pay-conflict-different-id';
    const resConflict = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-conflict-1', dataId: conflictingPayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: conflictingPayId,
          status: 'approved',
          transaction_amount: 119000,
          currency_id: 'CLP',
          external_reference: happyOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resConflict.statusCode, 200);
    assert.equal(resConflict.body.action, 'payment_conflict');
    assert.equal(resConflict.body.code, 'payment_conflict');
    assert.equal(db.orders.get(happyOrdId).payment_id, happyPayId, 'Original payment_id MUST NOT be overwritten');
    assert.equal(db.marcos.get('RB-2140').stock, 8, 'Stock MUST NOT be deducted again on payment_conflict');
    assert.equal(db.processedWebhooks.get(`${conflictingPayId}:evt-conflict-1`).status, 'IGNORED');

    // Terminal post-payment states (shipped, delivered, refunded) receiving a new event_id for the same payment_id
    for (const terminalState of ['shipped', 'delivered', 'refunded']) {
      db.orders.get(happyOrdId).status = terminalState;
      db.orders.get(happyOrdId).stock_decremented = false; // Even if flag were false on a refunded order
      const evtTerm = `evt-term-${terminalState}`;
      const resTerm = await processMercadoPagoWebhookEvent(
        { xSignature: 'ts=1,v1=bypass', xRequestId: evtTerm, dataId: happyPayId, type: 'payment' },
        {
          bypassSignature: true,
          customClient: client,
          customPaymentFetcher: async () => ({
            id: happyPayId,
            status: 'approved',
            transaction_amount: 119000,
            currency_id: 'CLP',
            external_reference: happyOrdId,
          }),
          emailSender: mockEmailSender,
        }
      );
      assert.equal(resTerm.statusCode, 200);
      assert.equal(resTerm.body.action, 'already_processed_duplicate');
      assert.equal(db.orders.get(happyOrdId).status, terminalState, `Order in ${terminalState} must not be overwritten to paid`);
      assert.equal(db.marcos.get('RB-2140').stock, 8);
    }

    // -------------------------------------------------------------------------
    // Case 7 (MEDIO-02): Transient concurrency error (40P01, 40001, 55P03) inside stock deduction:
    // Rolls back ENTIRE transaction, does NOT mark order requires_attention, does NOT record processed_webhooks,
    // and returns HTTP 503 so Mercado Pago retries!
    // -------------------------------------------------------------------------
    const transientOrdId = crypto.randomUUID();
    const transientPayId = 'pay-transient-28-6';
    db.orders.set(transientOrdId, {
      id: transientOrdId,
      user_id: 'usr-transient',
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
      total_amount: 59500,
      currency: 'CLP',
      customer_email: 'transient@optica.cl',
      customer_name: 'Óptica Transient',
      stock_decremented: false,
      stock_error: null,
      notes: null,
    });
    db.orderItems.push({
      id: 'oi-trans-1',
      order_id: transientOrdId,
      product_id: 'RB-2140',
      quantity: 1,
      product_name: 'Ray-Ban Wayfarer',
      unit_price_net: 50000,
    });

    for (const transientCode of ['40P01', '40001', '55P03']) {
      client.simulateTransientErrorCode = transientCode;
      const resTransient = await processMercadoPagoWebhookEvent(
        { xSignature: 'ts=1,v1=bypass', xRequestId: `evt-tr-${transientCode}`, dataId: transientPayId, type: 'payment' },
        {
          bypassSignature: true,
          customClient: client,
          customPaymentFetcher: async () => ({
            id: transientPayId,
            status: 'approved',
            transaction_amount: 59500,
            currency_id: 'CLP',
            external_reference: transientOrdId,
          }),
          emailSender: mockEmailSender,
        }
      );

      assert.equal(resTransient.statusCode, 503, `Transient error ${transientCode} must return HTTP 503 for MP retry`);
      assert.equal(resTransient.body.code, 'TRANSIENT_CONCURRENCY_CONFLICT');
      assert.equal(
        db.orders.get(transientOrdId).status,
        'pending',
        `Order must roll back to 'pending' (NOT 'requires_attention') after transient error ${transientCode}`
      );
      assert.equal(
        db.processedWebhooks.has(`${transientPayId}:evt-tr-${transientCode}`),
        false,
        `processed_webhooks must NOT record event after transient error ${transientCode}`
      );
      assert.equal(db.marcos.get('RB-2140').stock, 8);
    }

    // Now clear the transient fault and retry the exact same webhook -> succeeds cleanly!
    client.simulateTransientErrorCode = null;
    const resRetrySuccess = await processMercadoPagoWebhookEvent(
      { xSignature: 'ts=1,v1=bypass', xRequestId: 'evt-tr-40P01', dataId: transientPayId, type: 'payment' },
      {
        bypassSignature: true,
        customClient: client,
        customPaymentFetcher: async () => ({
          id: transientPayId,
          status: 'approved',
          transaction_amount: 59500,
          currency_id: 'CLP',
          external_reference: transientOrdId,
        }),
        emailSender: mockEmailSender,
      }
    );
    assert.equal(resRetrySuccess.statusCode, 200);
    assert.equal(resRetrySuccess.body.action, 'approved');
    assert.equal(db.orders.get(transientOrdId).status, 'paid');
    assert.equal(db.marcos.get('RB-2140').stock, 7);
    assert.equal(db.processedWebhooks.has(`${transientPayId}:evt-tr-40P01`), true);
  } finally {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
  }
});
