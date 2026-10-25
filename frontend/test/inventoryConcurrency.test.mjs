// frontend/test/inventoryConcurrency.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./test_alias_loader.mjs', pathToFileURL('./'));

const {
  createPurchaseOrderWithAtomicStockDeduction,
  deductStockForOrderAtomic,
  adjustOrReplenishStockAtomic,
} = await import('../lib/inventory/inventoryService.ts');
const {
  InsufficientStockError,
  InvalidQuantityError,
  ProductNotFoundError,
  formatInventoryErrorResponse,
} = await import('../lib/inventory/errors.ts');
const { isPoolConnectionError, isTransientConcurrencyError } = await import('../lib/db/postgres.ts');

/**
 * In-memory simulated PostgreSQL Client supporting:
 * - Explicit transactions (BEGIN, COMMIT, ROLLBACK)
 * - Row-level locking (SELECT ... FOR UPDATE)
 * - Rollback on error restoring state
 */
class MockPgDatabase {
  constructor() {
    this.marcos = new Map([
      ['RB-2140', { id_ext: 'RB-2140', stock: 5, marca: 'Ray-Ban', modelo: 'Wayfarer Classic', precio_neto_clp: 45000 }],
      ['TF-501', { id_ext: 'TF-501', stock: 2, marca: 'Tom Ford', modelo: 'Square Frame', precio_neto_clp: 95000 }],
      ['OO-9208', { id_ext: 'OO-9208', stock: 0, marca: 'Oakley', modelo: 'Radar EV Path', precio_neto_clp: 72000 }],
    ]);
    this.orders = new Map();
    this.orderItems = [];
    this.inventoryMovements = [];
    // Concurrency lock table: maps productId to promise queue
    this.rowLocks = new Map();
  }

  acquireRowLock(productId) {
    const prev = this.rowLocks.get(productId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.rowLocks.set(productId, prev.then(() => current));
    return prev.then(() => release);
  }

  createClient() {
    return new MockPgClient(this);
  }
}

class MockPgClient {
  constructor(db) {
    this.db = db;
    this.inTransaction = false;
    this.heldLocks = [];
    this.rollbackActions = [];
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('BEGIN')) {
      this.inTransaction = true;
      this.rollbackActions = [];
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('COMMIT')) {
      this.inTransaction = false;
      this.rollbackActions = [];
      this.releaseAllLocks();
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('ROLLBACK')) {
      while (this.rollbackActions.length > 0) {
        const action = this.rollbackActions.pop();
        try {
          action();
        } catch {}
      }
      this.inTransaction = false;
      this.releaseAllLocks();
      return { rows: [], rowCount: 0 };
    }

    // SELECT ... FOR UPDATE on marcos
    if (normalized.includes('FROM marcos') && normalized.includes('FOR UPDATE')) {
      const pids = params[0];
      const targetIds = Array.isArray(pids) ? pids : [pids];

      // Sequential lock acquisition simulation (ORDER BY ensures consistent order)
      for (const pid of targetIds) {
        const unlock = await this.db.acquireRowLock(pid);
        this.heldLocks.push(unlock);
      }

      const rows = [];
      for (const pid of targetIds) {
        if (this.db.marcos.has(pid)) {
          rows.push({ ...this.db.marcos.get(pid) });
        }
      }
      return { rows, rowCount: rows.length };
    }

