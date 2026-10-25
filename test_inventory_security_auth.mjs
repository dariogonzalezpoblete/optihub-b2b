// test_inventory_security_auth.mjs
// Automated test suite for FASE 25.0: Controlled security implementation for Inventory routes
// Tests SEC-03, SEC-04, and SEC-05 protections.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register the path alias loader for @/ resolution under Node.js native ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

// Import route handlers
const { handleAdjustStock } = await import(
  './frontend/app/api/inventory/adjust/route.ts'
);
const { handleDeductStock } = await import(
  './frontend/app/api/inventory/deduct/route.ts'
);
const { handleCreateInventoryOrder } = await import(
  './frontend/app/api/inventory/orders/route.ts'
);

// ---------------------------------------------------------------------------
// TEST MOCKS & FIXTURES
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'multifocuslimitada@gmail.com';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_EMAIL = 'optica_cliente@test.cl';
const VICTIM_USER_ID = '99999999-9999-4999-8999-999999999999';

function createMockAuthClient() {
  const usersByToken = new Map([
    [
      'valid_admin_token',
      { id: 'admin-uuid', email: ADMIN_EMAIL, role: 'authenticated' },
    ],
    [
      'valid_client_token',
      { id: CLIENT_ID, email: CLIENT_EMAIL, role: 'authenticated' },
    ],
  ]);

  return {
    auth: {
      getUser: async (token) => {
        if (usersByToken.has(token)) {
          return { data: { user: usersByToken.get(token) }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid or expired token') };
      },
    },
  };
}

function createMockInventoryService() {
  const calls = {
    adjust: [],
    deduct: [],
    createOrder: [],
  };

  return {
    calls,
    adjustOrReplenishStockAtomic: async (input) => {
      calls.adjust.push(input);
      return {
        success: true,
        productId: input.productId,
        previousStock: 10,
        newStock: 10 + input.quantityDelta,
        quantityDelta: input.quantityDelta,
        movement: { id: 'mov-1', type: input.type, quantity: input.quantityDelta },
      };
    },
    deductStockForOrderAtomic: async (orderId) => {
      calls.deduct.push(orderId);
      return {
        success: true,
        orderId,
        alreadyProcessed: false,
        message: 'Stock descontado exitosamente.',
        deductions: [{ productId: 'PROD-1', requestedQuantity: 2, previousStock: 5, newStock: 3 }],
      };
    },
    createPurchaseOrderWithAtomicStockDeduction: async (input) => {
      calls.createOrder.push(input);
      return {
        success: true,
        order: { id: 'ord-123', user_id: input.userId, total_amount: 150000, status: 'paid' },
        orderItems: [],
        movements: [],
        deductions: [],
      };
    },
  };
}

function createMockRequest({
  url = 'http://localhost:3000/api/inventory/adjust',
  method = 'POST',
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
    json: async () => {
      if (body === 'INVALID_JSON') {
        throw new SyntaxError('Unexpected token in JSON');
      }
      return body;
    },
  };
}

// ===========================================================================
// SUITE 1: POST /api/inventory/adjust (SEC-03)
// ===========================================================================

test('1. SEC-03: /api/inventory/adjust rejects request missing Authorization header (401)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    headers: {},
    body: { productId: 'MARCO-1', quantityDelta: 5 },
  });

  const res = await handleAdjustStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 401);
  assert.equal(invService.calls.adjust.length, 0); // Core logic NEVER reached
});

test('2. SEC-03: /api/inventory/adjust rejects request with invalid token (401)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    headers: { authorization: 'Bearer invalid_or_expired_token' },
    body: { productId: 'MARCO-1', quantityDelta: 5 },
  });

  const res = await handleAdjustStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 401);
  assert.equal(invService.calls.adjust.length, 0);
});

test('3. SEC-03: /api/inventory/adjust returns 403 Forbidden when called by authenticated regular client', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    headers: { authorization: 'Bearer valid_client_token' },
    body: { productId: 'MARCO-1', quantityDelta: 5 },
  });

  const res = await handleAdjustStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.code, 'FORBIDDEN');
  assert.equal(invService.calls.adjust.length, 0); // Mutation BLOCKED
});

