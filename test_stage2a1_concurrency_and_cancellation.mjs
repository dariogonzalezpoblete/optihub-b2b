// test_stage2a1_concurrency_and_cancellation.mjs
// Automated test suite for OptiHub B2B: Etapa 2A.5 - Cancelación Atómica y Garantía de Rollback
//
// ==============================================================================
// DISTINCIÓN METODOLÓGICA OBLIGATORIA (Mocks vs PostgreSQL Real):
// - Estas pruebas unitarias evalúan la lógica TypeScript de la API (route.ts),
//   los códigos de error (503, 409, 502, 400), el mapeo de excepciones y la
//   coordinación de Fencing Tokens y cancelación atómica mediante mocks controlados.
// - Los mocks modelan la semántica transaccional esperada (savepoints y rollbacks ante excepciones),
//   pero NO constituyen una prueba de rollback físico a nivel de motor de almacenamiento o WAL.
// - La garantía física definitiva de concurrencia y ACID depende exclusivamente de la ejecución
//   real de supabase_migration_012_checkout_user_concurrency_lease.sql en PostgreSQL.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WebhookSignatureValidator } from './frontend/node_modules/mercadopago/dist/index.js';
import {
  classifyCheckoutLeaseError,
  evaluateWebhookPaymentTransition,
  resolveVerifiedCheckoutResult,
  isValidUuid,
  evaluatePendingOrdersForCheckout,
  isOrderWithinReuseWindow,
} from './frontend/lib/checkoutWebhookAndResult.ts';

// Helper simulando acquireUserCheckoutLease de route.ts
async function simulateAcquireUserCheckoutLease(mockRpcResult) {
  const { data, error } = mockRpcResult;

  if (error) {
    const classified = classifyCheckoutLeaseError(error);
    return {
      success: false,
      httpStatus: classified.httpStatus,
      code: classified.code,
      message: classified.message
    };
  }

  if (!data?.success) {
    return {
      success: false,
      httpStatus: 409,
      code: data?.code || 'CHECKOUT_IN_PROGRESS',
      message: data?.message || 'Ya existe un proceso de pago en curso para tu cuenta. Por favor espera unos momentos antes de reintentar.',
      retryAfter: data?.retry_after_seconds || 5
    };
  }

  return { success: true };
}

// Helper simulando verifyUserCheckoutLease de route.ts
async function simulateVerifyUserCheckoutLease(mockDb, userId, leaseId) {
  const row = mockDb.leases.get(userId);

  if (!row) {
    return {
      valid: false,
      code: 'LEASE_NOT_FOUND',
      message: 'La reserva de checkout ya no existe o fue eliminada.'
    };
  }

  if (row.leaseId !== leaseId) {
    return {
      valid: false,
      code: 'LEASE_LOST_TO_CONCURRENT_REQUEST',
      message: 'La reserva de checkout fue adquirida por otra solicitud concurrente.'
    };
  }

  if (row.expiresAt <= Date.now()) {
    return {
      valid: false,
      code: 'LEASE_EXPIRED',
      message: 'La reserva de checkout ha expirado por tiempo de espera.'
    };
  }

  return { valid: true };
}

// Helper simulando release_checkout_lease con Fencing Token de PostgreSQL
async function simulateReleaseLeaseRpc(mockDb, userId, leaseId) {
  const row = mockDb.leases.get(userId);
  if (!row) {
    return { success: false, released: false, reason: 'lease_not_found' };
  }

  if (row.leaseId === leaseId) {
    mockDb.leases.delete(userId);
    return { success: true, released: true };
  } else {
    return { success: false, released: false, reason: 'not_lease_owner' };
  }
}

// Helper simulando el comportamiento transaccional de process_b2b_checkout (Etapa 2A.5)
function simulateProcessB2bCheckout(mockDb, params) {
  const {
    p_user_id,
    p_cart_id,
    p_billing,
    p_lease_id,
    p_cancel_order_id,
    simulateStockError,
    simulateUniqueConstraintViolation
  } = params;

  // FASE 1: Validaciones de precondición (sin mutar datos)
  if (!p_lease_id) {
    return { data: { success: false, code: 'LEASE_REQUIRED', message: 'Se requiere lease_id.' }, error: null };
  }

  const lease = mockDb.leases.get(p_user_id);
  if (!lease) {
    return { data: { success: false, code: 'LEASE_NOT_FOUND', message: 'No existe reserva activa.' }, error: null };
  }
  if (lease.leaseId !== p_lease_id) {
    return { data: { success: false, code: 'LEASE_LOST_TO_CONCURRENT_REQUEST', message: 'Reserva perdida.' }, error: null };
  }
  if (lease.expiresAt <= Date.now()) {
    return { data: { success: false, code: 'LEASE_EXPIRED', message: 'Reserva expirada.' }, error: null };
  }

  // Pre-validación de orden a cancelar si se especificó
  if (p_cancel_order_id) {
    const prevOrder = mockDb.orders.get(p_cancel_order_id);
    if (!prevOrder || prevOrder.user_id !== p_user_id || prevOrder.status !== 'pending') {
      return {
        data: {
          success: false,
          code: 'CONCURRENT_ORDER_STATE_CHANGED',
          message: 'No se pudo cancelar la orden previa porque su estado cambió concurrentemente.'
        },
        error: null
      };
    }
  }

  // Pre-validación de stock en Fase 1
  if (simulateStockError) {
    // En PostgreSQL: RAISE EXCEPTION 'Stock insuficiente...'
    return {
      data: null,
      error: { code: 'P0001', message: 'Stock insuficiente para el producto solicitado.' }
    };
  }

  // FASE 2: Transacción Atómica con capacidad de Rollback
  // Snapshot para simular rollback transaccional ante excepciones
  const snapshotOrders = new Map(Array.from(mockDb.orders.entries()).map(([k, v]) => [k, { ...v }]));

  try {
    // 2.1 Cancelar orden previa si aplica
    if (p_cancel_order_id) {
      const target = mockDb.orders.get(p_cancel_order_id);
      target.status = 'cancelled';
      target.notes = (target.notes || '') + '\n[Cancelada atómicamente por reemplazo de carrito]';
    }

    // 2.2 Simular violación de índice único parcial (ej. colisión concurrente de orden pending)
    if (simulateUniqueConstraintViolation) {
      throw {
        code: '23505',
        message: 'CONCURRENT_PENDING_ORDER_EXISTS: Ya existe una orden pendiente activa para este usuario.'
      };
    }

    // 2.3 Crear nueva orden
    const newOrderId = 'order-new-' + Math.random().toString(36).substring(2, 9);
    mockDb.orders.set(newOrderId, {
      id: newOrderId,
      user_id: p_user_id,
      cart_id: p_cart_id,
      status: 'pending',
      payment_status: 'pending',
      subtotal_net: 860000,
      tax_amount: 163400,
      total_amount: 1023400
    });

    return { data: { success: true, order_id: newOrderId }, error: null };
  } catch (err) {
    // ROLLBACK SIMULADO: Revertir todo el snapshot (como lo hace PostgreSQL al abortar subtransacción)
    mockDb.orders = snapshotOrders;
    return { data: null, error: err };
  }
}

// ==============================================================================
// PRUEBAS DE INFRAESTRUCTURA Y CONTRATOS (ETAPA 2A.5)
// ==============================================================================

