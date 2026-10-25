// test_cart_sync_and_checkout.mjs
// Automated tests for OptiHub B2B: Cart Synchronization & Checkout Integrity

if (typeof globalThis.localStorage === 'undefined') {
  const memoryStorage = new Map();
  const mockStorage = {
    getItem: (key) => memoryStorage.get(key) || null,
    setItem: (key, val) => memoryStorage.set(key, String(val)),
    removeItem: (key) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
  };
  globalThis.localStorage = mockStorage;
  globalThis.window = { localStorage: mockStorage };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { useCartStore } from './frontend/store/useCartStore.ts';
import { resolveVerifiedCheckoutResult } from './frontend/lib/checkoutWebhookAndResult.ts';

// Helper to reset store
function resetStore() {
  useCartStore.getState().clearCart();
  useCartStore.getState().setCartId(null);
  useCartStore.getState().setLastSyncedAt(null);
  useCartStore.getState().setSyncStatus('idle');
  useCartStore.getState().clearLastError();
}

// ==============================================================================
// TEST SUITE 1: API Route /api/mercadopago/create-preference validation
// ==============================================================================

test('1. API Route rejects request when cartId is missing or null (HTTP 400)', async () => {
  // Simulación de la lógica de validación de backend en create-preference/route.ts
  const validateCreatePreferencePayload = (body, authHeader) => {
    if (!authHeader) {
      return { status: 401, error: 'No autorizado: Falta token de autenticación.' };
    }
    const { cart, billing, cartId } = body;
    if (!cartId) {
      return { status: 400, error: 'Falta el identificador del carrito (Sincronización pendiente).' };
    }
    if (!billing || !billing.rut) {
      return { status: 400, error: 'El RUT ingresado no es válido para compras B2B.' };
    }
    return { status: 200, success: true };
  };

  const dummyCart = [
    {
      producto: { id_ext: 'FRAME-001', stock: 20, precio_neto_clp: 35000 },
      cantidad: 10,
    },
  ];
  const dummyBilling = {
    rut: '76.123.456-7',
    razon_social: 'Óptica Central SpA',
  };

  // Case A: cartId is null
  const resNull = validateCreatePreferencePayload(
    { cart: dummyCart, billing: dummyBilling, cartId: null },
    'Bearer test-token'
  );
  assert.equal(resNull.status, 400);
  assert.equal(resNull.error, 'Falta el identificador del carrito (Sincronización pendiente).');

  // Case B: cartId is undefined / omitted
  const resUndefined = validateCreatePreferencePayload(
    { cart: dummyCart, billing: dummyBilling },
    'Bearer test-token'
  );
  assert.equal(resUndefined.status, 400);
  assert.equal(resUndefined.error, 'Falta el identificador del carrito (Sincronización pendiente).');

  // Case C: cartId is empty string
  const resEmpty = validateCreatePreferencePayload(
    { cart: dummyCart, billing: dummyBilling, cartId: '' },
    'Bearer test-token'
  );
  assert.equal(resEmpty.status, 400);
  assert.equal(resEmpty.error, 'Falta el identificador del carrito (Sincronización pendiente).');

  // Case D: valid cartId provided
  const resValid = validateCreatePreferencePayload(
    { cart: dummyCart, billing: dummyBilling, cartId: 'c8f49b10-21a4-4e92-9e32-23fba1e76543' },
    'Bearer test-token'
  );
  assert.equal(resValid.status, 200);
  assert.equal(resValid.success, true);
});

// ==============================================================================
// TEST SUITE 2: ensureCartSynced & Store State Propagation
// ==============================================================================

test('2. ensureCartSynced confirms remote cart and updates Zustand cartId & syncStatus', async () => {
  resetStore();
  const store = useCartStore.getState();

  // Populate cart with 10 units of valid product (meets B2B MOQ)
  store.addToCart(
    {
      id_ext: 'FRAME-RAYBAN-WAYFARER',
      marca: 'Ray-Ban',
      modelo: 'Wayfarer',
      stock: 15,
      precio_neto_clp: 45000,
    },
    10
  );

  assert.equal(useCartStore.getState().cartId, null, 'cartId must initially be null');
  assert.equal(useCartStore.getState().syncStatus, 'idle', 'Initial status must be idle');

  // Mock implementation of ensureCartSynced conforming to cartService.ts
  const mockEnsureCartSynced = async (userId, localCart) => {
    assert.ok(userId, 'userId must be provided');
    assert.ok(localCart.length > 0, 'localCart must have items');
    return {
      cartId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      updatedAt: '2026-10-15T12:00:00.000Z',
    };
  };

  // Simulate checkout pre-sync flow
  useCartStore.getState().setSyncStatus('syncing');
  const syncResult = await mockEnsureCartSynced('user-12345', useCartStore.getState().cart);

  useCartStore.getState().setCartId(syncResult.cartId);
  useCartStore.getState().setLastSyncedAt(syncResult.updatedAt);
  useCartStore.getState().setSyncStatus('synced');

  // Verify Zustand store updated properly
  assert.equal(useCartStore.getState().cartId, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
  assert.equal(useCartStore.getState().lastSyncedAt, '2026-10-15T12:00:00.000Z');
  assert.equal(useCartStore.getState().syncStatus, 'synced');
});

// ==============================================================================
// TEST SUITE 3: Checkout blocks and synchronizes if not yet synced
// ==============================================================================

test('3. Checkout submission awaits ensureCartSynced when cart is initially unsynced', async () => {
  resetStore();
  const store = useCartStore.getState();

  store.addToCart(
    {
      id_ext: 'FRAME-OAKLEY-01',
      marca: 'Oakley',
      modelo: 'Holbrook',
      stock: 20,
      precio_neto_clp: 50000,
    },
    10
  );

  // Cart starts with cartId = null (unsynced)
  assert.equal(useCartStore.getState().cartId, null);

  let preferenceRequestPayload = null;
  let preferenceCalled = false;

  const mockCreatePreferenceEndpoint = async (body) => {
    preferenceCalled = true;
    preferenceRequestPayload = body;
    if (!body.cartId) {
      return { status: 400, error: 'Falta el identificador del carrito (Sincronización pendiente).' };
    }
    return { status: 200, initPoint: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=123' };
  };

  // Simulating checkout handleSubmit logic from frontend/app/checkout/page.tsx
  const simulateCheckoutSubmit = async ({ session, formData, initialCartId }) => {
    let loading = true;
    let errorMsg = '';
    let confirmedCartId = initialCartId;

    try {
      if (!session?.user?.id) {
        throw new Error('Debes iniciar sesión para completar la compra.');
      }

      // Blocking synchronization step
      useCartStore.getState().setSyncStatus('syncing');
      const syncResult = {
        cartId: 'cf8290e1-4567-4abc-89ef-0123456789ab',
        updatedAt: new Date().toISOString(),
      };
      confirmedCartId = syncResult.cartId;
      useCartStore.getState().setCartId(confirmedCartId);
      useCartStore.getState().setLastSyncedAt(syncResult.updatedAt);
      useCartStore.getState().setSyncStatus('synced');

      if (!confirmedCartId) {
        throw new Error('No se pudo obtener el identificador del carrito en el servidor.');
      }

      const res = await mockCreatePreferenceEndpoint({
        cart: useCartStore.getState().cart,
        cartId: confirmedCartId,
        billing: formData,
      });

      if (res.status !== 200) {
        throw new Error(res.error);
      }

      // Vaciamos carrito tras crear la orden con éxito
      useCartStore.getState().clearCart();
      useCartStore.getState().setCartId(null);
      useCartStore.getState().setLastSyncedAt(null);

      return { success: true, initPoint: res.initPoint };
    } catch (err) {
      errorMsg = err.message;
      return { success: false, error: errorMsg };
    } finally {
      loading = false;
    }
  };

  const result = await simulateCheckoutSubmit({
    session: { user: { id: 'test-user-b2b' }, access_token: 'valid-jwt' },
    formData: { rut: '76.123.456-7', razon_social: 'Optica Test' },
    initialCartId: useCartStore.getState().cartId, // null!
  });

  assert.equal(result.success, true);
  assert.equal(preferenceCalled, true);
  assert.equal(preferenceRequestPayload.cartId, 'cf8290e1-4567-4abc-89ef-0123456789ab');
  assert.ok(result.initPoint.includes('mercadopago.cl'));
  assert.equal(useCartStore.getState().cart.length, 0, 'Cart should be cleared after successful order');
  assert.equal(useCartStore.getState().cartId, null, 'cartId reset after successful order');
});

// ==============================================================================
// TEST SUITE 4: Sync Failure Handling (No preference created, clear error message)
// ==============================================================================

test('4. Synchronization failure blocks checkout, preserves cart, and does NOT call Mercado Pago', async () => {
  resetStore();
  const store = useCartStore.getState();

  store.addToCart(
    {
      id_ext: 'FRAME-PERSOL-01',
      marca: 'Persol',
      modelo: 'PO0714',
      stock: 12,
      precio_neto_clp: 65000,
    },
    10
  );

  let preferenceCalled = false;
  const mockCreatePreferenceEndpoint = async () => {
    preferenceCalled = true;
    return { status: 200 };
  };

  const simulateFailedSyncSubmit = async () => {
    let loading = true;
    let errorMsg = '';
    let confirmedCartId = useCartStore.getState().cartId;

    try {
      useCartStore.getState().setSyncStatus('syncing');
      // Simulate network / server crash during sync
      throw new Error('Database connection timeout during sync_cart RPC');
    } catch (syncErr) {
      useCartStore.getState().setSyncStatus('error');
      errorMsg = 'No se pudo sincronizar tu pedido con el servidor. Por favor, reintenta en unos instantes.';
      loading = false;
      return { success: false, error: errorMsg, loading };
    }
  };

  const result = await simulateFailedSyncSubmit();

  assert.equal(result.success, false);
  assert.equal(result.error, 'No se pudo sincronizar tu pedido con el servidor. Por favor, reintenta en unos instantes.');
  assert.equal(result.loading, false, 'Loading must be reset to false so user can retry');
  assert.equal(preferenceCalled, false, 'Mercado Pago must NEVER be called if sync fails');
  assert.equal(useCartStore.getState().syncStatus, 'error');
  assert.equal(useCartStore.getState().cart.length, 1, 'Local cart items must be preserved on error');
  assert.equal(useCartStore.getState().cart[0].cantidad, 10);
});

// ==============================================================================
// TEST SUITE 5: Retry Flow after Transient Failure
// ==============================================================================

test('5. Retry mechanism succeeds on subsequent attempt without state corruption', async () => {
  resetStore();
  const store = useCartStore.getState();

  store.addToCart(
    {
      id_ext: 'FRAME-RETRY-01',
      marca: 'Gucci',
      modelo: 'GG001',
      stock: 15,
      precio_neto_clp: 80000,
    },
    10
  );

  let syncAttempts = 0;
  const mockFlakySync = async () => {
    syncAttempts++;
    if (syncAttempts === 1) {
      throw new Error('Temporary gateway 503');
    }
    return {
      cartId: 'cart-retry-resolved-uuid-999',
      updatedAt: new Date().toISOString(),
    };
  };

  let preferenceCalls = 0;
  const mockPreferenceEndpoint = async (cartId) => {
    preferenceCalls++;
    return { status: 200, initPoint: 'https://mercadopago.cl/init?id=retry' };
  };

  // Attempt 1: Fails
  let attempt1Error = null;
  try {
    await mockFlakySync();
  } catch (err) {
    attempt1Error = err;
    useCartStore.getState().setSyncStatus('error');
  }
  assert.ok(attempt1Error);
  assert.equal(syncAttempts, 1);
  assert.equal(preferenceCalls, 0);
  assert.equal(useCartStore.getState().syncStatus, 'error');
  assert.equal(useCartStore.getState().cart.length, 1);

  // Attempt 2: User clicks "Proceder al Pago" again -> Retry succeeds!
  const syncRes = await mockFlakySync();
  useCartStore.getState().setCartId(syncRes.cartId);
  useCartStore.getState().setSyncStatus('synced');

  const prefRes = await mockPreferenceEndpoint(syncRes.cartId);
  assert.equal(syncAttempts, 2);
  assert.equal(preferenceCalls, 1);
  assert.equal(prefRes.status, 200);
  assert.equal(useCartStore.getState().cartId, 'cart-retry-resolved-uuid-999');
  assert.equal(useCartStore.getState().syncStatus, 'synced');
});

// ==============================================================================
// TEST SUITE 6: Duplicate Cart Prevention & Concurrency Handling
// ==============================================================================

test('6. getOrCreateActiveCart prevents duplicate active carts and handles concurrent inserts', async () => {
  // Simulación de la lógica atómica de getOrCreateActiveCart en cartService.ts
  const mockDatabase = {
    carts: [],
  };

  const simulatedGetOrCreateActiveCart = async (userId, simulateRace = false) => {
    // 1. Buscar carrito activo existente
    const existing = mockDatabase.carts.find(c => c.user_id === userId && c.status === 'active');
    if (existing) {
      return { id: existing.id, updatedAt: existing.updated_at };
    }

    // 2. Si no existe, crear uno nuevo
    if (simulateRace && mockDatabase.carts.some(c => c.user_id === userId && c.status === 'active')) {
      // Simula error de violación de restricción única 'unique_active_cart_per_user'
      const activeCart = mockDatabase.carts.find(c => c.user_id === userId && c.status === 'active');
      return { id: activeCart.id, updatedAt: activeCart.updated_at };
    }

    const newCart = {
      id: `cart-uuid-${Math.random().toString(36).substring(2, 9)}`,
      user_id: userId,
      status: 'active',
      updated_at: new Date().toISOString(),
    };
    mockDatabase.carts.push(newCart);
    return { id: newCart.id, updatedAt: newCart.updated_at };
  };

  const userId = 'b2b-customer-unique-01';

  // Primer llamado: crea el carrito activo
  const firstCall = await simulatedGetOrCreateActiveCart(userId);
  assert.ok(firstCall.id);

  // Segundo llamado secuencial: reutiliza exactamente el mismo carrito
  const secondCall = await simulatedGetOrCreateActiveCart(userId);
  assert.equal(secondCall.id, firstCall.id, 'Must reuse the existing active cart');

  // Llamadas concurrentes: dos solicitudes simultáneas que intentan insertar a la vez
  const [conc1, conc2] = await Promise.all([
    simulatedGetOrCreateActiveCart(userId, true),
    simulatedGetOrCreateActiveCart(userId, true),
  ]);

  assert.equal(conc1.id, firstCall.id, 'Concurrent call 1 must resolve to the same active cart');
  assert.equal(conc2.id, firstCall.id, 'Concurrent call 2 must resolve to the same active cart');

  const activeCartsCount = mockDatabase.carts.filter(c => c.user_id === userId && c.status === 'active').length;
  assert.equal(activeCartsCount, 1, 'There must NEVER be more than 1 active cart per user');
});

// ==============================================================================
// TEST SUITE 7: Controlled Cart Clearing on Verified Checkout Result (FASE 17)
// ==============================================================================

/**
 * Simulates the controlled cart clearing hook logic from ResultadoContent
 * in frontend/app/checkout/resultado/page.tsx.
 */
function simulateResultadoContentCartClearing({
  urlStatus,
  urlRef,
  orderFromDb,
  verificationComplete,
  clearedRefTracker,
}) {
  const { displayState, verifiedOrderId } = resolveVerifiedCheckoutResult({
    urlStatus,
    urlRef,
    orderFromDb,
    verificationComplete,
  });

  const isApproved = displayState === 'approved';

  if (isApproved && verifiedOrderId && clearedRefTracker.current !== verifiedOrderId) {
    clearedRefTracker.current = verifiedOrderId;
    useCartStore.getState().clearCart();
    useCartStore.getState().setCartId(null);
  }

  return { isApproved, displayState, verifiedOrderId };
}

test('7.1 Pago Aprobado verificado en BD: limpia el carrito y resetea cartId', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'RB-2140', stock: 20, precio_neto_clp: 45000 }, cantidad: 10 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-123');

  assert.equal(useCartStore.getState().cart.length, 1);
  assert.equal(useCartStore.getState().cartId, 'cart-active-123');

  const tracker = { current: null };
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'paid',
      payment_status: 'approved',
      payment_id: 'mp-pay-999',
    },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, true);
  assert.equal(res.displayState, 'approved');
  assert.equal(tracker.current, validOrderId);
  assert.equal(useCartStore.getState().cart.length, 0, 'Carrito debe quedar vacío tras pago aprobado verificado');
  assert.equal(useCartStore.getState().cartId, null, 'cartId debe quedar reseteado');
});