test('4. SEC-03: /api/inventory/adjust rejects invalid JSON or empty body (400)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();

  // Invalid JSON
  const reqInvalid = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: 'INVALID_JSON',
  });
  const resInvalid = await handleAdjustStock(reqInvalid, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });
  assert.equal(resInvalid.status, 400);

  // Empty body
  const reqEmpty = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: null,
  });
  const resEmpty = await handleAdjustStock(reqEmpty, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });
  assert.equal(resEmpty.status, 400);
});

test('5. SEC-03: /api/inventory/adjust rejects missing productId or invalid quantityDelta (400)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();

  // Missing productId
  const req1 = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: '   ', quantityDelta: 5 },
  });
  const res1 = await handleAdjustStock(req1, { customAuthClient: authClient, customInventoryService: invService });
  assert.equal(res1.status, 400);

  // quantityDelta = 0
  const req2 = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-1', quantityDelta: 0 },
  });
  const res2 = await handleAdjustStock(req2, { customAuthClient: authClient, customInventoryService: invService });
  assert.equal(res2.status, 400);

  // quantityDelta not integer
  const req3 = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-1', quantityDelta: 4.5 },
  });
  const res3 = await handleAdjustStock(req3, { customAuthClient: authClient, customInventoryService: invService });
  assert.equal(res3.status, 400);

  // quantityDelta out of range (> 100,000)
  const req4 = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-1', quantityDelta: 500000 },
  });
  const res4 = await handleAdjustStock(req4, { customAuthClient: authClient, customInventoryService: invService });
  assert.equal(res4.status, 400);

  // Invalid type
  const req5 = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-1', quantityDelta: 10, type: 'INVALID_TYPE' },
  });
  const res5 = await handleAdjustStock(req5, { customAuthClient: authClient, customInventoryService: invService });
  assert.equal(res5.status, 400);

  assert.equal(invService.calls.adjust.length, 0);
});

test('6. SEC-03: /api/inventory/adjust succeeds and invokes core logic when caller is authenticated admin', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-ALPHA', quantityDelta: 20, type: 'RETURN', notes: 'Reposición por devolución' },
  });

  const res = await handleAdjustStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.productId, 'MARCO-ALPHA');
  assert.equal(json.newStock, 30);
  assert.equal(invService.calls.adjust.length, 1);
  assert.equal(invService.calls.adjust[0].productId, 'MARCO-ALPHA');
  assert.equal(invService.calls.adjust[0].type, 'RETURN');
});

// ===========================================================================
// SUITE 2: POST /api/inventory/deduct (SEC-04)
// ===========================================================================

test('7. SEC-04: /api/inventory/deduct rejects request missing Authorization header (401)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/deduct',
    headers: {},
    body: { orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });

  const res = await handleDeductStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 401);
  assert.equal(invService.calls.deduct.length, 0);
});

test('8. SEC-04: /api/inventory/deduct returns 403 Forbidden when called by regular client (prevents order stock tampering)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/deduct',
    headers: { authorization: 'Bearer valid_client_token' },
    body: { orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });

  const res = await handleDeductStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.code, 'FORBIDDEN');
  assert.equal(invService.calls.deduct.length, 0);
});

test('9. SEC-04: /api/inventory/deduct rejects missing or empty orderId (400)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/deduct',
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { orderId: '   ' },
  });

  const res = await handleDeductStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 400);
  assert.equal(invService.calls.deduct.length, 0);
});

test('10. SEC-04: /api/inventory/deduct succeeds when called by authorized admin', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const targetOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/deduct',
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { orderId: targetOrderId },
  });

  const res = await handleDeductStock(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.orderId, targetOrderId);
  assert.equal(invService.calls.deduct.length, 1);
  assert.equal(invService.calls.deduct[0], targetOrderId);
});

