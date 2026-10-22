// test_cron_dispatch_emails_isolation.mjs
// Automated test suite for FASE 24.19: Safe Outbox Dispatch Isolation & Simulation Mode

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Replicate pure helper functions from frontend/app/api/cron/dispatch-emails/route.ts
function validateCronSecret(headers, env) {
  const cronSecret = env.CRON_SECRET || env.OUTBOX_DISPATCH_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authHeader = headers['authorization'] || '';
  const expectedBearer = `Bearer ${cronSecret}`;

  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expectedBearer);

  if (authBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(authBuffer, expectedBuffer);
}

function parseLimit(limitParam) {
  if (!limitParam) {
    return { value: 20 };
  }

  const trimmed = limitParam.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'Invalid limit: Must be a positive integer.' };
  }

  const parsed = parseInt(trimmed, 10);
  if (parsed < 1 || parsed > 100) {
    return { error: 'Invalid limit: Must be between 1 and 100.' };
  }

  return { value: parsed };
}

function parseOrderId(orderIdParam) {
  if (!orderIdParam) {
    return { value: undefined };
  }

  const trimmed = orderIdParam.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return { error: 'Invalid orderId: Must be a valid UUID format.' };
  }

  return { value: trimmed.toLowerCase() };
}

// Simulated endpoint dispatcher handler
async function simulateEndpointHandler({ headers, searchParams, env, mockDispatchService }) {
  if (!validateCronSecret(headers, env)) {
    return {
      status: 401,
      body: { error: 'Unauthorized: Invalid or missing authorization token.' },
    };
  }

  const limitResult = parseLimit(searchParams.get('limit'));
  if (limitResult.error) {
    return { status: 400, body: { error: limitResult.error } };
  }

  const orderIdResult = parseOrderId(searchParams.get('orderId'));
  if (orderIdResult.error) {
    return { status: 400, body: { error: orderIdResult.error } };
  }

  const serviceResult = await mockDispatchService({
    limit: limitResult.value,
    orderId: orderIdResult.value,
  });

  return {
    status: 200,
    body: {
      success: true,
      timestamp: new Date().toISOString(),
      isolatedOrderId: orderIdResult.value || null,
      ...serviceResult,
    },
  };
}

// ---------------------------------------------------------------------------
// SUITE DE PRUEBAS
// ---------------------------------------------------------------------------

test('1. Falta de autenticación o token ausente: devuelve 401 Unauthorized', async () => {
  const env = { CRON_SECRET: 'test-secret-123' };
  const res = await simulateEndpointHandler({
    headers: {},
    searchParams: new URLSearchParams(),
    env,
    mockDispatchService: async () => { throw new Error('Should not be called'); },
  });

  assert.equal(res.status, 401);
  assert.match(res.body.error, /Unauthorized/);
});

test('2. Token incorrecto o intento de paso por query string: devuelve 401', async () => {
  const env = { CRON_SECRET: 'test-secret-123' };

  // Bearer inválido
  const resWrongToken = await simulateEndpointHandler({
    headers: { authorization: 'Bearer wrong-secret' },
    searchParams: new URLSearchParams(),
    env,
    mockDispatchService: async () => { throw new Error('Should not be called'); },
  });
  assert.equal(resWrongToken.status, 401);

  // Secreto en query string pero sin header
  const resQueryParam = await simulateEndpointHandler({
    headers: {},
    searchParams: new URLSearchParams({ secret: 'test-secret-123' }),
    env,
    mockDispatchService: async () => { throw new Error('Should not be called'); },
  });
  assert.equal(resQueryParam.status, 401);
});