    // SELECT * FROM orders WHERE id = $1 FOR UPDATE
    if (normalized.includes('FROM orders WHERE id = $1 FOR UPDATE')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    // SELECT order items with marcos join FOR UPDATE OF m
    if (normalized.includes('FROM order_items oi') && normalized.includes('FOR UPDATE OF m')) {
      const orderId = params[0];
      const items = this.db.orderItems.filter((i) => i.order_id === orderId);
      const rows = [];
      for (const item of items) {
        const marco = this.db.marcos.get(item.product_id);
        if (marco) {
          const unlock = await this.db.acquireRowLock(item.product_id);
          this.heldLocks.push(unlock);
          rows.push({
            order_item_id: item.id,
            product_id: item.product_id,
            quantity: item.quantity,
            product_name: item.product_name,
            stock: marco.stock,
            marca: marco.marca,
            modelo: marco.modelo,
          });
        }
      }
      return { rows, rowCount: rows.length };
    }

    // INSERT INTO orders
    if (normalized.includes('INSERT INTO orders')) {
      const order = {
        id: params[0],
        user_id: params[1],
        status: 'pending',
        payment_status: 'pending',
        subtotal_net: params[2],
        tax_amount: params[3],
        shipping_amount: params[4],
        total_amount: params[5],
        currency: params[6],
        customer_name: params[7],
        customer_email: params[8],
        customer_phone: params[9],
        business_name: params[10],
        business_rut: params[11],
        billing_address: params[12],
        shipping_address: params[13],
        shipping_region: params[14],
        shipping_commune: params[15],
        notes: params[16],
        stock_decremented: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.db.orders.set(order.id, order);
      this.rollbackActions.push(() => {
        this.db.orders.delete(order.id);
      });
      return { rows: [order], rowCount: 1 };
    }

    // INSERT INTO order_items
    if (normalized.includes('INSERT INTO order_items')) {
      const item = {
        id: 'oi-' + Math.random().toString(36).substring(2, 9),
        order_id: params[0],
        product_id: params[1],
        sku: params[2],
        product_name: params[3],
        brand_name: params[4],
        unit_price_net: params[5],
        quantity: params[6],
        subtotal_net: params[7],
        created_at: new Date().toISOString(),
      };
      this.db.orderItems.push(item);
      this.rollbackActions.push(() => {
        const idx = this.db.orderItems.indexOf(item);
        if (idx !== -1) this.db.orderItems.splice(idx, 1);
      });
      return { rows: [item], rowCount: 1 };
    }

    // UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2
    if (normalized.includes('UPDATE marcos SET stock = stock - $1')) {
      const qty = params[0];
      const pid = params[1];
      const marco = this.db.marcos.get(pid);
      if (marco) {
        marco.stock -= qty;
        this.rollbackActions.push(() => {
          marco.stock += qty;
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // DELETE FROM marcos WHERE id_ext = $1
    // Enforces PostgreSQL FOREIGN KEY (product_id) REFERENCES marcos(id_ext) ON DELETE RESTRICT
    if (normalized.startsWith('DELETE FROM marcos WHERE id_ext = $1')) {
      const pid = params[0];
      const hasMovements = this.db.inventoryMovements.some((m) => m.product_id === pid);
      if (hasMovements) {
        const fkErr = new Error(
          `update or delete on table "marcos" violates foreign key constraint "inventory_movements_product_id_fkey" on table "inventory_movements" (id_ext=${pid})`
        );
        fkErr.code = '23503';
        throw fkErr;
      }
      const marco = this.db.marcos.get(pid);
      if (marco) {
        this.db.marcos.delete(pid);
        this.rollbackActions.push(() => {
          this.db.marcos.set(pid, marco);
        });
      }
      return { rows: [], rowCount: marco ? 1 : 0 };
    }

    // UPDATE marcos SET stock = $1 WHERE id_ext = $2
    if (normalized.includes('UPDATE marcos SET stock = $1 WHERE id_ext = $2')) {
      const newStock = params[0];
      const pid = params[1];
      const marco = this.db.marcos.get(pid);
      if (marco) {
        const prev = marco.stock;
        marco.stock = newStock;
        this.rollbackActions.push(() => {
          marco.stock = prev;
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO inventory_movements
    // Enforces PostgreSQL FOREIGN KEY (product_id) REFERENCES marcos(id_ext) ON DELETE RESTRICT
    if (normalized.includes('INSERT INTO inventory_movements')) {
      const productId = params[0];
      if (!this.db.marcos.has(productId)) {
        const fkErr = new Error(
          `insert or update on table "inventory_movements" violates foreign key constraint "inventory_movements_product_id_fkey" (product_id=${productId} not present in table "marcos")`
        );
        fkErr.code = '23503';
        throw fkErr;
      }
      const movement = {
        id: 'mov-' + Math.random().toString(36).substring(2, 9),
        product_id: productId,
        order_id: params[1],
        quantity: params[2],
        type: params[3],
        notes: params[4],
        created_at: new Date().toISOString(),
      };
      this.db.inventoryMovements.push(movement);
      this.rollbackActions.push(() => {
        const idx = this.db.inventoryMovements.indexOf(movement);
        if (idx !== -1) this.db.inventoryMovements.splice(idx, 1);
      });
      return { rows: [movement], rowCount: 1 };
    }

    // UPDATE orders SET stock_decremented = true
    if (normalized.includes('UPDATE orders') && normalized.includes('stock_decremented = true')) {
      const orderId = params[0];
      const order = this.db.orders.get(orderId);
      if (order) {
        const prevFlag = order.stock_decremented;
        order.stock_decremented = true;
        order.updated_at = new Date().toISOString();
        this.rollbackActions.push(() => {
          order.stock_decremented = prevFlag;
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // Default return
    return { rows: [], rowCount: 0 };
  }

  releaseAllLocks() {
    for (const unlock of this.heldLocks) {
      try {
        unlock();
      } catch {}
    }
    this.heldLocks = [];
  }

  release() {
    this.releaseAllLocks();
  }
}

// --------------------------------------------------------------------------
// TEST CASES
// --------------------------------------------------------------------------

test('1. Validations: Rejects invalid quantities (<= 0, decimals, strings)', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  await assert.rejects(
    async () => {
      await createPurchaseOrderWithAtomicStockDeduction(
        {
          userId: 'usr-123',
          items: [{ productId: 'RB-2140', quantity: 0 }],
        },
        client
      );
    },
    (err) => err instanceof InvalidQuantityError
  );

  await assert.rejects(
    async () => {
      await createPurchaseOrderWithAtomicStockDeduction(
        {
          userId: 'usr-123',
          items: [{ productId: 'RB-2140', quantity: -3 }],
        },
        client
      );
    },
    (err) => err instanceof InvalidQuantityError
  );

  await assert.rejects(
    async () => {
      await createPurchaseOrderWithAtomicStockDeduction(
        {
          userId: 'usr-123',
          items: [{ productId: 'RB-2140', quantity: 2.5 }],
        },
        client
      );
    },
    (err) => err instanceof InvalidQuantityError
  );
});

test('2. Validations: Rejects non-existent product with ProductNotFoundError', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  await assert.rejects(
    async () => {
      await createPurchaseOrderWithAtomicStockDeduction(
        {
          userId: 'usr-123',
          items: [{ productId: 'NON-EXISTENT-SKU', quantity: 1 }],
        },
        client
      );
    },
    (err) => err instanceof ProductNotFoundError
  );
});

test('3. Atomic Rollback: Fails when stock is insufficient and leaves stock unchanged', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  const initialStockRB = db.marcos.get('RB-2140').stock; // 5
  const initialStockTF = db.marcos.get('TF-501').stock; // 2

  // Simulate transactional attempt: item 1 (RB-2140) has stock, but item 2 (TF-501) requested 99 (has 2)
  await client.query('BEGIN');
  try {
    await createPurchaseOrderWithAtomicStockDeduction(
      {
        userId: 'usr-123',
        items: [
          { productId: 'RB-2140', quantity: 2 },
          { productId: 'TF-501', quantity: 99 },
        ],
      },
      client
    );
    await client.query('COMMIT');
    assert.fail('Should have thrown InsufficientStockError');
  } catch (error) {
    await client.query('ROLLBACK');
    assert.ok(error instanceof InsufficientStockError);
    assert.equal(error.code, 'INSUFFICIENT_STOCK');
    assert.equal(error.statusCode, 409);
  }

  // Verify atomic guarantee: Stock was NOT deducted and no orders were created
  assert.equal(db.marcos.get('RB-2140').stock, initialStockRB, 'RB-2140 stock must remain unchanged');
  assert.equal(db.marcos.get('TF-501').stock, initialStockTF, 'TF-501 stock must remain unchanged');
  assert.equal(db.orders.size, 0, 'No order should be recorded');
  assert.equal(db.inventoryMovements.length, 0, 'No ledger movement should be recorded');
});

test('4. Atomic Success: Creates purchase order, deducts stock, and records ledger entry', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  await client.query('BEGIN');
  const result = await createPurchaseOrderWithAtomicStockDeduction(
    {
      userId: 'usr-buyer-001',
      customerName: 'Óptica Santa Lucía',
      customerEmail: 'contacto@opticasantalucia.cl',
      businessRut: '76.123.456-7',
      shippingAmount: 5000,
      items: [
        { productId: 'RB-2140', quantity: 2 }, // 45000 * 2 = 90000
        { productId: 'TF-501', quantity: 1 },  // 95000 * 1 = 95000
      ],
    },
    client
  );
  await client.query('COMMIT');

  assert.equal(result.success, true);
  assert.equal(result.order.user_id, 'usr-buyer-001');
  assert.equal(result.order.subtotal_net, 185000);
  assert.equal(result.order.tax_amount, Math.round(185000 * 0.19)); // 35150
  assert.equal(result.order.total_amount, 185000 + 35150 + 5000); // 225150

  // Verify stock decremented
  assert.equal(db.marcos.get('RB-2140').stock, 3); // 5 - 2 = 3
  assert.equal(db.marcos.get('TF-501').stock, 1);  // 2 - 1 = 1

  // Verify ledger movements recorded with negative quantities
  assert.equal(result.movements.length, 2);
  assert.equal(result.movements[0].type, 'SALE');
  assert.equal(result.movements[0].quantity, -2);
  assert.equal(result.movements[1].type, 'SALE');
  assert.equal(result.movements[1].quantity, -1);
});

test('5. Idempotency: deductStockForOrderAtomic avoids double deductions', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  // Create an order first
  await client.query('BEGIN');
  const created = await createPurchaseOrderWithAtomicStockDeduction(
    {
      userId: 'usr-idempotent',
      items: [{ productId: 'RB-2140', quantity: 1 }],
    },
    client
  );
  await client.query('COMMIT');

  const stockAfterCreate = db.marcos.get('RB-2140').stock; // 4

  // Attempting to deduct stock again for the already processed order
  const secondAttempt = await deductStockForOrderAtomic(created.order.id, client);

  assert.equal(secondAttempt.success, true);
  assert.equal(secondAttempt.alreadyProcessed, true);
  assert.equal(db.marcos.get('RB-2140').stock, stockAfterCreate, 'Stock should NOT be decremented a second time');
});

test('6. Concurrency Simulation: 10 concurrent buyers competing for 3 units with row locks', async () => {
  const db = new MockPgDatabase();
  // Set initial stock of LIMITED-3 to exactly 3
  db.marcos.set('LIMITED-3', {
    id_ext: 'LIMITED-3',
    stock: 3,
    marca: 'Ray-Ban',
    modelo: 'Wayfarer Limited',
    precio_neto_clp: 45000,
  });

  const concurrentRequests = 10;
  let successfulOrders = 0;
  let rejectedOrders = 0;

  // Execute 10 concurrent purchase requests
  const promises = Array.from({ length: concurrentRequests }).map(async (_, idx) => {
    const client = db.createClient();
    try {
      await client.query('BEGIN');
      await createPurchaseOrderWithAtomicStockDeduction(
        {
          userId: `concurrent-buyer-${idx}`,
          items: [{ productId: 'LIMITED-3', quantity: 1 }],
        },
        client
      );
      await client.query('COMMIT');
      successfulOrders++;
    } catch (err) {
      await client.query('ROLLBACK');
      // Cuando el stock llega a 0 el servicio actualiza stock = 0 (sin DELETE FROM marcos),
      // por lo que todos los compradores posteriores reciben estrictamente InsufficientStockError.
      if (err instanceof InsufficientStockError) {
        rejectedOrders++;
      } else {
        throw err;
      }
    }
  });

  await Promise.all(promises);

  // Exactly 3 succeed, exactly 7 fail with InsufficientStockError, stock is 0 (NO OVERSELLING, NO DELETE)
  assert.equal(successfulOrders, 3, 'Exactly 3 orders should succeed');
  assert.equal(rejectedOrders, 7, 'Exactly 7 orders should be rejected with InsufficientStockError');
  const finalMarco = db.marcos.get('LIMITED-3');
  assert.ok(finalMarco !== undefined, 'LIMITED-3 must still exist in marcos table');
  assert.equal(finalMarco.stock, 0, 'Final stock must be exactly 0, never negative');
  assert.equal(db.orders.size, 3, 'Exactly 3 orders recorded in database');
  assert.equal(db.inventoryMovements.length, 3, 'Exactly 3 ledger movements recorded');
  assert.ok(
    db.inventoryMovements.every((m) => m.type === 'SALE' && m.product_id === 'LIMITED-3' && m.quantity === -1),
    'All 3 movements must be SALE of -1 for LIMITED-3'
  );

  // Verify a subsequent return/replenishment on depleted LIMITED-3 restores stock = 5 without FK error
  const replenishClient = db.createClient();
  await replenishClient.query('BEGIN');
  const returnResult = await adjustOrReplenishStockAtomic(
    {
      productId: 'LIMITED-3',
      quantityDelta: 5,
      type: 'RETURN',
      notes: 'Restitución por devolución',
    },
    replenishClient
  );
  await replenishClient.query('COMMIT');

  assert.equal(returnResult.success, true);
  assert.equal(returnResult.previousStock, 0);
  assert.equal(returnResult.newStock, 5);
  assert.equal(db.marcos.get('LIMITED-3').stock, 5, 'Stock of LIMITED-3 must be restored to 5');
  assert.equal(db.inventoryMovements.length, 4, 'RETURN movement must be appended to inventory_movements');
});

test('7. Inventory Adjustment / Restock', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  const initialStock = db.marcos.get('TF-501').stock; // 2

  // Restock 10 units
  await client.query('BEGIN');
  const restockResult = await adjustOrReplenishStockAtomic(
    {
      productId: 'TF-501',
      quantityDelta: 10,
      type: 'ADJUSTMENT',
      notes: 'Llegada de embarque proveedor',
    },
    client
  );
  await client.query('COMMIT');

  assert.equal(restockResult.success, true);
  assert.equal(restockResult.previousStock, initialStock);
  assert.equal(restockResult.newStock, initialStock + 10);
  assert.equal(db.marcos.get('TF-501').stock, initialStock + 10);
});

test('8. Error Formatting and Connection Pool resilience', () => {
  // Test Pool Connection Error detection
  const connectionRefusedErr = new Error('connect ECONNREFUSED 127.0.0.1:5432');
  connectionRefusedErr.code = 'ECONNREFUSED';
  assert.equal(isPoolConnectionError(connectionRefusedErr), true);

  const poolResponse = formatInventoryErrorResponse(connectionRefusedErr);
  assert.equal(poolResponse.status, 503, 'Pool error should map to HTTP 503 Service Unavailable');

  // Test Insufficient Stock HTTP status mapping
  const insufficientErr = new InsufficientStockError('RB-2140', 10, 2);
  const stockResponse = formatInventoryErrorResponse(insufficientErr);
  assert.equal(stockResponse.status, 409, 'Insufficient stock should map to HTTP 409 Conflict');

  // Test Transient Concurrency error detection
  const deadlockErr = new Error('deadlock detected');
  deadlockErr.code = '40P01';
  assert.equal(isTransientConcurrencyError(deadlockErr), true);

  const deadlockResponse = formatInventoryErrorResponse(deadlockErr);
  assert.equal(deadlockResponse.status, 409, 'Deadlock conflict should map to HTTP 409 Conflict');
});

test('9. CRÍTICO-01 Price Integrity: createPurchaseOrderWithAtomicStockDeduction ignores client-supplied unitPriceNet and enforces catalog price', async () => {
  const db = new MockPgDatabase();
  const client = db.createClient();

  await client.query('BEGIN');
  const result = await createPurchaseOrderWithAtomicStockDeduction(
    {
      userId: 'usr-admin-test',
      customerName: 'Óptica Validación Precio',
      customerEmail: 'admin@optihub.cl',
      items: [
        // Attempt to tamper price to 0 or 1 CLP when catalog price of RB-2140 is 45,000 CLP
        { productId: 'RB-2140', quantity: 2, unitPriceNet: 0 },
        { productId: 'TF-501', quantity: 1, unitPriceNet: 1 },
      ],
    },
    client
  );
  await client.query('COMMIT');

  // RB-2140 (45000 * 2 = 90000) + TF-501 (95000 * 1 = 95000) = 185000
  assert.equal(result.order.subtotal_net, 185000, 'Must strictly use catalog precio_neto_clp, ignoring unitPriceNet');
  assert.equal(result.order.tax_amount, Math.round(185000 * 0.19));
  assert.equal(result.order.total_amount, 185000 + Math.round(185000 * 0.19));
  assert.equal(result.orderItems[0].unit_price_net, 45000);
  assert.equal(result.orderItems[1].unit_price_net, 95000);
});
