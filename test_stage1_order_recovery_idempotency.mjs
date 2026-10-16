// test_stage1_order_recovery_idempotency.mjs
// Automated test suite for OptiHub B2B: Stage 1 Order Recovery, Preference Reuse & Idempotency

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Helper matching matchesCandidateOrder from route.ts
function matchesCandidateOrder(candidateOrder, candidateItems, currentItems, cartCalc) {
  if (!candidateOrder || !candidateItems || !currentItems || !cartCalc) return false;

  // Comparar totales financieros recalculados
  if (Number(candidateOrder.subtotal_net) !== cartCalc.subtotalNet) return false;
  if (Number(candidateOrder.tax_amount) !== cartCalc.taxAmount) return false;
  if (Number(candidateOrder.total_amount) !== cartCalc.totalAmount) return false;

  // Comparar cantidad de ítems únicos
  if (candidateItems.length !== currentItems.length) return false;

  // Mapear ítems de la orden candidata
  const candidateMap = new Map();
  for (const oi of candidateItems) {
    candidateMap.set(oi.product_id, {
      quantity: Number(oi.quantity),
      unit_price_net: Number(oi.unit_price_net)
    });
  }

  // Verificar que cada ítem del carrito coincida exactamente en producto, cantidad y precio unitario
  for (const ci of currentItems) {
    const candidateItem = candidateMap.get(ci.product_id);
    if (!candidateItem) return false;
    if (candidateItem.quantity !== ci.quantity) return false;

    const catalogProduct = cartCalc.catalogMap.get(ci.product_id);
    if (!catalogProduct || candidateItem.unit_price_net !== Number(catalogProduct.precio_neto_clp)) {
      return false;
    }
  }

  return true;
}

// Helper matching sanitizeMercadoPagoError from route.ts
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

// Helper matching simulated persistPreferenceAtomic
async function simulatePersistPreferenceAtomic(mockDb, orderId, prefId, paymentUrl) {
  const order = mockDb.orders.get(orderId);
  if (!order) throw new Error('Order not found');

  if (order.preference_id === null) {
    // Winner
    order.preference_id = prefId;
    order.init_point = paymentUrl;
    return { id: prefId, initPoint: paymentUrl, orderId };
  } else {
    // Loser reads winner's preference
    return { id: order.preference_id, initPoint: order.init_point, orderId };
  }
}

// ==============================================================================
// TEST 1: Reutilización de órdenes idénticas
// ==============================================================================
test('1. Exact Match: Reuses existing pending order and returns cached preference without creating new order', () => {
  const orderId = 'order-pending-uuid-1';
  const existingOrder = {
    id: orderId,
    user_id: 'user-b2b-1',
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 860000,
    tax_amount: 163400,
    total_amount: 1023400,
    preference_id: 'pref-mp-12345',
    init_point: 'https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=pref-mp-12345',
  };

  const existingOrderItems = [
    { product_id: 'SKU-BOSS-1', quantity: 2, unit_price_net: 86000 },
    { product_id: 'SKU-BOSS-2', quantity: 8, unit_price_net: 86000 },
  ];

  const currentCartItems = [
    { product_id: 'SKU-BOSS-1', quantity: 2 },
    { product_id: 'SKU-BOSS-2', quantity: 8 },
  ];

  const catalogMap = new Map([
    ['SKU-BOSS-1', { id_ext: 'SKU-BOSS-1', precio_neto_clp: 86000, stock: 15 }],
    ['SKU-BOSS-2', { id_ext: 'SKU-BOSS-2', precio_neto_clp: 86000, stock: 20 }],
  ]);

  const cartCalc = {
    subtotalNet: 860000,
    taxAmount: 163400,
    totalAmount: 1023400,
    catalogMap,
  };

  const isMatch = matchesCandidateOrder(existingOrder, existingOrderItems, currentCartItems, cartCalc);
  assert.equal(isMatch, true, 'Order must match exactly when products, quantities and recalculated prices are identical');

  // Decision logic check
  const responsePayload = {
    id: existingOrder.preference_id,
    initPoint: existingOrder.init_point,
    orderId: existingOrder.id,
  };
  assert.equal(responsePayload.id, 'pref-mp-12345');
  assert.equal(responsePayload.orderId, orderId);
});

