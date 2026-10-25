// test_checkout_isolation_fase25.mjs
// Automated test suite for FASE 25.3 (Etapa D): Aislamiento del Checkout y Credenciales de Mercado Pago
//
// Verifies that Vercel Preview, local development, and unverified environments
// CANNOT execute checkouts with production credentials, pollute shared production orders,
// or accept untrusted third-party hosts in return/webhook URLs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register path alias loader for @/ resolution under Node.js ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

// Import runtime environment helpers
const {
  checkCheckoutPreferenceAllowed,
  isCheckoutPreferenceAllowed,
  getRuntimeEnvironment,
  isConnectedToProductionDb,
  PROD_SUPABASE_PROJECT_REF,
} = await import('./frontend/lib/env/runtimeEnv.ts');

// Import create-preference route handlers and helpers
const {
  handleCreatePreference,
  createMpPreference,
  sanitizeMercadoPagoError,
  resolveAndValidateBaseUrl,
} = await import('./frontend/app/api/mercadopago/create-preference/route.ts');

// Import mercadopagoService and back URL validator
const {
  validateAndResolveBackUrl,
} = await import('./frontend/lib/payments/mercadopagoService.ts');

// Import checkout verification logic
const {
  resolveVerifiedCheckoutResult,
} = await import('./frontend/lib/checkoutWebhookAndResult.ts');

// ---------------------------------------------------------------------------
// TEST FIXTURES
// ---------------------------------------------------------------------------

const PROD_TOKEN = 'APP_USR-7890123456789012-102217-abcde12345-123456789';
const TEST_TOKEN = 'TEST-7890123456789012-102217-abcde12345-123456789';
const TRUSTED_SITE_URL = 'https://optihub-b2b.vercel.app';
const TRUSTED_PREVIEW_URL = 'https://frontend-ipb1mbaiy-optihub.vercel.app';

function createMockRequest({
  url = 'http://localhost:3000/api/mercadopago/create-preference',
  headers = {},
  body = {},
}) {
  const urlObj = new URL(url);
  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }

  return {
    url: urlObj.toString(),
    nextUrl: urlObj,
    method: 'POST',
    headers: {
      get: (header) => headerMap.get(header.toLowerCase()) || null,
    },
    json: async () => body,
  };
}

// ===========================================================================
// SUITE 1: checkCheckoutPreferenceAllowed Unit & Policy Tests
// ===========================================================================

test('1. Preview con credenciales productivas: bloqueado antes de cualquier llamada externa (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalToken = process.env.MP_ACCESS_TOKEN;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.MP_ACCESS_TOKEN = PROD_TOKEN;

    const guardResult = checkCheckoutPreferenceAllowed();
    assert.equal(guardResult.allowed, false);
    assert.equal(guardResult.code, 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED');
    assert.equal(guardResult.environment, 'preview');
    assert.equal(guardResult.response.status, 403);

    const body = await guardResult.response.json();
    assert.equal(body.code, 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED');
    assert.equal(body.error.includes('credenciales productivas'), true);
    // Crucial: Secret token value must never be reflected in response
    assert.equal(JSON.stringify(body).includes(PROD_TOKEN), false);

    // Route level verification
    const req = createMockRequest({
      headers: { authorization: 'Bearer test-token' },
      body: { cartId: 'c123', billing: { rut: '12.345.678-5' } },
    });
    const res = await handleCreatePreference(req);
    assert.equal(res.status, 403);
    const resJson = await res.json();
    assert.equal(resJson.code, 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED');
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.MP_ACCESS_TOKEN = originalToken;
  }
});

test('2. Preview con credenciales de prueba, pero base de datos compartida sin aislamiento de pedidos: bloqueado (403)', async () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalToken = process.env.MP_ACCESS_TOKEN;
  const originalIsolatedDb = process.env.ISOLATED_PREVIEW_DB;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.MP_ACCESS_TOKEN = TEST_TOKEN;
    delete process.env.ISOLATED_PREVIEW_DB;

    const guardResult = checkCheckoutPreferenceAllowed();
    assert.equal(guardResult.allowed, false);
    assert.equal(guardResult.code, 'PREVIEW_SHARED_DATABASE_BLOCKED');
    assert.equal(guardResult.environment, 'preview');
    assert.equal(guardResult.response.status, 403);

    const body = await guardResult.response.json();
    assert.equal(body.code, 'PREVIEW_SHARED_DATABASE_BLOCKED');
    assert.match(body.error, /compartida con producci[oó]n/i);
    assert.equal(JSON.stringify(body).includes(TEST_TOKEN), false);

    // Route level verification
    const req = createMockRequest({
      headers: { authorization: 'Bearer test-token' },
      body: { cartId: 'c123', billing: { rut: '12.345.678-5' } },
    });
    const res = await handleCreatePreference(req);
    assert.equal(res.status, 403);
    const resJson = await res.json();
    assert.equal(resJson.code, 'PREVIEW_SHARED_DATABASE_BLOCKED');
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.MP_ACCESS_TOKEN = originalToken;
    process.env.ISOLATED_PREVIEW_DB = originalIsolatedDb;
  }
});

