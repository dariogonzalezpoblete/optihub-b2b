// test_invalidate_preference_compensation.mjs
// Verifica que, cuando createMpPreference supera el timeout local, rechace con
// TIMEOUT_MP_PREFERENCE_CREATE y que la preferencia creada tardíamente por Mercado Pago sea
// invalidada mediante la función inyectada `invalidatePreference` (compensación).
// Además verifica que, sin timeout, NO se invalide la preferencia legítima.
//
// Aislamiento: usa un cliente Preference simulado inyectado; no realiza llamadas de red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Loader de alias (next/server y @/...) para ejecutar route.ts directamente bajo Node ESM,
// igual que el resto de suites aisladas de la raíz.
register('./test_alias_loader.mjs', pathToFileURL('./'));

const { createMpPreference } = await import(
  './frontend/app/api/mercadopago/create-preference/route.ts'
);

// Mock Preference client que simula una respuesta con retardo configurable.
class MockPreference {
  constructor(delayMs) {
    this.delayMs = delayMs;
  }
  async create(_opts) {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return { id: 'pref-mock', sandbox_init_point: 'https://sandbox.mercadopago.com/init' };
  }
}

function baseParams(overrides) {
  return {
    orderId: 'order-test-123',
    customerName: 'Test User',
    customerEmail: 'test@example.com',
    orderItems: [],
    taxAmount: 0,
    siteUrl: 'https://optihub-test.example.com',
    ...overrides,
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

test('Compensación de Preference tras timeout: rechaza con timeout e invalida la preferencia tardía', async () => {
  const invalidatedIds = [];
  const mockInvalidatePreference = async (prefId) => {
    invalidatedIds.push(prefId);
    return { success: true };
  };

  await assert.rejects(
    () =>
      createMpPreference(
        baseParams({
          timeoutMs: 10, // mucho menor que el retardo del mock (50 ms)
          injectedPreferenceClient: new MockPreference(50),
          invalidatePreference: mockInvalidatePreference,
        })
      ),
    (err) => err.message === 'TIMEOUT_MP_PREFERENCE_CREATE'
  );

  // La respuesta tardía del mock (50 ms) dispara la compensación en segundo plano.
  const called = await waitFor(() => invalidatedIds.length > 0);
  assert.ok(called, 'invalidatePreference debe haber sido llamado tras el timeout');
  assert.deepEqual(invalidatedIds, ['pref-mock'], 'Debe invalidar exactamente la preferencia tardía');
});

test('Sin timeout: devuelve la preferencia y NO invoca la compensación', async () => {
  const invalidatedIds = [];
  const mockInvalidatePreference = async (prefId) => {
    invalidatedIds.push(prefId);
    return { success: true };
  };

  const result = await createMpPreference(
    baseParams({
      timeoutMs: 1000,
      injectedPreferenceClient: new MockPreference(10),
      invalidatePreference: mockInvalidatePreference,
    })
  );

  assert.equal(result.id, 'pref-mock');
  assert.equal(result.paymentUrl, 'https://sandbox.mercadopago.com/init');

  // Margen para detectar una invalidación espuria
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(invalidatedIds.length, 0, 'No debe invalidar una preferencia entregada a tiempo');
});