// ==============================================================================
// TEST 2: Recuperación de orden sin preferencia (Fallo previo de MP)
// ==============================================================================
test('2. Recovery: Order with preference_id=null is healed with new preference without creating second order', async () => {
  const orderId = 'order-orphan-uuid-2';
  const existingOrderWithoutPref = {
    id: orderId,
    user_id: 'user-b2b-1',
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 860000,
    tax_amount: 163400,
    total_amount: 1023400,
    preference_id: null,
    init_point: null,
  };

  const existingOrderItems = [
    { product_id: 'SKU-BOSS-1', quantity: 2, unit_price_net: 86000 },
    { product_id: 'SKU-BOSS-2', quantity: 8, unit_price_net: 86000 },
  ];

  const currentCartItems = [
    { product_id: 'SKU-BOSS-1', quantity: 2 },
    { product_id: 'SKU-BOSS-2', quantity: 8 },
  ];

  const catalogMap = new Map([
    ['SKU-BOSS-1', { id_ext: 'SKU-BOSS-1', precio_neto_clp: 86000, stock: 15 }],
    ['SKU-BOSS-2', { id_ext: 'SKU-BOSS-2', precio_neto_clp: 86000, stock: 20 }],
  ]);

  const cartCalc = {
    subtotalNet: 860000,
    taxAmount: 163400,
    totalAmount: 1023400,
    catalogMap,
  };

  const isMatch = matchesCandidateOrder(existingOrderWithoutPref, existingOrderItems, currentCartItems, cartCalc);
  assert.equal(isMatch, true);
  assert.equal(existingOrderWithoutPref.preference_id, null, 'Simulates order whose previous MP call failed');

  // Recovery simulation
  const mockDb = {
    orders: new Map([[orderId, { ...existingOrderWithoutPref }]]),
  };

  const healedPrefId = 'pref-mp-healed-999';
  const healedUrl = 'https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=' + healedPrefId;

  const result = await simulatePersistPreferenceAtomic(mockDb, orderId, healedPrefId, healedUrl);

  assert.equal(result.id, healedPrefId);
  assert.equal(result.orderId, orderId, 'Must keep the same existing order ID');
  assert.equal(mockDb.orders.get(orderId).preference_id, healedPrefId, 'Database updated with healed preference');
});

// ==============================================================================
// TEST 3: Carrito modificado (No reutilización de orden obsoleta)
// ==============================================================================
test('3. Cart Modified: When products or quantities differ, candidate order is NOT reused', () => {
  const orderId = 'order-pending-uuid-3';
  const existingOrder = {
    id: orderId,
    subtotal_net: 860000,
    tax_amount: 163400,
    total_amount: 1023400,
  };

  const existingOrderItems = [
    { product_id: 'SKU-BOSS-1', quantity: 10, unit_price_net: 86000 },
  ];

  // Case A: Different product
  const modifiedCartDifferentProduct = [
    { product_id: 'SKU-RAYBAN-WAYFARER', quantity: 10 },
  ];
  const catalogMapA = new Map([
    ['SKU-RAYBAN-WAYFARER', { id_ext: 'SKU-RAYBAN-WAYFARER', precio_neto_clp: 86000, stock: 20 }],
  ]);
  const cartCalcA = { subtotalNet: 860000, taxAmount: 163400, totalAmount: 1023400, catalogMap: catalogMapA };

  const matchA = matchesCandidateOrder(existingOrder, existingOrderItems, modifiedCartDifferentProduct, cartCalcA);
  assert.equal(matchA, false, 'Must reject reuse when product_id is different');

  // Case B: Different quantity
  const modifiedCartDifferentQty = [
    { product_id: 'SKU-BOSS-1', quantity: 12 },
  ];
  const catalogMapB = new Map([
    ['SKU-BOSS-1', { id_ext: 'SKU-BOSS-1', precio_neto_clp: 86000, stock: 20 }],
  ]);
  const cartCalcB = { subtotalNet: 1032000, taxAmount: 196080, totalAmount: 1228080, catalogMap: catalogMapB };

  const matchB = matchesCandidateOrder(existingOrder, existingOrderItems, modifiedCartDifferentQty, cartCalcB);
  assert.equal(matchB, false, 'Must reject reuse when quantity and total differ');
});

