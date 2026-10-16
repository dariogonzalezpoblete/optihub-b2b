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
import { useCartStore, getValidStock, getProductCartKey } from './frontend/store/useCartStore.ts';

// Helper to reset store between tests
function resetStore() {
  useCartStore.getState().clearCart();
}

test('Stock Control - getValidStock sanitization', () => {
  assert.equal(getValidStock(8), 8, 'Valid integer stock should return 8');
  assert.equal(getValidStock(1), 1, 'Valid stock 1 should return 1');
  assert.equal(getValidStock(0), 0, 'Stock 0 should return 0');
  assert.equal(getValidStock(-5), 0, 'Negative stock should return 0');
  assert.equal(getValidStock(null), 0, 'Null stock should return 0');
  assert.equal(getValidStock(undefined), 0, 'Undefined stock should return 0');
  assert.equal(getValidStock(NaN), 0, 'NaN stock should return 0');
  assert.equal(getValidStock('invalid'), 0, 'Invalid string stock should return 0');
  assert.equal(getValidStock(8.7), 8, 'Decimal stock should floor to 8');
});

test('Stock Control - getProductCartKey uses id_ext', () => {
  assert.equal(getProductCartKey({ id_ext: 'RB-2140', id: 10 }), 'RB-2140');
  assert.equal(getProductCartKey({ id_ext: '  RB-2140  ' }), 'RB-2140');
  assert.equal(getProductCartKey({ id: 55 }), '55');
  assert.equal(getProductCartKey({}), '');
});

test('Stock Control - Problem reproduction: adding 11 units when stock is 8', () => {
  resetStore();
  const store = useCartStore.getState();

  const productStock8 = {
    id_ext: 'FRAME-8-STOCK',
    marca: 'Ray-Ban',
    modelo: 'Wayfarer Classic',
    precio_neto_clp: 45000,
    stock: 8,
  };

  // Attempt to add 11 units to an empty cart
  const result = store.addToCart(productStock8, 11);

  assert.equal(result.success, true, 'Operation should succeed by adding allowable units');
  assert.equal(result.added, 8, 'Should add exactly 8 units, discarding the 3 excess units');
  assert.equal(result.message, 'Stock máximo disponible: 8 unidades.', 'Should set clear message');

  const cart = useCartStore.getState().cart;
  assert.equal(cart.length, 1);
  assert.equal(cart[0].cantidad, 8, 'Cart item quantity must be 8, NEVER 11');
  assert.equal(useCartStore.getState().lastError, 'Stock máximo disponible: 8 unidades.');
});

test('Stock Control - Product with stock 8 can NEVER reach quantity 9', () => {
  resetStore();
  const store = useCartStore.getState();

  const productStock8 = {
    id_ext: 'FRAME-STOCK-8',
    marca: 'Oakley',
    modelo: 'Holbrook',
    precio_neto_clp: 50000,
    stock: 8,
  };

  // 1. Add 5 units initially
  const res1 = store.addToCart(productStock8, 5);
  assert.equal(res1.success, true);
  assert.equal(res1.added, 5);
  assert.equal(useCartStore.getState().cart[0].cantidad, 5);

  // 2. Attempt to add 4 more units (5 + 4 = 9 > 8)
  const res2 = store.addToCart(productStock8, 4);
  assert.equal(res2.added, 3, 'Should add only 3 units to reach stock limit 8');
  assert.equal(res2.message, 'Stock máximo disponible: 8 unidades.');
  assert.equal(useCartStore.getState().cart[0].cantidad, 8, 'Quantity must cap at 8, not 9');

  // 3. Attempt to add 1 more unit when already at 8
  const res3 = store.addToCart(productStock8, 1);
  assert.equal(res3.success, false, 'Adding when at limit must fail');
  assert.equal(res3.added, 0, 'No units added');
  assert.equal(res3.message, 'Stock máximo disponible: 8 unidades.');
  assert.equal(useCartStore.getState().cart[0].cantidad, 8, 'Quantity must stay 8');

  // 4. Attempt to update quantity directly to 9 via updateQuantity
  const updateRes = store.updateQuantity('FRAME-STOCK-8', 9);
  assert.equal(updateRes.success, false);
  assert.equal(updateRes.finalQuantity, 8, 'updateQuantity must clamp to 8');
  assert.equal(updateRes.message, 'Stock máximo disponible: 8 unidades.');
  assert.equal(useCartStore.getState().cart[0].cantidad, 8, 'Quantity must stay 8');
});

test('Stock Control - Stock 0 blocks addition completely', () => {
  resetStore();
  const store = useCartStore.getState();

  const productStock0 = {
    id_ext: 'OUT-OF-STOCK-1',
    marca: 'Persol',
    modelo: 'PO0714',
    precio_neto_clp: 60000,
    stock: 0,
  };

  const res = store.addToCart(productStock0, 1);
  assert.equal(res.success, false);
  assert.equal(res.added, 0);
  assert.equal(res.message, 'Producto sin stock disponible.');
  assert.equal(useCartStore.getState().cart.length, 0, 'Cart must remain empty');
  assert.equal(useCartStore.getState().lastError, 'Producto sin stock disponible.');
});

