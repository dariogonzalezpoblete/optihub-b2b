// test_mp_preference_config.mjs
// Automated tests for OptiHub B2B: Mercado Pago Preference Configuration & URL Validation

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Helper matching resolveAndValidateBaseUrl from frontend/app/api/mercadopago/create-preference/route.ts
function resolveAndValidateBaseUrl(providedUrl) {
  const candidate = (
    providedUrl !== undefined ? providedUrl : (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
  ).trim();

  if (!candidate) {
    return {
      valid: false,
      error: 'Falta la configuración de la URL base del sitio en las variables de entorno (SITE_URL o NEXT_PUBLIC_SITE_URL).'
    };
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Protocolo de URL base inválido. Debe comenzar con http:// o https://.'
      };
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return {
        valid: false,
        error: 'Mercado Pago auto_return requiere un dominio público accesible. No se admite localhost ni 127.0.0.1. Configure el dominio desplegado de OptiHub en SITE_URL.'
      };
    }
    return {
      valid: true,
      url: candidate.replace(/\/+$/, '')
    };
  } catch {
    return {
      valid: false,
      error: 'La URL base configurada (SITE_URL) no tiene un formato de URL válido.'
    };
  }
}

// Helper to construct preference payload
function buildPreferencePayload({ siteUrl, orderId, items, customer }) {
  const urlValidation = resolveAndValidateBaseUrl(siteUrl);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.error);
  }
  const cleanBase = urlValidation.url;

  return {
    items,
    external_reference: orderId,
    payer: {
      name: customer.name,
      email: customer.email,
    },
    back_urls: {
      success: `${cleanBase}/checkout/resultado?status=approved&ref=${orderId}`,
      failure: `${cleanBase}/checkout/resultado?status=failure&ref=${orderId}`,
      pending: `${cleanBase}/checkout/resultado?status=pending&ref=${orderId}`,
    },
    auto_return: 'approved',
  };
}

// Sanitized error handler matching route.ts
function sanitizeMercadoPagoError(mpError) {
  let clientMessage = 'No se pudo generar la pasarela de pago en Mercado Pago.';
  if (mpError?.message?.includes('auto_return invalid')) {
    clientMessage = 'Error de configuración: Las URLs de retorno no son válidas para auto_return.';
  } else if (mpError?.status === 400 || mpError?.name === 'MPBadRequestError') {
    clientMessage = 'Datos de orden no válidos para la pasarela de pagos.';
  } else if (mpError?.status === 401) {
    clientMessage = 'Error de autorización con la pasarela de pagos.';
  }
  return { status: 502, error: clientMessage };
}

// ==============================================================================
// TEST 1: Configuración correcta de las tres back_urls y auto_return
// ==============================================================================

test('1. Preference payload configures all three back_urls and auto_return: "approved"', () => {
  const orderId = 'order-b2b-uuid-12345';
  const siteUrl = 'https://optihub-b2b.vercel.app';
  const dummyItems = [
    { id: 'FRAME-01', title: 'Ray-Ban Wayfarer', quantity: 10, unit_price: 35000, currency_id: 'CLP' },
    { id: 'IVA', title: 'IVA (19%)', quantity: 1, unit_price: 66500, currency_id: 'CLP' },
  ];
  const dummyCustomer = { name: 'Optica Central', email: 'contacto@opticacentral.cl' };

  const payload = buildPreferencePayload({ siteUrl, orderId, items: dummyItems, customer: dummyCustomer });

  // 1. auto_return must be "approved"
  assert.equal(payload.auto_return, 'approved');

  // 2. All three back_urls must exist and be defined
  assert.ok(payload.back_urls.success, 'back_urls.success must be defined');
  assert.ok(payload.back_urls.failure, 'back_urls.failure must be defined');
  assert.ok(payload.back_urls.pending, 'back_urls.pending must be defined');

  // 3. URLs must point to /checkout/resultado with valid status query parameter matching resultado/page.tsx
  assert.equal(
    payload.back_urls.success,
    `https://optihub-b2b.vercel.app/checkout/resultado?status=approved&ref=${orderId}`
  );
  assert.equal(
    payload.back_urls.failure,
    `https://optihub-b2b.vercel.app/checkout/resultado?status=failure&ref=${orderId}`
  );
  assert.equal(
    payload.back_urls.pending,
    `https://optihub-b2b.vercel.app/checkout/resultado?status=pending&ref=${orderId}`
  );

  // 4. external_reference must match orderId
  assert.equal(payload.external_reference, orderId);
});

// ==============================================================================
// TEST 2: Validación y manejo de errores ante ausencia o invalidez de URL base
// ==============================================================================