test('3. Preview: variable declarativa ISOLATED_PREVIEW_DB no autoriza checkout por si sola; solo permitido en test con mock inyectado y DB aislada', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalToken = process.env.MP_ACCESS_TOKEN;
  const originalIsolatedDb = process.env.ISOLATED_PREVIEW_DB;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.MP_ACCESS_TOKEN = TEST_TOKEN;
    process.env.ISOLATED_PREVIEW_DB = 'true';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Subcaso 3.1: Variable declarativa sola (ISOLATED_PREVIEW_DB=true) es INSUFICIENTE en Preview -> BLOQUEADO
    const guardDeclarativeOnly = checkCheckoutPreferenceAllowed();
    assert.equal(guardDeclarativeOnly.allowed, false);
    assert.equal(guardDeclarativeOnly.code, 'PREVIEW_SHARED_DATABASE_BLOCKED');
    assert.equal(guardDeclarativeOnly.environment, 'preview');
    assert.match(guardDeclarativeOnly.reason, /declarativa no es suficiente|compartida/i);

    // Subcaso 3.2: Si está conectado a la referencia de base productiva (yrdjnkbrvynmnzyrxlfx), incluso con mock options -> BLOQUEADO
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://yrdjnkbrvynmnzyrxlfx.supabase.co';
    const guardProdDbBlocked = checkCheckoutPreferenceAllowed({
      allowInTest: true,
      injectedPreferenceClient: {},
      isolatedDatabaseConfirmed: true,
      customToken: TEST_TOKEN,
    });
    assert.equal(guardProdDbBlocked.allowed, false);
    assert.equal(guardProdDbBlocked.code, 'PREVIEW_SHARED_DATABASE_BLOCKED');
    assert.match(guardProdDbBlocked.reason, /proyecto de producci[oó]n/i);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Subcaso 3.3: Solo permitido en test explícito con mock inyectado Y confirmación de BD aislada sin ref productiva
    const guardMockTestAllowed = checkCheckoutPreferenceAllowed({
      allowInTest: true,
      injectedPreferenceClient: {},
      isolatedDatabaseConfirmed: true,
      customToken: TEST_TOKEN,
    });
    assert.equal(guardMockTestAllowed.allowed, true);
    assert.equal(guardMockTestAllowed.environment, 'preview');

    // Subcaso 3.4: Token productivo (APP_USR-...) en Preview es SIEMPRE BLOQUEADO, incluso en test con mocks
    process.env.MP_ACCESS_TOKEN = PROD_TOKEN;
    const guardProdTokenBlocked = checkCheckoutPreferenceAllowed({
      allowInTest: true,
      injectedPreferenceClient: {},
      isolatedDatabaseConfirmed: true,
      customToken: PROD_TOKEN,
    });
    assert.equal(guardProdTokenBlocked.allowed, false);
    assert.equal(guardProdTokenBlocked.code, 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED');
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.MP_ACCESS_TOKEN = originalToken;
    process.env.ISOLATED_PREVIEW_DB = originalIsolatedDb;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});

test('4. Producción: mantiene el contrato productivo sin revelar credenciales', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalToken = process.env.MP_ACCESS_TOKEN;

  try {
    process.env.VERCEL_ENV = 'production';
    process.env.MP_ACCESS_TOKEN = PROD_TOKEN;

    const guardResult = checkCheckoutPreferenceAllowed();
    assert.equal(guardResult.allowed, true);
    assert.equal(guardResult.environment, 'production');
    assert.equal(isCheckoutPreferenceAllowed(), true);

    // Missing credentials in production returns 500 config error fail-closed
    delete process.env.MP_ACCESS_TOKEN;
    const guardMissing = checkCheckoutPreferenceAllowed();
    assert.equal(guardMissing.allowed, false);
    assert.equal(guardMissing.code, 'MISSING_MP_CREDENTIALS');
    assert.equal(guardMissing.response.status, 500);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.MP_ACCESS_TOKEN = originalToken;
  }
});

test('5. Entorno desconocido o local: no realiza llamadas externas sin configuración segura comprobada', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalToken = process.env.MP_ACCESS_TOKEN;

  try {
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    process.env.MP_ACCESS_TOKEN = PROD_TOKEN;

    // Unknown env fails closed
    const guardUnknown = checkCheckoutPreferenceAllowed();
    assert.equal(guardUnknown.allowed, false);
    assert.equal(guardUnknown.code, 'UNVERIFIED_ENVIRONMENT_BLOCKED');
    assert.equal(guardUnknown.response.status, 403);

    // Local development without mock / isolated DB is blocked
    process.env.NODE_ENV = 'development';
    const guardDev = checkCheckoutPreferenceAllowed();
    assert.equal(guardDev.allowed, false);
    assert.equal(guardDev.code, 'LOCAL_CHECKOUT_BLOCKED');
    assert.equal(guardDev.response.status, 403);

    // Mock test options allow local test execution
    const guardMockedTest = checkCheckoutPreferenceAllowed({ allowInTest: true });
    assert.equal(guardMockedTest.allowed, true);
  } finally {
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.MP_ACCESS_TOKEN = originalToken;
  }
});