test('Stock Control - Null, undefined, or invalid stock blocks addition', () => {
  resetStore();
  const store = useCartStore.getState();

  const productNullStock = {
    id_ext: 'NULL-STOCK',
    marca: 'BrandX',
    modelo: 'ModelA',
    precio_neto_clp: 30000,
    stock: null,
  };

  const productUndefinedStock = {
    id_ext: 'UNDEF-STOCK',
    marca: 'BrandY',
    modelo: 'ModelB',
    precio_neto_clp: 30000,
    stock: undefined,
  };

  const productNegativeStock = {
    id_ext: 'NEG-STOCK',
    marca: 'BrandZ',
    modelo: 'ModelC',
    precio_neto_clp: 30000,
    stock: -2,
  };

  assert.equal(store.addToCart(productNullStock, 1).success, false);
  assert.equal(store.addToCart(productUndefinedStock, 1).success, false);
  assert.equal(store.addToCart(productNegativeStock, 1).success, false);
  assert.equal(useCartStore.getState().cart.length, 0, 'Cart must remain empty for all invalid stocks');
});

test('Stock Control - Independent tracking by id_ext across multiple products', () => {
  resetStore();
  const store = useCartStore.getState();

  const prodA = {
    id_ext: 'SKU-PROD-A',
    marca: 'Ray-Ban',
    modelo: 'Aviator',
    precio_neto_clp: 40000,
    stock: 8,
  };

  const prodB = {
    id_ext: 'SKU-PROD-B',
    marca: 'Gucci',
    modelo: 'GG001',
    precio_neto_clp: 70000,
    stock: 5,
  };

  store.addToCart(prodA, 8);
  store.addToCart(prodB, 5);

  const cart = useCartStore.getState().cart;
  assert.equal(cart.length, 2);
  assert.equal(cart.find(i => i.producto.id_ext === 'SKU-PROD-A')?.cantidad, 8);
  assert.equal(cart.find(i => i.producto.id_ext === 'SKU-PROD-B')?.cantidad, 5);

  // Trying to add to prodA does not affect prodB
  const resA = store.addToCart(prodA, 2);
  assert.equal(resA.success, false);
  assert.equal(resA.added, 0);

  // prodB should still be 5
  assert.equal(useCartStore.getState().cart.find(i => i.producto.id_ext === 'SKU-PROD-B')?.cantidad, 5);
});

test('Stock Control & Commercial MOQ Rule (10 units)', () => {
  resetStore();
  const store = useCartStore.getState();

  const prodA = {
    id_ext: 'SKU-A',
    marca: 'Marca A',
    modelo: 'Modelo 1',
    precio_neto_clp: 20000,
    stock: 8,
  };

  const prodB = {
    id_ext: 'SKU-B',
    marca: 'Marca B',
    modelo: 'Modelo 2',
    precio_neto_clp: 30000,
    stock: 6,
  };

  // Add max stock of prodA (8 units)
  store.addToCart(prodA, 8);
  assert.equal(store.getTotalUnits(), 8);
  assert.equal(store.isValidMOQ(), false, '8 units should NOT meet MOQ of 10');

  // Add 2 units of prodB
  store.addToCart(prodB, 2);
  assert.equal(store.getTotalUnits(), 10);
  assert.equal(store.isValidMOQ(), true, '10 combined units MUST meet MOQ');

  // Verify financial calculations
  const expectedNeto = (20000 * 8) + (30000 * 2); // 160000 + 60000 = 220000
  const expectedIva = Math.round(expectedNeto * 0.19); // 41800
  const expectedTotal = expectedNeto + expectedIva; // 261800

  assert.equal(store.getMontoNeto(), expectedNeto);
  assert.equal(store.getMontoIva(), expectedIva);
  assert.equal(store.getMontoTotal(), expectedTotal);
});

test('Stock Control - Cart operations (remove, clear, updateQuantity)', () => {
  resetStore();
  const store = useCartStore.getState();

  const prod = {
    id_ext: 'SKU-TEST',
    marca: 'Brand',
    modelo: 'Model',
    precio_neto_clp: 10000,
    stock: 8,
  };

  store.addToCart(prod, 8);
  assert.equal(useCartStore.getState().cart.length, 1);

  // updateQuantity to 4
  store.updateQuantity('SKU-TEST', 4);
  assert.equal(useCartStore.getState().cart[0].cantidad, 4);

  // updateQuantity to 0 removes item
  store.updateQuantity('SKU-TEST', 0);
  assert.equal(useCartStore.getState().cart.length, 0);

  // Re-add and clear
  store.addToCart(prod, 3);
  assert.equal(useCartStore.getState().cart.length, 1);
  store.clearCart();
  assert.equal(useCartStore.getState().cart.length, 0);
  assert.equal(useCartStore.getState().lastError, null);
});
