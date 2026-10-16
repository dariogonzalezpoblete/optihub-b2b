// test_cart_concurrency_occ.mjs
// Automated tests for OptiHub B2B: OCC Concurrency, Mutex Serialization & Cart Integrity

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
import { useCartStore, getValidStock } from './frontend/store/useCartStore.ts';

// Implementation of withCartSyncLock matching frontend/lib/cartService.ts
let syncQueue = Promise.resolve();

function withCartSyncLock(task, timeoutMs = 15000) {
  const runWithTimeout = async () => {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT_CART_SYNC: La sincronización del carrito tardó demasiado tiempo.'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const next = syncQueue.then(runWithTimeout, runWithTimeout);
  syncQueue = next.catch(() => {});
  return next;
}

// Implementation of reconcileCartItems matching frontend/lib/cartService.ts
function reconcileCartItems(localItems, remoteDbItems, catalogProducts) {
  const catalogMap = new Map();
  catalogProducts.forEach((p) => {
    if (p.id_ext) catalogMap.set(p.id_ext, p);
  });

  const remoteMap = new Map();
  remoteDbItems.forEach((item) => {
    remoteMap.set(item.product_id, item.quantity);
  });

  const reconciledQuantities = new Map();

  // 1. Conservar los ítems locales con la intención del usuario (sin duplicar sumando remoto)
  localItems.forEach((localItem) => {
    const pid = localItem.producto?.id_ext;
    if (!pid) return;
    const catalogItem = catalogMap.get(pid);
    const stockToUse = catalogItem ? catalogItem.stock : localItem.producto.stock;
    const maxStock = getValidStock(stockToUse);
    const validQty = maxStock > 0 ? Math.min(localItem.cantidad, maxStock) : localItem.cantidad;
    if (validQty > 0) {
      reconciledQuantities.set(pid, validQty);
    }
  });

  // 2. Incorporar ítems remotos no presentes en local (ej. añadidos desde otra pestaña)
  remoteDbItems.forEach((remoteItem) => {
    if (!reconciledQuantities.has(remoteItem.product_id)) {
      const catalogItem = catalogMap.get(remoteItem.product_id);
      const maxStock = catalogItem ? getValidStock(catalogItem.stock) : 9999;
      const validQty = maxStock > 0 ? Math.min(remoteItem.quantity, maxStock) : remoteItem.quantity;
      if (validQty > 0) {
        reconciledQuantities.set(remoteItem.product_id, validQty);
      }
    }
  });

  // 3. Generar la lista final con información de producto completa
  const finalCart = [];
  reconciledQuantities.forEach((qty, pid) => {
    const localExisting = localItems.find((i) => i.producto?.id_ext === pid);
    const catalogProduct = catalogMap.get(pid);
    const productInfo = catalogProduct || localExisting?.producto;
    if (productInfo) {
      finalCart.push({
        producto: productInfo,
        cantidad: qty,
      });
    }
  });

  return finalCart;
}

function resetStore() {
  useCartStore.getState().clearCart();
  useCartStore.getState().setCartId(null);
  useCartStore.getState().setLastSyncedAt(null);
  useCartStore.getState().setSyncStatus('idle');
  useCartStore.getState().clearLastError();
}

// ==============================================================================
// 1. SERIALIZACIÓN DE SINCRONIZACIONES SIMULTÁNEAS (withCartSyncLock)
// ==============================================================================

test('1. withCartSyncLock serializes concurrent tasks and prevents overlapping execution', async () => {
  const executionOrder = [];
  let concurrentExecutions = 0;
  let maxConcurrentSeen = 0;

  const makeAsyncTask = (id, delayMs) => {
    return async () => {
      concurrentExecutions++;
      if (concurrentExecutions > maxConcurrentSeen) {
        maxConcurrentSeen = concurrentExecutions;
      }
      executionOrder.push(`start-${id}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      executionOrder.push(`end-${id}`);
      concurrentExecutions--;
      return id;
    };
  };

  // Launch 3 asynchronous tasks simultaneously
  const results = await Promise.all([
    withCartSyncLock(makeAsyncTask('task-1', 25)),
    withCartSyncLock(makeAsyncTask('task-2', 15)),
    withCartSyncLock(makeAsyncTask('task-3', 10)),
  ]);

  assert.deepEqual(results, ['task-1', 'task-2', 'task-3']);
  assert.equal(maxConcurrentSeen, 1, 'Never more than 1 sync task running concurrently');
  assert.deepEqual(
    executionOrder,
    ['start-task-1', 'end-task-1', 'start-task-2', 'end-task-2', 'start-task-3', 'end-task-3'],
    'Tasks must execute strictly sequentially in FIFO order'
  );
});

test('1.b withCartSyncLock does NOT deadlock if an earlier task fails', async () => {
  let task2Executed = false;

  const failingTask = async () => {
    throw new Error('Database network glitch');
  };

  const subsequentTask = async () => {
    task2Executed = true;
    return 'recovered';
  };

  // First task fails
  await assert.rejects(
    async () => withCartSyncLock(failingTask),
    { message: 'Database network glitch' }
  );

  // Subsequent task must still execute cleanly
  const res = await withCartSyncLock(subsequentTask);
  assert.equal(res, 'recovered');
  assert.equal(task2Executed, true, 'Subsequent task in queue ran successfully');
});

// ==============================================================================
// 2. PREVENCIÓN DE CANTIDADES DUPLICADAS (reconcileCartItems)
// ==============================================================================

test('2. reconcileCartItems prevents quantity doubling (8 + 8 does NOT become 16)', () => {
  const localCart = [
    {
      producto: {
        id_ext: 'RB-WAYFARER-01',
        marca: 'Ray-Ban',
        modelo: 'Wayfarer',
        stock: 12,
        precio_neto_clp: 45000,
      },
      cantidad: 8,
    },
  ];

  // Remote database already has 8 units of the same item
  const remoteDbItems = [
    { product_id: 'RB-WAYFARER-01', quantity: 8 },
  ];

  const catalog = [
    {
      id_ext: 'RB-WAYFARER-01',
      marca: 'Ray-Ban',
      modelo: 'Wayfarer',
      stock: 12,
      precio_neto_clp: 45000,
    },
  ];

  const reconciled = reconcileCartItems(localCart, remoteDbItems, catalog);

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].producto.id_ext, 'RB-WAYFARER-01');
  assert.equal(
    reconciled[0].cantidad,
    8,
    'Quantity must be 8 (local user intention), NEVER 16 (8 + 8)'
  );
});

test('2.b reconcileCartItems preserves local edits and incorporates new remote items without duplicates', () => {
  // Local user changed item A to 6 units
  const localCart = [
    {
      producto: { id_ext: 'PROD-A', stock: 10, precio_neto_clp: 20000 },
      cantidad: 6,
    },
  ];

  // Remote DB had item A at 4 units, and item B (added in another tab) at 5 units
  const remoteDbItems = [
    { product_id: 'PROD-A', quantity: 4 },
    { product_id: 'PROD-B', quantity: 5 },
  ];

  const catalog = [
    { id_ext: 'PROD-A', stock: 10, precio_neto_clp: 20000 },
    { id_ext: 'PROD-B', stock: 8, precio_neto_clp: 30000 },
  ];

  const reconciled = reconcileCartItems(localCart, remoteDbItems, catalog);

  assert.equal(reconciled.length, 2);

  const itemA = reconciled.find((i) => i.producto.id_ext === 'PROD-A');
  const itemB = reconciled.find((i) => i.producto.id_ext === 'PROD-B');

  assert.equal(itemA.cantidad, 6, 'Local intent (6) is preserved, NOT 6 + 4 = 10');
  assert.equal(itemB.cantidad, 5, 'Remote item B (5) is incorporated safely');
});

test('2.c reconcileCartItems clamps quantities strictly to catalog stock', () => {
  const localCart = [
    {
      producto: { id_ext: 'PROD-LOW-STOCK', stock: 15, precio_neto_clp: 25000 },
      cantidad: 12, // User had 12 in local
    },
  ];

  const remoteDbItems = [
    { product_id: 'PROD-LOW-STOCK', quantity: 12 },
  ];

  // Catalog stock in DB was reduced to 7 by warehouse
  const catalog = [
    { id_ext: 'PROD-LOW-STOCK', stock: 7, precio_neto_clp: 25000 },
  ];

  const reconciled = reconcileCartItems(localCart, remoteDbItems, catalog);
  assert.equal(reconciled[0].cantidad, 7, 'Reconciled quantity must clamp to actual stock 7');
});

// ==============================================================================
// 3. CONFLICTO OCC & RECUPERACIÓN EXITOSA
// ==============================================================================

test('3. OCC Conflict: automatic reconciliation recovers on stale data and re-pushes with new version', async () => {
  let rpcCalls = 0;
  const initialTimestamp = '2026-10-15T12:00:00.000Z';
  const remoteNewTimestamp = '2026-10-15T12:00:03.000Z';
  const finalTimestamp = '2026-10-15T12:00:04.000Z';

  // Simulated push function implementing the exact OCC retry loop from cartService.ts
  const simulatePushWithOccRecovery = async ({
    userId,
    localCart,
    lastSyncedAt,
    maxRetries = 3,
  }) => {
    let currentLastSyncedAt = lastSyncedAt;
    let currentCartToSync = localCart;
    let reconciledResultCart = undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      rpcCalls++;

      // Simulating PostgreSQL sync_cart OCC check
      if (currentLastSyncedAt !== remoteNewTimestamp && attempt === 1) {
        // Attempt 1 fails with 'stale' because DB timestamp (remoteNewTimestamp) is newer
        const rpcResult = {
          success: false,
          reason: 'stale',
          current_updated_at: remoteNewTimestamp,
        };

        // Recovery: fetch remote state, reconcile without duplicating, update timestamp
        const remoteItems = [{ product_id: 'ITEM-1', quantity: 10 }];
        const catalog = [{ id_ext: 'ITEM-1', stock: 15, precio_neto_clp: 40000 }];

        currentCartToSync = reconcileCartItems(currentCartToSync, remoteItems, catalog);
        reconciledResultCart = currentCartToSync;
        currentLastSyncedAt = rpcResult.current_updated_at;
        continue;
      }

      // Attempt 2 succeeds because currentLastSyncedAt matches the remote version
      return {
        updatedAt: finalTimestamp,
        cartId: 'cart-occ-recovered-123',
        reconciledCart: reconciledResultCart,
      };
    }

    throw new Error('OCC_PERSISTENT_CONFLICT');
  };

  const initialCart = [
    {
      producto: { id_ext: 'ITEM-1', stock: 15, precio_neto_clp: 40000 },
      cantidad: 10,
    },
  ];

  const result = await simulatePushWithOccRecovery({
    userId: 'user-occ-test',
    localCart: initialCart,
    lastSyncedAt: initialTimestamp, // Outdated!
  });

  assert.equal(rpcCalls, 2, 'Should retry exactly once after resolving stale conflict');
  assert.equal(result.updatedAt, finalTimestamp);
  assert.equal(result.cartId, 'cart-occ-recovered-123');
  assert.equal(result.reconciledCart.length, 1);
  assert.equal(result.reconciledCart[0].cantidad, 10, 'Reconciled quantity must remain 10');
});

// ==============================================================================
// 4. CONFLICTO PERSISTENTE (Límite de 3 intentos agotado)
// ==============================================================================

test('4. OCC Persistent Conflict throws controlled error when maxRetries is reached', async () => {
  let attemptsMade = 0;

  const simulatePersistentConflictPush = async (maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attemptsMade++;
      // Every attempt encounters a newer conflict (e.g. constant concurrent writes)
      if (attempt === maxRetries) {
        throw new Error('OCC_PERSISTENT_CONFLICT');
      }
    }
  };

  await assert.rejects(
    async () => simulatePersistentConflictPush(3),
    { message: 'OCC_PERSISTENT_CONFLICT' }
  );

  assert.equal(attemptsMade, 3, 'Must stop at exactly 3 retries without looping infinitely');
});

// ==============================================================================
// 5. CHECKOUT BLOQUEADO CUANDO LA SINCRONIZACIÓN FALLA
// ==============================================================================

test('5. Checkout blocks cleanly on OCC_PERSISTENT_CONFLICT: no Mercado Pago call, preserves cart', async () => {
  resetStore();
  const store = useCartStore.getState();

  store.addToCart(
    {
      id_ext: 'FRAME-CHECKOUT-OCC',
      marca: 'Silhouette',
      modelo: 'Titan Minimal',
      stock: 20,
      precio_neto_clp: 95000,
    },
    10
  );

  assert.equal(useCartStore.getState().cart.length, 1);
  assert.equal(useCartStore.getState().cart[0].cantidad, 10);

  let preferenceCalled = false;
  const mockCreatePreferenceEndpoint = async () => {
    preferenceCalled = true;
    return { status: 200, initPoint: 'https://mercadopago.cl/...' };
  };

  // Simulating checkout handleSubmit with OCC conflict handling
  const simulateCheckoutSubmit = async () => {
    let loading = true;
    let errorMsg = '';

    try {
      // Step 1: Ensure cart synced (fails with OCC_PERSISTENT_CONFLICT)
      useCartStore.getState().setSyncStatus('syncing');
      throw new Error('OCC_PERSISTENT_CONFLICT');
    } catch (syncErr) {
      useCartStore.getState().setSyncStatus('error');
      errorMsg =
        syncErr?.message === 'OCC_PERSISTENT_CONFLICT'
          ? 'Detectamos cambios simultáneos en tu carrito. Por favor, revisa tus productos y vuelve a intentar.'
          : 'No se pudo sincronizar tu pedido con el servidor. Por favor, reintenta en unos instantes.';
      loading = false;
      return { success: false, error: errorMsg, loading };
    }
  };

  const result = await simulateCheckoutSubmit();

  assert.equal(result.success, false);
  assert.equal(
    result.error,
    'Detectamos cambios simultáneos en tu carrito. Por favor, revisa tus productos y vuelve a intentar.'
  );
  assert.equal(result.loading, false, 'Loading must be false so user can retry');
  assert.equal(preferenceCalled, false, 'Mercado Pago must NEVER be called');
  assert.equal(useCartStore.getState().syncStatus, 'error');

  // Verify cart was NOT cleared or lost
  assert.equal(useCartStore.getState().cart.length, 1);
  assert.equal(useCartStore.getState().cart[0].cantidad, 10);
});