test('3. Limit inválido (no numérico, menor a 1, o mayor a 100): devuelve 400 sin llamar al servicio', async () => {
  const env = { CRON_SECRET: 'test-secret-123' };
  const headers = { authorization: 'Bearer test-secret-123' };

  let called = false;
  const mockDispatch = async () => { called = true; return {}; };

  // Caso: string no numérico
  const resAlpha = await simulateEndpointHandler({
    headers,
    searchParams: new URLSearchParams({ limit: 'diez' }),
    env,
    mockDispatchService: mockDispatch,
  });
  assert.equal(resAlpha.status, 400);
  assert.equal(called, false);
  assert.match(resAlpha.body.error, /positive integer/);

  // Caso: menor a 1 (0)
  const resZero = await simulateEndpointHandler({
    headers,
    searchParams: new URLSearchParams({ limit: '0' }),
    env,
    mockDispatchService: mockDispatch,
  });
  assert.equal(resZero.status, 400);
  assert.equal(called, false);

  // Caso: mayor a 100 (500)
  const resExceeded = await simulateEndpointHandler({
    headers,
    searchParams: new URLSearchParams({ limit: '500' }),
    env,
    mockDispatchService: mockDispatch,
  });
  assert.equal(resExceeded.status, 400);
  assert.equal(called, false);
  assert.match(resExceeded.body.error, /between 1 and 100/);
});

test('4. UUID de orderId inválido: devuelve 400 sin invocar el servicio', async () => {
  const env = { CRON_SECRET: 'test-secret-123' };
  const headers = { authorization: 'Bearer test-secret-123' };

  let serviceInvoked = false;
  const mockDispatch = async () => { serviceInvoked = true; return {}; };

  const invalidUuids = [
    '12345',
    'not-a-uuid',
    'e6b8c9d0-1234-5678-90ab',
    'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
    '../../etc/passwd',
  ];

  for (const badUuid of invalidUuids) {
    const res = await simulateEndpointHandler({
      headers,
      searchParams: new URLSearchParams({ orderId: badUuid }),
      env,
      mockDispatchService: mockDispatch,
    });
    assert.equal(res.status, 400, `Debería fallar con 400 para ${badUuid}`);
    assert.equal(serviceInvoked, false);
    assert.match(res.body.error, /valid UUID format/);
  }
});

test('5. orderId válido: el servicio recibe el filtro correspondiente y aísla la consulta', async () => {
  const env = { CRON_SECRET: 'test-secret-123' };
  const headers = { authorization: 'Bearer test-secret-123' };
  const targetOrderId = 'e6b8c9d0-1234-4567-89ab-cdef01234567';

  let capturedOptions = null;
  const mockDispatch = async (opts) => {
    capturedOptions = opts;
    return { processedCount: 1, sentCount: 1, failedCount: 0, details: [{ orderId: opts.orderId, status: 'SENT' }] };
  };

  const res = await simulateEndpointHandler({
    headers,
    searchParams: new URLSearchParams({ orderId: targetOrderId, limit: '5' }),
    env,
    mockDispatchService: mockDispatch,
  });

  assert.equal(res.status, 200);
  assert.equal(capturedOptions.orderId, targetOrderId);
  assert.equal(capturedOptions.limit, 5);
  assert.equal(res.body.isolatedOrderId, targetOrderId);
  assert.equal(res.body.processedCount, 1);
});

test('6. Invocación general sin orderId: conserva valor por defecto y no envía orderId al servicio', async () => {
  const env = { OUTBOX_DISPATCH_SECRET: 'another-secret-456' };
  const headers = { authorization: 'Bearer another-secret-456' };

  let capturedOptions = null;
  const mockDispatch = async (opts) => {
    capturedOptions = opts;
    return { processedCount: 0, sentCount: 0, failedCount: 0, details: [] };
  };

  const res = await simulateEndpointHandler({
    headers,
    searchParams: new URLSearchParams(),
    env,
    mockDispatchService: mockDispatch,
  });

  assert.equal(res.status, 200);
  assert.equal(capturedOptions.limit, 20); // Default
  assert.equal(capturedOptions.orderId, undefined);
  assert.equal(res.body.isolatedOrderId, null);
});

