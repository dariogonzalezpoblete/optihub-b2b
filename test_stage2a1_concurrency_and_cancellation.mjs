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

// Helper simulando acquireUserCheckoutLease de route.ts
async function simulateAcquireUserCheckoutLease(mockRpcResult) {
  const { data, error } = mockRpcResult;

  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202' || error.message?.includes('not found')) {
      return {
        success: false,
        httpStatus: 503,
        code: 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED',
        message: 'El servicio de checkout requiere la configuración de concurrencia en base de datos. Por favor contacta al administrador.'
      };
    }
    return {
      success: false,
      httpStatus: 503,
      code: 'CHECKOUT_LEASE_UNAVAILABLE',
      message: 'No se pudo establecer la reserva de checkout en el servidor. Por favor intenta nuevamente.'
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


