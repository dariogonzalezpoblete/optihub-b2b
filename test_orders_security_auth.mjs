// test_orders_security_auth.mjs
// Automated test suite for FASE 24.4: Controlled security fix for Order routes
// Tests SEC-01 and SEC-02 protections.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register the path alias loader for @/ resolution under Node.js native ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

// Import pure serverAuth functions and route handlers dynamically
const {
  authenticateServerRequest,
  isUserAdmin,
  getAuthorizedAdminEmails,
} = await import('./frontend/lib/auth/serverAuth.ts');

const { handleUpdateTracking: updateTrackingHandler } = await import(
  './frontend/app/api/orders/update-tracking/route.ts'
);
const { handleGetOrders: getOrdersHandler } = await import(
  './frontend/app/api/orders/route.ts'
);
const { handleGetOrderDetail: getOrderDetailHandler } = await import(
  './frontend/app/api/orders/[id]/route.ts'
);

// ---------------------------------------------------------------------------
// TEST MOCKS & FIXTURES
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'multifocuslimitada@gmail.com';
const CLIENT_A_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_A_EMAIL = 'optica_central@test.cl';
const CLIENT_B_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_B_EMAIL = 'optica_sur@test.cl';

const ORDER_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * Mock data store for orders
 */
function createMockDb() {
  const orders = [
    {
      id: ORDER_A_ID,
      user_id: CLIENT_A_ID,
      customer_name: 'Óptica Central',
      customer_email: CLIENT_A_EMAIL,
      total_amount: 150000,
      status: 'paid',
      payment_status: 'approved',
      shipping_provider: 'DHL Express',
      tracking_number: 'DHL-111',
      notes: '{"stage":"logistica_usa"}',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: ORDER_B_ID,
      user_id: CLIENT_B_ID,
      customer_name: 'Óptica Sur',
      customer_email: CLIENT_B_EMAIL,
      total_amount: 280000,
      status: 'paid',
      payment_status: 'approved',
      shipping_provider: 'Chilexpress',
      tracking_number: 'CHX-222',
      notes: '{"stage":"reparto_chile"}',
      created_at: '2026-10-02T12:00:00Z',
    },
  ];

  const orderItems = [
    { id: 'item-1', order_id: ORDER_A_ID, product_name: 'Armazón Alpha', quantity: 2 },
    { id: 'item-2', order_id: ORDER_B_ID, product_name: 'Armazón Beta', quantity: 5 },
  ];

  return { orders, orderItems };
}

/**
 * Creates a mock Supabase Auth client
 */