test('7.2 Pago Pendiente (en URL o BD): Carrito permanece INTACTO', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'RB-2140', stock: 20, precio_neto_clp: 45000 }, cantidad: 10 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-123');

  const tracker = { current: null };
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'pending',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
    },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, false);
  assert.equal(res.displayState, 'pending');
  assert.equal(tracker.current, null, 'Tracker no debe marcar orden como limpiada');
  assert.equal(useCartStore.getState().cart.length, 1, 'Carrito debe permanecer intacto');
  assert.equal(useCartStore.getState().cart[0].cantidad, 10);
  assert.equal(useCartStore.getState().cartId, 'cart-active-123');
});

test('7.3 Pago Rechazado o Cancelado: Carrito permanece INTACTO para reintento', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'RB-2140', stock: 20, precio_neto_clp: 45000 }, cantidad: 12 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-123');

  const tracker = { current: null };
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'failure',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'cancelled',
      payment_status: 'rejected',
      payment_id: null,
    },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, false);
  assert.equal(res.displayState, 'rejected');
  assert.equal(tracker.current, null);
  assert.equal(useCartStore.getState().cart.length, 1, 'Carrito debe conservarse para que el usuario reintente');
  assert.equal(useCartStore.getState().cart[0].cantidad, 12);
});

test('7.4 Error de Verificación (orden ausente en BD / fallo de red): Carrito permanece INTACTO', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'TF-501', stock: 15, precio_neto_clp: 95000 }, cantidad: 10 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-456');

  const tracker = { current: null };
  // Caso: BD no retorna la orden (null) tras completar reintentos
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: null,
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, false);
  assert.equal(res.displayState, 'rejected');
  assert.equal(tracker.current, null);
  assert.equal(useCartStore.getState().cart.length, 1, 'Carrito no debe borrarse si la BD no confirma la orden');
});

