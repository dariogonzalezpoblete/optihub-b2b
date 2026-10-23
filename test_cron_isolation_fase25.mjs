// test_cron_isolation_fase25.mjs
// Automated test suite for FASE 25.2 (Etapa C): Aislamiento del Cron y Outbox de Correos
//
// Verifies that Vercel Preview, local development, and unverified environments
// CANNOT claim, modify, or process records from the shared PostgreSQL order_email_outbox queue.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register path alias loader for @/ resolution under Node.js ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

// Import runtime environment helpers
const {
  checkCronDispatchAllowed,
  isCronDispatchAllowed,
  getRuntimeEnvironment,
} = await import('./frontend/lib/env/runtimeEnv.ts');

// Import route handlers
const {
  handleDispatchEmails,
  handleDispatch,
  GET,
  POST,
} = await import('./frontend/app/api/cron/dispatch-emails/route.ts');

// ---------------------------------------------------------------------------
// TEST FIXTURES & HELPERS
// ---------------------------------------------------------------------------

const CRON_SECRET = 'cron-secret-fase25-test-key-xyz987';
const OUTBOX_SECRET = 'outbox-secret-fase25-test-key-abc123';
const VALID_ORDER_ID = 'e6b8c9d0-1234-4567-89ab-cdef01234567';

function createMockCronRequest({
  url = 'http://localhost:3000/api/cron/dispatch-emails',
  method = 'GET',
  headers = {},
  searchParams = {},
}) {
  const urlObj = new URL(url);
  for (const [key, val] of Object.entries(searchParams)) {
    urlObj.searchParams.set(key, val);
  }

  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }

  return {
    url: urlObj.toString(),
    nextUrl: urlObj,
    method,
    headers: {
      get: (header) => headerMap.get(header.toLowerCase()) || null,
    },
    json: async () => null,
  };
}

function createMockDispatchTracker() {
  const calls = [];
  const mockFn = async (options) => {
    calls.push(options);
    return {
      processedCount: 1,
      sentCount: 1,
      failedCount: 0,
      details: [{ outboxId: 'mock-outbox-id', orderId: options.orderId || 'general-ord', status: 'SENT', attempts: 1 }],
    };
  };
  return { calls, mockFn };
}

// ===========================================================================
// SUITE 1: runtimeEnv checkCronDispatchAllowed unit tests
// ===========================================================================

