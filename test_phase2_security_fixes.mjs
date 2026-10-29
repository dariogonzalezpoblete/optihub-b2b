// test_phase2_security_fixes.mjs
// FASE 2: H-01 (pool sin config), H-02 (/api/inventory/check), H-04 (seguimiento), H-06 (webhook secret).
// 100% local: sin red, sin base de datos y sin servicios remotos (todo con mocks).
// Ejecutar desde la raíz del repo: node --test test_phase2_security_fixes.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./test_alias_loader.mjs', pathToFileURL('./'));

const { handleCheckStockGet, handleCheckStockPost } = await import(
  './frontend/app/api/inventory/check/route.ts'
);
const { processMercadoPagoWebhookEvent } = await import(
  './frontend/lib/payments/mercadopagoWebhookHandler.ts'
);
const { getPool, isPoolConnectionError, DB_NOT_CONFIGURED_CODE } = await import(
  './frontend/lib/db/postgres.ts'
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const authClient = {
  auth: {
    getUser: async (token) => {
      const users = {
        pending_token: { id: 'u-pending', email: 'pendiente@test.cl', app_metadata: {}, user_metadata: {} },
        approved_token: {
          id: 'u-approved',
          email: 'optica@test.cl',
          app_metadata: { b2b_approved: true },
          user_metadata: {},
        },
        blocked_token: {
          id: 'u-blocked',
          email: 'bloqueado@test.cl',
          app_metadata: {},
          user_metadata: { estado_verificacion: 'rechazado' },
        },
        // Un cliente no puede autoaprobarse con parámetros propios: solo cuenta lo que devuelve Supabase.
      };
      return users[token]
        ? { data: { user: users[token] }, error: null }
        : { data: { user: null }, error: new Error('invalid') };
    },
  },
};

function makeService(impl) {
  const calls = [];
  return {
    calls,
    checkStockAvailability: async (ids) => {
      calls.push(ids);
      return impl ? impl(ids) : ids.map((id) => ({
        productId: id,
        exists: true,
        availableStock: 7,
        brandName: 'SECRET-BRAND',
        modelName: 'SECRET-MODEL',
        priceNetoClp: 123456,
        isAvailable: true,
      }));
    },
  };
}

const url = (qs) => `http://localhost/api/inventory/check${qs}`;
const get = (qs, token) =>
  new Request(url(qs), { headers: token ? { authorization: `Bearer ${token}` } : {} });
const post = (body, token, raw = false) =>
  new Request(url(''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: raw ? body : JSON.stringify(body),
  });

// ---------------------------------------------------------------------------
// H-02: /api/inventory/check
// ---------------------------------------------------------------------------
test('H-02: sin sesión → 401 y no consulta inventario (GET y POST)', async () => {
  const svc = makeService();
  const opts = { customAuthClient: authClient, customInventoryService: svc };
  assert.equal((await handleCheckStockGet(get('?ids=A-1'), opts)).status, 401);
  assert.equal((await handleCheckStockPost(post({ productIds: ['A-1'] }), opts)).status, 401);
  assert.equal((await handleCheckStockGet(get('?ids=A-1', 'token_falso'), opts)).status, 401);
  assert.equal(svc.calls.length, 0);
});

test('H-02: sesión no aprobada o rechazada → 403 y no consulta inventario', async () => {
  const svc = makeService();
  const opts = { customAuthClient: authClient, customInventoryService: svc };
  assert.equal((await handleCheckStockGet(get('?ids=A-1', 'pending_token'), opts)).status, 403);
  assert.equal((await handleCheckStockPost(post({ productIds: ['A-1'] }, 'blocked_token'), opts)).status, 403);
  assert.equal(svc.calls.length, 0);
});

test('H-02: B2B aprobado → 200 limitado a productId/availableStock/isAvailable', async () => {
  const svc = makeService();
  const opts = { customAuthClient: authClient, customInventoryService: svc };
  for (const res of [
    await handleCheckStockGet(get('?ids=GG1319O-001,GG1319O-001,B-2', 'approved_token'), opts),
    await handleCheckStockPost(post({ productIds: ['GG1319O-001', 'B-2'] }, 'approved_token'), opts),
  ]) {
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') || '', /no-store/);
    const json = await res.json();
    assert.equal(json.items.length, 2);
    for (const item of json.items) {
      assert.deepEqual(Object.keys(item).sort(), ['availableStock', 'isAvailable', 'productId']);
    }
    const text = JSON.stringify(json);
    assert.ok(!/SECRET|priceNeto|precio|123456|brandName|modelName/.test(text));
  }
});

test('H-02: identificadores malformados → 400 controlado', async () => {
  const svc = makeService();
  const opts = { customAuthClient: authClient, customInventoryService: svc };
  const bad = [
    await handleCheckStockGet(get('?ids=', 'approved_token'), opts),
    await handleCheckStockGet(get('?ids=' + encodeURIComponent("x';DROP TABLE marcos;--"), 'approved_token'), opts),
    await handleCheckStockGet(get('?ids=' + 'a'.repeat(65), 'approved_token'), opts),
    await handleCheckStockGet(
      get('?ids=' + Array.from({ length: 51 }, (_, i) => `id${i}`).join(','), 'approved_token'),
      opts
    ),
    await handleCheckStockPost(post({ productIds: [{ $ne: 1 }] }, 'approved_token'), opts),
    await handleCheckStockPost(post({ productIds: 'A-1' }, 'approved_token'), opts),
    await handleCheckStockPost(post('{no-json', 'approved_token', true), opts),
  ];
  for (const res of bad) {
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.code);
  }
  assert.equal(svc.calls.length, 0);
});