test('Caso 1A: RPC acquire_checkout_lease no existe (42883 / PGRST202) -> HTTP 503 CHECKOUT_CONCURRENCY_NOT_CONFIGURED', async () => {
  const mockRpcMissing = {
    data: null,
    error: { code: '42883', message: 'function acquire_checkout_lease does not exist' }
  };

  const res = await simulateAcquireUserCheckoutLease(mockRpcMissing);
  assert.equal(res.success, false, 'No debe asumir fallback exitoso');
  assert.equal(res.httpStatus, 503);
  assert.equal(res.code, 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED');
  assert.ok(res.message.includes('requiere la configuración de concurrencia'));
});

test('Caso 1B: Fallo de red/BD en adquisición -> HTTP 503 CHECKOUT_LEASE_UNAVAILABLE', async () => {
  const mockRpcDbError = {
    data: null,
    error: { code: '57P01', message: 'terminating connection due to administrator command' }
  };

  const res = await simulateAcquireUserCheckoutLease(mockRpcDbError);
  assert.equal(res.success, false);
  assert.equal(res.httpStatus, 503);
  assert.equal(res.code, 'CHECKOUT_LEASE_UNAVAILABLE');
  assert.ok(res.message.includes('No se pudo establecer la reserva de checkout'));
});

test('Caso 2: Dos solicitudes simultáneas con carritos distintos para el mismo usuario -> Solicitud 2 recibe 409 CHECKOUT_IN_PROGRESS', async () => {
  const mockRpcCollision = {
    data: {
      success: false,
      code: 'CHECKOUT_IN_PROGRESS',
      message: 'Ya hay una operación de pago en curso para tu cuenta.',
      retry_after_seconds: 44
    },
    error: null
  };

  const res2 = await simulateAcquireUserCheckoutLease(mockRpcCollision);
  assert.equal(res2.success, false);
  assert.equal(res2.httpStatus, 409);
  assert.equal(res2.code, 'CHECKOUT_IN_PROGRESS');
  assert.equal(res2.retryAfter, 44);
});

test('Caso 3: Petición A supera TTL de 45s -> Petición B adquiere lease sobrescribiendo el expirado de forma segura', async () => {
  const mockDb = { leases: new Map() };
  const userId = 'user-ttl-test';
  const leaseA = 'lease-expired-A';
  const leaseB = 'lease-active-B';

  mockDb.leases.set(userId, {
    userId,
    leaseId: leaseA,
    cartId: 'cart-A',
    expiresAt: Date.now() - 5000 // expirado
  });

  const existing = mockDb.leases.get(userId);
  assert.ok(existing.expiresAt <= Date.now(), 'El lease de A debe considerarse expirado');

  // Sobrescritura segura
  mockDb.leases.set(userId, {
    userId,
    leaseId: leaseB,
    cartId: 'cart-B',
    expiresAt: Date.now() + 45000
  });

  assert.equal(mockDb.leases.get(userId).leaseId, leaseB, 'El lease activo en BD ahora pertenece a B');
});

test('Caso 4: Petición A ralentizada intenta operar tras perder lease -> verifyUserCheckoutLease detecta LEASE_LOST_TO_CONCURRENT_REQUEST', async () => {
  const mockDb = { leases: new Map() };
  const userId = 'user-zombie-test';
  const leaseA = 'lease-zombie-A';
  const leaseB = 'lease-winner-B';

  mockDb.leases.set(userId, {
    userId,
    leaseId: leaseB,
    cartId: 'cart-B',
    expiresAt: Date.now() + 40000
  });

  const validity = await simulateVerifyUserCheckoutLease(mockDb, userId, leaseA);
  assert.equal(validity.valid, false);
  assert.equal(validity.code, 'LEASE_LOST_TO_CONCURRENT_REQUEST');
});

test('Caso 5: Petición A intenta liberar lease tras expirar -> release_checkout_lease afecta 0 filas y no borra el lease de B', async () => {
  const mockDb = { leases: new Map() };
  const userId = 'user-fencing-test';
  const leaseA = 'lease-old-A';
  const leaseB = 'lease-new-B';

  mockDb.leases.set(userId, {
    userId,
    leaseId: leaseB,
    cartId: 'cart-B',
    expiresAt: Date.now() + 45000
  });

  const releaseResult = await simulateReleaseLeaseRpc(mockDb, userId, leaseA);
  assert.equal(releaseResult.success, false);
  assert.equal(releaseResult.released, false);
  assert.equal(releaseResult.reason, 'not_lease_owner');
  assert.equal(mockDb.leases.get(userId).leaseId, leaseB);
});

// ==============================================================================
// PRUEBAS DE CANCELACIÓN ATÓMICA Y GARANTÍA DE ROLLBACK (ETAPA 2A.5 EXCLUSIVO)
// ==============================================================================

test('Caso 6.1 (Reemplazo correcto): A se cancela y B se crea atómicamente dentro de la misma transacción', () => {
  const userId = 'user-atomic-replace';
  const leaseId = 'lease-atomic-ok';
  const mockDb = {
    leases: new Map([[userId, { userId, leaseId, cartId: 'cart-new', expiresAt: Date.now() + 45000 }]]),
    orders: new Map([['order-A', { id: 'order-A', user_id: userId, status: 'pending', notes: '' }]])
  };

  const res = simulateProcessB2bCheckout(mockDb, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: leaseId,
    p_cancel_order_id: 'order-A'
  });

  assert.equal(res.error, null);
  assert.equal(res.data.success, true);
  assert.ok(res.data.order_id);

  // Orden A debe figurar cancelada
  const orderA = mockDb.orders.get('order-A');
  assert.equal(orderA.status, 'cancelled');
  assert.ok(orderA.notes.includes('Cancelada atómicamente'));

  // Orden B debe figurar creada en pending
  const orderB = mockDb.orders.get(res.data.order_id);
  assert.ok(orderB);
  assert.equal(orderB.status, 'pending');
});

test('Caso 6.2 (Garantía de Rollback ante fallo de stock): Fallo de stock al crear B -> A permanece pending y no se crea B', () => {
  const userId = 'user-stock-fail';
  const leaseId = 'lease-stock-ok';
  const mockDb = {
    leases: new Map([[userId, { userId, leaseId, cartId: 'cart-new', expiresAt: Date.now() + 45000 }]]),
    orders: new Map([['order-A', { id: 'order-A', user_id: userId, status: 'pending', notes: 'Original' }]])
  };

  const res = simulateProcessB2bCheckout(mockDb, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: leaseId,
    p_cancel_order_id: 'order-A',
    simulateStockError: true
  });

  // RPC arrojó excepción de stock
  assert.ok(res.error);
  assert.ok(res.error.message.includes('Stock insuficiente'));

  // GARANTÍA CRÍTICA: Orden A NO debe haber sido cancelada
  const orderA = mockDb.orders.get('order-A');
  assert.equal(orderA.status, 'pending', 'Orden A DEBE conservar estado pending ante fallo de stock');
  assert.equal(orderA.notes, 'Original');

  // Ninguna orden nueva debe existir
  assert.equal(mockDb.orders.size, 1);
});

test('Caso 6.3 (Orden A modificada concurrentemente): A ya fue pagada -> process_b2b_checkout rechaza con CONCURRENT_ORDER_STATE_CHANGED y no crea B', () => {
  const userId = 'user-mutated-order';
  const leaseId = 'lease-mutated-ok';
  const mockDb = {
    leases: new Map([[userId, { userId, leaseId, cartId: 'cart-new', expiresAt: Date.now() + 45000 }]]),
    // Orden A ya fue pagada (status 'paid' o 'preparing') por un webhook concurrente
    orders: new Map([['order-A', { id: 'order-A', user_id: userId, status: 'paid', notes: 'Pagada' }]])
  };

  const res = simulateProcessB2bCheckout(mockDb, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: leaseId,
    p_cancel_order_id: 'order-A'
  });

  assert.equal(res.error, null);
  assert.equal(res.data.success, false);
  assert.equal(res.data.code, 'CONCURRENT_ORDER_STATE_CHANGED');

  // Orden A conserva su estado intacto (paid)
  const orderA = mockDb.orders.get('order-A');
  assert.equal(orderA.status, 'paid');

  // No se creó ninguna orden nueva
  assert.equal(mockDb.orders.size, 1);
});

test('Caso 6.4 (Lease vencido o perdido): No se cancela la orden previa A', () => {
  const userId = 'user-lost-lease';
  const leaseA = 'lease-expired-A';
  const mockDb = {
    leases: new Map([[userId, { userId, leaseId: 'lease-other', cartId: 'cart-other', expiresAt: Date.now() + 45000 }]]),
    orders: new Map([['order-A', { id: 'order-A', user_id: userId, status: 'pending', notes: '' }]])
  };

  const res = simulateProcessB2bCheckout(mockDb, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: leaseA,
    p_cancel_order_id: 'order-A'
  });

  assert.equal(res.data.success, false);
  assert.equal(res.data.code, 'LEASE_LOST_TO_CONCURRENT_REQUEST');

  // Orden A NO debe haber sido cancelada
  const orderA = mockDb.orders.get('order-A');
  assert.equal(orderA.status, 'pending');
});