test('2. Base URL validation detects missing, invalid, or localhost URLs', () => {
  // Case A: Missing or empty
  const emptyRes = resolveAndValidateBaseUrl('');
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error.includes('Falta la configuración de la URL base'));

  const undefinedRes = resolveAndValidateBaseUrl(undefined);
  // If env vars not set during this test call:
  if (!process.env.SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL) {
    assert.equal(undefinedRes.valid, false);
  }

  // Case B: Localhost / 127.0.0.1 (incompatible with auto_return in Mercado Pago)
  const localRes1 = resolveAndValidateBaseUrl('http://localhost:3000');
  assert.equal(localRes1.valid, false);
  assert.ok(localRes1.error.includes('No se admite localhost'));

  const localRes2 = resolveAndValidateBaseUrl('http://127.0.0.1:3000');
  assert.equal(localRes2.valid, false);
  assert.ok(localRes2.error.includes('No se admite localhost ni 127.0.0.1'));

  // Case C: Malformed / Invalid protocol
  const malformed = resolveAndValidateBaseUrl('not-a-valid-url');
  assert.equal(malformed.valid, false);
  assert.ok(malformed.error.includes('no tiene un formato de URL válido'));

  const badProtocol = resolveAndValidateBaseUrl('ftp://optihub-b2b.vercel.app');
  assert.equal(badProtocol.valid, false);
  assert.ok(badProtocol.error.includes('Protocolo de URL base inválido'));

  // Case D: Valid deployed domain (with and without trailing slash)
  const valid1 = resolveAndValidateBaseUrl('https://optihub-b2b.vercel.app');
  assert.equal(valid1.valid, true);
  assert.equal(valid1.url, 'https://optihub-b2b.vercel.app');

  const valid2 = resolveAndValidateBaseUrl('https://optihub-b2b.vercel.app/');
  assert.equal(valid2.valid, true);
  assert.equal(valid2.url, 'https://optihub-b2b.vercel.app', 'Trailing slash must be stripped');
});

// ==============================================================================
// TEST 3: Manejo controlado de errores de Mercado Pago (sin exponer credenciales)
// ==============================================================================

test('3. Provider error handling sanitizes MP error responses and hides credentials', () => {
  // Case A: auto_return error
  const res1 = sanitizeMercadoPagoError({
    name: 'MPBadRequestError',
    message: 'auto_return invalid. back_url.success must be defined',
    status: 400,
  });
  assert.equal(res1.status, 502);
  assert.equal(res1.error, 'Error de configuración: Las URLs de retorno no son válidas para auto_return.');

  // Case B: Bad request / invalid item data
  const res2 = sanitizeMercadoPagoError({
    name: 'MPBadRequestError',
    message: 'Invalid item price',
    status: 400,
  });
  assert.equal(res2.status, 502);
  assert.equal(res2.error, 'Datos de orden no válidos para la pasarela de pagos.');

  // Case C: Auth error (expired or invalid token)
  const res3 = sanitizeMercadoPagoError({
    name: 'MPAuthenticationError',
    message: 'Unauthorized with token APP_USR-SECRET-1234567890',
    status: 401,
  });
  assert.equal(res3.status, 502);
  assert.equal(res3.error, 'Error de autorización con la pasarela de pagos.');
  // Ensure the secret token is NOT leaked into the client response
  assert.equal(res3.error.includes('APP_USR'), false);
  assert.equal(res3.error.includes('SECRET'), false);
});

// ==============================================================================
// TEST 4: Creación real de una preferencia en Mercado Pago Sandbox
// ==============================================================================

test('4. Live Sandbox integration test: creates real preference with deployed domain and auto_return', async () => {
  let token = process.env.MP_ACCESS_TOKEN;
  if (!token && fs.existsSync('frontend/.env.local')) {
    const envContent = fs.readFileSync('frontend/.env.local', 'utf8');
    const tokenMatch = envContent.match(/MP_ACCESS_TOKEN=(.*)/);
    if (tokenMatch) token = tokenMatch[1].trim();
  }

  assert.ok(token, 'MP_ACCESS_TOKEN must be configured in environment or .env.local');

  // Import dynamically from frontend node_modules
  const { MercadoPagoConfig, Preference } = await import('./frontend/node_modules/mercadopago/dist/index.js');

  const client = new MercadoPagoConfig({ accessToken: token });
  const preference = new Preference(client);

  const testOrderId = `order-test-sandbox-${Date.now()}`;
  const deployedDomain = 'https://optihub-b2b.vercel.app';

  const payload = buildPreferencePayload({
    siteUrl: deployedDomain,
    orderId: testOrderId,
    items: [
      { id: 'TEST-SKU-1', title: 'Marco Óptico B2B Prueba', quantity: 10, unit_price: 25000, currency_id: 'CLP' },
      { id: 'IVA', title: 'IVA (19%)', quantity: 1, unit_price: 47500, currency_id: 'CLP' },
    ],
    customer: {
      name: 'Óptica Demo SpA',
      email: 'test_demo_b2b@optihub.cl',
    },
  });

  const response = await preference.create({ body: payload });

  // Assertions on real Mercado Pago Sandbox response
  assert.ok(response.id, 'Preference ID must be returned by Mercado Pago');
  assert.ok(response.init_point || response.sandbox_init_point, 'Init point must be returned');
  assert.equal(response.external_reference, testOrderId, 'External reference must match order ID');
  assert.equal(response.auto_return, 'approved', 'auto_return must be approved');
  assert.equal(
    response.back_urls.success,
    `${deployedDomain}/checkout/resultado?status=approved&ref=${testOrderId}`,
    'back_urls.success must match exact configured URL'
  );
  assert.equal(
    response.back_urls.failure,
    `${deployedDomain}/checkout/resultado?status=failure&ref=${testOrderId}`,
    'back_urls.failure must match exact configured URL'
  );
  assert.equal(
    response.back_urls.pending,
    `${deployedDomain}/checkout/resultado?status=pending&ref=${testOrderId}`,
    'back_urls.pending must match exact configured URL'
  );
});