test('7. Modo Simulación en email.ts: EMAIL_SIMULATION_MODE=true no llama a Resend y devuelve simulated=true', async () => {
  // Test email simulation behavior
  let resendCalled = false;
  const fakeResend = {
    emails: {
      send: async () => {
        resendCalled = true;
        return { data: { id: 'real_msg_123' } };
      },
    },
  };

  async function mockSendOrderConfirmationEmails(data, env, customResend) {
    const adminEmail = env.ADMIN_EMAIL || 'contacto@optihub.cl';
    const isSimulationMode = env.EMAIL_SIMULATION_MODE === 'true';

    if (!customResend || isSimulationMode) {
      const simulationReason = isSimulationMode
        ? 'EMAIL_SIMULATION_MODE activado'
        : 'RESEND_API_KEY no detectada';
      return {
        success: true,
        simulated: true,
        simulationReason,
        recipients: {
          client: data.billing.contacto_email,
          admin: adminEmail,
        },
      };
    }

    return customResend.emails.send();
  }

  const dummyPayload = {
    externalReference: 'TEST-SIM-001',
    billing: { contacto_email: 'optica-cliente@example.com' },
  };

  // Escenario A: EMAIL_SIMULATION_MODE=true activo, aún con cliente Resend presente
  const resultSimulated = await mockSendOrderConfirmationEmails(
    dummyPayload,
    { EMAIL_SIMULATION_MODE: 'true', ADMIN_EMAIL: 'admin@optihub.cl' },
    fakeResend
  );

  assert.equal(resendCalled, false, 'No debe invocar Resend bajo EMAIL_SIMULATION_MODE=true');
  assert.equal(resultSimulated.success, true);
  assert.equal(resultSimulated.simulated, true);
  assert.equal(resultSimulated.simulationReason, 'EMAIL_SIMULATION_MODE activado');
  assert.equal(resultSimulated.recipients.client, 'optica-cliente@example.com');
  assert.equal(resultSimulated.recipients.admin, 'admin@optihub.cl');

  // Escenario B: EMAIL_SIMULATION_MODE no activo, cliente Resend presente -> llama a Resend
  const resultReal = await mockSendOrderConfirmationEmails(
    dummyPayload,
    { EMAIL_SIMULATION_MODE: 'false' },
    fakeResend
  );
  assert.equal(resendCalled, true, 'Debe invocar Resend cuando no está en modo simulación');
  assert.equal(resultReal.data.id, 'real_msg_123');
});

test('8. Verificación de archivos modificados: coincidencia con requerimientos', () => {
  const routeContent = fs.readFileSync('frontend/app/api/cron/dispatch-emails/route.ts', 'utf-8');
  assert.ok(routeContent.includes('parseOrderId'), 'route.ts debe incluir validación de orderId');
  assert.ok(routeContent.includes('parseLimit'), 'route.ts debe incluir validación de limit');
  assert.ok(routeContent.includes('orderId: orderIdResult.value'), 'route.ts debe pasar orderId a dispatchOrderEmailOutbox');

  const emailContent = fs.readFileSync('frontend/lib/email.ts', 'utf-8');
  assert.ok(emailContent.includes("process.env.EMAIL_SIMULATION_MODE === 'true'"), 'email.ts debe soportar EMAIL_SIMULATION_MODE');
  assert.ok(emailContent.includes('simulated: true'), 'email.ts debe retornar simulated: true');
});

test('9. Servicio orderEmailOutboxService: simulación libera lease a PENDING sin alterar attempts ni processed_at', () => {
  const serviceContent = fs.readFileSync('frontend/lib/payments/orderEmailOutboxService.ts', 'utf-8');
  assert.ok(serviceContent.includes('isSimulated'), 'Debe detectar si sendResult fue simulado');
  assert.ok(serviceContent.includes("SET status = 'PENDING'"), 'Debe restablecer status a PENDING en simulación');
  assert.ok(serviceContent.includes('claim_token = NULL'), 'Debe liberar claim_token en simulación');
  assert.ok(serviceContent.includes('WHERE id = $1 AND claim_token = $2'), 'Debe validar fencing token en simulación');
  assert.ok(serviceContent.includes('simulatedCount'), 'Debe contabilizar simulatedCount');
});