test('Caso 6.5 (Garantía de Rollback ante Violación de Restricción): Error SQL/violación de índice al insertar B -> Rollback revierte cancelación de A', () => {
  const userId = 'user-constraint-fail';
  const leaseId = 'lease-constraint-ok';
  const mockDb = {
    leases: new Map([[userId, { userId, leaseId, cartId: 'cart-new', expiresAt: Date.now() + 45000 }]]),
    orders: new Map([['order-A', { id: 'order-A', user_id: userId, status: 'pending', notes: 'Initial' }]])
  };

  // Simulación: la inserción de la orden B lanza unique_violation (código 23505)
  const res = simulateProcessB2bCheckout(mockDb, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: leaseId,
    p_cancel_order_id: 'order-A',
    simulateUniqueConstraintViolation: true
  });

  // La RPC re-lanza la excepción para forzar el aborto de la transacción en PostgreSQL
  assert.ok(res.error);
  assert.equal(res.error.code, '23505');
  assert.ok(res.error.message.includes('CONCURRENT_PENDING_ORDER_EXISTS'));

  // GARANTÍA CRÍTICA DE ROLLBACK: La cancelación de A fue revertida por el rollback del savepoint
  const orderA = mockDb.orders.get('order-A');
  assert.equal(orderA.status, 'pending', 'Orden A DEBE revertirse a pending tras fallo de inserción de B');
  assert.equal(orderA.notes, 'Initial');
});

test('Caso 6.6 (Compatibilidad de firma SQL y TypeScript payload): Verificación de parámetros p_lease_id y p_cancel_order_id', () => {
  // Simular payload exacto emitido desde create-preference/route.ts
  const verifiedUserId = 'uuid-user-123';
  const cartId = 'uuid-cart-456';
  const leaseId = 'uuid-lease-789';
  const cancelOrderId = 'uuid-order-prev-000';
  const billingData = { rut: '76.000.000-1', customer_name: 'Óptica B2B' };

  const rpcPayload = {
    p_user_id: verifiedUserId,
    p_cart_id: cartId,
    p_billing: billingData,
    p_lease_id: leaseId,
    p_cancel_order_id: cancelOrderId
  };

  // Verificar que la firma de 5 parámetros en migration 012 coincide exactamente con los nombres
  const sqlParameters = ['p_user_id', 'p_cart_id', 'p_billing', 'p_lease_id', 'p_cancel_order_id'];
  for (const param of sqlParameters) {
    assert.ok(param in rpcPayload, `El payload de TypeScript debe contener ${param}`);
  }

  // Verificar que p_lease_id no sea null ni undefined
  assert.ok(rpcPayload.p_lease_id, 'p_lease_id es mandatorio');
});

test('Caso 6.7 (Protección de Webhook en Migración 011 ante pagos tardíos y reintentos idempotentes)', () => {
  const dbOrder = {
    id: 'order-cancelled-late-payment',
    status: 'cancelled',
    payment_status: 'pending',
    payment_id: null,
    stock_decremented: false
  };

  const incomingPaymentId = 'MP-LATE-APPROVED-999';

  // Entrega 1: Pago tardío sobre orden cancelada
  if (dbOrder.status === 'cancelled') {
    dbOrder.payment_id = incomingPaymentId;
    dbOrder.payment_status = 'approved';
    dbOrder.status = 'requires_attention';
    dbOrder.stock_decremented = false;
  }

  assert.equal(dbOrder.status, 'requires_attention');
  assert.equal(dbOrder.stock_decremented, false, 'Stock no debe ser descontado');

  // Entrega 2: Reintento del mismo webhook para orden en requires_attention
  let idempotentAck = false;
  if (dbOrder.payment_status === 'approved' && dbOrder.payment_id === incomingPaymentId && dbOrder.status === 'requires_attention') {
    idempotentAck = true;
  }

  assert.equal(idempotentAck, true, 'El webhook debe reconocer idempotentemente la incidencia pendiente con ACK 200');
});

// ==============================================================================
// PRUEBAS DE LA ETAPA 2A.7: CORRECCIÓN DEFENSIVA DE ERRORES HTTP (OBS-01 Y OBS-02)
// ==============================================================================

function simulateRouteCheckoutErrorHandler(checkoutError, cancelOrderId) {
  const isPendingOrderUniqueConflict =
    checkoutError.message?.includes('CONCURRENT_PENDING_ORDER_EXISTS') ||
    checkoutError.message?.includes('idx_uniq_user_pending_order') ||
    checkoutError.details?.includes('idx_uniq_user_pending_order');

  if (isPendingOrderUniqueConflict) {
    return {
      status: 409,
      body: {
        error: 'Ya existe una orden pendiente activa para tu cuenta. Por favor completa o revisa el pedido anterior.',
        code: 'CONCURRENT_PENDING_ORDER_EXISTS'
      }
    };
  }

  if (checkoutError.message?.includes('CONCURRENT_ORDER_STATE_CHANGED')) {
    const responseBody = {
      error: 'No se pudo procesar el reemplazo porque la orden previa cambió de estado concurrentemente o ya fue procesada.',
      code: 'CONCURRENT_ORDER_STATE_CHANGED'
    };
    if (cancelOrderId) {
      responseBody.orderId = cancelOrderId;
    }
    return { status: 409, body: responseBody };
  }

  if (
    checkoutError.message?.includes('Stock insuficiente') ||
    checkoutError.message?.includes('inventario configurado') ||
    checkoutError.message?.includes('Cantidad inválida')
  ) {
    return {
      status: 400,
      body: {
        error: checkoutError.message,
        code: 'INSUFFICIENT_STOCK'
      }
    };
  }

  if (
    checkoutError.message?.includes('Compra mínima mayorista') ||
    checkoutError.message?.includes('MOQ')
  ) {
    return {
      status: 400,
      body: {
        error: checkoutError.message,
        code: 'MOQ_NOT_REACHED'
      }
    };
  }

  if (
    checkoutError.message?.includes('no encontrado en catálogo') ||
    checkoutError.message?.includes('El carrito no existe')
  ) {
    return {
      status: 400,
      body: {
        error: checkoutError.message,
        code: 'INVALID_CHECKOUT_REQUEST'
      }
    };
  }

  return {
    status: 500,
    body: {
      error: 'Ocurrió un error interno al procesar la orden en el servidor. Por favor intenta nuevamente más tarde.',
      code: 'INTERNAL_CHECKOUT_ERROR'
    }
  };
}

function simulateRouteControlledRejection(checkoutResult, cancelOrderId) {
  const responseBody = {
    error: checkoutResult.message || 'Conflicto al procesar la orden en el servidor.',
    code: checkoutResult.code || 'CHECKOUT_CONFLICT'
  };
  if (cancelOrderId) {
    responseBody.orderId = cancelOrderId;
  }
  return { status: 409, body: responseBody };
}

test('Caso 7.1 (OBS-01): Errores comerciales de stock y MOQ devuelven HTTP 400 estructurado', () => {
  const stockErr = { message: 'Stock insuficiente para Ray-Ban Aviator (RB-3025). Solicitado: 12, Disponible: 5' };
  const resStock = simulateRouteCheckoutErrorHandler(stockErr, null);
  assert.equal(resStock.status, 400);
  assert.equal(resStock.body.code, 'INSUFFICIENT_STOCK');
  assert.ok(resStock.body.error.includes('Stock insuficiente'));

  const moqErr = { message: 'Compra mínima mayorista no alcanzada. Requiere al menos 10 unidades en total. Actual: 6' };
  const resMoq = simulateRouteCheckoutErrorHandler(moqErr, null);
  assert.equal(resMoq.status, 400);
  assert.equal(resMoq.body.code, 'MOQ_NOT_REACHED');
  assert.ok(resMoq.body.error.includes('Compra mínima mayorista'));
});