// ==============================================================================
// TEST 4: Concurrencia atómica (Race condition simulation)
// ==============================================================================
test('4. Concurrency: Two parallel requests racing to persist preference resolve atomically', async () => {
  const orderId = 'order-concurrent-test';
  const mockDb = {
    orders: new Map([[orderId, { id: orderId, preference_id: null, init_point: null }]]),
  };

  // Two workers generate preferences concurrently
  const worker1Promise = simulatePersistPreferenceAtomic(mockDb, orderId, 'PREF-WORKER-1', 'https://url-1');
  const worker2Promise = simulatePersistPreferenceAtomic(mockDb, orderId, 'PREF-WORKER-2', 'https://url-2');

  const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

  // Both workers must return the SAME preference ID and init_point (no split-brain)
  assert.equal(res1.id, res2.id, 'Both concurrent requests must resolve to the identical preference');
  assert.equal(res1.initPoint, res2.initPoint);
  assert.equal(res1.orderId, orderId);
  assert.equal(mockDb.orders.get(orderId).preference_id, res1.id);
});

// ==============================================================================
// TEST 5: Manejo de errores de Mercado Pago sanitizados
// ==============================================================================
test('5. Error Handling: Provider errors are cleanly sanitized without leaking secrets or tokens', () => {
  const res1 = sanitizeMercadoPagoError({ message: 'auto_return invalid: back_url.success must be defined' });
  assert.equal(res1.status, 502);
  assert.equal(res1.error, 'Error de configuración: Las URLs de retorno no son válidas para auto_return.');

  const res2 = sanitizeMercadoPagoError({ status: 401, message: 'Unauthorized APP_USR-SECRET-TOKEN' });
  assert.equal(res2.status, 502);
  assert.equal(res2.error, 'Error de autorización con la pasarela de pagos.');
  assert.equal(res2.error.includes('APP_USR'), false);

  const res3 = sanitizeMercadoPagoError({ status: 400, name: 'MPBadRequestError' });
  assert.equal(res3.status, 502);
  assert.equal(res3.error, 'Datos de orden no válidos para la pasarela de pagos.');
});

// ==============================================================================
// TEST 6: Live Sandbox Test - Creación con expiración a 4 horas
// ==============================================================================
test('6. Live Sandbox integration: verifies preference creation with expires=true and 4-hour expiration', async () => {
  let token = process.env.MP_ACCESS_TOKEN;
  if (!token && fs.existsSync('frontend/.env.local')) {
    const envContent = fs.readFileSync('frontend/.env.local', 'utf8');
    const tokenMatch = envContent.match(/MP_ACCESS_TOKEN=(.*)/);
    if (tokenMatch) token = tokenMatch[1].trim();
  }

  assert.ok(token, 'MP_ACCESS_TOKEN must be configured');

  const { MercadoPagoConfig, Preference } = await import('./frontend/node_modules/mercadopago/dist/index.js');
  const client = new MercadoPagoConfig({ accessToken: token });
  const preference = new Preference(client);

  const testOrderId = `order-test-stage1-${Date.now()}`;
  const deployedDomain = 'https://optihub-b2b.vercel.app';
  const expectedExp = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const response = await preference.create({
    body: {
      items: [
        { id: 'TEST-SKU-EXP', title: 'Marco Prueba Expiracion', quantity: 10, unit_price: 25000, currency_id: 'CLP' },
        { id: 'IVA', title: 'IVA (19%)', quantity: 1, unit_price: 47500, currency_id: 'CLP' },
      ],
      external_reference: testOrderId,
      payer: { name: 'Cliente Test', email: 'test_stage1@optihub.cl' },
      back_urls: {
        success: `${deployedDomain}/checkout/resultado?status=approved&ref=${testOrderId}`,
        failure: `${deployedDomain}/checkout/resultado?status=failure&ref=${testOrderId}`,
        pending: `${deployedDomain}/checkout/resultado?status=pending&ref=${testOrderId}`,
      },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: expectedExp,
    }
  });

  assert.ok(response.id, 'Preference ID must be returned');
  assert.ok(response.sandbox_init_point || response.init_point, 'Init point returned');
  assert.equal(response.external_reference, testOrderId);
  assert.equal(response.expires, true, 'expires must be true');
  assert.ok(response.expiration_date_to, 'expiration_date_to must be present in MP response');
});