test('1. checkCronDispatchAllowed: strictly allows only production, blocks preview and unknown', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // Production allowed
    process.env.VERCEL_ENV = 'production';
    assert.equal(checkCronDispatchAllowed().allowed, true);
    assert.equal(isCronDispatchAllowed(), true);
    assert.equal(checkCronDispatchAllowed().environment, 'production');

    // Preview blocked (403)
    process.env.VERCEL_ENV = 'preview';
    const previewRes = checkCronDispatchAllowed();
    assert.equal(previewRes.allowed, false);
    assert.equal(isCronDispatchAllowed(), false);
    assert.equal(previewRes.environment, 'preview');
    assert.equal(previewRes.response.status, 403);

    // Development blocked (403)
    process.env.VERCEL_ENV = 'development';
    const devRes = checkCronDispatchAllowed();
    assert.equal(devRes.allowed, false);
    assert.equal(isCronDispatchAllowed(), false);
    assert.equal(devRes.environment, 'development');
    assert.equal(devRes.response.status, 403);

    // Unknown blocked (403)
    process.env.VERCEL_ENV = 'staging';
    const unknownRes = checkCronDispatchAllowed();
    assert.equal(unknownRes.allowed, false);
    assert.equal(unknownRes.environment, 'unknown');
    assert.equal(unknownRes.response.status, 403);

    // Missing VERCEL_ENV blocked (403)
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    const missingRes = checkCronDispatchAllowed();
    assert.equal(missingRes.allowed, false);
    assert.equal(missingRes.response.status, 403);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

// ===========================================================================
// SUITE 2: Cron Route Handler Integration Tests
// ===========================================================================

test('2. Preview con credenciales válidas: rechazo 403 sin acceder a la cola', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();
    const req = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await handleDispatchEmails(req, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'PREVIEW_CRON_BLOCKED');
    assert.equal(body.environment, 'preview');
    assert.match(body.error, /Preview/);
    // CRITICAL: queue dispatch function was NEVER invoked
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('3. Entorno local sin VERCEL_ENV: rechazo 403 sin acceder a la cola', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'development';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();
    const req = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await handleDispatchEmails(req, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'LOCAL_CRON_BLOCKED');
    assert.equal(body.environment, 'development');
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('4. Entorno desconocido: rechazo 403 sin acceder a la cola', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'unrecognized_cluster';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();
    const req = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await handleDispatchEmails(req, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'UNVERIFIED_ENVIRONMENT_BLOCKED');
    assert.equal(body.environment, 'unknown');
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('5. Producción sin credenciales: HTTP 401 Unauthorized según contrato existente', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'production';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();

    // Sin header de autorización
    const reqNoAuth = createMockCronRequest({ headers: {} });
    const resNoAuth = await handleDispatchEmails(reqNoAuth, { customDispatchService: tracker.mockFn });

    assert.equal(resNoAuth.status, 401);
    const bodyNoAuth = await resNoAuth.json();
    assert.match(bodyNoAuth.error, /Unauthorized/);
    assert.equal(tracker.calls.length, 0);

    // Con token incorrecto
    const reqBadAuth = createMockCronRequest({
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const resBadAuth = await handleDispatchEmails(reqBadAuth, { customDispatchService: tracker.mockFn });

    assert.equal(resBadAuth.status, 401);
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('6. Producción con credenciales válidas: ejecución del flujo de procesamiento (200 OK)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'production';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();
    const req = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      searchParams: { limit: '15' },
    });

    const res = await handleDispatchEmails(req, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.processedCount, 1);
    assert.equal(body.sentCount, 1);
    assert.equal(tracker.calls.length, 1);
    assert.equal(tracker.calls[0].limit, 15);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('7. GET y POST aplican exactamente el mismo aislamiento de entorno', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.CRON_SECRET = CRON_SECRET;

    const reqGet = createMockCronRequest({
      method: 'GET',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const reqPost = createMockCronRequest({
      method: 'POST',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const resGet = await GET(reqGet);
    const resPost = await POST(reqPost);

    assert.equal(resGet.status, 403);
    assert.equal(resPost.status, 403);

    const bodyGet = await resGet.json();
    const bodyPost = await resPost.json();

    assert.equal(bodyGet.code, 'PREVIEW_CRON_BLOCKED');
    assert.equal(bodyPost.code, 'PREVIEW_CRON_BLOCKED');
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('8. Un orderId válido no permite saltarse la protección en Preview o Local', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.CRON_SECRET = CRON_SECRET;

    const tracker = createMockDispatchTracker();
    const reqWithOrderId = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      searchParams: { orderId: VALID_ORDER_ID },
    });

    const res = await handleDispatchEmails(reqWithOrderId, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'PREVIEW_CRON_BLOCKED');
    // Dispatch service was NOT invoked even with valid orderId
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
  }
});

test('9. EMAIL_SIMULATION_MODE=true no permite que Preview reclame registros', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalSimMode = process.env.EMAIL_SIMULATION_MODE;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.EMAIL_SIMULATION_MODE = 'true';

    const tracker = createMockDispatchTracker();
    const req = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await handleDispatchEmails(req, { customDispatchService: tracker.mockFn });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'PREVIEW_CRON_BLOCKED');
    // Simulation mode does not bypass the Preview isolation guard
    assert.equal(tracker.calls.length, 0);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
    process.env.EMAIL_SIMULATION_MODE = originalSimMode;
  }
});

test('10. Las respuestas nunca revelan secretos ni credenciales', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalOutboxSecret = process.env.OUTBOX_DISPATCH_SECRET;

  try {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.OUTBOX_DISPATCH_SECRET = OUTBOX_SECRET;

    // Caso 403 en Preview
    process.env.VERCEL_ENV = 'preview';
    const reqPreview = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const resPreview = await handleDispatchEmails(reqPreview);
    const strPreview = JSON.stringify(await resPreview.json());
    assert.equal(strPreview.includes(CRON_SECRET), false);
    assert.equal(strPreview.includes(OUTBOX_SECRET), false);

    // Caso 401 en Producción
    process.env.VERCEL_ENV = 'production';
    const reqProdBad = createMockCronRequest({
      headers: { authorization: 'Bearer wrong' },
    });
    const resProdBad = await handleDispatchEmails(reqProdBad);
    const strProdBad = JSON.stringify(await resProdBad.json());
    assert.equal(strProdBad.includes(CRON_SECRET), false);
    assert.equal(strProdBad.includes(OUTBOX_SECRET), false);

    // Caso 400 bad query param
    const reqBadParam = createMockCronRequest({
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      searchParams: { limit: '9999' },
    });
    const resBadParam = await handleDispatchEmails(reqBadParam);
    const strBadParam = JSON.stringify(await resBadParam.json());
    assert.equal(strBadParam.includes(CRON_SECRET), false);
    assert.equal(strBadParam.includes(OUTBOX_SECRET), false);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.CRON_SECRET = originalCronSecret;
    process.env.OUTBOX_DISPATCH_SECRET = originalOutboxSecret;
  }
});