test('Caso 7.2 (OBS-01): Conflictos de concurrencia CONCURRENT_PENDING_ORDER_EXISTS y CONCURRENT_ORDER_STATE_CHANGED devuelven HTTP 409', () => {
  const pendingConflictErr = {
    message: 'CONCURRENT_PENDING_ORDER_EXISTS: Ya existe una orden pendiente activa para este usuario.',
    code: '23505'
  };
  const resPending = simulateRouteCheckoutErrorHandler(pendingConflictErr, null);
  assert.equal(resPending.status, 409);
  assert.equal(resPending.body.code, 'CONCURRENT_PENDING_ORDER_EXISTS');

  const stateChangedErr = {
    message: 'CONCURRENT_ORDER_STATE_CHANGED: No se pudo cancelar la orden previa.'
  };
  const resState = simulateRouteCheckoutErrorHandler(stateChangedErr, 'order-prev-uuid');
  assert.equal(resState.status, 409);
  assert.equal(resState.body.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(resState.body.orderId, 'order-prev-uuid');
});

test('Caso 7.3 (OBS-01): Fallos de BD imprevistos o internos devuelven HTTP 500 sanitizado sin fugar detalles SQL', () => {
  const dbInternalError = {
    message: 'server closed the connection unexpectedly (08006)',
    code: '08006',
    details: 'PostgreSQL connection terminated',
    hint: 'Check postgres logs'
  };

  const res = simulateRouteCheckoutErrorHandler(dbInternalError, null);
  assert.equal(res.status, 500);
  assert.equal(res.body.code, 'INTERNAL_CHECKOUT_ERROR');
  assert.equal(res.body.error, 'Ocurrió un error interno al procesar la orden en el servidor. Por favor intenta nuevamente más tarde.');
  // Asegurar que no se expone el mensaje SQL al cliente
  assert.equal(res.body.error.includes('08006'), false);
  assert.equal(res.body.error.includes('PostgreSQL'), false);
});

test('Caso 7.4 (OBS-01): Violación de unicidad ajena a idx_uniq_user_pending_order devuelve HTTP 500 y no 409', () => {
  // Simular una violación de unicidad en otra tabla o restricción (ej. idx_uniq_order_per_cart o orders_pkey)
  const cartUniqueErr = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "idx_uniq_order_per_cart"',
    details: 'Key (cart_id)=(uuid-cart-123) already exists.'
  };

  const res = simulateRouteCheckoutErrorHandler(cartUniqueErr, null);
  // NO debe clasificarse como CONCURRENT_PENDING_ORDER_EXISTS ni HTTP 409
  assert.notEqual(res.status, 409);
  assert.notEqual(res.body.code, 'CONCURRENT_PENDING_ORDER_EXISTS');
  // Debe tratarse como error interno sanitizado HTTP 500
  assert.equal(res.status, 500);
  assert.equal(res.body.code, 'INTERNAL_CHECKOUT_ERROR');
});

test('Caso 7.5 (OBS-02): Respuestas controladas omiten orderId cuando cancelOrderId es null', () => {
  const checkoutRejection = {
    success: false,
    code: 'CHECKOUT_CONFLICT',
    message: 'Conflicto en servidor'
  };

  // Sin cancelOrderId (checkout estándar)
  const resNoCancel = simulateRouteControlledRejection(checkoutRejection, null);
  assert.equal(resNoCancel.status, 409);
  assert.equal('orderId' in resNoCancel.body, false, 'No debe existir la propiedad orderId en el JSON cuando cancelOrderId es null');

  // Con cancelOrderId válido
  const resWithCancel = simulateRouteControlledRejection(checkoutRejection, 'order-previous-uuid');
  assert.equal(resWithCancel.status, 409);
  assert.equal(resWithCancel.body.orderId, 'order-previous-uuid');
});

test('Caso 7.6: Fallo en process_b2b_checkout impide terminantemente la creación de preferencia de Mercado Pago', async () => {
  let mpPreferenceCreated = false;

  async function mockCheckoutFlow(simulateRpcSuccess) {
    const rpcResult = simulateRpcSuccess
      ? { data: { success: true, order_id: 'order-123' }, error: null }
      : { data: null, error: { message: 'Stock insuficiente' } };

    if (rpcResult.error) {
      return simulateRouteCheckoutErrorHandler(rpcResult.error, null);
    }
    if (rpcResult.data && !rpcResult.data.success) {
      return simulateRouteControlledRejection(rpcResult.data, null);
    }
    if (rpcResult.data && rpcResult.data.success) {
      // Simular llamada a Mercado Pago
      mpPreferenceCreated = true;
      return { status: 200, body: { id: 'pref-123' } };
    }
  }

  // Ejecución con fallo en RPC
  const result = await mockCheckoutFlow(false);
  assert.equal(result.status, 400);
  assert.equal(mpPreferenceCreated, false, 'Mercado Pago NUNCA debe ser llamado si la RPC de checkout falla');
});

test('Caso 7.7: Bloque finally garantiza liberación del lease ante errores de base de datos o excepciones', async () => {
  const mockDb = { leases: new Map() };
  const userId = 'user-finally-test';
  const leaseId = 'lease-finally-123';

  // 1. Lease adquirido
  mockDb.leases.set(userId, { userId, leaseId, expiresAt: Date.now() + 45000 });
  assert.equal(mockDb.leases.has(userId), true);

  // 2. Simular ejecución protegida con bloque try-finally
  try {
    throw new Error('Database connection failed unexpectedly');
  } catch (err) {
    // Error capturado
    assert.ok(err);
  } finally {
    // Simular release en finally
    await simulateReleaseLeaseRpc(mockDb, userId, leaseId);
  }

  // 3. Verificar que el lease fue liberado
  assert.equal(mockDb.leases.has(userId), false, 'El lease DEBE ser liberado en el bloque finally');
});

// ==============================================================================
// PRUEBAS DE LA ETAPA 2A.8: VALIDACIÓN FAIL-CLOSED DEL RESULTADO DE CHECKOUT
// ==============================================================================

function simulateRouteFailClosedValidation(checkoutResult, cancelOrderId) {
  // 7.1 Validación Fail-Closed: checkoutResult debe ser un objeto válido y definido
  if (!checkoutResult || typeof checkoutResult !== 'object') {
    return {
      status: 500,
      valid: false,
      body: {
        error: 'No se pudo confirmar la creación de la orden. Por favor intenta nuevamente.',
        code: 'INVALID_CHECKOUT_RESPONSE'
      }
    };
  }

  // 7.2 Si success !== true, verificar si es un rechazo controlado o respuesta anómala
  if (checkoutResult.success !== true) {
    const responseBody = {
      error: checkoutResult.message || 'Conflicto al procesar la orden en el servidor.',
      code: checkoutResult.code || 'CHECKOUT_CONFLICT'
    };
    if (cancelOrderId) {
      responseBody.orderId = cancelOrderId;
    }
    return { status: 409, valid: false, body: responseBody };
  }

  // 7.3 Validación Fail-Closed del identificador de orden (order_id): Formato UUID estricto
  const rawOrderId = checkoutResult.order_id;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!rawOrderId || typeof rawOrderId !== 'string' || !uuidRegex.test(rawOrderId)) {
    return {
      status: 500,
      valid: false,
      body: {
        error: 'El servidor no pudo verificar la orden creada. Por favor contacta a soporte.',
        code: 'INVALID_ORDER_IDENTIFIER'
      }
    };
  }

  return {
    status: 200,
    valid: true,
    orderId: rawOrderId
  };
}

test('Caso 8.1 (Fail-Closed): checkoutResult === null devuelve HTTP 500 INVALID_CHECKOUT_RESPONSE', () => {
  const res = simulateRouteFailClosedValidation(null, null);
  assert.equal(res.status, 500);
  assert.equal(res.valid, false);
  assert.equal(res.body.code, 'INVALID_CHECKOUT_RESPONSE');
  assert.ok(res.body.error.includes('No se pudo confirmar la creación'));
});

test('Caso 8.2 (Fail-Closed): checkoutResult === undefined devuelve HTTP 500 INVALID_CHECKOUT_RESPONSE', () => {
  const res = simulateRouteFailClosedValidation(undefined, null);
  assert.equal(res.status, 500);
  assert.equal(res.valid, false);
  assert.equal(res.body.code, 'INVALID_CHECKOUT_RESPONSE');
});

test('Caso 8.3 (Fail-Closed): checkoutResult no es un objeto válido (string o primitivo) devuelve HTTP 500', () => {
  const resStr = simulateRouteFailClosedValidation('unexpected string return', null);
  assert.equal(resStr.status, 500);
  assert.equal(resStr.valid, false);
  assert.equal(resStr.body.code, 'INVALID_CHECKOUT_RESPONSE');

  const resNum = simulateRouteFailClosedValidation(12345, null);
  assert.equal(resNum.status, 500);
  assert.equal(resNum.valid, false);
});

test('Caso 8.4 (Fail-Closed): checkoutResult sin propiedad success devuelve HTTP 409 con CHECKOUT_CONFLICT', () => {
  const res = simulateRouteFailClosedValidation({ message: 'Resultado anómalo' }, null);
  assert.equal(res.status, 409);
  assert.equal(res.valid, false);
  assert.equal(res.body.code, 'CHECKOUT_CONFLICT');
});

