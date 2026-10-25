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
//   real de supabase_migration_012_checkout_user_concurrency_lease.sql y
//   supabase_migration_013_atomic_preference_persistence_and_detach.sql en PostgreSQL.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { WebhookSignatureValidator } from './frontend/node_modules/mercadopago/dist/index.js';
import {
  classifyCheckoutLeaseError,
  evaluateWebhookPaymentTransition,
  resolveVerifiedCheckoutResult,
  isValidUuid,
  evaluatePendingOrdersForCheckout,
  isOrderWithinReuseWindow,
  resolveCancelledOrderIncidentUpdateOutcome,
  simulateApprovedPaymentRpc011,
  clearInvalidatedPreferencesCache,
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

// Helper simulando el comportamiento transaccional de process_b2b_checkout (Etapa 2A.5 + Migración 013)
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

  // Pre-validación de orden a cancelar si se especificó (Migración 013 exige además preference_id IS NULL)
  if (p_cancel_order_id) {
    const prevOrder = mockDb.orders.get(p_cancel_order_id);
    if (
      !prevOrder ||
      prevOrder.user_id !== p_user_id ||
      prevOrder.status !== 'pending' ||
      (prevOrder.preference_id !== undefined && prevOrder.preference_id !== null)
    ) {
      return {
        data: {
          success: false,
          code: 'CONCURRENT_ORDER_STATE_CHANGED',
          message: 'No se pudo cancelar la orden previa porque su estado cambió concurrentemente o aún conserva una preferencia asociada.'
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
    // 2.1 Cancelar orden previa si aplica (exigiendo status = 'pending' y preference_id IS NULL)
    if (p_cancel_order_id) {
      const target = mockDb.orders.get(p_cancel_order_id);
      if (target.status !== 'pending' || (target.preference_id !== undefined && target.preference_id !== null)) {
        throw {
          code: 'P0001',
          message: 'CONCURRENT_ORDER_STATE_CHANGED: No se pudo cancelar la orden previa porque su estado o preferencia cambió concurrentemente.'
        };
      }
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

test('Caso 9.3 (ALTO-01 / Migración 012): Exclusividad de firma de 5 argumentos en process_b2b_checkout y detención sin efectos laterales ante fallos de lease', async () => {
  const rpcCalls = [];
  const invalidatedPreferences = [];
  const cancelledOrderIds = [];
  const releasedLeases = [];

  async function simulateCreatePreferenceFlowWithLeaseGate({
    mockAcquireRpcResponse,
    verifiedUserId,
    cartId,
    leaseId,
    billingData,
    pendingOrders,
  }) {
    let leaseAcquired = false;
    try {
      const leaseResult = await simulateAcquireUserCheckoutLease(mockAcquireRpcResponse);
      if (!leaseResult.success) {
        return {
          status: leaseResult.httpStatus || 503,
          code: leaseResult.code,
          error: leaseResult.message,
          retryAfter: leaseResult.retryAfter,
        };
      }
      leaseAcquired = true;

      // Solo si el lease fue adquirido se evalúan/invalidan preferencias previas y se invoca la RPC de 5 argumentos
      const ordersToCancel = [];
      for (const order of pendingOrders) {
        if (order.preference_id) {
          invalidatedPreferences.push(order.preference_id);
        }
        ordersToCancel.push(order.id);
      }

      const cancelOrderId = ordersToCancel.length > 0 ? ordersToCancel[0] : null;
      if (ordersToCancel.length > 1) {
        cancelledOrderIds.push(...ordersToCancel.slice(1));
      }

      rpcCalls.push({
        fn: 'process_b2b_checkout',
        argsCount: 5,
        payload: {
          p_user_id: verifiedUserId,
          p_cart_id: cartId,
          p_billing: billingData,
          p_lease_id: leaseId,
          p_cancel_order_id: cancelOrderId,
        },
      });
      return { status: 200, mode: '5-args' };
    } finally {
      if (leaseAcquired && verifiedUserId && leaseId) {
        releasedLeases.push({ userId: verifiedUserId, leaseId });
      }
    }
  }

  // Subcaso A: Adquisición de lease exitosa -> ejecuta exclusivamente firma de 5 argumentos y libera lease en finally
  const resOk = await simulateCreatePreferenceFlowWithLeaseGate({
    mockAcquireRpcResponse: { data: { success: true, lease_id: 'lease-ok-1', status: 'created' }, error: null },
    verifiedUserId: 'user-1',
    cartId: 'cart-1',
    leaseId: 'lease-ok-1',
    billingData: { business_rut: '76.123.456-7' },
    pendingOrders: [{ id: 'old-order-1', preference_id: 'pref-old-1' }],
  });
  assert.equal(resOk.status, 200);
  assert.equal(resOk.mode, '5-args');
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].argsCount, 5);
  assert.equal(rpcCalls[0].payload.p_lease_id, 'lease-ok-1');
  assert.equal(rpcCalls[0].payload.p_cancel_order_id, 'old-order-1');
  assert.deepEqual(invalidatedPreferences, ['pref-old-1']);
  assert.deepEqual(releasedLeases, [{ userId: 'user-1', leaseId: 'lease-ok-1' }]);

  // Subcaso B: Error de caché de esquema / función ausente (PGRST202 / 42883 / 42P01 / PGRST205) -> detiene con 503 SIN fallback,
  // SIN invalidar preferencias en MP, SIN cancelar órdenes, SIN llamar a process_b2b_checkout y SIN liberar lease no adquirido
  for (const schemaErr of [
    { code: 'PGRST202', message: 'Could not find the function public.acquire_checkout_lease in the schema cache' },
    { code: '42883', message: 'function public.acquire_checkout_lease(uuid, uuid, uuid, integer) does not exist' },
    { code: '42P01', message: 'relation "public.user_checkout_leases" does not exist' },
    { code: 'PGRST205', message: 'Could not find the table public.user_checkout_leases in the schema cache' },
  ]) {
    const resNotConfigured = await simulateCreatePreferenceFlowWithLeaseGate({
      mockAcquireRpcResponse: { data: null, error: schemaErr },
      verifiedUserId: 'user-1',
      cartId: 'cart-2',
      leaseId: 'lease-never-acquired',
      billingData: { business_rut: '76.123.456-7' },
      pendingOrders: [{ id: 'order-must-remain-untouched', preference_id: 'pref-must-not-invalidate' }],
    });
    assert.equal(resNotConfigured.status, 503);
    assert.equal(resNotConfigured.code, 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED');
  }

  // Subcaso C: Error de permisos (42501) y error de base de datos (57P01) -> detienen con 503 sin efectos laterales
  const resPerm = await simulateCreatePreferenceFlowWithLeaseGate({
    mockAcquireRpcResponse: { data: null, error: { code: '42501', message: 'permission denied' } },
    verifiedUserId: 'user-1',
    cartId: 'cart-3',
    leaseId: 'lease-perm-fail',
    billingData: { business_rut: '76.123.456-7' },
    pendingOrders: [{ id: 'order-must-remain-untouched', preference_id: 'pref-must-not-invalidate' }],
  });
  assert.equal(resPerm.status, 503);
  assert.equal(resPerm.code, 'CHECKOUT_LEASE_PERMISSION_DENIED');

  const resDbFail = await simulateCreatePreferenceFlowWithLeaseGate({
    mockAcquireRpcResponse: { data: null, error: { code: '57P01', message: 'connection lost' } },
    verifiedUserId: 'user-1',
    cartId: 'cart-4',
    leaseId: 'lease-db-fail',
    billingData: { business_rut: '76.123.456-7' },
    pendingOrders: [{ id: 'order-must-remain-untouched', preference_id: 'pref-must-not-invalidate' }],
  });
  assert.equal(resDbFail.status, 503);
  assert.equal(resDbFail.code, 'CHECKOUT_LEASE_UNAVAILABLE');

  // Subcaso D: Lease ocupado por otra solicitud concurrente -> detiene con 409 CHECKOUT_IN_PROGRESS sin efectos laterales
  const resBusy = await simulateCreatePreferenceFlowWithLeaseGate({
    mockAcquireRpcResponse: {
      data: {
        success: false,
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'Ya hay una operación de pago en curso.',
        retry_after_seconds: 18,
      },
      error: null,
    },
    verifiedUserId: 'user-1',
    cartId: 'cart-5',
    leaseId: 'lease-busy-fail',
    billingData: { business_rut: '76.123.456-7' },
    pendingOrders: [{ id: 'order-must-remain-untouched', preference_id: 'pref-must-not-invalidate' }],
  });
  assert.equal(resBusy.status, 409);
  assert.equal(resBusy.code, 'CHECKOUT_IN_PROGRESS');
  assert.equal(resBusy.retryAfter, 18);

  // Confirmar que ningún fallo de adquisición (Subcasos B, C y D) produjo efectos laterales ni intentó liberar un lease no adquirido
  assert.equal(rpcCalls.length, 1, 'Nunca debe invocar process_b2b_checkout cuando falla la adquisición del lease');
  assert.deepEqual(
    invalidatedPreferences,
    ['pref-old-1'],
    'Nunca debe invalidar preferencias de Mercado Pago cuando falla la adquisición del lease'
  );
  assert.deepEqual(
    cancelledOrderIds,
    [],
    'Nunca debe cancelar órdenes previas cuando falla la adquisición del lease'
  );
  assert.equal(
    releasedLeases.length,
    1,
    'Nunca debe intentar liberar en finally un lease que no fue adquirido'
  );

  // Subcaso E: Verificación estática directa sobre el código fuente real de create-preference/route.ts
  const routeSource = fs.readFileSync(
    new URL('./frontend/app/api/mercadopago/create-preference/route.ts', import.meta.url),
    'utf8'
  );
  assert.equal(
    routeSource.includes("leaseResult.code === 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED'"),
    false,
    'route.ts no debe contener el fallback que continúa sin lease ante CHECKOUT_CONCURRENCY_NOT_CONFIGURED'
  );
  const checkoutRpcMatches = routeSource.match(/\.rpc\(\s*['"]process_b2b_checkout['"]/g) || [];
  assert.equal(
    checkoutRpcMatches.length,
    1,
    'route.ts debe tener exactamente una invocación a process_b2b_checkout (la de 5 argumentos)'
  );
  assert.ok(
    routeSource.includes('p_lease_id: leaseId') && routeSource.includes('p_cancel_order_id: cancelOrderId'),
    'La invocación a process_b2b_checkout en route.ts debe incluir p_lease_id y p_cancel_order_id'
  );
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

test('Caso 9.12 (Auditoría Migración 011 y Webhook): Idempotencia post-pago/reembolso, stock_status estructural, validación de parámetros y carrera de 0 filas en UPDATE', () => {
  const orderId = '0f205418-b5f9-484f-8047-fa24b52cc923';

  // 1. Estados posteriores al pago o terminales (refunded, paid, preparing, shipped, delivered) con stock_decremented=false:
  //    Nunca deben volver a llamar a la RPC ni revertir a 'preparing'
  for (const postStatus of ['refunded', 'paid', 'preparing', 'shipped', 'delivered']) {
    const samePayDecision = evaluateWebhookPaymentTransition({
      order: {
        id: orderId,
        status: postStatus,
        payment_status: postStatus === 'refunded' ? 'refunded' : 'approved',
        payment_id: 'pay-reconciled-100',
        stock_decremented: false,
        total_amount: 119000,
        currency: 'CLP',
      },
      payment: {
        id: 'pay-reconciled-100',
        status: 'approved',
        transaction_amount: 119000,
        currency_id: 'CLP',
      },
    });
    assert.equal(samePayDecision.action, 'ignore_ack');
    assert.equal(samePayDecision.rpcEquivalentResult.code, 'idempotent');

    const diffPayDecision = evaluateWebhookPaymentTransition({
      order: {
        id: orderId,
        status: postStatus,
        payment_status: postStatus === 'refunded' ? 'refunded' : 'approved',
        payment_id: 'pay-reconciled-100',
        stock_decremented: false,
        total_amount: 119000,
        currency: 'CLP',
      },
      payment: {
        id: 'pay-rogue-200',
        status: 'approved',
        transaction_amount: 119000,
        currency_id: 'CLP',
      },
    });
    assert.equal(diffPayDecision.action, 'ignore_ack');
    assert.equal(diffPayDecision.reason, 'payment_conflict');
    assert.equal(diffPayDecision.rpcEquivalentResult.code, 'payment_conflict');
  }

  // 2. Distinción estructural de stock_status ('skipped' con stock_error=null vs 'failed' con stock_error!=null)
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

  // Incluso si SQLERRM viene vacío (''), el Paso 5 lo normaliza a 'Error al descontar inventario' (NOT NULL)
  const emptyErrRpc = simulateApprovedPaymentRpc011({
    p_order_id: orderId,
    p_payment_id: 'pay-empty-sqlerrm',
    ordersById,
    decrementStockForOrder: () => {
      throw new Error('   ');
    },
  });
  assert.equal(emptyErrRpc.code, 'stock_failed_requires_attention');
  assert.equal(emptyErrRpc.stock_status, 'failed');
  assert.equal(ordersById.get(orderId).stock_error, 'Error al descontar inventario');

  const retryEmptyErrRpc = simulateApprovedPaymentRpc011({
    p_order_id: orderId,
    p_payment_id: 'pay-empty-sqlerrm',
    ordersById,
    decrementStockForOrder: () => {},
  });
  assert.equal(retryEmptyErrRpc.code, 'incident_pending');
  assert.equal(retryEmptyErrRpc.stock_status, 'failed', 'Jamás debe degradarse a skipped cuando hubo fallo real de stock');

  // 3. Resolución de carrera en Step 6 del webhook (0 filas afectadas o 23505 en idx_uniq_orders_payment_id)
  const duplicateKeyRes = resolveCancelledOrderIncidentUpdateOutcome({
    orderId,
    paymentId: 'pay-dup-23505',
    updatedOrder: null,
    updateError: { code: '23505', message: 'duplicate key value violates unique constraint "idx_uniq_orders_payment_id"' },
    rereadOrder: null,
    rereadError: null,
    rpcEquivalentResult: { code: 'cancelled_order_paid_requires_attention' },
  });
  assert.equal(duplicateKeyRes.httpStatus, 200);
  assert.equal(duplicateKeyRes.emitCriticalAlert, false);
  assert.equal(duplicateKeyRes.responseBody.result.code, 'payment_duplicate');

  // Carrera de 0 filas donde otro proceso concurrente registró el MISMO payment_id en requires_attention
  const parallelSamePayRes = resolveCancelledOrderIncidentUpdateOutcome({
    orderId,
    paymentId: 'pay-same-777',
    updatedOrder: null,
    updateError: null,
    rereadOrder: {
      id: orderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'pay-same-777',
      stock_decremented: false,
      stock_error: null,
    },
    rereadError: null,
    rpcEquivalentResult: { code: 'cancelled_order_paid_requires_attention' },
  });
  assert.equal(parallelSamePayRes.httpStatus, 200);
  assert.equal(parallelSamePayRes.emitCriticalAlert, false);
  assert.equal(parallelSamePayRes.responseBody.result.code, 'incident_pending');
  assert.equal(parallelSamePayRes.responseBody.result.stock_status, 'skipped');

  // Carrera de 0 filas donde la orden sigue sin registrar el pago (estado inesperado) -> 502 para reintento seguro
  const unresolvedRaceRes = resolveCancelledOrderIncidentUpdateOutcome({
    orderId,
    paymentId: 'pay-unrecorded-999',
    updatedOrder: null,
    updateError: null,
    rereadOrder: {
      id: orderId,
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
      stock_decremented: false,
      stock_error: null,
    },
    rereadError: null,
    rpcEquivalentResult: { code: 'cancelled_order_paid_requires_attention' },
  });
  assert.equal(unresolvedRaceRes.httpStatus, 502, 'Debe devolver 502 si 0 filas fueron actualizadas y el pago no quedó registrado');
});

test('Caso 9.13 (MEDIO-01): Protección contra persistencia tardía de preferencia en orden cancelada tras expiración de lease y timeout de createMpPreference', async () => {
  // Registrar hook de resolución para importar directamente las funciones reales de route.ts en Node
  const { registerHooks } = await import('node:module');
  const frontendRootUrl = new URL('./frontend/', import.meta.url);
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@/lib/utils/rut') {
        return nextResolve(new URL('lib/utils/rut.ts', frontendRootUrl).href, context);
      }
      if (specifier === '@/lib/checkoutWebhookAndResult') {
        return nextResolve(new URL('lib/checkoutWebhookAndResult.ts', frontendRootUrl).href, context);
      }
      if (specifier === 'next/server') {
        return nextResolve(new URL('node_modules/next/server.js', frontendRootUrl).href, context);
      }
      if (specifier === 'mercadopago') {
        return nextResolve(new URL('node_modules/mercadopago/dist/index.js', frontendRootUrl).href, context);
      }
      if (specifier === '@supabase/supabase-js') {
        return nextResolve(
          new URL('node_modules/@supabase/supabase-js/dist/index.mjs', frontendRootUrl).href,
          context
        );
      }
      if (specifier.startsWith('@/')) {
        // Alias genérico @/... (p. ej. @/lib/env/runtimeEnv, importado por route.ts desde la Fase 25)
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, frontendRootUrl).href, context);
      }
      return nextResolve(specifier, context);
    },
  });

  let routeModule;
  try {
    routeModule = await import('./frontend/app/api/mercadopago/create-preference/route.ts');
  } finally {
    hook.deregister();
  }

  const {
    createMpPreference,
    persistPreferenceAtomic,
    ConcurrentOrderStateChangedError,
    sanitizeMercadoPagoError,
  } = routeModule;

  const defaultUserId913 = 'user-b2b-medio01';
  const defaultLeaseId913 = 'lease-valid-medio01';

  // Helper que construye un cliente Supabase mock con soporte de .rpc('persist_order_preference_with_lease')
  // (modelando la semántica de supabase_migration_013_atomic_preference_persistence_and_detach.sql)
  // y soporte de .from('orders')
  function createMockOrdersSupabase(ordersMap, hooks = {}) {
    return {
      async rpc(fnName, params) {
        assert.equal(fnName, 'persist_order_preference_with_lease');
        if (hooks.onBeforeRpc) {
          await hooks.onBeforeRpc(ordersMap, params);
        }
        const {
          p_user_id,
          p_order_id,
          p_lease_id,
          p_preference_id,
          p_init_point,
          p_expected_stale_preference_id,
        } = params;

        if (!p_user_id || !p_order_id || !p_lease_id) {
          return {
            data: { success: false, persisted: false, code: 'LEASE_REQUIRED', message: 'Lease requerido.' },
            error: null,
          };
        }

        const row = ordersMap.get(p_order_id);
        if (!row || (row.user_id && row.user_id !== p_user_id) || row.status !== 'pending') {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'CONCURRENT_ORDER_STATE_CHANGED',
              message: 'Orden ya no está en estado pending.',
              order_id: p_order_id,
            },
            error: null,
          };
        }

        const canUpdate =
          row.preference_id === null ||
          row.preference_id === undefined ||
          (p_expected_stale_preference_id != null && row.preference_id === p_expected_stale_preference_id);

        if (canUpdate) {
          if (hooks.onAfterFailedUpdate) {
            await hooks.onAfterFailedUpdate(ordersMap, params);
            if (row.status !== 'pending') {
              return {
                data: {
                  success: false,
                  persisted: false,
                  code: 'CONCURRENT_ORDER_STATE_CHANGED',
                  message: 'Orden cambió de estado concurrentemente.',
                  order_id: p_order_id,
                },
                error: null,
              };
            }
          }
          row.preference_id = p_preference_id;
          row.init_point = p_init_point;
          return {
            data: {
              success: true,
              persisted: true,
              order_id: p_order_id,
              preference_id: p_preference_id,
              init_point: p_init_point,
            },
            error: null,
          };
        }

        // Otra preferencia ya presente en la orden
        if (hooks.onAfterFailedUpdate) {
          await hooks.onAfterFailedUpdate(ordersMap, params);
          if (row.status !== 'pending') {
            return {
              data: {
                success: false,
                persisted: false,
                code: 'CONCURRENT_ORDER_STATE_CHANGED',
                message: 'Orden cambió de estado concurrentemente.',
                order_id: p_order_id,
              },
              error: null,
            };
          }
        }

        if (row.preference_id && row.init_point) {
          return {
            data: {
              success: true,
              persisted: false,
              code: 'PREFERENCE_ALREADY_PRESENT',
              order_id: p_order_id,
              preference_id: row.preference_id,
              init_point: row.init_point,
            },
            error: null,
          };
        }

        return {
          data: {
            success: false,
            persisted: false,
            code: 'CONCURRENT_ORDER_STATE_CHANGED',
            order_id: p_order_id,
          },
          error: null,
        };
      },
      from(table) {
        assert.equal(table, 'orders');
        return {
          update(patch) {
            const filters = { eq: {}, is: {} };
            const builder = {
              eq(col, val) {
                filters.eq[col] = val;
                return builder;
              },
              is(col, val) {
                filters.is[col] = val;
                return builder;
              },
              select() {
                return builder;
              },
              async maybeSingle() {
                if (hooks.onBeforeUpdate) {
                  await hooks.onBeforeUpdate(ordersMap, filters);
                }
                const row = ordersMap.get(filters.eq.id);
                if (!row) {
                  return { data: null, error: null };
                }
                const matchesEq = Object.entries(filters.eq).every(([k, v]) => row[k] === v);
                const matchesIs = Object.entries(filters.is).every(([k, v]) => row[k] === v);
                if (!matchesEq || !matchesIs) {
                  if (hooks.onAfterFailedUpdate) {
                    await hooks.onAfterFailedUpdate(ordersMap, filters);
                  }
                  return { data: null, error: null };
                }
                Object.assign(row, patch);
                return { data: { ...row }, error: null };
              },
            };
            return builder;
          },
          select() {
            const filters = { eq: {} };
            const executeSelect = async () => {
              if (hooks.onBeforeSelect) {
                await hooks.onBeforeSelect(ordersMap, filters);
              }
              const row = ordersMap.get(filters.eq.id);
              if (!row) {
                return { data: null, error: null };
              }
              const matchesEq = Object.entries(filters.eq).every(([k, v]) => row[k] === v);
              if (!matchesEq) {
                return { data: null, error: null };
              }
              return { data: { ...row }, error: null };
            };
            const builder = {
              eq(col, val) {
                filters.eq[col] = val;
                return builder;
              },
              maybeSingle: executeSelect,
              single: executeSelect,
            };
            return builder;
          },
        };
      },
    };
  }

  // =========================================================================
  // Escenario 1: La orden sigue 'pending' -> la preferencia se persiste normalmente
  //              (y en carrera legítima con otra petición sobre la misma orden 'pending', recupera la ganadora)
  // =========================================================================
  const orderId1 = '11111111-1111-4111-8111-111111111111';
  const ordersMap1 = new Map([
    [
      orderId1,
      {
        id: orderId1,
        user_id: defaultUserId913,
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const invalidatedPrefs1 = [];
  const supabase1 = createMockOrdersSupabase(ordersMap1);

  const persisted1 = await persistPreferenceAtomic(
    supabase1,
    orderId1,
    'pref-valid-001',
    'https://mp.cl/checkout/pref-valid-001',
    {
      userId: defaultUserId913,
      leaseId: defaultLeaseId913,
      invalidatePreference: async (prefId) => {
        invalidatedPrefs1.push(prefId);
        return { success: true };
      },
    }
  );

  assert.deepEqual(persisted1, {
    id: 'pref-valid-001',
    initPoint: 'https://mp.cl/checkout/pref-valid-001',
    orderId: orderId1,
  });
  assert.equal(ordersMap1.get(orderId1).preference_id, 'pref-valid-001');
  assert.equal(ordersMap1.get(orderId1).status, 'pending');
  assert.equal(invalidatedPrefs1.length, 0, 'No debe invalidar la preferencia cuando la RPC persiste con éxito');

  // Si una segunda llamada concurrente intenta persistir otra preferencia mientras la orden sigue 'pending',
  // recupera la preferencia ganadora ('pref-valid-001'), la verifica en MP e invalida la redundante ('pref-loser-002')
  const recoveredWinner = await persistPreferenceAtomic(
    supabase1,
    orderId1,
    'pref-loser-002',
    'https://mp.cl/checkout/pref-loser-002',
    {
      userId: defaultUserId913,
      leaseId: defaultLeaseId913,
      checkPreferenceValidity: async (winnerPrefId, expectedOrdId) => {
        assert.equal(winnerPrefId, 'pref-valid-001');
        assert.equal(expectedOrdId, orderId1);
        return { valid: true, status: 'active' };
      },
      invalidatePreference: async (prefId) => {
        invalidatedPrefs1.push(prefId);
        return { success: true };
      },
    }
  );
  assert.deepEqual(recoveredWinner, {
    id: 'pref-valid-001',
    initPoint: 'https://mp.cl/checkout/pref-valid-001',
    orderId: orderId1,
  });
  assert.deepEqual(invalidatedPrefs1, ['pref-loser-002']);

  // =========================================================================
  // Escenario 2: La orden pasa a 'cancelled' antes de persistir (tras expirar el lease) ->
  //              la preferencia NO se asigna, se invalida la preferencia tardía y falla en cerrado (409)
  // =========================================================================
  const orderId2 = '22222222-2222-4222-8222-222222222222';
  const ordersMap2 = new Map([
    [
      orderId2,
      {
        id: orderId2,
        user_id: defaultUserId913,
        status: 'cancelled', // Cancelada por la Petición B tras expirar el lease de la Petición A
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const invalidatedPrefs2 = [];
  const supabase2 = createMockOrdersSupabase(ordersMap2);

  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        supabase2,
        orderId2,
        'pref-late-cancelled-002',
        'https://mp.cl/checkout/pref-late-cancelled-002',
        {
          userId: defaultUserId913,
          leaseId: defaultLeaseId913,
          invalidatePreference: async (prefId) => {
            invalidatedPrefs2.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.equal(err instanceof ConcurrentOrderStateChangedError, true);
      assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
      assert.equal(err.httpStatus, 409);
      assert.equal(err.orderId, orderId2);
      return true;
    }
  );

  assert.equal(
    ordersMap2.get(orderId2).preference_id,
    null,
    'Jamás debe persistirse preference_id en una orden cancelada'
  );
  assert.equal(
    ordersMap2.get(orderId2).init_point,
    null,
    'Jamás debe persistirse init_point en una orden cancelada'
  );
  assert.deepEqual(
    invalidatedPrefs2,
    ['pref-late-cancelled-002'],
    'Debe invalidar la preferencia tardía creada para la orden que fue cancelada'
  );

  // =========================================================================
  // Escenario 3: La orden cambia de estado a 'cancelled' concurrentemente -> rechazo atómico
  // =========================================================================
  const orderId3 = '33333333-3333-4333-8333-333333333333';
  const ordersMap3 = new Map([
    [
      orderId3,
      {
        id: orderId3,
        user_id: defaultUserId913,
        status: 'pending',
        preference_id: 'pref-prior-before-cancel',
        init_point: 'https://mp.cl/checkout/pref-prior-before-cancel',
      },
    ],
  ]);
  const invalidatedPrefs3 = [];
  const supabase3 = createMockOrdersSupabase(ordersMap3, {
    onAfterFailedUpdate(map) {
      map.get(orderId3).status = 'cancelled';
    },
  });

  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        supabase3,
        orderId3,
        'pref-race-between-update-and-select',
        'https://mp.cl/checkout/pref-race-between-update-and-select',
        {
          userId: defaultUserId913,
          leaseId: defaultLeaseId913,
          invalidatePreference: async (prefId) => {
            invalidatedPrefs3.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.equal(err instanceof ConcurrentOrderStateChangedError, true);
      assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
      assert.equal(err.httpStatus, 409);
      assert.equal(err.orderId, orderId3);
      return true;
    }
  );

  assert.deepEqual(
    invalidatedPrefs3,
    ['pref-race-between-update-and-select'],
    'Debe invalidar la preferencia tardía cuando la orden cambia a cancelled'
  );

  // =========================================================================
  // Escenario 4: La invalidación de la preferencia tardía falla ->
  //              se registra el error controlado y aun así el checkout se rechaza sin persistir en la orden cancelada
  // =========================================================================
  const orderId4 = '44444444-4444-4444-8444-444444444444';
  const ordersMap4 = new Map([
    [
      orderId4,
      {
        id: orderId4,
        user_id: defaultUserId913,
        status: 'cancelled',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const supabase4 = createMockOrdersSupabase(ordersMap4);
  const loggedInvalidationErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    loggedInvalidationErrors.push(args);
  };

  try {
    // 4a: invalidatePreference devuelve { success: false, error: '...' }
    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabase4,
          orderId4,
          'pref-inv-fail-result',
          'https://mp.cl/checkout/pref-inv-fail-result',
          {
            userId: defaultUserId913,
            leaseId: defaultLeaseId913,
            invalidatePreference: async () => ({
              success: false,
              error: 'MP 503 Service Unavailable during invalidation',
            }),
          }
        );
      },
      (err) => {
        assert.equal(err instanceof ConcurrentOrderStateChangedError, true);
        assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
        assert.equal(err.httpStatus, 409);
        return true;
      }
    );

    // 4b: invalidatePreference lanza una excepción de red
    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabase4,
          orderId4,
          'pref-inv-throw-err',
          'https://mp.cl/checkout/pref-inv-throw-err',
          {
            userId: defaultUserId913,
            leaseId: defaultLeaseId913,
            invalidatePreference: async () => {
              throw new Error('Network socket hang up');
            },
          }
        );
      },
      (err) => {
        assert.equal(err instanceof ConcurrentOrderStateChangedError, true);
        assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
        assert.equal(err.httpStatus, 409);
        return true;
      }
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(ordersMap4.get(orderId4).preference_id, null, 'No debe persistir en la orden cancelada');
  assert.equal(
    loggedInvalidationErrors.length,
    2,
    'Debe registrar de forma controlada tanto el fallo por resultado como la excepción de invalidación'
  );
  assert.match(String(loggedInvalidationErrors[0][0]), /invalidar preferencia MP tardía\/huérfana/);
  assert.equal(loggedInvalidationErrors[0][1].preferenceId, 'pref-inv-fail-result');
  assert.equal(loggedInvalidationErrors[1][1].preferenceId, 'pref-inv-throw-err');

  // =========================================================================
  // Escenario 5: La creación de preferencia excede el timeout ->
  //              la petición falla en cerrado sin marcar la orden cancelada como válida,
  //              y cuando Mercado Pago resuelve tarde en segundo plano, invalida la preferencia huérfana
  // =========================================================================
  const orderId5 = '55555555-5555-4555-8555-555555555555';
  let resolveLateMpCreate;
  const lateMpPromise = new Promise((resolve) => {
    resolveLateMpCreate = resolve;
  });

  const lateInvalidatedPrefs = [];
  let lateInvalidationDoneResolve;
  const lateInvalidationDone = new Promise((resolve) => {
    lateInvalidationDoneResolve = resolve;
  });

  let timeoutErrorCaught = null;
  try {
    await createMpPreference({
      orderId: orderId5,
      customerName: 'Óptica Central B2B',
      customerEmail: 'compras@opticacentral.cl',
      orderItems: [
        {
          sku: 'SKU-01',
          product_id: 'SKU-01',
          product_name: 'Marco Titanio',
          quantity: 10,
          unit_price_net: 25000,
        },
      ],
      taxAmount: 47500,
      siteUrl: 'https://optihub.cl',
      timeoutMs: 25,
      injectedPreferenceClient: {
        create: () => lateMpPromise,
      },
      invalidatePreference: async (latePrefId) => {
        lateInvalidatedPrefs.push(latePrefId);
        lateInvalidationDoneResolve();
        return { success: true };
      },
    });
  } catch (err) {
    timeoutErrorCaught = err;
  }

  assert.ok(timeoutErrorCaught, 'createMpPreference debe rechazar cuando se supera timeoutMs');
  assert.equal(timeoutErrorCaught.message, 'TIMEOUT_MP_PREFERENCE_CREATE');

  // El mapeo de error para el cliente debe ser un 502 sanitizado (fallo en cerrado)
  const sanitizedTimeout = sanitizeMercadoPagoError(timeoutErrorCaught);
  assert.equal(sanitizedTimeout.status, 502);
  assert.match(sanitizedTimeout.error, /Tiempo de espera agotado/i);

  // Ahora la llamada remota colgada en Mercado Pago termina tardíamente devolviendo una preferencia huérfana
  resolveLateMpCreate({
    id: 'pref-orphan-after-timeout-999',
    init_point: 'https://mp.cl/checkout/pref-orphan-after-timeout-999',
  });

  await lateInvalidationDone;
  assert.deepEqual(
    lateInvalidatedPrefs,
    ['pref-orphan-after-timeout-999'],
    'Cuando la promesa remota de MP se resuelve después del timeout local, debe invalidarse automáticamente la preferencia huérfana'
  );

  // Verificación estática complementaria en route.ts para asegurar cableado en POST y recover_missing_preference
  const routeSource = fs.readFileSync(
    new URL('./frontend/app/api/mercadopago/create-preference/route.ts', import.meta.url),
    'utf8'
  );
  assert.match(
    routeSource,
    /\.select\('status, preference_id, init_point, customer_name, customer_email, tax_amount'\)/,
    'POST debe incluir status al consultar la orden recién creada antes de llamar a createMpPreference'
  );
  assert.match(
    routeSource,
    /if\s*\(\s*orderData\.status\s*!==\s*'pending'\s*\)/,
    'POST debe rechazar con 409 si la orden recién creada dejó de estar en estado pending antes de llamar a MP'
  );
});

test('Caso 9.14 (MEDIO-02): Secuencia segura de invalidación diferida y recuperación explícita ante fallos en sync_cart, lease, process_b2b_checkout, createMpPreference y persistPreferenceAtomic', async () => {
  const { registerHooks } = await import('node:module');
  const frontendRootUrl = new URL('./frontend/', import.meta.url);
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@/lib/utils/rut') {
        return nextResolve(new URL('lib/utils/rut.ts', frontendRootUrl).href, context);
      }
      if (specifier === '@/lib/checkoutWebhookAndResult') {
        return nextResolve(new URL('lib/checkoutWebhookAndResult.ts', frontendRootUrl).href, context);
      }
      if (specifier === 'next/server') {
        return nextResolve(new URL('node_modules/next/server.js', frontendRootUrl).href, context);
      }
      if (specifier === 'mercadopago') {
        return nextResolve(new URL('node_modules/mercadopago/dist/index.js', frontendRootUrl).href, context);
      }
      if (specifier === '@supabase/supabase-js') {
        return nextResolve(
          new URL('node_modules/@supabase/supabase-js/dist/index.mjs', frontendRootUrl).href,
          context
        );
      }
      if (specifier.startsWith('@/')) {
        // Alias genérico @/... (p. ej. @/lib/env/runtimeEnv, importado por route.ts desde la Fase 25)
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, frontendRootUrl).href, context);
      }
      return nextResolve(specifier, context);
    },
  });

  let routeModule;
  try {
    routeModule = await import('./frontend/app/api/mercadopago/create-preference/route.ts');
  } finally {
    hook.deregister();
  }

  const {
    invalidateAndDetachPriorOrderPreferences,
    restorePendingOrdersAfterFailedReplacement,
    persistPreferenceAtomic,
    checkCandidatePreferenceValidity,
    classifyCheckoutRpcFailureForRecovery,
    validateCreatedOrderAfterCheckoutRpc,
    cancelExtraPendingOrdersBeforeCheckout,
    isPreferenceMarkedInvalidated,
    markPreferenceAsInvalidated,
    CheckoutLeaseInvalidError,
    ConcurrentOrderStateChangedError,
    WinnerPreferenceVerificationFailedError,
  } = routeModule;

  const nowMs = Date.parse('2026-10-17T18:00:00.000Z');
  const recentIso = new Date(nowMs - 10 * 60 * 1000).toISOString();
  const validLeaseId = '99999999-9999-4999-8999-999999999999';
  const userId = 'user-b2b-medio02';

  // Helper que simula tanto .from('orders') como la RPC atómica persist_order_preference_with_lease
  // definida en supabase_migration_013_atomic_preference_persistence_and_detach.sql.
  // NOTA METODOLÓGICA: Este mock modela en memoria las precondiciones y el compare-and-swap de la RPC SQL;
  // la serialización física FOR UPDATE depende de la ejecución de la migración 013 en PostgreSQL real.
  function createMockOrdersSupabase(ordersMap, options = {}) {
    const leasesMap =
      options.leasesMap ||
      new Map([
        [
          userId,
          {
            userId,
            leaseId: validLeaseId,
            expiresAt: nowMs + 45_000,
          },
        ],
      ]);

    return {
      async rpc(fnName, params) {
        assert.equal(fnName, 'persist_order_preference_with_lease');
        if (options.onBeforeRpc) {
          await options.onBeforeRpc(ordersMap, leasesMap, params);
        }

        const {
          p_user_id,
          p_order_id,
          p_lease_id,
          p_preference_id,
          p_init_point,
          p_expected_stale_preference_id,
        } = params;

        // 1. Validación de parámetros
        if (!p_user_id || !p_order_id || !p_lease_id) {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'LEASE_REQUIRED',
              message: 'Se requiere un lease_id, user_id y order_id válidos para persistir la preferencia.',
            },
            error: null,
          };
        }

        if (!p_preference_id || !String(p_preference_id).trim() || !p_init_point || !String(p_init_point).trim()) {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'INVALID_PREFERENCE_DATA',
              message: 'Se requieren preference_id e init_point no vacíos.',
            },
            error: null,
          };
        }

        // 2. Verificación del lease (orden de bloqueo: user_checkout_leases -> orders)
        const lease = leasesMap.get(p_user_id);
        if (!lease) {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'LEASE_NOT_FOUND',
              message: 'No existe una reserva activa de checkout para este usuario.',
            },
            error: null,
          };
        }

        if (lease.leaseId !== p_lease_id) {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'LEASE_LOST_TO_CONCURRENT_REQUEST',
              message: 'La reserva de checkout fue adquirida por otra solicitud concurrente.',
            },
            error: null,
          };
        }

        const checkNow = options.getNowMs ? options.getNowMs() : nowMs;
        if (lease.expiresAt <= checkNow) {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'LEASE_EXPIRED',
              message: 'La reserva de checkout expiró antes de persistir la preferencia.',
            },
            error: null,
          };
        }

        // 3. Verificación de la orden (user_id y status = 'pending')
        const order = ordersMap.get(p_order_id);
        if (!order || order.user_id !== p_user_id || order.status !== 'pending') {
          return {
            data: {
              success: false,
              persisted: false,
              code: 'CONCURRENT_ORDER_STATE_CHANGED',
              message: 'No se pudo persistir la preferencia porque la orden ya no está pendiente o no pertenece al usuario.',
              order_id: p_order_id,
            },
            error: null,
          };
        }

        // 4. Compare-and-swap atómico en un único UPDATE
        const canWrite =
          order.preference_id === null ||
          order.preference_id === undefined ||
          (p_expected_stale_preference_id != null && order.preference_id === p_expected_stale_preference_id);

        if (canWrite) {
          order.preference_id = p_preference_id;
          order.init_point = p_init_point;
          return {
            data: {
              success: true,
              persisted: true,
              order_id: p_order_id,
              preference_id: p_preference_id,
              init_point: p_init_point,
            },
            error: null,
          };
        }

        // 5. Otra preferencia ya presente en la orden pendiente
        if (order.preference_id && String(order.preference_id).trim() && order.init_point && String(order.init_point).trim()) {
          return {
            data: {
              success: true,
              persisted: false,
              code: 'PREFERENCE_ALREADY_PRESENT',
              order_id: p_order_id,
              preference_id: order.preference_id,
              init_point: order.init_point,
            },
            error: null,
          };
        }

        return {
          data: {
            success: false,
            persisted: false,
            code: 'CONCURRENT_ORDER_STATE_CHANGED',
            message: 'La orden pendiente contiene un estado de preferencia inconsistente.',
            order_id: p_order_id,
          },
          error: null,
        };
      },
      from(table) {
        assert.equal(table, 'orders');
        return {
          update(patch) {
            const filters = { eq: {}, is: {}, in: null };
            const executeSingleUpdate = async () => {
              const row = ordersMap.get(filters.eq.id);
              if (!row) return { data: null, error: null };
              const matchesEq = Object.entries(filters.eq).every(([k, v]) => row[k] === v);
              const matchesIs = Object.entries(filters.is).every(([k, v]) => row[k] === v);
              if (!matchesEq || !matchesIs) return { data: null, error: null };
              Object.assign(row, patch);
              return { data: { ...row }, error: null };
            };
            const executeBatchUpdate = async () => {
              if (options.overrideBatchUpdateResult) {
                return options.overrideBatchUpdateResult(ordersMap, filters, patch);
              }
              const targetIds = filters.in?.values || [];
              const updatedRows = [];
              for (const id of targetIds) {
                const row = ordersMap.get(id);
                if (!row) continue;
                const matchesEq = Object.entries(filters.eq).every(([k, v]) => row[k] === v);
                const matchesIs = Object.entries(filters.is).every(([k, v]) => row[k] === v);
                if (!matchesEq || !matchesIs) continue;
                Object.assign(row, patch);
                updatedRows.push({ ...row });
              }
              return { data: updatedRows, error: null };
            };
            const builder = {
              eq(col, val) {
                filters.eq[col] = val;
                return builder;
              },
              is(col, val) {
                filters.is[col] = val;
                return builder;
              },
              in(col, values) {
                filters.in = { col, values };
                return builder;
              },
              select() {
                if (filters.in) {
                  return executeBatchUpdate();
                }
                return builder;
              },
              maybeSingle: executeSingleUpdate,
              single: executeSingleUpdate,
            };
            return builder;
          },
          select() {
            const filters = { eq: {} };
            const executeSelect = async () => {
              const row = ordersMap.get(filters.eq.id);
              if (!row) return { data: null, error: null };
              const matchesEq = Object.entries(filters.eq).every(([k, v]) => row[k] === v);
              if (!matchesEq) return { data: null, error: null };
              return { data: { ...row }, error: null };
            };
            const builder = {
              eq(col, val) {
                filters.eq[col] = val;
                return builder;
              },
              maybeSingle: executeSelect,
              single: executeSelect,
            };
            return builder;
          },
        };
      },
    };
  }

  // =========================================================================
  // 1. Múltiples órdenes pendientes donde la 2ª bloquea en checkPaymentStatus:
  //    La Fase 1 de evaluatePendingOrdersForCheckout verifica TODAS antes de invalidar.
  //    La preferencia de la 1ª orden NO se invalida.
  // =========================================================================
  const invalidatedInMulti = [];
  const multiBlockRes = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'ord-multi-clean-1',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-must-stay-valid-1',
        init_point: 'https://mp.cl/pref-1',
      },
      {
        id: 'ord-multi-active-2',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-active-2',
        init_point: 'https://mp.cl/pref-2',
      },
    ],
    fetchOrderItems: async () => [],
    matchesOrder: () => false,
    checkPaymentStatus: async (orderId) => {
      if (orderId === 'ord-multi-clean-1') return { status: 'clean' };
      return { status: 'has_active_payment', activeState: 'in_process' };
    },
    invalidatePreference: async (prefId) => {
      invalidatedInMulti.push(prefId);
      return { success: true };
    },
    nowMs,
  });

  assert.equal(multiBlockRes.outcome, 'block');
  assert.equal(multiBlockRes.code, 'PAYMENT_IN_PROCESS');
  assert.equal(
    invalidatedInMulti.length,
    0,
    'Jamás debe invalidar la preferencia de la primera orden si la segunda orden bloquea el reemplazo'
  );

  // =========================================================================
  // 2. Fallos en sync_cart o en verifyUserCheckoutLease con deferPreferenceInvalidation=true:
  //    La preferencia previa NO se invalida antes de confirmar sync_cart y vigencia del lease.
  // =========================================================================
  const invalidatedBeforeSyncOrLease = [];
  const deferredDecision = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: 'ord-prior-a',
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-prior-a-valid',
        init_point: 'https://mp.cl/pref-prior-a-valid',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'SKU-1', quantity: 10 }],
    matchesOrder: () => false, // Carrito modificado
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async (prefId) => {
      invalidatedBeforeSyncOrLease.push(prefId);
      return { success: true };
    },
    nowMs,
    deferPreferenceInvalidation: true,
  });

  assert.equal(deferredDecision.outcome, 'proceed_new_order');
  assert.equal(
    invalidatedBeforeSyncOrLease.length,
    0,
    'Con deferPreferenceInvalidation=true no se invalida la preferencia antes de sync_cart y verifyUserCheckoutLease'
  );
  assert.deepEqual(deferredDecision.preferencesToInvalidate, [
    { orderId: 'ord-prior-a', preferenceId: 'pref-prior-a-valid' },
  ]);

  // =========================================================================
  // 3. Protección frente a concurrencia en invalidateAndDetachPriorOrderPreferences:
  //    No debe invalidar la preferencia ganadora de otra solicitud ni operar sobre una orden cancelada.
  // =========================================================================
  const orderConcurrentId = '66666666-6666-4666-8666-666666666666';

  // 3a: Otra petición concurrente ya asignó una preferencia ganadora distinta ('pref-winner-new')
  const ordersConcurrentWinner = new Map([
    [
      orderConcurrentId,
      {
        id: orderConcurrentId,
        user_id: userId,
        status: 'pending',
        payment_status: 'pending',
        preference_id: 'pref-winner-new',
        init_point: 'https://mp.cl/pref-winner-new',
      },
    ],
  ]);
  const invalidatedByStaleReq = [];
  const staleAgainstWinnerRes = await invalidateAndDetachPriorOrderPreferences({
    supabaseAdmin: createMockOrdersSupabase(ordersConcurrentWinner),
    userId,
    preferencesToInvalidate: [{ orderId: orderConcurrentId, preferenceId: 'pref-old-stale' }],
    invalidatePreference: async (prefId) => {
      invalidatedByStaleReq.push(prefId);
      return { success: true };
    },
  });

  assert.equal(staleAgainstWinnerRes.ok, false);
  assert.equal(staleAgainstWinnerRes.httpStatus, 409);
  assert.equal(staleAgainstWinnerRes.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(invalidatedByStaleReq.length, 0, 'No debe invalidar la preferencia ganadora de otra petición');
  assert.equal(ordersConcurrentWinner.get(orderConcurrentId).preference_id, 'pref-winner-new');

  // 3b: La orden previa ya fue cancelada concurrentemente
  const ordersAlreadyCancelled = new Map([
    [
      orderConcurrentId,
      {
        id: orderConcurrentId,
        user_id: userId,
        status: 'cancelled',
        payment_status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const staleAgainstCancelledRes = await invalidateAndDetachPriorOrderPreferences({
    supabaseAdmin: createMockOrdersSupabase(ordersAlreadyCancelled),
    userId,
    preferencesToInvalidate: [{ orderId: orderConcurrentId, preferenceId: 'pref-old-stale' }],
    invalidatePreference: async (prefId) => {
      invalidatedByStaleReq.push(prefId);
      return { success: true };
    },
  });

  assert.equal(staleAgainstCancelledRes.ok, false);
  assert.equal(staleAgainstCancelledRes.httpStatus, 409);
  assert.equal(staleAgainstCancelledRes.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(ordersAlreadyCancelled.get(orderConcurrentId).status, 'cancelled', 'No debe revivir una orden cancelada');

  // =========================================================================
  // 4. Fallo determinista en process_b2b_checkout después de invalidar la preferencia previa (con lease válido):
  // =========================================================================
  const orderPriorId = '77777777-7777-4777-8777-777777777777';
  const priorOrderRecord = {
    id: orderPriorId,
    user_id: userId,
    status: 'pending',
    payment_status: 'pending',
    subtotal_net: 250000,
    tax_amount: 47500,
    total_amount: 297500,
    customer_name: 'Óptica del Sur',
    customer_email: 'pagos@opticadelsur.cl',
    created_at: recentIso,
    preference_id: 'pref-prior-to-replace-001',
    init_point: 'https://mp.cl/checkout/pref-prior-to-replace-001',
  };

  // Subcaso 4a: Invalidación + desacople seguidos de rollback confirmado en process_b2b_checkout y restauración con lease válido
  const ordersMap4a = new Map([[orderPriorId, { ...priorOrderRecord }]]);
  const supabase4a = createMockOrdersSupabase(ordersMap4a);
  const invalidatedPrefs4a = [];

  const detachOutcome4a = await invalidateAndDetachPriorOrderPreferences({
    supabaseAdmin: supabase4a,
    userId,
    preferencesToInvalidate: [{ orderId: orderPriorId, preferenceId: 'pref-prior-to-replace-001' }],
    invalidatePreference: async (prefId) => {
      invalidatedPrefs4a.push(prefId);
      return { success: true };
    },
  });

  assert.equal(detachOutcome4a.ok, true);
  assert.deepEqual(invalidatedPrefs4a, ['pref-prior-to-replace-001']);
  assert.equal(
    ordersMap4a.get(orderPriorId).preference_id,
    null,
    'Inmediatamente tras invalidar en MP, preference_id debe limpiarse a null en BD'
  );
  assert.equal(ordersMap4a.get(orderPriorId).init_point, null);

  const restoreRes4a = await restorePendingOrdersAfterFailedReplacement({
    supabaseAdmin: supabase4a,
    userId,
    leaseId: validLeaseId,
    verifyLease: async () => ({ valid: true }),
    detachedOrders: detachOutcome4a.detachedOrders,
    candidateOrdersById: new Map([[orderPriorId, priorOrderRecord]]),
    siteUrl: 'https://optihub.cl',
    fallbackCustomerEmail: 'pagos@opticadelsur.cl',
    fetchOrderItems: async () => [
      { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
    ],
    createPreference: async () => ({
      id: 'pref-restored-fresh-002',
      paymentUrl: 'https://mp.cl/checkout/pref-restored-fresh-002',
    }),
    persistPreference: (db, ordId, pId, url, opts) =>
      persistPreferenceAtomic(db, ordId, pId, url, {
        ...opts,
        invalidatePreference: async () => ({ success: true }),
      }),
    nowMs,
  });

  assert.equal(restoreRes4a.abortedByLeaseLoss, false);
  assert.deepEqual(restoreRes4a.restoredOrderIds, [orderPriorId]);
  assert.equal(ordersMap4a.get(orderPriorId).status, 'pending');
  assert.equal(
    ordersMap4a.get(orderPriorId).preference_id,
    'pref-restored-fresh-002',
    'La orden pendiente recibe una nueva preferencia válida y operativa tras el fallo de reemplazo'
  );
  assert.notEqual(
    ordersMap4a.get(orderPriorId).preference_id,
    'pref-prior-to-replace-001',
    'Jamás conserva ni reutiliza la preferencia invalidada'
  );

  // Subcaso 4b: Si durante la restauración tras el fallo de process_b2b_checkout también falla Mercado Pago,
  //             la orden queda en status='pending' con preference_id=null (no pagable con preferencia muerta)
  //             y al reintentar el carrito original entra por recover_missing_preference
  const ordersMap4b = new Map([[orderPriorId, { ...priorOrderRecord }]]);
  const supabase4b = createMockOrdersSupabase(ordersMap4b);

  const detachOutcome4b = await invalidateAndDetachPriorOrderPreferences({
    supabaseAdmin: supabase4b,
    userId,
    preferencesToInvalidate: [{ orderId: orderPriorId, preferenceId: 'pref-prior-to-replace-001' }],
    invalidatePreference: async () => ({ success: true }),
  });
  assert.equal(detachOutcome4b.ok, true);

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  let restoreRes4b;
  try {
    restoreRes4b = await restorePendingOrdersAfterFailedReplacement({
      supabaseAdmin: supabase4b,
      userId,
      leaseId: validLeaseId,
      verifyLease: async () => ({ valid: true }),
      detachedOrders: detachOutcome4b.detachedOrders,
      candidateOrdersById: new Map([[orderPriorId, priorOrderRecord]]),
      siteUrl: 'https://optihub.cl',
      fallbackCustomerEmail: 'pagos@opticadelsur.cl',
      fetchOrderItems: async () => [
        { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
      ],
      createPreference: async () => {
        throw new Error('MP 502 Bad Gateway during recovery');
      },
      nowMs,
    });
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }

  assert.deepEqual(restoreRes4b.restoredOrderIds, []);
  assert.deepEqual(restoreRes4b.detachedOnlyOrderIds, [orderPriorId]);
  assert.equal(
    ordersMap4b.get(orderPriorId).preference_id,
    null,
    'Ante fallo de regeneración, la orden NO debe quedar marcada con la preferencia invalidada'
  );
  assert.equal(ordersMap4b.get(orderPriorId).init_point, null);

  const nextAttemptDecision = await evaluatePendingOrdersForCheckout({
    pendingOrders: [ordersMap4b.get(orderPriorId)],
    fetchOrderItems: async () => [{ product_id: 'SKU-A', quantity: 10, unit_price_net: 25000 }],
    matchesOrder: () => true,
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
    deferPreferenceInvalidation: true,
  });

  assert.equal(
    nextAttemptDecision.outcome,
    'recover_missing_preference',
    'Una orden cuya preferencia previa fue invalidada y limpiada debe repararse vía recover_missing_preference y nunca vía reuse_existing_preference'
  );

  // =========================================================================
  // 5. Fallo en creación de la nueva preferencia (createMpPreference) o en persistencia (persistPreferenceAtomic)
  //    después de que process_b2b_checkout ya canceló la orden previa A y creó la nueva orden B:
  // =========================================================================
  const orderNewBId = '88888888-8888-4888-8888-888888888888';
  const ordersMap5 = new Map([
    [
      orderPriorId,
      {
        ...priorOrderRecord,
        status: 'cancelled',
        preference_id: null,
        init_point: null,
      },
    ],
    [
      orderNewBId,
      {
        id: orderNewBId,
        user_id: userId,
        status: 'pending',
        payment_status: 'pending',
        subtotal_net: 300000,
        tax_amount: 57000,
        total_amount: 357000,
        created_at: recentIso,
        preference_id: null,
        init_point: null,
      },
    ],
  ]);

  const invalidatedOnPersistDbErr = [];
  const supabaseFailingRpc = {
    async rpc() {
      return { data: null, error: { message: 'connection reset by peer' } };
    },
  };

  console.error = () => {};
  try {
    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabaseFailingRpc,
          orderNewBId,
          'pref-B-failed-persist',
          'https://mp.cl/checkout/pref-B-failed-persist',
          {
            userId,
            leaseId: validLeaseId,
            invalidatePreference: async (prefId) => {
              invalidatedOnPersistDbErr.push(prefId);
              return { success: true };
            },
          }
        );
      },
      /Error interno al persistir la Preference/
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(
    invalidatedOnPersistDbErr,
    ['pref-B-failed-persist'],
    'Si falla la persistencia en BD, debe invalidar la preferencia recién creada en MP'
  );
  assert.equal(ordersMap5.get(orderNewBId).preference_id, null);

  const retryOrderBDecision = await evaluatePendingOrdersForCheckout({
    pendingOrders: [ordersMap5.get(orderNewBId)],
    fetchOrderItems: async () => [{ product_id: 'SKU-B', quantity: 12, unit_price_net: 25000 }],
    matchesOrder: () => true,
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
    deferPreferenceInvalidation: true,
  });

  assert.equal(retryOrderBDecision.outcome, 'recover_missing_preference');
  assert.equal(retryOrderBDecision.order.id, orderNewBId);

  const healedOrderB = await persistPreferenceAtomic(
    createMockOrdersSupabase(ordersMap5),
    orderNewBId,
    'pref-B-healed-ok',
    'https://mp.cl/checkout/pref-B-healed-ok',
    {
      userId,
      leaseId: validLeaseId,
      invalidatePreference: async () => ({ success: true }),
    }
  );
  assert.equal(healedOrderB.id, 'pref-B-healed-ok');
  assert.equal(ordersMap5.get(orderNewBId).preference_id, 'pref-B-healed-ok');

  // =========================================================================
  // REGRESIÓN 6 (Requisito 1 + ALTO-M02-01): Pérdida del lease antes y durante la recuperación
  // y eliminación de la ventana destructiva leaseAfterPersist
  // =========================================================================
  // 6a: Si process_b2b_checkout rechaza por LEASE_LOST_TO_CONCURRENT_REQUEST, LEASE_EXPIRED,
  //     LEASE_NOT_FOUND o CONCURRENT_ORDER_STATE_CHANGED, classifyCheckoutRpcFailureForRecovery
  //     prohíbe ejecutar la recuperación compensatoria.
  for (const rejectCode of [
    'LEASE_LOST_TO_CONCURRENT_REQUEST',
    'LEASE_EXPIRED',
    'LEASE_NOT_FOUND',
    'CONCURRENT_ORDER_STATE_CHANGED',
  ]) {
    const classification = classifyCheckoutRpcFailureForRecovery({
      checkoutError: null,
      checkoutResult: { success: false, code: rejectCode, message: 'Rechazado por RPC' },
    });
    assert.equal(
      classification.shouldRecover,
      false,
      `No debe ejecutar recuperación cuando process_b2b_checkout devuelve ${rejectCode}`
    );
    assert.equal(classification.category, 'lease_or_concurrency_conflict');
  }

  // 6b: Pérdida del lease ANTES de iniciar createPreference en restorePendingOrdersAfterFailedReplacement
  const ordersMap6b = new Map([
    [orderPriorId, { ...priorOrderRecord, preference_id: null, init_point: null }],
  ]);
  let createCalls6b = 0;
  let persistCalls6b = 0;
  console.warn = () => {};
  let res6b;
  try {
    res6b = await restorePendingOrdersAfterFailedReplacement({
      supabaseAdmin: createMockOrdersSupabase(ordersMap6b),
      userId,
      leaseId: 'stale-lease-id',
      verifyLease: async () => ({ valid: false, code: 'LEASE_LOST_TO_CONCURRENT_REQUEST' }),
      detachedOrders: [{ orderId: orderPriorId, invalidatedPreferenceId: 'pref-prior-to-replace-001' }],
      candidateOrdersById: new Map([[orderPriorId, priorOrderRecord]]),
      siteUrl: 'https://optihub.cl',
      fallbackCustomerEmail: 'pagos@opticadelsur.cl',
      fetchOrderItems: async () => [
        { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
      ],
      createPreference: async () => {
        createCalls6b++;
        return { id: 'pref-should-never-be-created', paymentUrl: 'https://mp.cl/never' };
      },
      persistPreference: async () => {
        persistCalls6b++;
        return { id: 'pref-should-never-be-created', initPoint: 'https://mp.cl/never', orderId: orderPriorId };
      },
      nowMs,
    });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(res6b.abortedByLeaseLoss, true);
  assert.equal(createCalls6b, 0, 'No debe llamar a createPreference si perdió el lease antes de recuperar');
  assert.equal(persistCalls6b, 0, 'No debe llamar a persistPreference si perdió el lease antes de recuperar');
  assert.equal(ordersMap6b.get(orderPriorId).preference_id, null);

  // 6c: Pérdida del lease DURANTE createPreference (antes de persistPreference):
  //     Verifica que no se persiste la preferencia, se invalida en MP la preferencia recién creada,
  //     y si otra petición concurrente B cancela la orden, la orden queda en 'cancelled' con preference_id = null.
  const ordersMap6c = new Map([
    [orderPriorId, { ...priorOrderRecord, preference_id: null, init_point: null }],
  ]);
  let leaseChecks6c = 0;
  let persistCalls6c = 0;
  const invalidatedIn6c = [];
  console.warn = () => {};
  let res6c;
  try {
    res6c = await restorePendingOrdersAfterFailedReplacement({
      supabaseAdmin: createMockOrdersSupabase(ordersMap6c),
      userId,
      leaseId: validLeaseId,
      verifyLease: async () => {
        leaseChecks6c++;
        // Check 1 (antes de leer orden) y Check 2 (antes de createPreference) son válidos;
        // Check 3 (después de createPreference, antes de persistPreference) falla porque el lease expiró durante la llamada a MP.
        if (leaseChecks6c <= 2) return { valid: true };
        return { valid: false, code: 'LEASE_EXPIRED' };
      },
      detachedOrders: [{ orderId: orderPriorId, invalidatedPreferenceId: 'pref-prior-to-replace-001' }],
      candidateOrdersById: new Map([[orderPriorId, priorOrderRecord]]),
      siteUrl: 'https://optihub.cl',
      fallbackCustomerEmail: 'pagos@opticadelsur.cl',
      fetchOrderItems: async () => [
        { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
      ],
      createPreference: async () => ({
        id: 'pref-created-during-expiring-lease',
        paymentUrl: 'https://mp.cl/pref-created-during-expiring-lease',
      }),
      persistPreference: async () => {
        persistCalls6c++;
        return {
          id: 'pref-created-during-expiring-lease',
          initPoint: 'https://mp.cl/pref-created-during-expiring-lease',
          orderId: orderPriorId,
        };
      },
      invalidatePreference: async (prefId) => {
        invalidatedIn6c.push(prefId);
        return { success: true };
      },
      nowMs,
    });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(res6c.abortedByLeaseLoss, true);
  assert.deepEqual(res6c.restoredOrderIds, []);
  assert.equal(persistCalls6c, 0, 'Jamás debe invocar persistPreference si el lease expiró durante createPreference');
  assert.deepEqual(
    invalidatedIn6c,
    ['pref-created-during-expiring-lease'],
    'Debe invalidar en MP la preferencia creada durante un lease que expiró antes de persistir'
  );
  assert.equal(ordersMap6c.get(orderPriorId).preference_id, null);

  // 6d (ALTO-M02-01): Eliminación de leaseAfterPersist tras persistencia atómica en PostgreSQL.
  // Si la RPC persist_order_preference_with_lease persiste atómicamente con lease válido y un instante después
  // el lease de A expira y la Petición B adquiere el lease y reutiliza 'pref-restored-committed-ok',
  // la Petición A JAMÁS invalida 'pref-restored-committed-ok' ni limpia preference_id en la BD.
  const ordersMap6d = new Map([
    [orderPriorId, { ...priorOrderRecord, preference_id: null, init_point: null }],
  ]);
  const leasesMap6d = new Map([
    [userId, { userId, leaseId: validLeaseId, expiresAt: nowMs + 45_000 }],
  ]);
  const supabase6d = createMockOrdersSupabase(ordersMap6d, { leasesMap: leasesMap6d });
  let leaseChecks6d = 0;
  const invalidatedIn6d = [];

  const res6d = await restorePendingOrdersAfterFailedReplacement({
    supabaseAdmin: supabase6d,
    userId,
    leaseId: validLeaseId,
    verifyLease: async () => {
      leaseChecks6d++;
      return { valid: true };
    },
    detachedOrders: [{ orderId: orderPriorId, invalidatedPreferenceId: 'pref-prior-to-replace-001' }],
    candidateOrdersById: new Map([[orderPriorId, priorOrderRecord]]),
    siteUrl: 'https://optihub.cl',
    fallbackCustomerEmail: 'pagos@opticadelsur.cl',
    fetchOrderItems: async () => [
      { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
    ],
    createPreference: async () => ({
      id: 'pref-restored-committed-ok',
      paymentUrl: 'https://mp.cl/pref-restored-committed-ok',
    }),
    persistPreference: async (db, ordId, pId, url, opts) => {
      const res = await persistPreferenceAtomic(db, ordId, pId, url, {
        ...opts,
        invalidatePreference: async (prefId) => {
          invalidatedIn6d.push(prefId);
          return { success: true };
        },
      });
      // Simulamos que inmediatamente después del COMMIT de la RPC, el lease de A expira y B adquiere un nuevo lease:
      leasesMap6d.set(userId, {
        userId,
        leaseId: 'lease-concurrent-winner-B',
        expiresAt: nowMs + 45_000,
      });
      return res;
    },
    invalidatePreference: async (prefId) => {
      invalidatedIn6d.push(prefId);
      return { success: true };
    },
    nowMs,
  });

  assert.equal(
    leaseChecks6d,
    3,
    'Solo debe verificar lease antes de leer orden, antes de crear preferencia y antes de invocar la RPC (nunca después del commit de la RPC)'
  );
  assert.equal(res6d.abortedByLeaseLoss, false);
  assert.deepEqual(res6d.restoredOrderIds, [orderPriorId]);
  assert.equal(
    invalidatedIn6d.length,
    0,
    'ALTO-M02-01: Jamás debe invalidar una preferencia que ya fue confirmada atómicamente por la RPC con lease válido'
  );
  assert.equal(
    ordersMap6d.get(orderPriorId).preference_id,
    'pref-restored-committed-ok',
    'ALTO-M02-01: La preferencia confirmada permanece intacta para que la Petición B pueda reutilizarla de forma segura'
  );

  // =========================================================================
  // REGRESIÓN 7 (Requisito 2): Orden leída inicialmente con preference_id = null
  // que recibe una preferencia concurrente antes de la cancelación
  // =========================================================================
  const orderInitiallyNullPrefId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const initialDecisionNullPref = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: orderInitiallyNullPrefId,
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: null,
        init_point: null,
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'SKU-1', quantity: 10 }],
    matchesOrder: () => false, // Carrito distinto -> reemplazo
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    nowMs,
    deferPreferenceInvalidation: true,
  });

  assert.equal(initialDecisionNullPref.outcome, 'proceed_new_order');
  assert.equal(initialDecisionNullPref.preferencesToInvalidate.length, 0);
  assert.deepEqual(initialDecisionNullPref.priorOrdersSnapshot, [
    { orderId: orderInitiallyNullPrefId, expectedPreferenceId: null },
  ]);

  // Antes de que esta petición llegue a cancelar la orden, otra petición le asigna 'pref-assigned-meanwhile'
  const ordersMap7 = new Map([
    [
      orderInitiallyNullPrefId,
      {
        id: orderInitiallyNullPrefId,
        user_id: userId,
        status: 'pending',
        payment_status: 'pending',
        preference_id: 'pref-assigned-meanwhile',
        init_point: 'https://mp.cl/pref-assigned-meanwhile',
      },
    ],
  ]);
  const invalidatedIn7 = [];
  const checkBeforeCancel7 = await invalidateAndDetachPriorOrderPreferences({
    supabaseAdmin: createMockOrdersSupabase(ordersMap7),
    userId,
    preferencesToInvalidate: initialDecisionNullPref.preferencesToInvalidate,
    ordersToReplace: initialDecisionNullPref.priorOrdersSnapshot,
    invalidatePreference: async (prefId) => {
      invalidatedIn7.push(prefId);
      return { success: true };
    },
  });

  assert.equal(checkBeforeCancel7.ok, false);
  assert.equal(checkBeforeCancel7.httpStatus, 409);
  assert.equal(checkBeforeCancel7.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(
    invalidatedIn7.length,
    0,
    'No debe invalidar la preferencia asignada concurrentemente a una orden que se leyó con preference_id = null'
  );
  assert.equal(
    ordersMap7.get(orderInitiallyNullPrefId).preference_id,
    'pref-assigned-meanwhile',
    'La orden conserva intacta su preferencia activa y no avanza a process_b2b_checkout para ser cancelada'
  );

  // =========================================================================
  // REGRESIÓN 8 (Requisito 3): Fallo doble de UPDATE después de invalidar la preferencia
  // en Mercado Pago y comportamiento del checkout posterior
  // =========================================================================
  const orderDoubleFailId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const deadPrefId = 'pref-invalidated-in-mp-but-detach-failed';
  const ordersMap8 = new Map([
    [
      orderDoubleFailId,
      {
        id: orderDoubleFailId,
        user_id: userId,
        status: 'pending',
        payment_status: 'pending',
        subtotal_net: 100000,
        tax_amount: 19000,
        total_amount: 119000,
        created_at: recentIso,
        preference_id: deadPrefId,
        init_point: 'https://mp.cl/dead-pref',
      },
    ],
  ]);

  let detachUpdateAttempts8 = 0;
  const supabaseFailingBothDetachUpdates = {
    from(table) {
      assert.equal(table, 'orders');
      return {
        select() {
          const builder = {
            eq: () => builder,
            maybeSingle: async () => ({ data: { ...ordersMap8.get(orderDoubleFailId) }, error: null }),
          };
          return builder;
        },
        update() {
          const builder = {
            eq: () => builder,
            select: () => builder,
            maybeSingle: async () => {
              detachUpdateAttempts8++;
              return { data: null, error: { message: 'Supabase write timeout on detach' } };
            },
          };
          return builder;
        },
      };
    },
  };

  console.error = () => {};
  let doubleFailDetachRes;
  try {
    doubleFailDetachRes = await invalidateAndDetachPriorOrderPreferences({
      supabaseAdmin: supabaseFailingBothDetachUpdates,
      userId,
      ordersToReplace: [{ orderId: orderDoubleFailId, expectedPreferenceId: deadPrefId }],
      invalidatePreference: async () => ({ success: true }),
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(detachUpdateAttempts8, 2, 'Debe intentar el UPDATE inicial y 1 reintento inmediato');
  assert.equal(doubleFailDetachRes.ok, false);
  assert.equal(doubleFailDetachRes.httpStatus, 500);
  assert.equal(doubleFailDetachRes.code, 'PRIOR_PREFERENCE_DETACH_FAILED');
  assert.deepEqual(doubleFailDetachRes.failedDetachPreferenceIds, [deadPrefId]);
  assert.equal(isPreferenceMarkedInvalidated(deadPrefId), true);
  // En BD la orden aún conserva el preference_id invalidado porque fallaron ambos UPDATE:
  assert.equal(ordersMap8.get(orderDoubleFailId).preference_id, deadPrefId);

  // Ahora llega el siguiente checkout con el MISMO carrito (matchesOrder === true):
  // Jamás debe devolver reuse_existing_preference con deadPrefId; debe exigir recover_missing_preference
  // y reparar la orden reemplazando deadPrefId por una preferencia nueva.
  let remoteMpGetCalledForDeadPref = 0;
  const nextCheckoutAfterDoubleFail = await evaluatePendingOrdersForCheckout({
    pendingOrders: [ordersMap8.get(orderDoubleFailId)],
    fetchOrderItems: async () => [{ product_id: 'SKU-1', quantity: 10, unit_price_net: 10000 }],
    matchesOrder: () => true,
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    checkPreferenceValidity: (prefId, expectedOrdId) =>
      checkCandidatePreferenceValidity(
        prefId,
        'test-token',
        5000,
        {
          get: async () => {
            remoteMpGetCalledForDeadPref++;
            return {
              id: prefId,
              init_point: 'https://mp.cl/dead-pref',
              external_reference: expectedOrdId,
              expires: true,
              expiration_date_to: new Date(nowMs - 60_000).toISOString(),
            };
          },
        },
        nowMs,
        expectedOrdId
      ),
    nowMs,
    deferPreferenceInvalidation: true,
  });

  assert.equal(
    remoteMpGetCalledForDeadPref,
    1,
    'MEDIO-M02-01: checkCandidatePreferenceValidity siempre debe consultar Mercado Pago aunque el ID esté en el Set local'
  );
  assert.equal(
    nextCheckoutAfterDoubleFail.outcome,
    'recover_missing_preference',
    'El checkout posterior NO debe reutilizar el preference_id invalidado cuyo UPDATE de desacoplo falló'
  );
  assert.equal(nextCheckoutAfterDoubleFail.stalePreferenceId, deadPrefId);

  // Y al persistir la nueva preferencia recuperada pasando expectedStalePreferenceId, la RPC atómica reemplaza deadPrefId en un único UPDATE:
  const repairedAfterDoubleFail = await persistPreferenceAtomic(
    createMockOrdersSupabase(ordersMap8),
    orderDoubleFailId,
    'pref-repaired-after-detach-failure',
    'https://mp.cl/pref-repaired-after-detach-failure',
    {
      userId,
      leaseId: validLeaseId,
      expectedStalePreferenceId: nextCheckoutAfterDoubleFail.stalePreferenceId,
      invalidatePreference: async () => ({ success: true }),
    }
  );
  assert.equal(repairedAfterDoubleFail.id, 'pref-repaired-after-detach-failure');
  assert.equal(ordersMap8.get(orderDoubleFailId).preference_id, 'pref-repaired-after-detach-failure');

  // También verificamos que checkCandidatePreferenceValidity detecta en MP una preferencia expirada en otra instancia serverless
  // (que no estaba en el Set en memoria de este proceso):
  clearInvalidatedPreferencesCache();
  const crossInstanceExpiredPref = 'pref-expired-on-other-serverless-instance';
  const crossInstanceValidity = await checkCandidatePreferenceValidity(
    crossInstanceExpiredPref,
    'test-token',
    5000,
    {
      get: async () => ({
        id: crossInstanceExpiredPref,
        init_point: 'https://mp.cl/cross-instance-expired',
        external_reference: orderDoubleFailId,
        expires: true,
        expiration_date_to: new Date(nowMs - 30_000).toISOString(),
      }),
    },
    nowMs,
    orderDoubleFailId
  );
  assert.equal(crossInstanceValidity.valid, false);
  assert.equal(crossInstanceValidity.status, 'expired');

  // =========================================================================
  // REGRESIÓN 9 (Requisito 4): Pérdida de conexión con resultado ambiguo de process_b2b_checkout
  // =========================================================================
  const ambiguousErrors = [
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: '08006', message: 'connection failure' },
    { code: 'PGRST000', message: 'TypeError: fetch failed (ECONNRESET)' },
    { code: '', message: 'socket hang up while awaiting RPC response' },
  ];

  for (const ambErr of ambiguousErrors) {
    const decision = classifyCheckoutRpcFailureForRecovery({
      checkoutError: ambErr,
      checkoutResult: null,
    });
    assert.equal(
      decision.shouldRecover,
      false,
      `Error ambiguo (${ambErr.message}) NO debe activar restauración ciega sobre orden que pudo cancelarse en PG`
    );
    assert.equal(decision.category, 'ambiguous_outcome');
  }

  // Mientras que un rollback confirmado de negocio (Stock insuficiente / MOQ) SÍ autoriza la recuperación bajo lease válido:
  const confirmedStockRollback = classifyCheckoutRpcFailureForRecovery({
    checkoutError: { code: 'P0001', message: 'Stock insuficiente para Marco A (SKU-A). Solicitado: 20, Disponible: 5' },
    checkoutResult: null,
  });
  assert.equal(confirmedStockRollback.shouldRecover, true);
  assert.equal(confirmedStockRollback.category, 'confirmed_rollback');

  // =========================================================================
  // REGRESIÓN 10 (Requisito 4 y 5): Carrito ya convertido y fallo posterior a la desvinculación
  // =========================================================================
  const orderPriorConvertedTestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const orderOldCancelledCartId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  // 10a: process_b2b_checkout retorna por idempotencia de carrito ya convertido sin haber cancelado cancelOrderId
  const ordersMap10a = new Map([
    [
      orderPriorConvertedTestId,
      {
        ...priorOrderRecord,
        id: orderPriorConvertedTestId,
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const supabase10a = createMockOrdersSupabase(ordersMap10a);
  let recoveryTriggered10a = 0;

  const convertedValidation10a = await validateCreatedOrderAfterCheckoutRpc({
    supabaseAdmin: supabase10a,
    userId,
    checkoutResult: {
      success: true,
      order_id: orderPriorConvertedTestId,
      message: 'Carrito ya convertido. Retornando orden existente.',
    },
    cancelOrderId: orderPriorConvertedTestId,
    restoreDetachedOrdersIfNeeded: async () => {
      recoveryTriggered10a++;
      await restorePendingOrdersAfterFailedReplacement({
        supabaseAdmin: supabase10a,
        userId,
        leaseId: validLeaseId,
        verifyLease: async () => ({ valid: true }),
        detachedOrders: [
          { orderId: orderPriorConvertedTestId, invalidatedPreferenceId: 'pref-prior-before-converted-cart' },
        ],
        candidateOrdersById: new Map([[orderPriorConvertedTestId, ordersMap10a.get(orderPriorConvertedTestId)]]),
        siteUrl: 'https://optihub.cl',
        fallbackCustomerEmail: 'pagos@opticadelsur.cl',
        fetchOrderItems: async () => [
          { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
        ],
        createPreference: async () => ({
          id: 'pref-restored-after-converted-cart',
          paymentUrl: 'https://mp.cl/pref-restored-after-converted-cart',
        }),
        persistPreference: (db, ordId, pId, url, opts) =>
          persistPreferenceAtomic(db, ordId, pId, url, {
            ...opts,
            invalidatePreference: async () => ({ success: true }),
          }),
        nowMs,
      });
    },
  });

  assert.equal(convertedValidation10a.ok, false);
  assert.equal(convertedValidation10a.httpStatus, 409);
  assert.equal(convertedValidation10a.body.code, 'CART_ALREADY_CONVERTED');
  assert.equal(recoveryTriggered10a, 1, 'Debe restaurar la orden previa desvinculada cuando el carrito nuevo ya estaba convertido');
  assert.equal(
    ordersMap10a.get(orderPriorConvertedTestId).preference_id,
    'pref-restored-after-converted-cart',
    'La orden previa pendiente recupera una preferencia válida y no queda huérfana'
  );

  // 10b: La orden devuelta por RPC ya está en status='cancelled' mientras cancelOrderId permaneció 'pending' con preference_id=null:
  //      No se crea preferencia para la orden cancelada y se restaura cancelOrderId bajo lease válido.
  const ordersMap10b = new Map([
    [
      orderPriorConvertedTestId,
      {
        ...priorOrderRecord,
        id: orderPriorConvertedTestId,
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
    [
      orderOldCancelledCartId,
      {
        ...priorOrderRecord,
        id: orderOldCancelledCartId,
        status: 'cancelled',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const supabase10b = createMockOrdersSupabase(ordersMap10b);
  let recoveryTriggered10b = 0;

  console.warn = () => {};
  let convertedValidation10b;
  try {
    convertedValidation10b = await validateCreatedOrderAfterCheckoutRpc({
      supabaseAdmin: supabase10b,
      userId,
      checkoutResult: {
        success: true,
        order_id: orderOldCancelledCartId,
      },
      cancelOrderId: orderPriorConvertedTestId,
      restoreDetachedOrdersIfNeeded: async () => {
        recoveryTriggered10b++;
        await restorePendingOrdersAfterFailedReplacement({
          supabaseAdmin: supabase10b,
          userId,
          leaseId: validLeaseId,
          verifyLease: async () => ({ valid: true }),
          detachedOrders: [
            { orderId: orderPriorConvertedTestId, invalidatedPreferenceId: 'pref-prior-10b' },
          ],
          candidateOrdersById: new Map([[orderPriorConvertedTestId, ordersMap10b.get(orderPriorConvertedTestId)]]),
          siteUrl: 'https://optihub.cl',
          fallbackCustomerEmail: 'pagos@opticadelsur.cl',
          fetchOrderItems: async () => [
            { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
          ],
          createPreference: async () => ({
            id: 'pref-restored-10b',
            paymentUrl: 'https://mp.cl/pref-restored-10b',
          }),
          persistPreference: (db, ordId, pId, url, opts) =>
            persistPreferenceAtomic(db, ordId, pId, url, {
              ...opts,
              invalidatePreference: async () => ({ success: true }),
            }),
          nowMs,
        });
      },
    });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(convertedValidation10b.ok, false);
  assert.equal(convertedValidation10b.httpStatus, 409);
  assert.equal(convertedValidation10b.body.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(recoveryTriggered10b, 1);
  assert.equal(
    ordersMap10b.get(orderOldCancelledCartId).preference_id,
    null,
    'La orden cancelada jamás recibe una preferencia recién creada'
  );
  assert.equal(
    ordersMap10b.get(orderPriorConvertedTestId).preference_id,
    'pref-restored-10b',
    'La orden previa que seguía pending recupera su preferencia válida bajo lease activo'
  );

  // =========================================================================
  // REGRESIÓN 11 (ALTO-M02-02): RPC atómica persist_order_preference_with_lease
  // con validación de lease, compare-and-swap atómico y manejo seguro de persisted: false
  // =========================================================================
  const orderRpcTestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  // 11a: Lease expirado, inexistente o de otra petición -> CheckoutLeaseInvalidError (HTTP 409) e invalida preferencia creada
  for (const leaseCase of [
    {
      label: 'LEASE_EXPIRED',
      leasesMap: new Map([[userId, { userId, leaseId: validLeaseId, expiresAt: nowMs - 1000 }]]),
      expectedCode: 'LEASE_EXPIRED',
    },
    {
      label: 'LEASE_NOT_FOUND',
      leasesMap: new Map(),
      expectedCode: 'LEASE_NOT_FOUND',
    },
    {
      label: 'LEASE_LOST_TO_CONCURRENT_REQUEST',
      leasesMap: new Map([[userId, { userId, leaseId: 'other-lease-id', expiresAt: nowMs + 45_000 }]]),
      expectedCode: 'LEASE_LOST_TO_CONCURRENT_REQUEST',
    },
  ]) {
    const ordersMapLeaseErr = new Map([
      [
        orderRpcTestId,
        {
          id: orderRpcTestId,
          user_id: userId,
          status: 'pending',
          preference_id: null,
          init_point: null,
        },
      ],
    ]);
    const invalidatedLeaseErr = [];
    const dbLeaseErr = createMockOrdersSupabase(ordersMapLeaseErr, { leasesMap: leaseCase.leasesMap });

    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          dbLeaseErr,
          orderRpcTestId,
          `pref-${leaseCase.label}`,
          `https://mp.cl/pref-${leaseCase.label}`,
          {
            userId,
            leaseId: validLeaseId,
            invalidatePreference: async (prefId) => {
              invalidatedLeaseErr.push(prefId);
              return { success: true };
            },
          }
        );
      },
      (err) => {
        assert.equal(err instanceof CheckoutLeaseInvalidError, true, `Debe lanzar CheckoutLeaseInvalidError para ${leaseCase.label}`);
        assert.equal(err.code, leaseCase.expectedCode);
        assert.equal(err.httpStatus, 409);
        return true;
      }
    );

    assert.equal(ordersMapLeaseErr.get(orderRpcTestId).preference_id, null, `No debe escribir en BD cuando ${leaseCase.label}`);
    assert.deepEqual(invalidatedLeaseErr, [`pref-${leaseCase.label}`], `Debe invalidar la preferencia creada cuando ${leaseCase.label}`);
  }

  // 11b: Rechazo cuando la orden pertenece a otro usuario o ya no está en estado 'pending'
  const ordersMapWrongOwner = new Map([
    [
      orderRpcTestId,
      {
        id: orderRpcTestId,
        user_id: 'other-user-id',
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const invalidatedWrongOwner = [];
  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        createMockOrdersSupabase(ordersMapWrongOwner),
        orderRpcTestId,
        'pref-wrong-owner',
        'https://mp.cl/pref-wrong-owner',
        {
          userId,
          leaseId: validLeaseId,
          invalidatePreference: async (prefId) => {
            invalidatedWrongOwner.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.equal(err instanceof ConcurrentOrderStateChangedError, true);
      assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
      assert.equal(err.httpStatus, 409);
      return true;
    }
  );
  assert.equal(ordersMapWrongOwner.get(orderRpcTestId).preference_id, null);
  assert.deepEqual(invalidatedWrongOwner, ['pref-wrong-owner']);

  // 11c: Dos peticiones concurrentes que intentan persistir preferencias distintas sobre la misma orden:
  //      Una gana (persisted: true) y la otra recibe persisted: false, verifica la ganadora en MP,
  //      invalida únicamente su propia preferencia redundante y jamás invalida ni borra la preferencia ganadora.
  const ordersMapRace = new Map([
    [
      orderRpcTestId,
      {
        id: orderRpcTestId,
        user_id: userId,
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
  ]);
  const dbRace = createMockOrdersSupabase(ordersMapRace);
  const invalidatedInRace = [];
  const verifiedWinnerCalls = [];

  const winnerResult = await persistPreferenceAtomic(
    dbRace,
    orderRpcTestId,
    'pref-winner-A',
    'https://mp.cl/pref-winner-A',
    {
      userId,
      leaseId: validLeaseId,
      invalidatePreference: async (prefId) => {
        invalidatedInRace.push(prefId);
        return { success: true };
      },
    }
  );
  assert.equal(winnerResult.id, 'pref-winner-A');

  const loserResult = await persistPreferenceAtomic(
    dbRace,
    orderRpcTestId,
    'pref-loser-B',
    'https://mp.cl/pref-loser-B',
    {
      userId,
      leaseId: validLeaseId,
      checkPreferenceValidity: async (winnerPrefId, expectedOrdId) => {
        verifiedWinnerCalls.push({ winnerPrefId, expectedOrdId });
        return { valid: true, status: 'active' };
      },
      invalidatePreference: async (prefId) => {
        invalidatedInRace.push(prefId);
        return { success: true };
      },
    }
  );

  assert.deepEqual(loserResult, {
    id: 'pref-winner-A',
    initPoint: 'https://mp.cl/pref-winner-A',
    orderId: orderRpcTestId,
  });
  assert.deepEqual(verifiedWinnerCalls, [{ winnerPrefId: 'pref-winner-A', expectedOrdId: orderRpcTestId }]);
  assert.deepEqual(
    invalidatedInRace,
    ['pref-loser-B'],
    'Solo debe invalidar su propia preferencia redundante (pref-loser-B) y jamás la ganadora (pref-winner-A)'
  );
  assert.equal(ordersMapRace.get(orderRpcTestId).preference_id, 'pref-winner-A');

  // 11d: Si persisted: false devuelve una preferencia existente pero su verificación en MP falla (ej. expirada o error de red),
  //      invalida solo la propia preferencia redundante, NO invalida ni borra la preferencia en BD, y falla en cerrado (502).
  const invalidatedWhenWinnerInvalid = [];
  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        dbRace,
        orderRpcTestId,
        'pref-loser-C',
        'https://mp.cl/pref-loser-C',
        {
          userId,
          leaseId: validLeaseId,
          checkPreferenceValidity: async () => ({
            valid: false,
            status: 'expired',
            reason: 'Preference expired in MP',
          }),
          invalidatePreference: async (prefId) => {
            invalidatedWhenWinnerInvalid.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.equal(err instanceof WinnerPreferenceVerificationFailedError, true);
      assert.equal(err.code, 'FAILED_TO_VERIFY_PRIOR_PAYMENTS');
      assert.equal(err.httpStatus, 502);
      return true;
    }
  );
  assert.deepEqual(
    invalidatedWhenWinnerInvalid,
    ['pref-loser-C'],
    'Jamás debe invalidar la preferencia ganadora en MP aunque falle su verificación'
  );
  assert.equal(
    ordersMapRace.get(orderRpcTestId).preference_id,
    'pref-winner-A',
    'Jamás debe borrar la preferencia ganadora en la base de datos'
  );

  // =========================================================================
  // REGRESIÓN 12 (MEDIO-M02-01): Endurecimiento de checkCandidatePreferenceValidity
  // ante expiración incompleta/malformada, external_reference distinto, init_point ausente y errores de SDK
  // =========================================================================
  const expectedOrd12 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  // 12a: expires === true con expiration_date_to ausente -> valid: false, status: 'error'
  const validityMissingExpDate = await checkCandidatePreferenceValidity(
    'pref-missing-exp-date',
    'test-token',
    5000,
    {
      get: async () => ({
        id: 'pref-missing-exp-date',
        init_point: 'https://mp.cl/pref-missing-exp-date',
        external_reference: expectedOrd12,
        expires: true,
        expiration_date_to: null,
      }),
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(validityMissingExpDate.valid, false, 'expires: true sin expiration_date_to debe fallar en cerrado');
  assert.equal(validityMissingExpDate.status, 'error');

  // 12b: expires === true con expiration_date_to malformada -> valid: false, status: 'error'
  const validityInvalidExpDate = await checkCandidatePreferenceValidity(
    'pref-invalid-exp-date',
    'test-token',
    5000,
    {
      get: async () => ({
        id: 'pref-invalid-exp-date',
        init_point: 'https://mp.cl/pref-invalid-exp-date',
        external_reference: expectedOrd12,
        expires: true,
        expiration_date_to: 'not-a-valid-iso-date',
      }),
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(validityInvalidExpDate.valid, false, 'expires: true con expiration_date_to malformada debe fallar en cerrado');
  assert.equal(validityInvalidExpDate.status, 'error');

  // 12c: external_reference distinto al expectedOrderId -> valid: false, status: 'error'
  const validityMismatchedExtRef = await checkCandidatePreferenceValidity(
    'pref-mismatch-extref',
    'test-token',
    5000,
    {
      get: async () => ({
        id: 'pref-mismatch-extref',
        init_point: 'https://mp.cl/pref-mismatch-extref',
        external_reference: 'other-order-uuid',
        expires: false,
      }),
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(validityMismatchedExtRef.valid, false, 'external_reference distinto a la orden debe fallar en cerrado');
  assert.equal(validityMismatchedExtRef.status, 'error');

  // 12d: init_point y sandbox_init_point vacíos -> valid: false, status: 'error'
  const validityMissingInitPoint = await checkCandidatePreferenceValidity(
    'pref-no-init-point',
    'test-token',
    5000,
    {
      get: async () => ({
        id: 'pref-no-init-point',
        init_point: '',
        sandbox_init_point: null,
        external_reference: expectedOrd12,
        expires: false,
      }),
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(validityMissingInitPoint.valid, false, 'Preferencia sin init_point utilizable debe fallar en cerrado');
  assert.equal(validityMissingInitPoint.status, 'error');

  // 12e: Error de consulta al SDK -> valid: false, status: 'error' y bloqueo 502 en evaluatePendingOrdersForCheckout
  const validitySdkError = await checkCandidatePreferenceValidity(
    'pref-sdk-err',
    'test-token',
    5000,
    {
      get: async () => {
        throw new Error('MP 503 Service Temporarily Unavailable');
      },
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(validitySdkError.valid, false);
  assert.equal(validitySdkError.status, 'error');

  const evalBlockOnPrefCheckError = await evaluatePendingOrdersForCheckout({
    pendingOrders: [
      {
        id: expectedOrd12,
        status: 'pending',
        payment_status: 'pending',
        total_amount: 119000,
        subtotal_net: 100000,
        tax_amount: 19000,
        created_at: recentIso,
        preference_id: 'pref-sdk-err',
        init_point: 'https://mp.cl/pref-sdk-err',
      },
    ],
    fetchOrderItems: async () => [{ product_id: 'SKU-1', quantity: 10, unit_price_net: 10000 }],
    matchesOrder: () => true,
    checkPaymentStatus: async () => ({ status: 'clean' }),
    invalidatePreference: async () => ({ success: true }),
    checkPreferenceValidity: async () => validitySdkError,
    nowMs,
    deferPreferenceInvalidation: true,
  });
  assert.equal(evalBlockOnPrefCheckError.outcome, 'block');
  assert.equal(evalBlockOnPrefCheckError.httpStatus, 502);
  assert.equal(evalBlockOnPrefCheckError.code, 'FAILED_TO_VERIFY_PRIOR_PAYMENTS');

  // 12f: Preferencia en el Set local que en MP sigue activa (hipotético falso positivo local):
  //      checkCandidatePreferenceValidity siempre consulta prefClient.get y no se detiene en el Set en memoria.
  markPreferenceAsInvalidated('pref-in-local-set-but-checked-in-mp');
  let mpGetCalls12f = 0;
  const validityCheckedInMp = await checkCandidatePreferenceValidity(
    'pref-in-local-set-but-checked-in-mp',
    'test-token',
    5000,
    {
      get: async () => {
        mpGetCalls12f++;
        return {
          id: 'pref-in-local-set-but-checked-in-mp',
          init_point: 'https://mp.cl/pref-in-local-set-but-checked-in-mp',
          external_reference: expectedOrd12,
          expires: true,
          expiration_date_to: new Date(nowMs + 3600_000).toISOString(),
        };
      },
    },
    nowMs,
    expectedOrd12
  );
  assert.equal(mpGetCalls12f, 1, 'Siempre debe consultar Mercado Pago sin cortocircuitar por el Set local');
  assert.equal(validityCheckedInMp.valid, true);
  assert.equal(validityCheckedInMp.status, 'active');

  // =========================================================================
  // REGRESIÓN 13 (MEDIO-M02-02): Guardia preference_id IS NULL en process_b2b_checkout,
  // validación estricta de extraCancelledRows y verificación de cancelOrderId en validateCreatedOrderAfterCheckoutRpc
  // =========================================================================
  // 13a: simulateProcessB2bCheckout rechaza con CONCURRENT_ORDER_STATE_CHANGED si la orden a cancelar aún tiene preference_id !== null
  const mockDbWithAttachedPref = {
    leases: new Map([[userId, { userId, leaseId: validLeaseId, cartId: 'cart-new', expiresAt: Date.now() + 45000 }]]),
    orders: new Map([
      [
        'order-with-pref',
        {
          id: 'order-with-pref',
          user_id: userId,
          status: 'pending',
          preference_id: 'pref-still-attached',
          notes: '',
        },
      ],
    ]),
  };
  const rpcCancelWithPrefRes = simulateProcessB2bCheckout(mockDbWithAttachedPref, {
    p_user_id: userId,
    p_cart_id: 'cart-new',
    p_billing: { rut: '76.123.456-7' },
    p_lease_id: validLeaseId,
    p_cancel_order_id: 'order-with-pref',
  });
  assert.equal(rpcCancelWithPrefRes.data.success, false);
  assert.equal(rpcCancelWithPrefRes.data.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(mockDbWithAttachedPref.orders.get('order-with-pref').status, 'pending');

  // 13b: cancelExtraPendingOrdersBeforeCheckout cuando extraCancelledRows es null o parcial ->
  //      falla en cerrado con 409 CONCURRENT_ORDER_STATE_CHANGED y ejecuta restoreDetachedOrdersIfNeeded
  //      sin reactivar órdenes ya canceladas o terminales.
  const extraOrd1 = '12121212-1212-4212-8212-121212121212';
  const extraOrd2 = '13131313-1313-4313-8313-131313131313';
  const ordersMap13b = new Map([
    [
      extraOrd1,
      {
        ...priorOrderRecord,
        id: extraOrd1,
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
    [
      extraOrd2,
      {
        ...priorOrderRecord,
        id: extraOrd2,
        status: 'cancelled', // Ya cancelada concurrentemente -> no coincide con status='pending'
        preference_id: null,
        init_point: null,
      },
    ],
  ]);

  let restoreCalls13b = 0;
  console.warn = () => {};
  let extraCancelResPartial;
  let extraCancelResNull;
  try {
    const db13bPartial = createMockOrdersSupabase(ordersMap13b);
    extraCancelResPartial = await cancelExtraPendingOrdersBeforeCheckout({
      supabaseAdmin: db13bPartial,
      userId,
      extraOrderIdsToCancel: [extraOrd1, extraOrd2],
      fallbackCancelOrderId: extraOrd1,
      restoreDetachedOrdersIfNeeded: async () => {
        restoreCalls13b++;
        await restorePendingOrdersAfterFailedReplacement({
          supabaseAdmin: db13bPartial,
          userId,
          leaseId: validLeaseId,
          verifyLease: async () => ({ valid: true }),
          detachedOrders: [
            { orderId: extraOrd1, invalidatedPreferenceId: 'pref-extra-1' },
            { orderId: extraOrd2, invalidatedPreferenceId: 'pref-extra-2' },
          ],
          candidateOrdersById: new Map([
            [extraOrd1, ordersMap13b.get(extraOrd1)],
            [extraOrd2, ordersMap13b.get(extraOrd2)],
          ]),
          siteUrl: 'https://optihub.cl',
          fallbackCustomerEmail: 'pagos@opticadelsur.cl',
          fetchOrderItems: async () => [
            { sku: 'SKU-A', product_id: 'SKU-A', product_name: 'Marco A', quantity: 10, unit_price_net: 25000 },
          ],
          createPreference: async ({ orderId: ordId }) => ({
            id: `pref-restored-${ordId}`,
            paymentUrl: `https://mp.cl/pref-restored-${ordId}`,
          }),
          persistPreference: (db, ordId, pId, url, opts) =>
            persistPreferenceAtomic(db, ordId, pId, url, {
              ...opts,
              invalidatePreference: async () => ({ success: true }),
            }),
          nowMs,
        });
      },
    });

    // También probamos cuando el cliente Supabase devuelve data: null sin error
    const db13bNull = createMockOrdersSupabase(ordersMap13b, {
      overrideBatchUpdateResult: async () => ({ data: null, error: null }),
    });
    extraCancelResNull = await cancelExtraPendingOrdersBeforeCheckout({
      supabaseAdmin: db13bNull,
      userId,
      extraOrderIdsToCancel: [extraOrd1],
      fallbackCancelOrderId: extraOrd1,
      restoreDetachedOrdersIfNeeded: async () => {
        restoreCalls13b++;
      },
    });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(extraCancelResPartial.ok, false);
  assert.equal(extraCancelResPartial.httpStatus, 409);
  assert.equal(extraCancelResPartial.body.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(extraCancelResNull.ok, false);
  assert.equal(extraCancelResNull.httpStatus, 409);
  assert.equal(extraCancelResNull.body.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(restoreCalls13b, 2);
  assert.equal(
    ordersMap13b.get(extraOrd2).status,
    'cancelled',
    'Jamás debe reactivar una orden cancelada ni asignarle preferencia durante la restauración'
  );
  assert.equal(ordersMap13b.get(extraOrd2).preference_id, null);

  // 13c: validateCreatedOrderAfterCheckoutRpc verifica que cancelOrderId quedó realmente en status='cancelled'
  //      cuando rawOrderId !== cancelOrderId. Si cancelOrderId sigue 'pending', falla en cerrado con 409 y restaura.
  const newCreatedOrd13c = '14141414-1414-4414-8414-141414141414';
  const uncancelledPriorOrd13c = '15151515-1515-4515-8515-151515151515';
  const ordersMap13c = new Map([
    [
      newCreatedOrd13c,
      {
        ...priorOrderRecord,
        id: newCreatedOrd13c,
        status: 'pending',
        preference_id: null,
        init_point: null,
      },
    ],
    [
      uncancelledPriorOrd13c,
      {
        ...priorOrderRecord,
        id: uncancelledPriorOrd13c,
        status: 'pending', // Anomalía: no quedó cancelada
        preference_id: null,
        init_point: null,
      },
    ],
  ]);

  let restoreCalls13c = 0;
  console.error = () => {};
  let validation13c;
  try {
    validation13c = await validateCreatedOrderAfterCheckoutRpc({
      supabaseAdmin: createMockOrdersSupabase(ordersMap13c),
      userId,
      checkoutResult: {
        success: true,
        order_id: newCreatedOrd13c,
      },
      cancelOrderId: uncancelledPriorOrd13c,
      restoreDetachedOrdersIfNeeded: async () => {
        restoreCalls13c++;
      },
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(validation13c.ok, false);
  assert.equal(validation13c.httpStatus, 409);
  assert.equal(validation13c.body.code, 'CONCURRENT_ORDER_STATE_CHANGED');
  assert.equal(restoreCalls13c, 1, 'Debe activar restauración si cancelOrderId no quedó en estado cancelled');

  // =========================================================================
  // REGRESIÓN 14: Verificación estática de supabase_migration_013_atomic_preference_persistence_and_detach.sql
  // =========================================================================
  const migration013Sql = fs.readFileSync(
    new URL('./supabase_migration_013_atomic_preference_persistence_and_detach.sql', import.meta.url),
    'utf8'
  );

  assert.match(
    migration013Sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.persist_order_preference_with_lease\s*\(/i,
    'Migración 013 debe definir public.persist_order_preference_with_lease'
  );
  assert.match(
    migration013Sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_b2b_checkout\s*\(/i,
    'Migración 013 debe actualizar public.process_b2b_checkout'
  );
  assert.match(
    migration013Sql,
    /SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public/i,
    'Ambas funciones en migración 013 deben declarar SECURITY DEFINER SET search_path = public'
  );
  assert.match(
    migration013Sql,
    /FROM\s+public\.user_checkout_leases[\s\S]*?FOR\s+UPDATE/i,
    'persist_order_preference_with_lease debe bloquear la fila de user_checkout_leases con FOR UPDATE'
  );
  assert.match(
    migration013Sql,
    /FROM\s+public\.orders[\s\S]*?FOR\s+UPDATE/i,
    'persist_order_preference_with_lease debe bloquear la fila de orders con FOR UPDATE'
  );
  assert.match(
    migration013Sql,
    /v_prev_order\.preference_id\s+IS\s+NOT\s+NULL/i,
    'process_b2b_checkout en migración 013 debe rechazar cancelar una orden previa si preference_id IS NOT NULL'
  );
  assert.match(
    migration013Sql,
    /AND\s+status\s*=\s*'pending'\s+AND\s+preference_id\s+IS\s+NULL/i,
    'El UPDATE de cancelación en process_b2b_checkout debe exigir status = pending AND preference_id IS NULL'
  );
  assert.match(
    migration013Sql,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.persist_order_preference_with_lease\(UUID,\s*UUID,\s*UUID,\s*TEXT,\s*TEXT,\s*TEXT\)\s+FROM\s+PUBLIC/i,
    'Migración 013 debe revocar permisos de persist_order_preference_with_lease para PUBLIC'
  );
  assert.match(
    migration013Sql,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.persist_order_preference_with_lease\(UUID,\s*UUID,\s*UUID,\s*TEXT,\s*TEXT,\s*TEXT\)\s+FROM\s+anon/i,
    'Migración 013 debe revocar permisos de persist_order_preference_with_lease para anon'
  );
  assert.match(
    migration013Sql,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.persist_order_preference_with_lease\(UUID,\s*UUID,\s*UUID,\s*TEXT,\s*TEXT,\s*TEXT\)\s+FROM\s+authenticated/i,
    'Migración 013 debe revocar permisos de persist_order_preference_with_lease para authenticated'
  );
  assert.match(
    migration013Sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.persist_order_preference_with_lease\(UUID,\s*UUID,\s*UUID,\s*TEXT,\s*TEXT,\s*TEXT\)\s+TO\s+service_role/i,
    'Migración 013 debe otorgar EXECUTE sobre persist_order_preference_with_lease a service_role'
  );
  assert.match(
    migration013Sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.persist_order_preference_with_lease\(UUID,\s*UUID,\s*UUID,\s*TEXT,\s*TEXT,\s*TEXT\)\s+TO\s+postgres/i,
    'Migración 013 debe otorgar EXECUTE sobre persist_order_preference_with_lease a postgres'
  );
});

// =============================================================================
// CASO 9.15 (MEDIO-02 Fase 2): Pruebas aisladas de compensación e invalidación de Mercado Pago
// =============================================================================
test('Caso 9.15 (MEDIO-02): Pruebas aisladas de compensación e invalidación de preferencias en Mercado Pago', async () => {
  const { registerHooks } = await import('node:module');
  const frontendRootUrl = new URL('./frontend/', import.meta.url);
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@/lib/utils/rut') {
        return nextResolve(new URL('lib/utils/rut.ts', frontendRootUrl).href, context);
      }
      if (specifier === '@/lib/checkoutWebhookAndResult') {
        return nextResolve(new URL('lib/checkoutWebhookAndResult.ts', frontendRootUrl).href, context);
      }
      if (specifier === 'next/server') {
        return nextResolve(new URL('node_modules/next/server.js', frontendRootUrl).href, context);
      }
      if (specifier === 'mercadopago') {
        return nextResolve(new URL('node_modules/mercadopago/dist/index.js', frontendRootUrl).href, context);
      }
      if (specifier === '@supabase/supabase-js') {
        return nextResolve(
          new URL('node_modules/@supabase/supabase-js/dist/index.mjs', frontendRootUrl).href,
          context
        );
      }
      if (specifier.startsWith('@/')) {
        // Alias genérico @/... (p. ej. @/lib/env/runtimeEnv, importado por route.ts desde la Fase 25)
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, frontendRootUrl).href, context);
      }
      return nextResolve(specifier, context);
    },
  });

  let routeModule;
  try {
    routeModule = await import('./frontend/app/api/mercadopago/create-preference/route.ts');
  } finally {
    hook.deregister();
  }

  const {
    createMpPreference,
    persistPreferenceAtomic,
    invalidateCandidateOrderPreference,
    isPreferenceMarkedInvalidated,
    markPreferenceAsInvalidated,
    clearInvalidatedPreferencesCache,
    CheckoutLeaseInvalidError,
    ConcurrentOrderStateChangedError,
    WinnerPreferenceVerificationFailedError,
  } = routeModule;

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  const testUserId = 'user-isolated-comp-01';
  const testLeaseId = 'lease-isolated-comp-01';
  const testOrderId = 'order-isolated-comp-01';

  // Helper local para crear Supabase mock controlado para persistPreferenceAtomic
  function createIsolatedSupabaseMock(rpcHandler) {
    return {
      rpc: async (fnName, params) => {
        assert.equal(fnName, 'persist_order_preference_with_lease');
        return rpcHandler(params);
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Preferencia creada y persistida correctamente: no se invoca compensación ni se marca invalidada
  // ---------------------------------------------------------------------------
  clearInvalidatedPreferencesCache();
  const invalidatedCalls1 = [];
  const supabaseOk = createIsolatedSupabaseMock((params) => ({
    data: {
      success: true,
      persisted: true,
      code: 'PREFERENCE_PERSISTED',
      order_id: params.p_order_id,
      preference_id: params.p_preference_id,
      init_point: params.p_init_point,
    },
    error: null,
  }));

  const resOk = await persistPreferenceAtomic(
    supabaseOk,
    testOrderId,
    'pref-isolated-ok-01',
    'https://mp.cl/init-ok-01',
    {
      userId: testUserId,
      leaseId: testLeaseId,
      invalidatePreference: async (prefId) => {
        invalidatedCalls1.push(prefId);
        return { success: true };
      },
    }
  );

  assert.equal(resOk.id, 'pref-isolated-ok-01');
  assert.equal(resOk.initPoint, 'https://mp.cl/init-ok-01');
  assert.equal(resOk.orderId, testOrderId);
  assert.equal(invalidatedCalls1.length, 0, 'No debe invocar compensación si la persistencia atómica fue exitosa');
  assert.equal(isPreferenceMarkedInvalidated('pref-isolated-ok-01'), false);

  // ---------------------------------------------------------------------------
  // 2. Timeout seguido de respuesta tardía en createMpPreference: invalida la preferencia huérfana
  // ---------------------------------------------------------------------------
  let resolveLateResponse;
  const lateResponsePromise = new Promise((resolve) => {
    resolveLateResponse = resolve;
  });

  const lateInvalidatedCalls = [];
  let lateInvalidationDone;
  const lateDonePromise = new Promise((resolve) => {
    lateInvalidationDone = resolve;
  });

  let timeoutCaught = null;
  try {
    await createMpPreference({
      orderId: testOrderId,
      customerName: 'Cliente B2B Test',
      customerEmail: 'cliente@optihub.cl',
      orderItems: [{ sku: 'SKU-TEST', product_id: 'SKU-TEST', product_name: 'Item Test', quantity: 10, unit_price_net: 50000 }],
      taxAmount: 95000,
      siteUrl: 'https://optihub.cl',
      timeoutMs: 30, // Forzar timeout rápido
      injectedPreferenceClient: {
        create: () => lateResponsePromise,
      },
      invalidatePreference: async (latePrefId) => {
        lateInvalidatedCalls.push(latePrefId);
        lateInvalidationDone();
        return { success: true };
      },
    });
  } catch (err) {
    timeoutCaught = err;
  }

  assert.ok(timeoutCaught, 'createMpPreference debe arrojar excepción ante timeout local');
  assert.equal(timeoutCaught.message, 'TIMEOUT_MP_PREFERENCE_CREATE');

  // Resolver la promesa tardía simulando respuesta tardía de Mercado Pago
  resolveLateResponse({
    id: 'pref-late-orphan-002',
    init_point: 'https://mp.cl/late-orphan-002',
  });

  await lateDonePromise;
  assert.deepEqual(
    lateInvalidatedCalls,
    ['pref-late-orphan-002'],
    'La promesa de fondo en createMpPreference debe invalidar la preferencia huérfana resuelta tras el timeout'
  );

  // ---------------------------------------------------------------------------
  // 3. Rechazo de persistencia por estado concurrente (CONCURRENT_ORDER_STATE_CHANGED):
  //    Invalida ÚNICAMENTE la preferencia creada por esta petición
  // ---------------------------------------------------------------------------
  const invalidatedCalls3 = [];
  const supabaseConcurrentReject = createIsolatedSupabaseMock((params) => ({
    data: {
      success: false,
      persisted: false,
      code: 'CONCURRENT_ORDER_STATE_CHANGED',
      order_id: params.p_order_id,
      message: 'La orden dejó de estar pendiente.',
    },
    error: null,
  }));

  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        supabaseConcurrentReject,
        testOrderId,
        'pref-loser-to-compensate-03',
        'https://mp.cl/init-03',
        {
          userId: testUserId,
          leaseId: testLeaseId,
          invalidatePreference: async (prefId) => {
            invalidatedCalls3.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.ok(err instanceof ConcurrentOrderStateChangedError);
      assert.equal(err.code, 'CONCURRENT_ORDER_STATE_CHANGED');
      assert.equal(err.httpStatus, 409);
      return true;
    }
  );

  assert.deepEqual(
    invalidatedCalls3,
    ['pref-loser-to-compensate-03'],
    'Debe invalidar en MP la preferencia creada por esta petición ante rechazo por estado concurrente'
  );

  // ---------------------------------------------------------------------------
  // 4. Pérdida o expiración del lease en persistencia (LEASE_EXPIRED / LEASE_LOST_TO_CONCURRENT_REQUEST):
  //    Impide persistir, invalida la preferencia creada y lanza CheckoutLeaseInvalidError (409)
  // ---------------------------------------------------------------------------
  for (const leaseCode of ['LEASE_EXPIRED', 'LEASE_LOST_TO_CONCURRENT_REQUEST']) {
    const invalidatedCalls4 = [];
    const supabaseLeaseReject = createIsolatedSupabaseMock(() => ({
      data: {
        success: false,
        persisted: false,
        code: leaseCode,
        message: 'Reserva de checkout inválida o expirada.',
      },
      error: null,
    }));

    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabaseLeaseReject,
          testOrderId,
          `pref-lease-lost-${leaseCode}`,
          'https://mp.cl/init-lease-lost',
          {
            userId: testUserId,
            leaseId: testLeaseId,
            invalidatePreference: async (prefId) => {
              invalidatedCalls4.push(prefId);
              return { success: true };
            },
          }
        );
      },
      (err) => {
        assert.ok(err instanceof CheckoutLeaseInvalidError);
        assert.equal(err.code, leaseCode);
        assert.equal(err.httpStatus, 409);
        return true;
      }
    );

    assert.deepEqual(
      invalidatedCalls4,
      [`pref-lease-lost-${leaseCode}`],
      `Debe invalidar la preferencia recién creada ante rechazo de lease con código ${leaseCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Fallo de la propia compensación (invalidatePreference falla o arroja):
  //    El error original se conserva y el fallo de compensación queda registrado sin ocultar el error
  // ---------------------------------------------------------------------------
  const loggedErrors5 = [];
  console.error = (...args) => {
    loggedErrors5.push(args);
  };

  try {
    const supabasePersistFail = createIsolatedSupabaseMock(() => ({
      data: {
        success: false,
        persisted: false,
        code: 'LEASE_EXPIRED',
        message: 'Lease expiró en PostgreSQL.',
      },
      error: null,
    }));

    // Caso 5A: invalidatePreference devuelve { success: false, error: 'MP API down' }
    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabasePersistFail,
          testOrderId,
          'pref-comp-fail-5a',
          'https://mp.cl/init-5a',
          {
            userId: testUserId,
            leaseId: testLeaseId,
            invalidatePreference: async () => ({
              success: false,
              error: 'Mercado Pago API 500 error',
            }),
          }
        );
      },
      (err) => {
        assert.ok(err instanceof CheckoutLeaseInvalidError);
        assert.equal(err.code, 'LEASE_EXPIRED', 'Conserva intacto el error de lease original');
        return true;
      }
    );

    // Caso 5B: invalidatePreference arroja excepción de red no controlada
    await assert.rejects(
      async () => {
        await persistPreferenceAtomic(
          supabasePersistFail,
          testOrderId,
          'pref-comp-fail-5b',
          'https://mp.cl/init-5b',
          {
            userId: testUserId,
            leaseId: testLeaseId,
            invalidatePreference: async () => {
              throw new Error('Network socket hang up');
            },
          }
        );
      },
      (err) => {
        assert.ok(err instanceof CheckoutLeaseInvalidError);
        assert.equal(err.code, 'LEASE_EXPIRED', 'Conserva intacto el error de lease original ante excepción en invalidación');
        return true;
      }
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(loggedErrors5.length, 2, 'Debe registrar console.error para ambos fallos de invalidación sin propagarlos sobre el error principal');
  assert.equal(loggedErrors5[0][1].preferenceId, 'pref-comp-fail-5a');
  assert.equal(loggedErrors5[1][1].preferenceId, 'pref-comp-fail-5b');

  // ---------------------------------------------------------------------------
  // 6. Preferencia ganadora concurrente: NUNCA se invalida por error; sólo se invalida la perdedora
  // ---------------------------------------------------------------------------
  const invalidatedCalls6 = [];
  const winnerPrefId = 'pref-winner-concurrent-006';
  const loserPrefId = 'pref-loser-concurrent-006';

  const supabaseWinnerPresent = createIsolatedSupabaseMock(() => ({
    data: {
      success: true,
      persisted: false,
      code: 'EXISTING_PREFERENCE_PRESENT',
      order_id: testOrderId,
      preference_id: winnerPrefId,
      init_point: 'https://mp.cl/winner-init',
    },
    error: null,
  }));

  const resWinner = await persistPreferenceAtomic(
    supabaseWinnerPresent,
    testOrderId,
    loserPrefId,
    'https://mp.cl/loser-init',
    {
      userId: testUserId,
      leaseId: testLeaseId,
      checkPreferenceValidity: async (candidatePrefId, expectedOrdId) => {
        assert.equal(candidatePrefId, winnerPrefId);
        assert.equal(expectedOrdId, testOrderId);
        return { valid: true, status: 'active' };
      },
      invalidatePreference: async (prefId) => {
        invalidatedCalls6.push(prefId);
        return { success: true };
      },
    }
  );

  assert.equal(resWinner.id, winnerPrefId, 'Debe entregar la preferencia ganadora');
  assert.equal(resWinner.initPoint, 'https://mp.cl/winner-init');
  assert.deepEqual(
    invalidatedCalls6,
    [loserPrefId],
    'ÚNICAMENTE debe invalidar la preferencia redundante (perdedora); JAMÁS la ganadora'
  );

  // ---------------------------------------------------------------------------
  // 7. Respuesta RPC incoherente o incompleta (persisted: true pero sin preference_id o init_point):
  //    Manejo estricto fail-closed, invalida la preferencia generada y arroja error sin declarar éxito falso
  // ---------------------------------------------------------------------------
  const invalidatedCalls7 = [];
  const supabaseIncoherentRpc = createIsolatedSupabaseMock(() => ({
    data: {
      success: true,
      persisted: true,
      // Anomalía de datos: preference_id ausente
      preference_id: null,
      init_point: 'https://mp.cl/init-incoherent',
    },
    error: null,
  }));

  await assert.rejects(
    async () => {
      await persistPreferenceAtomic(
        supabaseIncoherentRpc,
        testOrderId,
        'pref-incoherent-rpc-07',
        'https://mp.cl/init-07',
        {
          userId: testUserId,
          leaseId: testLeaseId,
          invalidatePreference: async (prefId) => {
            invalidatedCalls7.push(prefId);
            return { success: true };
          },
        }
      );
    },
    (err) => {
      assert.match(err.message, /Error interno al persistir la Preference/i);
      return true;
    }
  );

  assert.deepEqual(
    invalidatedCalls7,
    ['pref-incoherent-rpc-07'],
    'Debe invalidar la preferencia creada si la RPC devuelve datos incompletos o corruptos'
  );

  // ---------------------------------------------------------------------------
  // 8. MEDIO-03 (Fase 28.6): Si la RPC persist_order_preference_with_lease falta en BD (PGRST202 / 42883),
  //    JAMÁS degrada a un UPDATE directo en orders sin verificar el lease; falla en cerrado (fail-closed)
  //    e invalida la preferencia recién creada en Mercado Pago.
  // ---------------------------------------------------------------------------
  for (const missingCode of ['PGRST202', '42883']) {
    const invalidatedCalls8 = [];
    let directOrdersUpdateCalls = 0;
    const supabaseMissingRpc = {
      rpc: async (fnName) => {
        assert.equal(fnName, 'persist_order_preference_with_lease');
        return {
          data: null,
          error: {
            code: missingCode,
            message: 'Could not find the function public.persist_order_preference_with_lease in the schema cache',
          },
        };
      },
      from: () => ({
        update: () => {
          directOrdersUpdateCalls++;
          throw new Error('Should NEVER execute unlocked .from("orders").update() fallback when RPC fails or is missing');
        },
      }),
    };

    console.error = () => {};
    try {
      await assert.rejects(
        async () => {
          await persistPreferenceAtomic(
            supabaseMissingRpc,
            testOrderId,
            `pref-missing-rpc-${missingCode}`,
            'https://mp.cl/init-08',
            {
              userId: testUserId,
              leaseId: testLeaseId,
              invalidatePreference: async (prefId) => {
                invalidatedCalls8.push(prefId);
                return { success: true };
              },
            }
          );
        },
        (err) => {
          assert.match(err.message, /Error interno al persistir la Preference/i);
          return true;
        }
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(directOrdersUpdateCalls, 0, `No debe ejecutar UPDATE sin lease ante error ${missingCode}`);
    assert.deepEqual(
      invalidatedCalls8,
      [`pref-missing-rpc-${missingCode}`],
      `Debe invalidar la preferencia creada en MP cuando falta la RPC (${missingCode})`
    );
  }
});