function createMockAuthClient() {
  const usersByToken = new Map([
    [
      'valid_admin_token',
      { id: 'admin-uuid', email: ADMIN_EMAIL, role: 'authenticated' },
    ],
    [
      'valid_client_a_token',
      { id: CLIENT_A_ID, email: CLIENT_A_EMAIL, role: 'authenticated' },
    ],
    [
      'valid_client_b_token',
      { id: CLIENT_B_ID, email: CLIENT_B_EMAIL, role: 'authenticated' },
    ],
  ]);

  return {
    auth: {
      getUser: async (token) => {
        if (usersByToken.has(token)) {
          return { data: { user: usersByToken.get(token) }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid JWT or token expired') };
      },
    },
  };
}

/**
 * Creates a mock Supabase Admin query builder
 */
function createMockAdminClient(db) {
  let updateExecutedBeforePermissionCheck = false;

  return {
    from: (table) => {
      let filters = [];
      let updatePayload = null;
      let isSingle = false;

      const builder = {
        select: (fields = '*') => builder,
        neq: (col, val) => {
          filters.push((row) => row[col] !== val);
          return builder;
        },
        eq: (col, val) => {
          filters.push((row) => row[col] === val);
          return builder;
        },
        order: (col, opts) => builder,
        update: (payload) => {
          updatePayload = payload;
          return builder;
        },
        single: async () => {
          isSingle = true;
          return execute();
        },
        then: (resolve, reject) => {
          execute().then(resolve, reject);
        },
      };

      const execute = async () => {
        if (table === 'orders') {
          if (updatePayload) {
            // Apply update
            let targetOrder = db.orders.find((o) => filters.every((f) => f(o)));
            if (!targetOrder) {
              return { data: null, error: { message: 'Order not found' } };
            }
            Object.assign(targetOrder, updatePayload);
            return { data: targetOrder, error: null };
          }

          let results = db.orders.filter((o) => filters.every((f) => f(o)));
          if (isSingle) {
            return { data: results[0] || null, error: results.length ? null : { message: 'Not found' } };
          }
          return { data: results, error: null };
        }

        if (table === 'order_items') {
          let results = db.orderItems.filter((i) => filters.every((f) => f(i)));
          return { data: results, error: null };
        }

        return { data: [], error: null };
      };

      return builder;
    },
  };
}

/**
 * Helper to build mock HTTP Request
 */
function createMockRequest({
  url = 'http://localhost:3000/api/orders',
  method = 'GET',
  headers = {},
  body = null,
}) {
  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }

  return {
    url,
    method,
    headers: {
      get: (header) => headerMap.get(header.toLowerCase()) || null,
    },
    json: async () => body,
  };
}

// ===========================================================================
// SUITE 1: Helper serverAuth Unit Tests
// ===========================================================================

test('1. serverAuth: rejects request missing Authorization header (HTTP 401)', async () => {
  const req = createMockRequest({ headers: {} });
  const authClient = createMockAuthClient();

  const result = await authenticateServerRequest(req, { customAuthClient: authClient });
  assert.equal(result.authenticated, false);
  assert.equal(result.user, null);
  assert.equal(result.isAdmin, false);
  assert.equal(result.response.status, 401);

  const json = await result.response.json();
  assert.equal(json.error, 'No autorizado: Cabecera Authorization requerida.');
});

test('2. serverAuth: rejects request with malformed Bearer token (HTTP 401)', async () => {
  const req = createMockRequest({ headers: { authorization: 'Basic 123456' } });
  const authClient = createMockAuthClient();

  const result = await authenticateServerRequest(req, { customAuthClient: authClient });
  assert.equal(result.authenticated, false);
  assert.equal(result.response.status, 401);

  const json = await result.response.json();
  assert.equal(json.error, 'No autorizado: Formato de token inválido. Se espera Bearer <token>.');
});

test('3. serverAuth: rejects request with invalid/expired token (HTTP 401)', async () => {
  const req = createMockRequest({ headers: { authorization: 'Bearer expired_or_fake_token' } });
  const authClient = createMockAuthClient();

  const result = await authenticateServerRequest(req, { customAuthClient: authClient });
  assert.equal(result.authenticated, false);
  assert.equal(result.response.status, 401);

  const json = await result.response.json();
  assert.equal(json.error, 'No autorizado: Token inválido o sesión expirada.');
});

test('4. serverAuth: successfully verifies valid client token and identifies non-admin', async () => {
  const req = createMockRequest({ headers: { authorization: 'Bearer valid_client_a_token' } });
  const authClient = createMockAuthClient();

  const result = await authenticateServerRequest(req, { customAuthClient: authClient });
  assert.equal(result.authenticated, true);
  assert.equal(result.user.id, CLIENT_A_ID);
  assert.equal(result.user.email, CLIENT_A_EMAIL);
  assert.equal(result.isAdmin, false);
});

test('5. serverAuth: successfully verifies valid admin token and identifies admin', async () => {
  const req = createMockRequest({ headers: { authorization: 'Bearer valid_admin_token' } });
  const authClient = createMockAuthClient();

  const result = await authenticateServerRequest(req, { customAuthClient: authClient });
  assert.equal(result.authenticated, true);
  assert.equal(result.user.email, ADMIN_EMAIL);
  assert.equal(result.isAdmin, true);
});

// ===========================================================================
// SUITE 2: SEC-01 Tests: POST /api/orders/update-tracking
// ===========================================================================

test('6. SEC-01: update-tracking returns 401 when token is missing', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders/update-tracking',
    method: 'POST',
    headers: {},
    body: { orderId: ORDER_A_ID, stage: 'entregado' },
  });

  const res = await updateTrackingHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'No autorizado: Cabecera Authorization requerida.');

  // Order in DB must remain unmodified
  const order = db.orders.find((o) => o.id === ORDER_A_ID);
  assert.equal(order.status, 'paid');
});

test('7. SEC-01: update-tracking returns 401 when token is invalid', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders/update-tracking',
    method: 'POST',
    headers: { authorization: 'Bearer invalid_token_xyz' },
    body: { orderId: ORDER_A_ID, stage: 'entregado' },
  });

  const res = await updateTrackingHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, 'No autorizado: Token inválido o sesión expirada.');

  // Order in DB must remain unmodified
  const order = db.orders.find((o) => o.id === ORDER_A_ID);
  assert.equal(order.status, 'paid');
});

test('8. SEC-01: update-tracking returns 403 Forbidden when caller is an authenticated regular client', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders/update-tracking',
    method: 'POST',
    headers: { authorization: 'Bearer valid_client_a_token' },
    body: { orderId: ORDER_A_ID, stage: 'entregado', customNote: 'Malicious modification' },
  });

  const res = await updateTrackingHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(
    json.error,
    'Acceso denegado: Se requieren permisos administrativos para actualizar el seguimiento.'
  );

  // Order in DB must remain completely unmodified
  const order = db.orders.find((o) => o.id === ORDER_A_ID);
  assert.equal(order.status, 'paid');
  assert.equal(order.notes, '{"stage":"logistica_usa"}');
});

test('9. SEC-01: update-tracking succeeds when caller is authenticated and authorized admin', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders/update-tracking',
    method: 'POST',
    headers: { authorization: 'Bearer valid_admin_token' },
    body: {
      orderId: ORDER_A_ID,
      shipping_provider: 'FedEx Express',
      tracking_number: 'FDX-999888',
      stage: 'entregado',
      customNote: 'Entrega confirmada en óptica',
    },
  });

  const res = await updateTrackingHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.order.status, 'delivered');
  assert.equal(json.order.shipping_provider, 'FedEx Express');
  assert.equal(json.order.tracking_number, 'FDX-999888');

  // Verify in DB
  const order = db.orders.find((o) => o.id === ORDER_A_ID);
  assert.equal(order.status, 'delivered');
  assert.equal(order.shipping_provider, 'FedEx Express');
});