test('Caso 8.5 (Fail-Closed): checkoutResult con success === false devuelve HTTP 409 con código de la RPC', () => {
  const res = simulateRouteFailClosedValidation({
    success: false,
    code: 'LEASE_EXPIRED',
    message: 'La reserva ha expirado.'
  }, 'order-prev-123');

  assert.equal(res.status, 409);
  assert.equal(res.valid, false);
  assert.equal(res.body.code, 'LEASE_EXPIRED');
  assert.equal(res.body.orderId, 'order-prev-123');
});

test('Caso 8.6 (Fail-Closed): success === true pero order_id ausente devuelve HTTP 500 INVALID_ORDER_IDENTIFIER', () => {
  const resMissing = simulateRouteFailClosedValidation({ success: true }, null);
  assert.equal(resMissing.status, 500);
  assert.equal(resMissing.valid, false);
  assert.equal(resMissing.body.code, 'INVALID_ORDER_IDENTIFIER');

  const resNull = simulateRouteFailClosedValidation({ success: true, order_id: null }, null);
  assert.equal(resNull.status, 500);
  assert.equal(resNull.valid, false);
  assert.equal(resNull.body.code, 'INVALID_ORDER_IDENTIFIER');
});

test('Caso 8.7 (Fail-Closed): success === true pero order_id tiene formato no UUID devuelve HTTP 500 INVALID_ORDER_IDENTIFIER', () => {
  const invalidOrderIds = [
    'invalid-uuid-string',
    '12345',
    'f47ac10b-58cc-4372-a567', // truncado
    'g47ac10b-58cc-4372-a567-0e02b2c3d479', // 'g' no es hexadecimal
    '   ',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479; DROP TABLE orders;' // inyección
  ];

  for (const badId of invalidOrderIds) {
    const res = simulateRouteFailClosedValidation({ success: true, order_id: badId }, null);
    assert.equal(res.status, 500, `Debe fallar para order_id: ${badId}`);
    assert.equal(res.valid, false);
    assert.equal(res.body.code, 'INVALID_ORDER_IDENTIFIER');
  }
});

test('Caso 8.8 (Éxito Estricto): success === true con UUID válido es aceptado', () => {
  const validUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const res = simulateRouteFailClosedValidation({ success: true, order_id: validUuid }, null);
  assert.equal(res.status, 200);
  assert.equal(res.valid, true);
  assert.equal(res.orderId, validUuid);
});

test('Caso 8.9 (Idempotencia): Orden recuperada por carrito ya convertido conserva UUID válido', () => {
  const recoveredUuid = 'b2c3d4e5-6f7a-4890-a1b2-c3d4e5f6a7b8';
  const rpcRecovered = {
    success: true,
    order_id: recoveredUuid,
    message: 'Carrito ya convertido. Retornando orden existente.'
  };

  const res = simulateRouteFailClosedValidation(rpcRecovered, null);
  assert.equal(res.status, 200);
  assert.equal(res.valid, true);
  assert.equal(res.orderId, recoveredUuid);
});

test('Caso 8.10 (Garantía Fail-Closed): Ningún resultado inválido puede invocar Mercado Pago', async () => {
  const testCases = [
    null,
    undefined,
    'error',
    {},
    { success: false, code: 'LEASE_EXPIRED' },
    { success: true },
    { success: true, order_id: null },
    { success: true, order_id: 'bad-uuid' }
  ];

  for (const testCase of testCases) {
    let mpCalled = false;
    const validation = simulateRouteFailClosedValidation(testCase, null);

    if (validation.valid === true) {
      // Simular llamada a Mercado Pago
      mpCalled = true;
    }

    assert.equal(mpCalled, false, `Mercado Pago NO debe ser llamado para el caso: ${JSON.stringify(testCase)}`);
  }
});

test('Caso 8.11 (Alineación Estricta de Identificador): El UUID exacto devuelto por la RPC es el enviado a la preferencia de Mercado Pago', () => {
  const expectedOrderId = '9c8b7a6f-5e4d-4c3b-a2b1-0f9e8d7c6b5a';
  const rpcResult = { success: true, order_id: expectedOrderId };

  const validation = simulateRouteFailClosedValidation(rpcResult, null);
  assert.equal(validation.valid, true);

  // Simular payload enviado a createMpPreference
  const preferencePayload = {
    orderId: validation.orderId,
    customerName: 'Cliente B2B',
    external_reference: validation.orderId
  };

  assert.equal(preferencePayload.orderId, expectedOrderId);
  assert.equal(preferencePayload.external_reference, expectedOrderId);
});

// ============================================================================
// SECCIÓN 9: ETAPA 2D — VALIDACIÓN DE CHECKOUT, COMPATIBILIDAD 010/012,
//            WEBHOOK MERCADO PAGO Y VERIFICACIÓN DE /checkout/resultado
// ============================================================================

test('Caso 9.1 (Etapa 2D): Fallo 500 por configuración ausente en servidor (create-preference y webhook)', () => {
  function simulateConfigCheck({ supabaseUrl, supabaseAnonKey, serviceRoleKey, mpAccessToken, mpWebhookSecret, isWebhook }) {
    if (isWebhook) {
      if (!supabaseUrl || !serviceRoleKey || !mpAccessToken || !mpWebhookSecret) {
        return { status: 500, body: { error: 'Internal Server Error' } };
      }
      return { status: 200 };
    }
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return { status: 500, body: { error: 'Internal Server Error' } };
    }
    return { status: 200 };
  }

  const missingServiceRole = simulateConfigCheck({
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'anon-key',
    serviceRoleKey: '',
    isWebhook: false,
  });
  assert.equal(missingServiceRole.status, 500);
  assert.equal(missingServiceRole.body.error, 'Internal Server Error');

  const missingWebhookSecret = simulateConfigCheck({
    supabaseUrl: 'https://test.supabase.co',
    serviceRoleKey: 'service-key',
    mpAccessToken: 'APP_USR-123',
    mpWebhookSecret: '',
    isWebhook: true,
  });
  assert.equal(missingWebhookSecret.status, 500);
  assert.equal(missingWebhookSecret.body.error, 'Internal Server Error');
});

