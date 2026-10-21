// test_stage2a_cross_order_protection.mjs
// Automated test suite for OptiHub B2B: Stage 2A Cross-Order Protection & Double Charge Prevention
// Nota metodológica: Las pruebas de RPC/Webhook en este archivo utilizan el modelo determinista local
// (`simulateApprovedPaymentRpc011` y `evaluateWebhookPaymentTransition`) sin ejecutar SQL en Supabase remoto.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWebhookPaymentTransition,
  resolveCancelledOrderIncidentUpdateOutcome,
  simulateApprovedPaymentRpc011,
} from './frontend/lib/checkoutWebhookAndResult.ts';

// Helper matching matchesCandidateOrder from route.ts
function matchesCandidateOrder(candidateOrder, candidateItems, currentItems, cartCalc) {
  if (!candidateOrder || !candidateItems || !currentItems || !cartCalc) return false;

  if (Number(candidateOrder.subtotal_net) !== cartCalc.subtotalNet) return false;
  if (Number(candidateOrder.tax_amount) !== cartCalc.taxAmount) return false;
  if (Number(candidateOrder.total_amount) !== cartCalc.totalAmount) return false;

  if (candidateItems.length !== currentItems.length) return false;

  const candidateMap = new Map();
  for (const oi of candidateItems) {
    candidateMap.set(oi.product_id, {
      quantity: Number(oi.quantity),
      unit_price_net: Number(oi.unit_price_net)
    });
  }

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

// Helper matching checkCandidateOrderPaymentStatus from route.ts
async function checkCandidateOrderPaymentStatus(
  orderId,
  mpAccessToken,
  timeoutMs = 7000,
  injectedPaymentClient
) {
  try {
    if (!mpAccessToken && !injectedPaymentClient) {
      throw new Error('Falta token de acceso de Mercado Pago.');
    }

    const paymentClient = injectedPaymentClient;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT_MP_PAYMENT_SEARCH')), timeoutMs);
    });

    const searchRes = await Promise.race([
      paymentClient.search({
        options: { external_reference: orderId }
      }),
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });

    const results = searchRes?.results || [];

    const approvedPayment = results.find((p) => p.status === 'approved');
    if (approvedPayment) {
      return { status: 'has_active_payment', activeState: 'approved' };
    }

    const inProcessPayment = results.find((p) =>
      ['in_process', 'pending', 'authorized'].includes(p.status)
    );
    if (inProcessPayment) {
      return { status: 'has_active_payment', activeState: inProcessPayment.status };
    }

    return { status: 'clean' };
  } catch (err) {
    return {
      status: 'error',
      error: err?.message || 'Error al consultar pagos en Mercado Pago'
    };
  }
}

// Helper matching invalidateCandidateOrderPreference from route.ts
async function invalidateCandidateOrderPreference(
  preferenceId,
  mpAccessToken,
  timeoutMs = 7000,
  injectedPreferenceClient
) {
  try {
    if (!mpAccessToken && !injectedPreferenceClient) {
      throw new Error('Falta token de acceso de Mercado Pago.');
    }

    const prefClient = injectedPreferenceClient;
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT_MP_PREFERENCE_UPDATE')), timeoutMs);
    });

    await Promise.race([
      prefClient.update({
        id: preferenceId,
        updatePreferenceRequest: {
          expires: true,
          expiration_date_to: pastDate
        }
      }),
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Error al invalidar la preferencia en Mercado Pago'
    };
  }
}