// ===========================================================================
// SUITE 3: SEC-02 Tests: GET /api/orders
// ===========================================================================

test('10. SEC-02: GET /api/orders returns 401 when token is missing', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders',
    method: 'GET',
    headers: {},
  });

  const res = await getOrdersHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 401);
});

test('11. SEC-02: GET /api/orders: client providing admin email in URL does NOT gain admin privileges', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  // Client A attempts privilege escalation by adding ?email=multifocuslimitada@gmail.com
  const req = createMockRequest({
    url: `http://localhost:3000/api/orders?email=${encodeURIComponent(ADMIN_EMAIL)}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_client_a_token' },
  });

  const res = await getOrdersHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, false);
  // Client A must ONLY receive their own orders (Order A), NOT all orders
  assert.equal(json.orders.length, 1);
  assert.equal(json.orders[0].id, ORDER_A_ID);
  assert.equal(json.orders[0].user_id, CLIENT_A_ID);
});

test('12. SEC-02: GET /api/orders: client providing another client userId in URL only gets their own orders', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  // Client A attempts IDOR by providing ?userId=CLIENT_B_ID
  const req = createMockRequest({
    url: `http://localhost:3000/api/orders?userId=${CLIENT_B_ID}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_client_a_token' },
  });

  const res = await getOrdersHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, false);
  // URL param is strictly ignored, query is forced to Client A
  assert.equal(json.orders.length, 1);
  assert.equal(json.orders[0].id, ORDER_A_ID);
  assert.equal(json.orders[0].user_id, CLIENT_A_ID);
});

test('13. SEC-02: GET /api/orders: authorized admin receives all orders and isAdmin: true', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: 'http://localhost:3000/api/orders',
    method: 'GET',
    headers: { authorization: 'Bearer valid_admin_token' },
  });

  const res = await getOrdersHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, true);
  // Admin receives all valid orders across all clients
  assert.equal(json.orders.length, 2);
});

test('14. SEC-02: GET /api/orders: authorized admin can optionally filter by specific client userId', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: `http://localhost:3000/api/orders?userId=${CLIENT_B_ID}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_admin_token' },
  });

  const res = await getOrdersHandler(req, {
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, true);
  // Admin explicitly asked for Client B's orders
  assert.equal(json.orders.length, 1);
  assert.equal(json.orders[0].id, ORDER_B_ID);
  assert.equal(json.orders[0].user_id, CLIENT_B_ID);
});

// ===========================================================================
// SUITE 4: SEC-02 Tests: GET /api/orders/[id]
// ===========================================================================

test('15. SEC-02: GET /api/orders/[id] returns 401 when token is missing', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: `http://localhost:3000/api/orders/${ORDER_A_ID}`,
    method: 'GET',
    headers: {},
  });

  const res = await getOrderDetailHandler(req, {
    params: Promise.resolve({ id: ORDER_A_ID }),
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 401);
});

test('16. SEC-02: GET /api/orders/[id]: client can view their own order detail', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  const req = createMockRequest({
    url: `http://localhost:3000/api/orders/${ORDER_A_ID}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_client_a_token' },
  });

  const res = await getOrderDetailHandler(req, {
    params: Promise.resolve({ id: ORDER_A_ID }),
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, false);
  assert.equal(json.order.id, ORDER_A_ID);
  assert.equal(json.order.user_id, CLIENT_A_ID);
  assert.equal(json.items.length, 1);
});

test('17. SEC-02: GET /api/orders/[id]: client attempting to view another client order gets 404', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  // Client A tries to access Order B (belongs to Client B)
  const req = createMockRequest({
    url: `http://localhost:3000/api/orders/${ORDER_B_ID}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_client_a_token' },
  });

  const res = await getOrderDetailHandler(req, {
    params: Promise.resolve({ id: ORDER_B_ID }),
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  // Must return 404 Not Found to prevent data exposure or existence probing
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.error, 'Pedido no encontrado o sin permisos');
});

test('18. SEC-02: GET /api/orders/[id]: admin can view any client order detail', async () => {
  const db = createMockDb();
  const authClient = createMockAuthClient();
  const adminClient = createMockAdminClient(db);

  // Admin accesses Order B
  const req = createMockRequest({
    url: `http://localhost:3000/api/orders/${ORDER_B_ID}`,
    method: 'GET',
    headers: { authorization: 'Bearer valid_admin_token' },
  });

  const res = await getOrderDetailHandler(req, {
    params: Promise.resolve({ id: ORDER_B_ID }),
    customAuthClient: authClient,
    customAdminClient: adminClient,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.isAdmin, true);
  assert.equal(json.order.id, ORDER_B_ID);
  assert.equal(json.items.length, 1);
});