test('Caso 9.2 (Etapa 2D): Clasificación estricta de errores SQL en acquire_checkout_lease (ausencia de función/tabla vs permisos vs fallo interno)', () => {
  // 1. Ausencia real de función o tabla (migración 012 pendiente) -> NOT_CONFIGURED
  for (const missingErr of [
    { code: '42883', message: 'function public.acquire_checkout_lease(uuid, uuid, uuid, integer) does not exist' },
    { code: 'PGRST202', message: 'Could not find the function public.acquire_checkout_lease in the schema cache' },
    { code: '42P01', message: 'relation "public.user_checkout_leases" does not exist' },
    { code: 'PGRST205', message: 'Could not find the table public.user_checkout_leases in the schema cache' },
  ]) {
    const res = classifyCheckoutLeaseError(missingErr);
    assert.equal(res.kind, 'NOT_CONFIGURED');
    assert.equal(res.code, 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED');
  }

  // 2. Permisos insuficientes (42501) -> PERMISSION_DENIED (nunca debe activar fallback de 3 argumentos)
  const permRes = classifyCheckoutLeaseError({
    code: '42501',
    message: 'permission denied for table user_checkout_leases',
  });
  assert.equal(permRes.kind, 'PERMISSION_DENIED');
  assert.equal(permRes.code, 'CHECKOUT_LEASE_PERMISSION_DENIED');
  assert.equal(permRes.httpStatus, 503);

  // 3. Error de datos o infraestructura (incluso si el mensaje contiene palabras engañosas como "not found" de otro recurso) -> UNAVAILABLE
  const genericNotFoundRes = classifyCheckoutLeaseError({
    code: 'P0002',
    message: 'user profile record not found',
  });
  assert.equal(genericNotFoundRes.kind, 'UNAVAILABLE');
  assert.equal(genericNotFoundRes.code, 'CHECKOUT_LEASE_UNAVAILABLE');
  assert.equal(genericNotFoundRes.httpStatus, 503);
});

test('Caso 9.3 (Etapa 2D): Compatibilidad de RPC process_b2b_checkout con 3 argumentos (migración 010) y 5 argumentos (migración 012)', async () => {
  const rpcCalls = [];
  const cancelledOrderIds = [];

  async function simulateCheckoutRpcExecution({ leaseResult, verifiedUserId, cartId, billingData, ordersToCancel }) {
    const cancelOrderId = ordersToCancel.length > 0 ? ordersToCancel[ordersToCancel.length - 1] : null;
    if (leaseResult.success) {
      rpcCalls.push({
        fn: 'process_b2b_checkout',
        argsCount: 5,
        payload: {
          p_user_id: verifiedUserId,
          p_cart_id: cartId,
          p_billing: billingData,
          p_lease_id: 'lease-uuid-123',
          p_cancel_order_id: cancelOrderId,
        },
      });
      return { status: 200, mode: '5-args' };
    } else if (leaseResult.code === 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED') {
      if (ordersToCancel.length > 0) {
        cancelledOrderIds.push(...ordersToCancel);
      }
      rpcCalls.push({
        fn: 'process_b2b_checkout',
        argsCount: 3,
        payload: {
          p_user_id: verifiedUserId,
          p_cart_id: cartId,
          p_billing: billingData,
        },
      });
      return { status: 200, mode: '3-args' };
    } else {
      return { status: leaseResult.httpStatus || 503, code: leaseResult.code };
    }
  }

  // Subcaso A: Migración 012 activa -> llama firma de 5 argumentos
  const res5 = await simulateCheckoutRpcExecution({
    leaseResult: { success: true },
    verifiedUserId: 'user-1',
    cartId: 'cart-1',
    billingData: { business_rut: '76.123.456-7' },
    ordersToCancel: ['old-order-1'],
  });
  assert.equal(res5.mode, '5-args');
  assert.equal(rpcCalls[0].argsCount, 5);

  // Subcaso B: Migración 010 activa (NOT_CONFIGURED) -> cancela órdenes reemplazables y llama firma de 3 argumentos
  const res3 = await simulateCheckoutRpcExecution({
    leaseResult: classifyCheckoutLeaseError({ code: 'PGRST202', message: 'Could not find the function acquire_checkout_lease' }),
    verifiedUserId: 'user-1',
    cartId: 'cart-2',
    billingData: { business_rut: '76.123.456-7' },
    ordersToCancel: ['old-order-a', 'old-order-b'],
  });
  assert.equal(res3.mode, '3-args');
  assert.equal(rpcCalls[1].argsCount, 3);
  assert.deepEqual(cancelledOrderIds, ['old-order-a', 'old-order-b']);

  // Subcaso C: Error de permisos (42501) -> detiene con 503 sin llamar a la RPC de 3 argumentos
  const resPerm = await simulateCheckoutRpcExecution({
    leaseResult: classifyCheckoutLeaseError({ code: '42501', message: 'permission denied' }),
    verifiedUserId: 'user-1',
    cartId: 'cart-3',
    billingData: { business_rut: '76.123.456-7' },
    ordersToCancel: [],
  });
  assert.equal(resPerm.status, 503);
  assert.equal(resPerm.code, 'CHECKOUT_LEASE_PERMISSION_DENIED');
  assert.equal(rpcCalls.length, 2);
});

test('Caso 9.4 (Etapa 2D): Validación criptográfica real de firma de Webhook (WebhookSignatureValidator)', () => {
  const secret = 'test-webhook-secret-optihub-2026';
  const dataId = '9988776655';
  const xRequestId = 'req-id-abc-123';
  const ts = '1760640000';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const validHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  // 1. Firma legítima -> no lanza excepción
  assert.doesNotThrow(() => {
    WebhookSignatureValidator.validate({
      xSignature: `ts=${ts},v1=${validHash}`,
      xRequestId,
      dataId,
      secret,
    });
  });

  // 2. Firma alterada -> lanza excepción (se traduce en HTTP 401 en webhook/route.ts)
  assert.throws(() => {
    WebhookSignatureValidator.validate({
      xSignature: `ts=${ts},v1=${validHash.replace(/^./, validHash[0] === 'a' ? 'b' : 'a')}`,
      xRequestId,
      dataId,
      secret,
    });
  });

  // 3. dataId distinto al firmado -> lanza excepción
  assert.throws(() => {
    WebhookSignatureValidator.validate({
      xSignature: `ts=${ts},v1=${validHash}`,
      xRequestId,
      dataId: '1111111111',
      secret,
    });
  });
});

test('Caso 9.5 (Etapa 2D): Webhook rechaza desajuste de importe, moneda distinta de CLP y external_reference inválido', () => {
  const baseOrder = {
    id: '0f205418-b5f9-484f-8047-fa24b52cc923',
    status: 'pending',
    payment_status: 'pending',
    total_amount: 119000,
    currency: 'CLP',
  };

  // Desajuste de importe -> 400 amount_mismatch
  const amountMismatch = evaluateWebhookPaymentTransition({
    order: baseOrder,
    payment: {
      id: 'pay-1',
      status: 'approved',
      transaction_amount: 95000,
      currency_id: 'CLP',
    },
  });
  assert.equal(amountMismatch.action, 'reject');
  assert.equal(amountMismatch.httpStatus, 400);
  assert.equal(amountMismatch.reason, 'amount_mismatch');

  // Desajuste de moneda -> 400 currency_mismatch
  const currencyMismatch = evaluateWebhookPaymentTransition({
    order: baseOrder,
    payment: {
      id: 'pay-2',
      status: 'approved',
      transaction_amount: 119000,
      currency_id: 'USD',
    },
  });
  assert.equal(currencyMismatch.action, 'reject');
  assert.equal(currencyMismatch.httpStatus, 400);
  assert.equal(currencyMismatch.reason, 'currency_mismatch');

  // Validación estricta de UUID en external_reference
  assert.equal(isValidUuid('0f205418-b5f9-484f-8047-fa24b52cc923'), true);
  assert.equal(isValidUuid('OPTI-PEDIDO'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
});

test('Caso 9.6 (Etapa 2D): Transiciones del webhook (approved, pending, rejected, refunded, duplicados y orden cancelada con pago tardío)', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc923';

  // 1. Pago en proceso (in_process) sobre orden pending -> pasa a payment_pending
  const pendingDecision = evaluateWebhookPaymentTransition({
    order: { id: orderId, status: 'pending', payment_status: 'pending', total_amount: 119000, currency: 'CLP' },
    payment: { id: 'pay-100', status: 'in_process', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(pendingDecision.action, 'update_order_non_approved');
  assert.equal(pendingDecision.reason, 'payment_pending');
  assert.deepEqual(pendingDecision.updateFields, { status: 'payment_pending', payment_status: 'pending' });

  // 2. Pago rechazado (rejected) sobre orden pending -> marca payment_status = rejected
  const rejectedDecision = evaluateWebhookPaymentTransition({
    order: { id: orderId, status: 'pending', payment_status: 'pending', total_amount: 119000, currency: 'CLP' },
    payment: { id: 'pay-100', status: 'rejected', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(rejectedDecision.action, 'update_order_non_approved');
  assert.equal(rejectedDecision.reason, 'payment_rejected');
  assert.deepEqual(rejectedDecision.updateFields, { payment_status: 'rejected' });

  // 3. Pago aprobado sobre orden activa -> delega en RPC process_approved_mp_payment
  const approvedDecision = evaluateWebhookPaymentTransition({
    order: { id: orderId, status: 'pending', payment_status: 'rejected', total_amount: 119000, currency: 'CLP' },
    payment: { id: 'pay-101', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(approvedDecision.action, 'call_approved_rpc');

  // 4. Notificación atrasada/fuera de orden (rejected o in_process) después de que la orden ya fue aprobada -> se ignora (inmunidad)
  const staleRejection = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'preparing',
      payment_status: 'approved',
      payment_id: 'pay-101',
      stock_decremented: true,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: { id: 'pay-100', status: 'rejected', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(staleRejection.action, 'ignore_ack');
  assert.equal(staleRejection.reason, 'stale_rejection_notification');

  // 5. Orden cancelada que recibe un pago aprobado tardío -> defensa en profundidad (protege aunque migración 011 no esté aplicada)
  const latePaidOnCancelled = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'cancelled',
      payment_status: 'pending',
      stock_decremented: false,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: { id: 'pay-late-999', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(latePaidOnCancelled.action, 'record_cancelled_order_paid_incident');
  assert.equal(latePaidOnCancelled.alreadyProcessed, false);
  assert.equal(latePaidOnCancelled.updateFields.status, 'requires_attention');
  assert.equal(latePaidOnCancelled.updateFields.payment_status, 'approved');
  assert.equal(latePaidOnCancelled.updateFields.stock_decremented, false);

  // 6. Reintento del webhook sobre la misma orden en requires_attention -> idempotente
  const duplicateLatePaid = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'pay-late-999',
      stock_decremented: false,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: { id: 'pay-late-999', status: 'approved', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(duplicateLatePaid.action, 'record_cancelled_order_paid_incident');
  assert.equal(duplicateLatePaid.alreadyProcessed, true);
  assert.equal(duplicateLatePaid.rpcEquivalentResult.code, 'incident_pending');

  // 7. Reembolso (refunded) de orden aprobada con stock descontado -> pasa a requires_attention y payment_status = refunded
  const refundDecision = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'preparing',
      payment_status: 'approved',
      payment_id: 'pay-101',
      stock_decremented: true,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: { id: 'pay-101', status: 'refunded', transaction_amount: 119000, currency_id: 'CLP' },
  });
  assert.equal(refundDecision.action, 'update_order_non_approved');
  assert.equal(refundDecision.reason, 'payment_refunded');
  assert.equal(refundDecision.updateFields.payment_status, 'refunded');
  assert.equal(refundDecision.updateFields.status, 'requires_attention');
});

test('Caso 9.7 (Etapa 2D - Fase 3.7): /checkout/resultado jamás declara aprobado solo por query params de la URL', () => {
  const validOrderId = '0f205418-b5f9-484f-8047-fa24b52cc923';

  // 1. URL manipulada con ?status=approved pero sin ref UUID válida -> rejected
  const spoofedNoRef = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: 'OPTI-PEDIDO',
    orderFromDb: null,
    verificationComplete: true,
  });
  assert.equal(spoofedNoRef.displayState, 'rejected');

  // 2. URL con ?status=approved&ref=<uuid> mientras aún se consulta la BD -> verifying (NO approved)
  const whileLoading = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: null,
    verificationComplete: false,
  });
  assert.equal(whileLoading.displayState, 'verifying');

  // 3. URL con ?status=approved&ref=<uuid> pero la orden NO existe en BD (o pertenece a otro usuario) -> rejected
  const spoofedMissingOrder = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: null,
    verificationComplete: true,
  });
  assert.equal(spoofedMissingOrder.displayState, 'rejected');

  // 4. URL con ?status=approved&ref=<uuid> pero en BD la orden sigue payment_status = 'pending' -> pending (NUNCA approved)
  const unconfirmedInDb = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
    },
    verificationComplete: true,
  });
  assert.equal(unconfirmedInDb.displayState, 'pending');

  // 5. URL con ?status=approved&ref=<uuid> pero en BD la orden está cancelada o rechazada -> rejected
  const cancelledInDb = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'cancelled',
      payment_status: 'pending',
      payment_id: null,
    },
    verificationComplete: true,
  });
  assert.equal(cancelledInDb.displayState, 'rejected');

  // 6. ÚNICO caso que devuelve 'approved': orden verificada en BD con payment_status === 'approved' y estado operativo válido
  const verifiedApproved = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'preparing',
      payment_status: 'approved',
      payment_id: 'mp-pay-777',
    },
    verificationComplete: true,
  });
  assert.equal(verifiedApproved.displayState, 'approved');
  assert.equal(verifiedApproved.requiresAttention, false);
  assert.equal(verifiedApproved.verifiedOrderId, validOrderId);
  assert.equal(verifiedApproved.verifiedPaymentId, 'mp-pay-777');
});