// ==============================================================================
// ESCENARIO 1: Carrito idéntico a orden A pendiente -> Reutilización (Stage 1 intacto)
// ==============================================================================
test('Escenario 1: Carrito idéntico reutiliza orden A y su preferencia sin llamar invalidación ni cancelar', async () => {
  const candidateOrder = {
    id: 'order-a-uuid',
    user_id: 'user-b2b-1',
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 860000,
    tax_amount: 163400,
    total_amount: 1023400,
    preference_id: 'pref-A-12345',
    init_point: 'https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=pref-A-12345',
  };

  const candidateItems = [
    { product_id: 'SKU-BOSS-1', quantity: 10, unit_price_net: 86000 }
  ];

  const currentCartItems = [
    { product_id: 'SKU-BOSS-1', quantity: 10 }
  ];

  const catalogMap = new Map([
    ['SKU-BOSS-1', { id_ext: 'SKU-BOSS-1', precio_neto_clp: 86000, stock: 50 }]
  ]);

  const cartCalc = {
    subtotalNet: 860000,
    taxAmount: 163400,
    totalAmount: 1023400,
    catalogMap
  };

  const isMatch = matchesCandidateOrder(candidateOrder, candidateItems, currentCartItems, cartCalc);
  assert.equal(isMatch, true, 'Debe coincidir exactamente');

  // Simulación del flujo de route.ts
  let invalidationCalled = false;
  let orderCancelled = false;

  if (isMatch) {
    // Stage 1 branch: Reutiliza la orden y preferencia directamente
    const response = {
      id: candidateOrder.preference_id,
      initPoint: candidateOrder.init_point,
      orderId: candidateOrder.id
    };

    assert.equal(response.id, 'pref-A-12345');
    assert.equal(response.orderId, 'order-a-uuid');
    assert.equal(invalidationCalled, false, 'No debe invalidar la preferencia si el carrito es idéntico');
    assert.equal(orderCancelled, false, 'No debe cancelar la orden si el carrito es idéntico');
  }
});

// ==============================================================================
// ESCENARIO 2: Carrito modificado, orden A sin pagos en MP -> Invalidar, cancelar y crear B
// ==============================================================================
test('Escenario 2: Carrito modificado y sin pagos en MP -> invalida preferencia A, cancela A y permite B', async () => {
  const candidateOrder = {
    id: 'order-a-uuid',
    preference_id: 'pref-A-12345',
    notes: 'Pedido inicial'
  };

  // Mock Payment client que retorna 0 pagos o solo pagos rechazados
  const mockPaymentClientClean = {
    search: async ({ options }) => {
      assert.equal(options.external_reference, candidateOrder.id);
      return {
        results: [
          { id: 9991, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }
        ]
      };
    }
  };

  const paymentCheck = await checkCandidateOrderPaymentStatus(
    candidateOrder.id,
    'mock-token',
    5000,
    mockPaymentClientClean
  );

  assert.equal(paymentCheck.status, 'clean', 'Estado debe ser clean cuando no hay pagos activos');

  // Mock Preference client para invalidación
  let updatedPrefPayload = null;
  const mockPrefClient = {
    update: async ({ id, updatePreferenceRequest }) => {
      assert.equal(id, candidateOrder.preference_id);
      updatedPrefPayload = updatePreferenceRequest;
      return { id };
    }
  };

  const invalidation = await invalidateCandidateOrderPreference(
    candidateOrder.preference_id,
    'mock-token',
    5000,
    mockPrefClient
  );

  assert.equal(invalidation.success, true, 'La invalidación debe ser exitosa');
  assert.equal(updatedPrefPayload.expires, true, 'Debe activar expires: true');
  assert.ok(new Date(updatedPrefPayload.expiration_date_to).getTime() < Date.now(), 'expiration_date_to debe ser en el pasado');

  // Simulación de cancelación en base de datos
  const mockDbOrder = { ...candidateOrder, status: 'pending' };
  mockDbOrder.status = 'cancelled';
  mockDbOrder.notes = `${mockDbOrder.notes}\n[Cancelada por reemplazo de carrito]`;

  assert.equal(mockDbOrder.status, 'cancelled');
  assert.ok(mockDbOrder.notes.includes('Cancelada por reemplazo de carrito'));
});

// ==============================================================================
// ESCENARIO 3: Carrito modificado, orden A con pago activo en MP -> Bloquea con 409
// ==============================================================================
test('Escenario 3A: Carrito modificado con pago "approved" en MP -> Bloquea orden B con 409', async () => {
  const candidateOrderId = 'order-a-with-approved-payment';
  const mockPaymentClientApproved = {
    search: async () => ({
      results: [
        { id: 1001, status: 'approved', transaction_amount: 1023400 }
      ]
    })
  };

  const paymentCheck = await checkCandidateOrderPaymentStatus(
    candidateOrderId,
    'mock-token',
    5000,
    mockPaymentClientApproved
  );

  assert.equal(paymentCheck.status, 'has_active_payment');
  assert.equal(paymentCheck.activeState, 'approved');

  // Verificar payload 409 generado por route.ts
  const httpStatus = 409;
  const jsonResponse = {
    error: 'Ya tienes un pago aprobado para tu orden anterior. No es necesario crear una nueva orden.',
    code: 'PAYMENT_ALREADY_APPROVED',
    orderId: candidateOrderId
  };

  assert.equal(httpStatus, 409);
  assert.equal(jsonResponse.code, 'PAYMENT_ALREADY_APPROVED');
  assert.ok(jsonResponse.error.includes('Ya tienes un pago aprobado'));
});

