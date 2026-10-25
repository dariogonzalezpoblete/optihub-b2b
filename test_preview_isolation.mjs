// test_preview_isolation.mjs
// Automated test suite for FASE 25.1: Preview Environment Isolation
// Verifies that Vercel Preview deployments cannot mutate production orders, inventory, or webhook state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register path alias loader for @/ resolution under Node.js ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

// Import runtime environment helper
const {
  getRuntimeEnvironment,
  isPreviewEnvironment,
  isProductionEnvironment,
  checkBusinessMutationAllowed,
} = await import('./frontend/lib/env/runtimeEnv.ts');

// Import routes and handlers
const { handleAdjustStock } = await import(
  './frontend/app/api/inventory/adjust/route.ts'
);
const { handleDeductStock } = await import(
  './frontend/app/api/inventory/deduct/route.ts'
);
const { handleCreateInventoryOrder } = await import(
  './frontend/app/api/inventory/orders/route.ts'
);
const { handleUpdateTracking } = await import(
  './frontend/app/api/orders/update-tracking/route.ts'
);
const { processMercadoPagoWebhookEvent } = await import(
  './frontend/lib/payments/mercadopagoWebhookHandler.ts'
);
const { POST: webhookRoutePost } = await import(
  './frontend/app/api/mercadopago/webhook/route.ts'
);
const { handleGetOrders } = await import(
  './frontend/app/api/orders/route.ts'
);