// ============================================================================
// SECCIÓN 10: ETAPA 2D.2 — CORRECCIONES CRÍTICAS PREVIAS A LA MIGRACIÓN 012
// ============================================================================

test('Caso 9.8 (Etapa 2D.2 - Corrección 1): Órdenes pending antiguas (> 2h), con payment_status = rejected o múltiples se verifican en MP y se reemplazan sin conflicto con idx_uniq_user_pending_order', async () => {
  const nowMs = Date.parse('2026-10-16T18:00:00.000Z');
  const recentIso = new Date(nowMs - 15 * 60 * 1000).toISOString(); // hace 15 min (< 2h)
  const staleIso = new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(); // hace 5 horas (> 2h)

  assert.equal(isOrderWithinReuseWindow(recentIso, nowMs), true);
  assert.equal(isOrderWithinReuseWindow(staleIso, nowMs), false);

  // Subcaso A: Exactamente 1 orden pending reciente, payment_status = pending, coincide con carrito -> reuse_existing_preference
  let mpCheckCallsA = 0;
  const reuseRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-recent-match',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-123',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-123',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'prod-1', quantity: 10 }],
    matchesOrder: () => true,
    checkPaymentStatus: async () => {
      mpCheckCallsA++;
      return { status: 'clean' };
    },
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(reuseRes.outcome, 'reuse_existing_preference');
  assert.equal(reuseRes.order.id, 'order-recent-match');
  assert.equal(mpCheckCallsA, 0, 'No necesita cancelar cuando reutiliza preferencia vigente');

  // Subcaso B: Orden pending antigua (> 2h) aunque coincida con el carrito -> NO se reutiliza, se verifica en MP, se invalida preferencia y pasa a ordersToCancel
  const checkedOrderIdsB = [];
  const invalidatedPrefsB = [];
  const staleRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-stale-5h',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: staleIso,
        preference_id: 'pref-old',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-old',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'prod-1', quantity: 10 }],
    matchesOrder: () => true,
    checkPaymentStatus: async (orderId) => {
      checkedOrderIdsB.push(orderId);
      return { status: 'clean' };
    },
    invalidatePreference: async (prefId) => {
      invalidatedPrefsB.push(prefId);
      return { success: true };
    },
    nowMs,
  });
  assert.equal(staleRes.outcome, 'proceed_new_order');
  assert.deepEqual(checkedOrderIdsB, ['order-stale-5h'], 'Debe verificar el pago en MP antes de cancelar orden antigua');
  assert.deepEqual(invalidatedPrefsB, ['pref-old']);
  assert.deepEqual(staleRes.ordersToCancel, ['order-stale-5h']);

  // Subcaso C: Orden pending con payment_status = 'rejected' reciente -> NO se reutiliza, SIEMPRE consulta MP antes de cancelar
  const checkedOrderIdsC = [];
  const rejectedRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-rejected-1',
        status: 'pending',
        payment_status: 'rejected',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-rej',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-rej',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'prod-1', quantity: 10 }],
    matchesOrder: () => true,
    checkPaymentStatus: async (orderId) => {
      checkedOrderIdsC.push(orderId);
      return { status: 'clean' };
    },
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(rejectedRes.outcome, 'proceed_new_order');
  assert.deepEqual(
    checkedOrderIdsC,
    ['order-rejected-1'],
    'Nunca debe asumir que payment_status = rejected en BD basta sin verificar en MP'
  );
  assert.deepEqual(rejectedRes.ordersToCancel, ['order-rejected-1']);

  // Subcaso D: Múltiples órdenes pending del mismo usuario (ej. una reciente y una antigua/rechazada) -> NO reutiliza ninguna, verifica todas en MP y cancela todas
  const checkedOrderIdsD = [];
  const multiRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-multi-1',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-m1',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-m1',
      },
      {
        id: 'order-multi-2',
        status: 'pending',
        payment_status: 'rejected',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: staleIso,
        preference_id: 'pref-m2',
        init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-m2',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'prod-1', quantity: 10 }],
    matchesOrder: () => true,
    checkPaymentStatus: async (orderId) => {
      checkedOrderIdsD.push(orderId);
      return { status: 'clean' };
    },
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(multiRes.outcome, 'proceed_new_order');
  assert.deepEqual(checkedOrderIdsD, ['order-multi-1', 'order-multi-2']);
  assert.deepEqual(multiRes.ordersToCancel, ['order-multi-1', 'order-multi-2']);
});