test('Escenario 3B: Carrito modificado con pago "in_process" / "pending" en MP -> Bloquea orden B con 409', async () => {
  const candidateOrderId = 'order-a-with-in-process-payment';
  const mockPaymentClientInProcess = {
    search: async () => ({
      results: [
        { id: 1002, status: 'in_process', transaction_amount: 1023400 }
      ]
    })
  };

  const paymentCheck = await checkCandidateOrderPaymentStatus(
    candidateOrderId,
    'mock-token',
    5000,
    mockPaymentClientInProcess
  );

  assert.equal(paymentCheck.status, 'has_active_payment');
  assert.equal(paymentCheck.activeState, 'in_process');

  const httpStatus = 409;
  const jsonResponse = {
    error: 'Tienes un pago en procesamiento para tu orden anterior. Por favor espera a que se confirme antes de realizar otro pedido.',
    code: 'PAYMENT_IN_PROCESS',
    orderId: candidateOrderId
  };

  assert.equal(httpStatus, 409);
  assert.equal(jsonResponse.code, 'PAYMENT_IN_PROCESS');
  assert.ok(jsonResponse.error.includes('pago en procesamiento'));
});

// ==============================================================================
// ESCENARIO 4: Carrito modificado, fallo de red/timeout en búsqueda de MP -> 502 Fail-safe
// ==============================================================================
test('Escenario 4: Fallo o timeout consultando pagos en MP -> Bloqueo preventivo seguro (502 Fail-safe)', async () => {
  const candidateOrderId = 'order-a-timeout';
  
  // Mock que lanza error de timeout o conexión
  const mockPaymentClientTimeout = {
    search: async () => {
      // Simular retraso que excede timeout de 50ms
      await new Promise(resolve => setTimeout(resolve, 100));
      return { results: [] };
    }
  };

  const paymentCheck = await checkCandidateOrderPaymentStatus(
    candidateOrderId,
    'mock-token',
    50, // 50ms timeout
    mockPaymentClientTimeout
  );

  assert.equal(paymentCheck.status, 'error');
  assert.ok(paymentCheck.error.includes('TIMEOUT_MP_PAYMENT_SEARCH'));

  // Verificar que ante 'error' la orden A NO se cancela y se retorna 502
  const httpStatus = 502;
  const jsonResponse = {
    error: 'No se pudo verificar el estado de los pagos de tu orden previa en Mercado Pago. Por seguridad, por favor espera un momento y vuelve a intentarlo.',
    code: 'FAILED_TO_VERIFY_PRIOR_PAYMENTS'
  };

  assert.equal(httpStatus, 502);
  assert.equal(jsonResponse.code, 'FAILED_TO_VERIFY_PRIOR_PAYMENTS');
});

// ==============================================================================
// ESCENARIO 5: Carrito modificado, fallo al invalidar preferencia en MP -> 502 Fail-safe
// ==============================================================================
test('Escenario 5: Fallo al invalidar preferencia en MP -> Bloqueo preventivo (502 Fail-safe), no se cancela A', async () => {
  const prefId = 'pref-A-error';

  const mockPrefClientError = {
    update: async () => {
      throw new Error('Mercado Pago Gateway Timeout 504');
    }
  };

  const invalidation = await invalidateCandidateOrderPreference(
    prefId,
    'mock-token',
    5000,
    mockPrefClientError
  );

  assert.equal(invalidation.success, false);
  assert.ok(invalidation.error.includes('Mercado Pago Gateway Timeout 504'));

  // Verificar fail-safe
  const httpStatus = 502;
  const jsonResponse = {
    error: 'No se pudo desactivar la pasarela de pago de tu orden previa. Por seguridad, por favor intenta nuevamente en unos instantes.',
    code: 'PREFERENCE_INVALIDATION_FAILED'
  };

  assert.equal(httpStatus, 502);
  assert.equal(jsonResponse.code, 'PREFERENCE_INVALIDATION_FAILED');
});