// ===========================================================================
// SUITE 3: POST /api/inventory/orders (SEC-05)
// ===========================================================================

test('11. SEC-05: /api/inventory/orders rejects request missing Authorization header (401)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/orders',
    headers: {},
    body: { userId: VICTIM_USER_ID, items: [{ productId: 'PROD-1', quantity: 2 }] },
  });

  const res = await handleCreateInventoryOrder(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 401);
  assert.equal(invService.calls.createOrder.length, 0);
});

test('12. SEC-05 / CRÍTICO-01: /api/inventory/orders returns 403 Forbidden when called by regular client (prevents direct stock depletion and bypass of checkout lease)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();

  // Regular client attempts to invoke /api/inventory/orders directly
  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/orders',
    headers: { authorization: 'Bearer valid_client_token' },
    body: {
      userId: VICTIM_USER_ID,
      items: [{ productId: 'PROD-1', quantity: 2, unitPriceNet: 0 }],
      customerName: 'Cliente Spoof',
    },
  });

  const res = await handleCreateInventoryOrder(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.code, 'FORBIDDEN');
  // CRITICAL CHECK: Core logic NEVER reached -> zero orders created, zero stock deducted
  assert.equal(invService.calls.createOrder.length, 0);
});

test('13. SEC-05: /api/inventory/orders rejects empty or invalid items array (400)', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();

  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/orders',
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { items: [] },
  });

  const res = await handleCreateInventoryOrder(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 400);
  assert.equal(invService.calls.createOrder.length, 0);
});

test('14. SEC-05 / CRÍTICO-01: /api/inventory/orders allows authorized admin and strips any client-supplied unitPriceNet', async () => {
  const authClient = createMockAuthClient();
  const invService = createMockInventoryService();

  const req = createMockRequest({
    url: 'http://localhost:3000/api/inventory/orders',
    headers: { authorization: 'Bearer valid_admin_token' },
    body: {
      userId: VICTIM_USER_ID, // Admin creating on behalf of a client
      items: [{ productId: 'PROD-1', quantity: 2, unitPriceNet: 0 }],
    },
  });

  const res = await handleCreateInventoryOrder(req, {
    customAuthClient: authClient,
    customInventoryService: invService,
  });

  assert.equal(res.status, 201);
  assert.equal(invService.calls.createOrder.length, 1);
  assert.equal(invService.calls.createOrder[0].userId, VICTIM_USER_ID);
  assert.equal(
    'unitPriceNet' in invService.calls.createOrder[0].items[0],
    false,
    'Client-supplied unitPriceNet must be stripped by route handler'
  );
});

// ===========================================================================
// SUITE 4: Legitimate flows & Error handling
// ===========================================================================

test('15. Legitimate flow: deductStockForOrderAtomic remains available internally without HTTP dependency', async () => {
  const invService = createMockInventoryService();
  const orderId = 'test-internal-order';

  // Simulates internal call from mercadopagoWebhookHandler.ts
  const result = await invService.deductStockForOrderAtomic(orderId);
  assert.equal(result.success, true);
  assert.equal(result.orderId, orderId);
  assert.equal(invService.calls.deduct.length, 1);
});

test('16. Error handling: service exception returns standardized response without leaking secrets', async () => {
  const authClient = createMockAuthClient();
  const failingService = {
    adjustOrReplenishStockAtomic: async () => {
      throw new Error('Database connection failed with credentials [SECRET_KEY]');
    },
  };

  const req = createMockRequest({
    headers: { authorization: 'Bearer valid_admin_token' },
    body: { productId: 'MARCO-1', quantityDelta: 5 },
  });

  const res = await handleAdjustStock(req, {
    customAuthClient: authClient,
    customInventoryService: failingService,
  });

  assert.equal(res.status, 500);
  const json = await res.json();
  assert.equal(json.code, 'INTERNAL_SERVER_ERROR');
  assert.ok(!JSON.stringify(json).includes('SECRET_KEY'));
});