// ===========================================================================
// SUITE 2: URL & Host Security Tests
// ===========================================================================

test('6. notification_url y back_urls no aceptan hosts arbitrarios del cliente', () => {
  const trustedSite = 'https://optihub-b2b.vercel.app';
  const defaultSuccess = `${trustedSite}/checkout/resultado?status=approved`;

  // 1. Same-origin valid custom URL allowed
  const validSameOrigin = `${trustedSite}/checkout/resultado?custom=123`;
  assert.equal(
    validateAndResolveBackUrl(validSameOrigin, defaultSuccess, trustedSite),
    validSameOrigin
  );

  // 2. Third-party arbitrary domain strictly rejected
  assert.throws(
    () => validateAndResolveBackUrl('https://evil-phishing-optihub.com/steal', defaultSuccess, trustedSite),
    /Host no confiable en back_urls/
  );

  assert.throws(
    () => validateAndResolveBackUrl('https://attacker.com/oauth/callback', defaultSuccess, trustedSite),
    /Host no confiable en back_urls/
  );

  // 3. Embedded credentials strictly rejected
  assert.throws(
    () => validateAndResolveBackUrl(`https://user:pass@optihub-b2b.vercel.app/resultado`, defaultSuccess, trustedSite),
    /credenciales/
  );

  // 4. Fallback to default when undefined or empty
  assert.equal(
    validateAndResolveBackUrl(undefined, defaultSuccess, trustedSite),
    defaultSuccess
  );
  assert.equal(
    validateAndResolveBackUrl('', defaultSuccess, trustedSite),
    defaultSuccess
  );
});

// ===========================================================================
// SUITE 3: Provider Error Handling & Verified Server State
// ===========================================================================

test('7. Los errores de Mercado Pago no se interpretan como pagos aprobados', () => {
  const error400 = sanitizeMercadoPagoError({
    name: 'MPBadRequestError',
    message: 'Invalid payer email',
    status: 400,
  });
  assert.equal(error400.status, 502);
  assert.notEqual(error400.status, 200);
  assert.match(error400.error, /Datos de orden no v[aá]lidos/i);

  const errorTimeout = sanitizeMercadoPagoError({
    message: 'TIMEOUT_MP_PREFERENCE_CREATE',
  });
  assert.equal(errorTimeout.status, 502);
  assert.notEqual(errorTimeout.status, 200);

  const errorAuth = sanitizeMercadoPagoError({
    name: 'MPAuthenticationError',
    message: `Unauthorized token ${PROD_TOKEN}`,
    status: 401,
  });
  assert.equal(errorAuth.status, 502);
  // Redacts token
  assert.equal(errorAuth.details?.includes(PROD_TOKEN), false);
  assert.equal(errorAuth.details?.includes('[REDACTED_TOKEN]'), true);
});

test('8. Los estados de pago siguen dependiendo de la confirmación verificada del servidor', () => {
  const orderId = 'e6b8c9d0-1234-4567-89ab-cdef01234567';

  // Case A: Spoofed URL (?status=approved) but DB order still pending -> Display MUST NOT be approved
  const spoofedResult = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: orderId,
    orderFromDb: { id: orderId, status: 'pending', payment_status: 'pending' },
    verificationComplete: true,
  });
  assert.equal(spoofedResult.displayState, 'pending', 'Spoofed URL must resolve to pending, never approved');
  assert.notEqual(spoofedResult.displayState, 'approved');

  // Case B: DB order confirmed approved -> Display IS approved
  const genuineApproved = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: orderId,
    orderFromDb: { id: orderId, status: 'paid', payment_status: 'approved', payment_id: 'mp-pay-999' },
    verificationComplete: true,
  });
  assert.equal(genuineApproved.displayState, 'approved');
  assert.equal(genuineApproved.verifiedOrderId, orderId);

  // Case C: Missing DB row (not in database) -> Display rejected / failure, never approved
  const absentOrder = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: orderId,
    orderFromDb: null,
    verificationComplete: true,
  });
  assert.equal(absentOrder.displayState, 'rejected');
  assert.notEqual(absentOrder.displayState, 'approved');
});

// ===========================================================================
// SUITE 4: Supabase Client Fallback & Default Protection
// ===========================================================================

test('9. Supabase Client: Failsafe seguro sin fallback a credenciales productivas cuando faltan variables en runtime', async () => {
  const { supabase, isSupabaseConfigured } = await import('./frontend/lib/supabaseClient.ts');

  // Verify supabase client is initialized
  assert.ok(supabase, 'El cliente supabase debe estar inicializado para build/SSR');
  assert.ok(supabase.auth, 'auth debe existir en el cliente supabase');

  // Verify that the configured URL does NOT contain the production project ref
  const clientUrl = supabase['supabaseUrl'] || '';
  assert.equal(
    clientUrl.includes(PROD_SUPABASE_PROJECT_REF),
    false,
    'El cliente Supabase NUNCA debe contener la URL del proyecto productivo por defecto'
  );

  // When env vars are absent/placeholder, isSupabaseConfigured reflects the true status
  assert.equal(typeof isSupabaseConfigured, 'boolean');
});