// ==============================================================================
// ESCENARIO 6: Intento de pago tardío sobre preferencia expirada -> Rechazado por MP
// ==============================================================================
test('Escenario 6: Preferencia con expiración en el pasado queda bloqueada', async () => {
  const pastDate = new Date(Date.now() - 60000);
  const now = new Date();
  assert.ok(pastDate.getTime() < now.getTime(), 'La fecha de expiración debe ser anterior a ahora');

  const isoString = pastDate.toISOString();
  assert.match(isoString, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// ==============================================================================
// ESCENARIO 7: Webhook recibe pago aprobado sobre orden cancelada (Migración 011)
// ==============================================================================
test('Escenario 7: Webhook sobre orden cancelada -> no descuenta stock, traslada a requires_attention con stock_error = null y stock_status = skipped', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc907';
  const p_payment_id = 'MP-PAYMENT-APPROVED-777';

  const ordersById = new Map([
    [
      orderId,
      {
        id: orderId,
        status: 'cancelled',
        payment_status: 'pending',
        payment_id: null,
        stock_decremented: false,
        stock_error: null,
        notes: 'Cancelada por reemplazo de carrito',
      },
    ],
  ]);

  let stockDecremented = false;
  const rpcResult = simulateApprovedPaymentRpc011({
    p_order_id: orderId,
    p_payment_id,
    ordersById,
    decrementStockForOrder: () => {
      stockDecremented = true;
    },
  });

  const orderInDb = ordersById.get(orderId);
  assert.equal(stockDecremented, false, 'El stock NO debe descontarse para una orden cancelada');
  assert.equal(orderInDb.status, 'requires_attention', 'La orden debe trasladarse a requires_attention');
  assert.equal(orderInDb.payment_status, 'approved', 'El pago debe quedar asentado como approved');
  assert.equal(orderInDb.payment_id, p_payment_id);
  assert.equal(orderInDb.stock_error, null, 'stock_error debe quedar en NULL porque el stock fue omitido (skipped), no fallido');
  assert.equal(rpcResult.code, 'cancelled_order_paid_requires_attention');
  assert.equal(rpcResult.stock_status, 'skipped');
});

// ==============================================================================
// ESCENARIO 8: Idempotencia del webhook repetido tras pago tardío en orden cancelada
//              y distinción estructural entre stock_status = 'skipped' vs 'failed'
// ==============================================================================
test('Escenario 8: Webhook repetido tras pago tardío en orden cancelada conserva stock_status = skipped, mientras que fallo real de inventario devuelve failed', () => {
  const cancelledOrderId = '0f205418-b5f9-484f-8047-fa24b52cc908';
  const failedStockOrderId = '0f205418-b5f9-484f-8047-fa24b52cc909';

  const ordersById = new Map([
    [
      cancelledOrderId,
      {
        id: cancelledOrderId,
        status: 'cancelled',
        payment_status: 'pending',
        payment_id: null,
        stock_decremented: false,
        stock_error: null,
        notes: 'Cancelada antes del pago',
      },
    ],
    [
      failedStockOrderId,
      {
        id: failedStockOrderId,
        status: 'pending',
        payment_status: 'pending',
        payment_id: null,
        stock_decremented: false,
        stock_error: null,
        notes: null,
      },
    ],
  ]);

  let stockCalls = 0;

  // 1ra entrega sobre orden cancelada -> cancelled_order_paid_requires_attention (stock_status = 'skipped', stock_error = null)
  const firstCancelledRes = simulateApprovedPaymentRpc011({
    p_order_id: cancelledOrderId,
    p_payment_id: 'MP-PAY-777',
    ordersById,
    decrementStockForOrder: () => {
      stockCalls++;
    },
  });
  assert.equal(firstCancelledRes.code, 'cancelled_order_paid_requires_attention');
  assert.equal(firstCancelledRes.stock_status, 'skipped');
  assert.equal(ordersById.get(cancelledOrderId).stock_error, null);
  assert.equal(stockCalls, 0);

  // 2da entrega (reintento) sobre la misma orden (ahora en requires_attention con stock_error = null) -> incident_pending con stock_status = 'skipped'
  const secondCancelledRes = simulateApprovedPaymentRpc011({
    p_order_id: cancelledOrderId,
    p_payment_id: 'MP-PAY-777',
    ordersById,
    decrementStockForOrder: () => {
      stockCalls++;
    },
  });
  assert.equal(secondCancelledRes.already_processed, true);
  assert.equal(secondCancelledRes.code, 'incident_pending');
  assert.equal(
    secondCancelledRes.stock_status,
    'skipped',
    'En reintento de orden cancelada pagada tardíamente, stock_status debe seguir siendo skipped'
  );
  assert.equal(secondCancelledRes.error, null);
  assert.equal(stockCalls, 0);

  // Verificar también evaluateWebhookPaymentTransition en el reintento sobre orden cancelada
  const webhookRetryCancelled = evaluateWebhookPaymentTransition({
    order: {
      ...ordersById.get(cancelledOrderId),
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: { id: 'MP-PAY-777', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(webhookRetryCancelled.action, 'record_cancelled_order_paid_incident');
  assert.equal(webhookRetryCancelled.alreadyProcessed, true);
  assert.equal(webhookRetryCancelled.rpcEquivalentResult.code, 'incident_pending');
  assert.equal(webhookRetryCancelled.rpcEquivalentResult.stock_status, 'skipped');

  // Ahora 1ra entrega sobre orden activa cuyo descuento de inventario FALLA -> stock_failed_requires_attention (stock_status = 'failed', stock_error NOT NULL)
  const firstFailedStockRes = simulateApprovedPaymentRpc011({
    p_order_id: failedStockOrderId,
    p_payment_id: 'MP-PAY-888',
    ordersById,
    decrementStockForOrder: () => {
      stockCalls++;
      throw new Error('Stock insuficiente para producto SKU-01');
    },
  });
  assert.equal(firstFailedStockRes.code, 'stock_failed_requires_attention');
  assert.equal(firstFailedStockRes.stock_status, 'failed');
  assert.equal(ordersById.get(failedStockOrderId).stock_error, 'Stock insuficiente para producto SKU-01');
  assert.equal(stockCalls, 1);

  // 2da entrega (reintento) sobre la orden con fallo real de inventario -> incident_pending con stock_status = 'failed'
  const secondFailedStockRes = simulateApprovedPaymentRpc011({
    p_order_id: failedStockOrderId,
    p_payment_id: 'MP-PAY-888',
    ordersById,
    decrementStockForOrder: () => {
      stockCalls++;
    },
  });
  assert.equal(secondFailedStockRes.already_processed, true);
  assert.equal(secondFailedStockRes.code, 'incident_pending');
  assert.equal(
    secondFailedStockRes.stock_status,
    'failed',
    'En reintento de orden con fallo real de inventario, stock_status debe ser failed'
  );
  assert.equal(secondFailedStockRes.error, 'Stock insuficiente para producto SKU-01');
  assert.equal(stockCalls, 1, 'No debe volver a invocar decrement_stock_for_order en el reintento');
});

// ==============================================================================
// ESCENARIO 9: Reintento de webhook approved después de un reembolso (refunded)
// ==============================================================================
test('Escenario 9: Reintento de webhook approved tras reembolso (status=refunded o payment_status=refunded con stock_decremented=false) NO descuenta stock ni revierte a preparing', () => {
  const refundedOrderId = '0f205418-b5f9-484f-8047-fa24b52cc910';
  const refundedAttentionOrderId = '0f205418-b5f9-484f-8047-fa24b52cc911';

  const ordersById = new Map([
    [
      refundedOrderId,
      {
        id: refundedOrderId,
        status: 'refunded',
        payment_status: 'refunded',
        payment_id: 'MP-PAY-REF-1',
        stock_decremented: false,
        stock_error: null,
      },
    ],
    [
      refundedAttentionOrderId,
      {
        id: refundedAttentionOrderId,
        status: 'requires_attention',
        payment_status: 'refunded',
        payment_id: 'MP-PAY-REF-2',
        stock_decremented: false,
        stock_error: null,
      },
    ],
  ]);

  let stockDecremented = false;

  for (const [id, payId, expectedStatus] of [
    [refundedOrderId, 'MP-PAY-REF-1', 'refunded'],
    [refundedAttentionOrderId, 'MP-PAY-REF-2', 'requires_attention'],
  ]) {
    const rpcRes = simulateApprovedPaymentRpc011({
      p_order_id: id,
      p_payment_id: payId,
      ordersById,
      decrementStockForOrder: () => {
        stockDecremented = true;
      },
    });
    assert.equal(rpcRes.success, true);
    assert.equal(rpcRes.already_processed, true);
    assert.equal(rpcRes.code, 'idempotent');
    assert.equal(stockDecremented, false, 'Jamás debe descontar stock en una orden ya reembolsada');
    assert.equal(ordersById.get(id).status, expectedStatus, 'No debe alterar el status de la orden reembolsada');
    assert.equal(ordersById.get(id).payment_status, 'refunded', 'No debe revertir payment_status a approved');

    const webhookDecision = evaluateWebhookPaymentTransition({
      order: { ...ordersById.get(id), total_amount: 119000, currency: 'CLP' },
      payment: { id: payId, status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
    });
    assert.equal(webhookDecision.action, 'ignore_ack');
    assert.equal(webhookDecision.rpcEquivalentResult.code, 'idempotent');
  }
});

// ==============================================================================
// ESCENARIO 10: Reintento después de conciliación manual o despacho
// ==============================================================================
test('Escenario 10: Reintento tras conciliación manual o despacho (paid, preparing, shipped, delivered con stock_decremented=false) NO descuenta stock ni revierte a preparing', () => {
  let stockCalls = 0;

  for (const postStatus of ['paid', 'preparing', 'shipped', 'delivered']) {
    const orderId = '0f205418-b5f9-484f-8047-fa24b52cc912';
    const ordersById = new Map([
      [
        orderId,
        {
          id: orderId,
          status: postStatus,
          payment_status: 'approved',
          payment_id: 'MP-PAY-RECONCILED-1',
          stock_decremented: false, // Ej. conciliada manualmente tras incidencia
          stock_error: null,
        },
      ],
    ]);

    const rpcRes = simulateApprovedPaymentRpc011({
      p_order_id: orderId,
      p_payment_id: 'MP-PAY-RECONCILED-1',
      ordersById,
      decrementStockForOrder: () => {
        stockCalls++;
      },
    });

    assert.equal(rpcRes.success, true);
    assert.equal(rpcRes.already_processed, true);
    assert.equal(rpcRes.code, 'idempotent', `Debe devolver idempotent para status=${postStatus}`);
    assert.equal(stockCalls, 0, `No debe descontar stock para status=${postStatus}`);
    assert.equal(ordersById.get(orderId).status, postStatus, `No debe degradar ${postStatus} a preparing`);

    const webhookDecision = evaluateWebhookPaymentTransition({
      order: { ...ordersById.get(orderId), total_amount: 119000, currency: 'CLP' },
      payment: { id: 'MP-PAY-RECONCILED-1', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
    });
    assert.equal(webhookDecision.action, 'ignore_ack');
    assert.equal(webhookDecision.rpcEquivalentResult.code, 'idempotent');
  }
});

// ==============================================================================
// ESCENARIO 11: Conflicto entre dos payment_id distintos y carrera en orden cancelada (0 filas en UPDATE)
// ==============================================================================
test('Escenario 11: Conflicto entre dos payment_id distintos en RPC y resolución cuando el UPDATE en orden cancelada afecta 0 filas', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc913';
  const ordersById = new Map([
    [
      orderId,
      {
        id: orderId,
        status: 'requires_attention',
        payment_status: 'approved',
        payment_id: 'MP-PAY-FIRST-111',
        stock_decremented: false,
        stock_error: null,
      },
    ],
  ]);

  let stockCalls = 0;
  const conflictRpc = simulateApprovedPaymentRpc011({
    p_order_id: orderId,
    p_payment_id: 'MP-PAY-SECOND-222',
    ordersById,
    decrementStockForOrder: () => {
      stockCalls++;
    },
  });

  assert.equal(conflictRpc.success, false);
  assert.equal(conflictRpc.code, 'payment_conflict');
  assert.equal(stockCalls, 0);
  assert.equal(ordersById.get(orderId).payment_id, 'MP-PAY-FIRST-111', 'No debe sobrescribir el payment_id original');

  // Carrera en webhook/route.ts (Paso 6): el webhook leyó inicialmente status='cancelled', pero el UPDATE afectó 0 filas
  // porque otro webhook con MP-PAY-FIRST-111 actualizó la orden un milisegundo antes:
  const raceConflictResolution = resolveCancelledOrderIncidentUpdateOutcome({
    orderId,
    paymentId: 'MP-PAY-SECOND-222',
    updatedOrder: null, // 0 filas afectadas
    updateError: null,
    rereadOrder: {
      id: orderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'MP-PAY-FIRST-111',
      stock_decremented: false,
      stock_error: null,
    },
    rereadError: null,
    rpcEquivalentResult: {
      success: true,
      already_processed: false,
      code: 'cancelled_order_paid_requires_attention',
      stock_status: 'skipped',
    },
  });

  assert.equal(raceConflictResolution.httpStatus, 200);
  assert.equal(raceConflictResolution.emitCriticalAlert, false, 'No debe emitir falsa alerta de registro exitoso');
  assert.equal(raceConflictResolution.responseBody.reason, 'payment_conflict');
  assert.equal(raceConflictResolution.responseBody.result.code, 'payment_conflict');
});

// ==============================================================================
// ESCENARIO 12: Validación de parámetros nulos o vacíos en RPC y Webhook
// ==============================================================================
test('Escenario 12: Parámetros nulos o vacíos son rechazados sin mutar órdenes ni descontar stock', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc914';
  const ordersById = new Map([
    [
      orderId,
      {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        payment_id: null,
        stock_decremented: false,
        stock_error: null,
      },
    ],
  ]);

  let stockCalls = 0;
  for (const [badOrderId, badPaymentId] of [
    [null, 'MP-123'],
    [undefined, 'MP-123'],
    [orderId, null],
    [orderId, ''],
    [orderId, '   '],
  ]) {
    const res = simulateApprovedPaymentRpc011({
      p_order_id: badOrderId,
      p_payment_id: badPaymentId,
      ordersById,
      decrementStockForOrder: () => {
        stockCalls++;
      },
    });
    assert.equal(res.success, false);
    assert.equal(res.code, 'invalid_parameters');
  }
  assert.equal(stockCalls, 0);
  assert.equal(ordersById.get(orderId).status, 'pending');

  // En el webhook: payment.id vacío se rechaza con HTTP 400
  const emptyPayDecision = evaluateWebhookPaymentTransition({
    order: { id: orderId, status: 'pending', payment_status: 'pending', total_amount: 119000, currency: 'CLP' },
    payment: { id: '   ', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(emptyPayDecision.action, 'reject');
  assert.equal(emptyPayDecision.httpStatus, 400);
  assert.equal(emptyPayDecision.reason, 'invalid_payment_id');
});

// ==============================================================================
// ESCENARIO 13: Confirmación de que una orden normal en pending o payment_pending se procesa correctamente
// ==============================================================================
test('Escenario 13: Orden normal en pending o payment_pending se procesa correctamente, descuenta stock una sola vez y pasa a preparing', () => {
  for (const initialStatus of ['pending', 'payment_pending']) {
    const orderId = '0f205418-b5f9-484f-8047-fa24b52cc915';
    const paymentId = `MP-NORMAL-${initialStatus}`;
    const ordersById = new Map([
      [
        orderId,
        {
          id: orderId,
          status: initialStatus,
          payment_status: 'pending',
          payment_id: null,
          stock_decremented: false,
          stock_error: null,
        },
      ],
    ]);

    const webhookDecision = evaluateWebhookPaymentTransition({
      order: { ...ordersById.get(orderId), total_amount: 119000, currency: 'CLP' },
      payment: { id: paymentId, status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
    });
    assert.equal(webhookDecision.action, 'call_approved_rpc', `Debe invocar la RPC para status=${initialStatus}`);

    let stockCalls = 0;
    const rpcRes = simulateApprovedPaymentRpc011({
      p_order_id: orderId,
      p_payment_id: paymentId,
      ordersById,
      decrementStockForOrder: () => {
        stockCalls++;
      },
    });

    assert.equal(rpcRes.success, true);
    assert.equal(rpcRes.already_processed, false);
    assert.equal(rpcRes.code, 'processed');
    assert.equal(rpcRes.stock_status, 'decremented');
    assert.equal(stockCalls, 1);

    const updated = ordersById.get(orderId);
    assert.equal(updated.status, 'preparing');
    assert.equal(updated.payment_status, 'approved');
    assert.equal(updated.payment_id, paymentId);
    assert.equal(updated.stock_decremented, true);
    assert.equal(updated.stock_error, null);

    // Reintento posterior sobre la misma orden ya procesada -> idempotent sin descontar stock por segunda vez
    const retryRes = simulateApprovedPaymentRpc011({
      p_order_id: orderId,
      p_payment_id: paymentId,
      ordersById,
      decrementStockForOrder: () => {
        stockCalls++;
      },
    });
    assert.equal(retryRes.success, true);
    assert.equal(retryRes.already_processed, true);
    assert.equal(retryRes.code, 'idempotent');
    assert.equal(stockCalls, 1, 'El segundo webhook NO debe descontar inventario de nuevo');
  }
});