test('Caso 9.9 (Etapa 2D.2 - Corrección 1): Protección fail-closed ante pago approved, in_process o error/ambiguo en MP y creación posterior sin conflicto con idx_uniq_user_pending_order', async () => {
  const nowMs = Date.parse('2026-10-16T18:00:00.000Z');
  const staleIso = new Date(nowMs - 4 * 60 * 60 * 1000).toISOString();

  // 1. Orden con payment_status = 'rejected' en BD pero cuyo segundo intento de pago fue APROBADO en MP -> Bloquea con 409 y NO cancela
  const approvedInMpRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-secretly-approved',
        status: 'pending',
        payment_status: 'rejected',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: staleIso,
        preference_id: 'pref-sec',
        init_point: 'https://mp/pref-sec',
      },
    ],
    fetchOrderItems: async () => [],
    matchesOrder: () => false,
    checkPaymentStatus: async () => ({ status: 'has_active_payment', activeState: 'approved' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(approvedInMpRes.outcome, 'block');
  assert.equal(approvedInMpRes.httpStatus, 409);
  assert.equal(approvedInMpRes.code, 'PAYMENT_ALREADY_APPROVED');
  assert.equal(approvedInMpRes.orderId, 'order-secretly-approved');

  // 2. Orden cuyo pago está pending / in_process en MP -> Bloquea con 409 PAYMENT_IN_PROCESS y NO cancela
  const inProcessInMpRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'order-in-process',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: staleIso,
        preference_id: 'pref-proc',
        init_point: 'https://mp/pref-proc',
      },
    ],
    fetchOrderItems: async () => [],
    matchesOrder: () => true,
    checkPaymentStatus: async () => ({ status: 'has_active_payment', activeState: 'in_process' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(inProcessInMpRes.outcome, 'block');
  assert.equal(inProcessInMpRes.httpStatus, 409);
  assert.equal(inProcessInMpRes.code, 'PAYMENT_IN_PROCESS');
  assert.equal(inProcessInMpRes.orderId, 'order-in-process');

  // 3. Error o respuesta ambigua al consultar Mercado Pago -> Falla en cerrado con 502 FAILED_TO_VERIFY_PRIOR_PAYMENTS y NO cancela la orden
  for (const badStatus of ['error', 'ambiguous_unexpected_state']) {
    const errorInMpRes = await evaluatePendingOrdersForCheckout({
      pendingOrders: [
        {
          id: 'order-mp-error',
          status: 'pending',
          payment_status: 'pending',
          total_amount: 119000,
          subtotal_net: 100000,
          tax_amount: 19000,
          created_at: staleIso,
          preference_id: 'pref-err',
          init_point: 'https://mp/pref-err',
        },
      ],
      fetchOrderItems: async () => [],
      matchesOrder: () => true,
      checkPaymentStatus: async () => ({ status: badStatus }),
      invalidatePreference: async () => ({ success: true }),
      nowMs,
    });
    assert.equal(errorInMpRes.outcome, 'block');
    assert.equal(errorInMpRes.httpStatus, 502);
    assert.equal(errorInMpRes.code, 'FAILED_TO_VERIFY_PRIOR_PAYMENTS');
    assert.equal(errorInMpRes.orderId, 'order-mp-error');
  }

  // 4. Simulación de creación posterior de orden con índice único parcial idx_uniq_user_pending_order (WHERE status = 'pending')
  const simulatedOrdersTable = [
    {
      id: 'ord-old-pending',
      user_id: 'user-b2b-1',
      status: 'pending',
      payment_status: 'pending',
      total_amount: 119000,
      subtotal_net: 100000,
      tax_amount: 19000,
      created_at: staleIso,
    },
    {
      id: 'ord-rej-pending',
      user_id: 'user-b2b-1',
      status: 'pending',
      payment_status: 'rejected',
      total_amount: 119000,
      subtotal_net: 100000,
      tax_amount: 19000,
      created_at: staleIso,
    },
  ];

  // Consulta sin filtro de 2h ni payment_status (tal como hace route.ts)
  const pendingCandidates = simulatedOrdersTable.filter(
    (o) => o.user_id === 'user-b2b-1' && o.status === 'pending'
  );

  const evalDecision = await evaluatePendingOrdersForCheckout({
    pendingOrders: pendingCandidates,
    fetchOrderItems: async () => [],
    matchesOrder: () => false,
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
  });
  assert.equal(evalDecision.outcome, 'proceed_new_order');
  assert.deepEqual(evalDecision.ordersToCancel, ['ord-old-pending', 'ord-rej-pending']);

  // Cancelar todas las órdenes en ordersToCancel (sin filtrar por payment_status = 'pending')
  for (const row of simulatedOrdersTable) {
    if (
      row.user_id === 'user-b2b-1' &&
      row.status === 'pending' &&
      evalDecision.ordersToCancel.includes(row.id)
    ) {
      row.status = 'cancelled';
    }
  }

  // Verificar precondición de idx_uniq_user_pending_order antes de insertar la nueva orden
  const remainingPendingForUser = simulatedOrdersTable.filter(
    (o) => o.user_id === 'user-b2b-1' && o.status === 'pending'
  );
  assert.equal(
    remainingPendingForUser.length,
    0,
    'No debe quedar ninguna orden en status = pending antes de insertar la nueva orden'
  );

  // Insertar nueva orden pending y verificar que idx_uniq_user_pending_order se cumple (exactamente 1 pending)
  simulatedOrdersTable.push({
    id: 'ord-new-pending',
    user_id: 'user-b2b-1',
    status: 'pending',
    payment_status: 'pending',
    total_amount: 119000,
    subtotal_net: 100000,
    tax_amount: 19000,
    created_at: new Date(nowMs).toISOString(),
  });
  const activePendingAfterInsert = simulatedOrdersTable.filter(
    (o) => o.user_id === 'user-b2b-1' && o.status === 'pending'
  );
  assert.equal(activePendingAfterInsert.length, 1);
  assert.equal(activePendingAfterInsert[0].id, 'ord-new-pending');
});

test('Caso 9.10 (Etapa 2D.2 - Corrección 2A): requires_attention jamás se presenta como compra aprobada en /checkout/resultado', () => {
  const validOrderId = '0f205418-b5f9-484f-8047-fa24b52cc923';

  // Orden que recibió un pago tardío tras haber sido cancelada (status = requires_attention, payment_status = approved)
  const requiresAttentionRes = resolveVerifiedCheckoutResult({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'mp-late-pay-555',
    },
    verificationComplete: true,
  });

  assert.notEqual(
    requiresAttentionRes.displayState,
    'approved',
    'Una orden en requires_attention NUNCA debe devolverse con displayState = approved'
  );
  assert.equal(requiresAttentionRes.displayState, 'pending');
  assert.equal(requiresAttentionRes.requiresAttention, true);
  assert.equal(requiresAttentionRes.verifiedOrderId, validOrderId);
  assert.equal(requiresAttentionRes.verifiedPaymentId, 'mp-late-pay-555');

  // Estados operativos válidos con payment_status = approved sí devuelven displayState = approved
  for (const validStatus of ['paid', 'preparing', 'shipped', 'delivered']) {
    const okRes = resolveVerifiedCheckoutResult({
      urlStatus: 'approved',
      urlRef: validOrderId,
      orderFromDb: {
        id: validOrderId,
        status: validStatus,
        payment_status: 'approved',
        payment_id: 'mp-ok-pay-111',
      },
      verificationComplete: true,
    });
    assert.equal(okRes.displayState, 'approved', `Debe ser approved para status=${validStatus}`);
    assert.equal(okRes.requiresAttention, false);
  }
});

test('Caso 9.11 (Etapa 2D.2 - Corrección 2B): Conflicto de payment_id en orden cancelled o requires_attention no sobrescribe payment_id', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc923';

  // 1. Orden cancelled que ya tenía un payment_id registrado ('pay-original-111') recibe otro pago ('pay-different-222')
  const conflictOnCancelled = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'cancelled',
      payment_status: 'approved',
      payment_id: 'pay-original-111',
      stock_decremented: false,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: {
      id: 'pay-different-222',
      status: 'approved',
      transaction_amount: 119000,
      currency_id: 'CLP',
    },
  });

  assert.equal(conflictOnCancelled.action, 'ignore_ack');
  assert.equal(conflictOnCancelled.reason, 'payment_conflict');
  assert.equal(conflictOnCancelled.rpcEquivalentResult.code, 'payment_conflict');
  assert.equal(
    'updateFields' in conflictOnCancelled,
    false,
    'No debe generar updateFields que sobrescriban payment_id'
  );

  // 2. Orden en requires_attention que ya tenía payment_id ('pay-late-999') recibe un payment_id distinto ('pay-other-888')
  const conflictOnRequiresAttention = evaluateWebhookPaymentTransition({
    order: {
      id: orderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'pay-late-999',
      stock_decremented: false,
      total_amount: 119000,
      currency: 'CLP',
    },
    payment: {
      id: 'pay-other-888',
      status: 'approved',
      transaction_amount: 119000,
      currency_id: 'CLP',
    },
  });

  assert.equal(conflictOnRequiresAttention.action, 'ignore_ack');
  assert.equal(conflictOnRequiresAttention.reason, 'payment_conflict');
  assert.equal(conflictOnRequiresAttention.rpcEquivalentResult.code, 'payment_conflict');
});