test('H-02: error del pool → 503 controlado sin filtrar detalles internos', async () => {
  const leak = 'connect ECONNREFUSED 10.0.0.5:5432 password=hunter2';
  const svc = makeService(async () => {
    const e = new Error(leak);
    e.code = 'ECONNREFUSED';
    throw e;
  });
  const res = await handleCheckStockGet(get('?ids=A-1', 'approved_token'), {
    customAuthClient: authClient,
    customInventoryService: svc,
  });
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.ok(!text.includes('hunter2') && !text.includes('10.0.0.5') && !text.includes('ECONNREFUSED'));

  // Error inesperado genérico: tampoco filtra el mensaje
  const svc2 = makeService(async () => {
    throw new Error('secret internal detail xyz');
  });
  const res2 = await handleCheckStockPost(post({ productIds: ['A-1'] }, 'approved_token'), {
    customAuthClient: authClient,
    customInventoryService: svc2,
  });
  assert.ok(res2.status >= 500);
  assert.ok(!(await res2.text()).includes('secret internal detail xyz'));
});

// ---------------------------------------------------------------------------
// H-01: pool sin configuración en producción
// ---------------------------------------------------------------------------
test('H-01: producción sin DATABASE_URL/PGHOST falla explícito (no cae a 127.0.0.1) y se clasifica como error de pool', () => {
  const saved = { ...process.env };
  const savedPool = globalThis.__optihubPgPool;
  try {
    delete globalThis.__optihubPgPool;
    for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL', 'PGHOST']) delete process.env[k];
    process.env.NODE_ENV = 'production';
    let err;
    try {
      getPool();
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'debe lanzar');
    assert.equal(err.code, DB_NOT_CONFIGURED_CODE);
    assert.equal(isPoolConnectionError(err), true);
    assert.equal(globalThis.__optihubPgPool, undefined);
  } finally {
    process.env = saved;
    globalThis.__optihubPgPool = savedPool;
  }
});

// ---------------------------------------------------------------------------
// H-06: secreto del webhook
// ---------------------------------------------------------------------------
const SECRET = 'test-webhook-secret';
const DATA_ID = '123456789';
const REQ_ID = 'req-1';

function sign(secret, dataId = DATA_ID, reqId = REQ_ID) {
  const ts = String(Date.now());
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

async function withEnv(vars, fn) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    process.env = saved;
  }
}

const baseParams = (xSignature) => ({
  xSignature,
  xRequestId: REQ_ID,
  dataId: DATA_ID,
  type: 'payment',
  bodyPayload: null,
});

// El fetcher falla a propósito: el flujo se detiene tras pasar la validación de firma, sin tocar BD.
let fetcherCalls = 0;
const opts = {
  allowInTest: true,
  customPaymentFetcher: async () => {
    fetcherCalls++;
    throw new Error('stop-after-signature');
  },
};

const SANDBOX = { MP_ACCESS_TOKEN: 'TEST-0000-sandbox', MP_SANDBOX_MODE: 'true', MP_TEST_ACCESS_TOKEN: undefined };

test('H-06: producción sin MP_WEBHOOK_SECRET → 500 aun con modo Sandbox activo', async () => {
  fetcherCalls = 0;
  const r = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: undefined, VERCEL_ENV: 'production', NODE_ENV: 'production' },
    () => processMercadoPagoWebhookEvent(baseParams('ts=1,v1=abc'), opts)
  );
  assert.equal(r.statusCode, 500);
  assert.equal(fetcherCalls, 0);
});