// ---------------------------------------------------------------------------
// TEST MOCKS & FIXTURES
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'multifocuslimitada@gmail.com';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function createMockAuthClient() {
  const usersByToken = new Map([
    [
      'valid_admin_token',
      { id: 'admin-uuid', email: ADMIN_EMAIL, role: 'authenticated' },
    ],
    [
      'valid_client_token',
      { id: CLIENT_ID, email: 'client@test.cl', role: 'authenticated' },
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
  const calls = { adjust: [], deduct: [], createOrder: [] };
  return {
    calls,
    adjustOrReplenishStockAtomic: async (input) => {
      calls.adjust.push(input);
      return { success: true, productId: input.productId, newStock: 20 };
    },
    deductStockForOrderAtomic: async (orderId) => {
      calls.deduct.push(orderId);
      return { success: true, orderId, alreadyProcessed: false };
    },
    createPurchaseOrderWithAtomicStockDeduction: async (input) => {
      calls.createOrder.push(input);
      return { success: true, order: { id: 'ord-test', user_id: input.userId } };
    },
  };
}

function createMockRequest({
  url = 'http://localhost:3000/api/endpoint',
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
    json: async () => body,
  };
}

// ===========================================================================
// SUITE 1: runtimeEnv.ts helper unit tests
// ===========================================================================

test('1. runtimeEnv: accurately identifies environments based on explicit signals', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    process.env.VERCEL_ENV = 'preview';
    assert.equal(getRuntimeEnvironment(), 'preview');
    assert.equal(isPreviewEnvironment(), true);
    assert.equal(isProductionEnvironment(), false);

    process.env.VERCEL_ENV = 'production';
    assert.equal(getRuntimeEnvironment(), 'production');
    assert.equal(isPreviewEnvironment(), false);
    assert.equal(isProductionEnvironment(), true);

    process.env.VERCEL_ENV = 'development';
    assert.equal(getRuntimeEnvironment(), 'development');

    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
    assert.equal(getRuntimeEnvironment(), 'test');

    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    assert.equal(getRuntimeEnvironment(), 'unknown');
    assert.equal(isProductionEnvironment(), false);
    assert.equal(isPreviewEnvironment(), false);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('2. runtimeEnv: absence of VERCEL_ENV does NOT infer production and fails safe (403)', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;

    const guard = checkBusinessMutationAllowed('test_operation');
    assert.equal(guard.allowed, false);
    assert.equal(guard.environment, 'unknown');
    assert.equal(guard.response.status, 403);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

// ===========================================================================
// SUITE 2: Preview blocks Inventory mutations even for Admins
// ===========================================================================

test('3. Preview isolation: /api/inventory/adjust is blocked under VERCEL_ENV=preview for Admin (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const authClient = createMockAuthClient();
    const invService = createMockInventoryService();
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid_admin_token' },
      body: { productId: 'MARCO-1', quantityDelta: 5 },
    });

    const res = await handleAdjustStock(req, {
      customAuthClient: authClient,
      customInventoryService: invService,
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(json.environment, 'preview');
    // Core database mutation was NEVER invoked
    assert.equal(invService.calls.adjust.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

test('4. Preview isolation: /api/inventory/deduct is blocked under VERCEL_ENV=preview for Admin (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const authClient = createMockAuthClient();
    const invService = createMockInventoryService();
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid_admin_token' },
      body: { orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });

    const res = await handleDeductStock(req, {
      customAuthClient: authClient,
      customInventoryService: invService,
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(invService.calls.deduct.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

test('5. Preview isolation: /api/inventory/orders is blocked under VERCEL_ENV=preview (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const authClient = createMockAuthClient();
    const invService = createMockInventoryService();
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid_client_token' },
      body: { items: [{ productId: 'MARCO-1', quantity: 2 }] },
    });

    const res = await handleCreateInventoryOrder(req, {
      customAuthClient: authClient,
      customInventoryService: invService,
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(invService.calls.createOrder.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

// ===========================================================================
// SUITE 3: Preview blocks Order Tracking mutations for Admins
// ===========================================================================

test('6. Preview isolation: /api/orders/update-tracking is blocked under VERCEL_ENV=preview for Admin (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  let dbUpdated = false;
  const mockAdminClient = {
    from: () => ({
      update: () => {
        dbUpdated = true;
        return { eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) };
      },
    }),
  };

  try {
    const authClient = createMockAuthClient();
    const req = createMockRequest({
      url: 'http://localhost:3000/api/orders/update-tracking',
      headers: { authorization: 'Bearer valid_admin_token' },
      body: { orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', stage: 'entregado' },
    });

    const res = await handleUpdateTracking(req, {
      customAuthClient: authClient,
      customAdminClient: mockAdminClient,
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(dbUpdated, false); // Database was NEVER touched
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

// ===========================================================================
// SUITE 4: Preview blocks Mercado Pago Webhooks from mutating DB
// ===========================================================================

test('7. Preview isolation: processMercadoPagoWebhookEvent is blocked under VERCEL_ENV=preview (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  let dbTransactionStarted = false;
  const mockClient = {
    query: async () => {
      dbTransactionStarted = true;
      return { rows: [] };
    },
  };

  try {
    const result = await processMercadoPagoWebhookEvent(
      {
        dataId: '123456789',
        type: 'payment',
        xSignature: 'sig',
        xRequestId: 'req-1',
      },
      {
        customClient: mockClient,
      }
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body.code, 'PREVIEW_MUTATION_BLOCKED');
    assert.equal(result.body.environment, 'preview');
    assert.equal(dbTransactionStarted, false); // No SQL transaction, no stock decrement
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

test('8. Preview isolation: POST /api/mercadopago/webhook route is blocked under VERCEL_ENV=preview (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const req = {
      headers: new Map([
        ['x-signature', 'fake_sig'],
        ['x-request-id', 'req-123'],
      ]),
      nextUrl: {
        searchParams: new URLSearchParams({ 'data.id': '12345', type: 'payment' }),
      },
      clone: () => ({ json: async () => ({}) }),
    };

    const res = await webhookRoutePost(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'PREVIEW_MUTATION_BLOCKED');
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

// ===========================================================================
// SUITE 5: Production preserves normal expected flow
// ===========================================================================

test('9. Production flow: /api/inventory/adjust proceeds normally under VERCEL_ENV=production', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';

  try {
    const authClient = createMockAuthClient();
    const invService = createMockInventoryService();
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid_admin_token' },
      body: { productId: 'MARCO-PROD', quantityDelta: 15 },
    });

    const res = await handleAdjustStock(req, {
      customAuthClient: authClient,
      customInventoryService: invService,
    });

    assert.equal(res.status, 200);
    assert.equal(invService.calls.adjust.length, 1);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

// ===========================================================================
// SUITE 6: Public Catalog Reads remain completely functional in Preview
// ===========================================================================

test('10. Public Reads: GET /api/orders query remains accessible in Preview', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const authClient = createMockAuthClient();
    const mockAdminClient = {
      from: () => ({
        select: () => ({
          neq: () => ({
            order: () => ({
              eq: () => Promise.resolve({ data: [{ id: 'ord-1', total_amount: 1000 }], error: null }),
            }),
          }),
        }),
      }),
    };

    const req = createMockRequest({
      url: 'http://localhost:3000/api/orders',
      method: 'GET',
      headers: { authorization: 'Bearer valid_client_token' },
    });

    const res = await handleGetOrders(req, {
      customAuthClient: authClient,
      customAdminClient: mockAdminClient,
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.orders.length, 1);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});

// ===========================================================================
// SUITE 7: Error responses do not leak sensitive information
// ===========================================================================

test('11. Security: Blocked Preview responses do not leak secrets or credentials', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';

  try {
    const authClient = createMockAuthClient();
    const invService = createMockInventoryService();
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid_admin_token' },
      body: { productId: 'MARCO-1', quantityDelta: 5 },
    });

    const res = await handleAdjustStock(req, {
      customAuthClient: authClient,
      customInventoryService: invService,
    });

    const json = await res.json();
    const str = JSON.stringify(json);

    assert.ok(!str.includes('postgres://'));
    assert.ok(!str.includes('service_role'));
    assert.ok(!str.includes('SUPABASE_'));
    assert.ok(!str.includes('APP_USR'));
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
  }
});