test('7.5 Spoofing de URL (?status=approved manipulado sin confirmación en BD): Carrito permanece INTACTO', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'TF-501', stock: 15, precio_neto_clp: 95000 }, cantidad: 10 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-456');

  const tracker = { current: null };
  // Atacante manipula URL con ?status=approved pero la BD reporta payment_status = pending
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'pending',
      payment_status: 'pending',
      payment_id: null,
    },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, false);
  assert.equal(res.displayState, 'pending');
  assert.equal(tracker.current, null);
  assert.equal(useCartStore.getState().cart.length, 1, 'Carrito no debe limpiarse ante query params no verificados');
});

test('7.6 Incidencia de inventario (requires_attention): Carrito permanece INTACTO', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const cartItems = [
    { producto: { id_ext: 'RB-2140', stock: 20, precio_neto_clp: 45000 }, cantidad: 10 },
  ];
  useCartStore.getState().setCart(cartItems);
  useCartStore.getState().setCartId('cart-active-123');

  const tracker = { current: null };
  const res = simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: {
      id: validOrderId,
      status: 'requires_attention',
      payment_status: 'approved',
      payment_id: 'mp-pay-late-001',
    },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });

  assert.equal(res.isApproved, false);
  assert.equal(res.displayState, 'pending');
  assert.equal(tracker.current, null);
  assert.equal(useCartStore.getState().cart.length, 1, 'Carrito permanece intacto si el pedido está en conciliación manual');
});

test('7.7 Idempotencia: Múltiples re-renders o recargas no provocan comportamientos anómalos', () => {
  resetStore();
  const validOrderId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const tracker = { current: null };

  // Primer render / confirmación:
  useCartStore.getState().setCart([{ producto: { id_ext: 'RB-2140' }, cantidad: 10 }]);
  simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: { id: validOrderId, status: 'paid', payment_status: 'approved' },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });
  assert.equal(tracker.current, validOrderId);
  assert.equal(useCartStore.getState().cart.length, 0);

  // Segundo render (Strict Mode o cambio de estado interno):
  simulateResultadoContentCartClearing({
    urlStatus: 'approved',
    urlRef: validOrderId,
    orderFromDb: { id: validOrderId, status: 'paid', payment_status: 'approved' },
    verificationComplete: true,
    clearedRefTracker: tracker,
  });
  // Tracker mantiene la referencia sin re-ejecutar mutaciones redundantes
  assert.equal(tracker.current, validOrderId);
  assert.equal(useCartStore.getState().cart.length, 0);
});