test('H-06: entorno desconocido (sin VERCEL_ENV) sin secreto → 500 (fail-closed)', async () => {
  fetcherCalls = 0;
  const r = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: undefined, VERCEL_ENV: undefined, NODE_ENV: 'production' },
    () => processMercadoPagoWebhookEvent(baseParams('ts=1,v1=abc'), opts)
  );
  assert.notEqual(r.statusCode, 200);
  assert.equal(fetcherCalls, 0);
});

test('H-06: producción con firma inválida → 401 y no consulta el pago', async () => {
  fetcherCalls = 0;
  const r = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: SECRET, VERCEL_ENV: 'production', NODE_ENV: 'production' },
    () => processMercadoPagoWebhookEvent(baseParams(sign('otro-secreto')), opts)
  );
  assert.equal(r.statusCode, 401);
  assert.equal(fetcherCalls, 0);
});

test('H-06: producción sin cabeceras de firma → 401', async () => {
  const r = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: SECRET, VERCEL_ENV: 'production', NODE_ENV: 'production' },
    () => processMercadoPagoWebhookEvent({ ...baseParams(null), xRequestId: null }, opts)
  );
  assert.equal(r.statusCode, 401);
});

test('H-06: producción con firma válida → supera la firma y continúa con verificación server-to-server', async () => {
  fetcherCalls = 0;
  const r = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: SECRET, VERCEL_ENV: 'production', NODE_ENV: 'production' },
    () => processMercadoPagoWebhookEvent(baseParams(sign(SECRET)), opts)
  );
  assert.notEqual(r.statusCode, 401);
  assert.ok(fetcherCalls >= 1, 'debe consultar el pago en Mercado Pago tras validar la firma');
});

test('H-06: Sandbox local (test) sin secreto sigue permitido, solo con modo Sandbox fiable', async () => {
  fetcherCalls = 0;
  const ok = await withEnv(
    { ...SANDBOX, MP_WEBHOOK_SECRET: undefined, VERCEL_ENV: undefined, NODE_ENV: 'test' },
    () => processMercadoPagoWebhookEvent(baseParams('ts=1,v1=abc'), opts)
  );
  assert.notEqual(ok.statusCode, 500);
  assert.notEqual(ok.statusCode, 401);
  assert.ok(fetcherCalls >= 1);

  // Mismo entorno local pero con credenciales NO sandbox → exige secreto
  fetcherCalls = 0;
  const strict = await withEnv(
    {
      MP_ACCESS_TOKEN: 'APP_USR-live',
      MP_TEST_ACCESS_TOKEN: undefined,
      MP_SANDBOX_MODE: undefined,
      NEXT_PUBLIC_MP_SANDBOX_MODE: undefined,
      NEXT_PUBLIC_MP_PUBLIC_KEY: 'APP_USR-pub',
      NEXT_PUBLIC_MP_TEST_PUBLIC_KEY: undefined,
      MP_WEBHOOK_SECRET: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: 'test',
    },
    () => processMercadoPagoWebhookEvent(baseParams('ts=1,v1=abc'), opts)
  );
  assert.equal(strict.statusCode, 500);
  assert.equal(fetcherCalls, 0);
});

// ---------------------------------------------------------------------------
// H-04: seguimiento (comprobación estática del código cliente)
// ---------------------------------------------------------------------------
test('H-04: seguimiento no usa select(*) y filtra por el usuario autenticado', () => {
  const src = fs.readFileSync('./frontend/app/seguimiento/page.tsx', 'utf8');
  assert.ok(!/\.select\(\s*['"]\*['"]/.test(src), 'no debe usar select(*)');
  const m = src.match(/TRACKING_ORDER_COLUMNS\s*=\s*\n?\s*'([^']+)'/);
  assert.ok(m, 'debe declarar columnas explícitas');
  const cols = m[1].split(',').map((c) => c.trim());
  assert.deepEqual(cols, ['id', 'status', 'payment_status', 'created_at', 'notes', 'shipping_provider', 'tracking_number']);
  for (const forbidden of [
    'customer_email', 'customer_phone', 'business_rut', 'billing_address', 'shipping_address',
    'payment_id', 'user_id', 'stock_error', 'total_amount',
  ]) {
    assert.ok(!cols.includes(forbidden), `no debe incluir ${forbidden}`);
  }
  assert.match(src, /\.eq\('user_id',\s*user\?\.id/);
});
