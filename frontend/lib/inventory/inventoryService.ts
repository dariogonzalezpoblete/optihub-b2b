// frontend/lib/inventory/inventoryService.ts
import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import { executeQuery, withTransaction } from '../db/postgres';
import type {
  AdjustStockInput,
  AdjustStockResult,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderResult,
  DeductStockForOrderResult,
  InventoryMovementRecord,
  OrderItemRecord,
  OrderRecord,
  StockAvailabilityItem,
  StockDeductionDetail,
} from './types';
import {
  InsufficientStockError,
  InvalidQuantityError,
  OrderNotFoundError,
  ProductNotFoundError,
} from './errors';

/**
 * Validates that an item quantity is a strictly positive, finite integer.
 */
function assertValidQuantity(productId: string, quantity: unknown): number {
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    throw new InvalidQuantityError(productId, quantity);
  }
  return quantity;
}

/**
 * Row returned from locking `marcos`
 */
interface LockedMarcoRow {
  id_ext: string;
  stock: number | null;
  marca: string;
  modelo: string;
  precio_neto_clp: string | number | null;
}

/**
 * Creates a purchase order and deducts inventory stock atomically with row-level locking.
 *
 * Concurrency & ACID guarantees:
 * 1. Explicit PostgreSQL transaction (BEGIN ... COMMIT / ROLLBACK via withTransaction).
 * 2. Deterministic alphabetical sorting of product IDs eliminates deadlocks.
 * 3. Row-level locking (`SELECT ... FOR UPDATE`) prevents concurrent overselling.
 * 4. Inserts order, order_items, updates marcos.stock, and writes ledger audit entries into inventory_movements.
 */
export async function createPurchaseOrderWithAtomicStockDeduction(
  input: CreatePurchaseOrderInput,
  customClient?: PoolClient
): Promise<CreatePurchaseOrderResult> {
  // 1. Defensive input validations
  if (!input.userId || typeof input.userId !== 'string' || !input.userId.trim()) {
    throw new Error('El parámetro userId es requerido y debe ser una cadena válida.');
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('La orden debe contener al menos un producto (items no puede estar vacío).');
  }

  // Sanitize and validate quantities
  const sanitizedItems = input.items.map((item) => {
    const productId = (item.productId || '').trim();
    if (!productId) {
      throw new Error('Cada producto de la orden debe tener un productId válido.');
    }
    const quantity = assertValidQuantity(productId, item.quantity);
    return {
      ...item,
      productId,
      quantity,
    };
  });

  // Group quantities in case duplicate product IDs were passed in the payload
  const aggregatedQuantities = new Map<string, number>();
  for (const item of sanitizedItems) {
    const current = aggregatedQuantities.get(item.productId) || 0;
    aggregatedQuantities.set(item.productId, current + item.quantity);
  }

  // Sort product IDs alphabetically to eliminate deadlock conditions across concurrent transactions
  const uniqueSortedProductIds = Array.from(aggregatedQuantities.keys()).sort();

  // 2. Transaction execution runner
  const executeCoreLogic = async (client: PoolClient): Promise<CreatePurchaseOrderResult> => {
    // A. Row-level lock acquisition on marcos
    const lockQuery = `
      SELECT id_ext, stock, marca, modelo, precio_neto_clp
      FROM marcos
      WHERE id_ext = ANY($1::text[])
      ORDER BY id_ext
      FOR UPDATE
    `;

    const { rows: lockedRows } = await client.query<LockedMarcoRow>(lockQuery, [
      uniqueSortedProductIds,
    ]);

    const lockedMap = new Map<string, LockedMarcoRow>();
    for (const row of lockedRows) {
      lockedMap.set(row.id_ext, row);
    }

    // B. Verify all products exist
    for (const pid of uniqueSortedProductIds) {
      if (!lockedMap.has(pid)) {
        throw new ProductNotFoundError(pid);
      }
    }

    // C. Verify stock availability
    for (const [pid, neededQty] of aggregatedQuantities.entries()) {
      const marco = lockedMap.get(pid)!;
      const currentStock = marco.stock ?? 0;

      if (currentStock < neededQty) {
        throw new InsufficientStockError(
          pid,
          neededQty,
          currentStock,
          `${marco.marca} ${marco.modelo}`
        );
      }
    }

    // D. Compute pricing & financial totals (Chilean standard B2B 19% IVA)
    let subtotalNet = 0;
    const resolvedOrderItems: Array<{
      productId: string;
      sku: string;
      productName: string;
      brandName: string;
      unitPriceNet: number;
      quantity: number;
      subtotalNet: number;
    }> = [];

    for (const item of sanitizedItems) {
      const marco = lockedMap.get(item.productId)!;
      // CRÍTICO-01: El precio unitario neto se obtiene exclusivamente desde el catálogo en servidor (marcos.precio_neto_clp).
      // Se ignora cualquier valor unitPriceNet suministrado por el cliente.
      const unitPrice = Math.round(Number(marco.precio_neto_clp || 0));

      const lineSubtotal = unitPrice * item.quantity;
      subtotalNet += lineSubtotal;

      const productName =
        (item.productName || '').trim() || `${marco.marca} ${marco.modelo}`.trim();
      const brandName = (item.brandName || '').trim() || marco.marca || 'OptiHub';
      const sku = (item.sku || '').trim() || marco.id_ext;

      resolvedOrderItems.push({
        productId: item.productId,
        sku,
        productName,
        brandName,
        unitPriceNet: unitPrice,
        quantity: item.quantity,
        subtotalNet: lineSubtotal,
      });
    }

    const shippingAmount = Math.max(0, Math.round(input.shippingAmount || 0));
    const taxAmount = Math.round(subtotalNet * 0.19); // 19% IVA
    const totalAmount = subtotalNet + taxAmount + shippingAmount;
    const currency = (input.currency || 'CLP').toUpperCase();
    const orderId = crypto.randomUUID();

    // E. Insert order row
    const insertOrderQuery = `
      INSERT INTO orders (
        id,
        user_id,
        status,
        payment_status,
        subtotal_net,
        tax_amount,
        shipping_amount,
        total_amount,
        currency,
        customer_name,
        customer_email,
        customer_phone,
        business_name,
        business_rut,
        billing_address,
        shipping_address,
        shipping_region,
        shipping_commune,
        notes,
        stock_decremented,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, 'pending', 'pending', $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, true, NOW(), NOW()
      )
      RETURNING *
    `;

    const orderValues = [
      orderId,
      input.userId,
      subtotalNet,
      taxAmount,
      shippingAmount,
      totalAmount,
      currency,
      input.customerName || null,
      input.customerEmail || null,
      input.customerPhone || null,
      input.businessName || null,
      input.businessRut || null,
      input.billingAddress || null,
      input.shippingAddress || null,
      input.shippingRegion || null,
      input.shippingCommune || null,
      input.notes || null,
    ];

    const { rows: orderRows } = await client.query<OrderRecord>(insertOrderQuery, orderValues);
    const createdOrder = orderRows[0];

    // F. Insert order items
    const createdOrderItems: OrderItemRecord[] = [];
    for (const item of resolvedOrderItems) {
      const insertItemQuery = `
        INSERT INTO order_items (
          id,
          order_id,
          product_id,
          sku,
          product_name,
          brand_name,
          unit_price_net,
          quantity,
          subtotal_net,
          created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        )
        RETURNING *
      `;

      const { rows: itemRows } = await client.query<OrderItemRecord>(insertItemQuery, [
        orderId,
        item.productId,
        item.sku,
        item.productName,
        item.brandName,
        item.unitPriceNet,
        item.quantity,
        item.subtotalNet,
      ]);

      createdOrderItems.push(itemRows[0]);
    }

    // G. Apply stock decrement & record ledger movements
    const deductions: StockDeductionDetail[] = [];
    const movements: InventoryMovementRecord[] = [];

    for (const [pid, qtyToDeduct] of aggregatedQuantities.entries()) {
      const marco = lockedMap.get(pid)!;
      const previousStock = Number(marco.stock ?? 0);
      const newStock = previousStock - qtyToDeduct;

      // Update marcos stock (cuando el stock llega a 0 se mantiene la fila con stock = 0
      // en lugar de DELETE FROM marcos, preservando la restricción FOREIGN KEY ON DELETE RESTRICT
      // de public.inventory_movements en supabase_migration_003.sql y permitiendo devoluciones/reposiciones)
      await client.query(
        `UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2`,
        [qtyToDeduct, pid]
      );

      // Insert audit movement record (type: SALE, quantity negative for audit ledger)
      const insertMovementQuery = `
        INSERT INTO inventory_movements (
          id,
          product_id,
          order_id,
          quantity,
          type,
          notes,
          created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
        )
        RETURNING *
      `;

      const { rows: movRows } = await client.query<InventoryMovementRecord>(
        insertMovementQuery,
        [pid, orderId, -qtyToDeduct, 'SALE', `Descuento transaccional por orden ${orderId}`]
      );

      movements.push(movRows[0]);
      deductions.push({
        productId: pid,
        requestedQuantity: qtyToDeduct,
        previousStock,
        newStock,
      });
    }

    return {
      success: true,
      order: createdOrder,
      orderItems: createdOrderItems,
      movements,
      deductions,
    };
  };

  // If a transaction client is passed externally, reuse it; otherwise open managed transaction
  if (customClient) {
    return executeCoreLogic(customClient);
  }

  return withTransaction(executeCoreLogic);
}

/**
 * Atomically decrements stock for an existing order with row-level locking.
 * Includes strict idempotency protection (`stock_decremented` flag & ledger guard).
 */
export async function deductStockForOrderAtomic(
  orderId: string,
  customClient?: PoolClient
): Promise<DeductStockForOrderResult> {
  const cleanOrderId = (orderId || '').trim();
  if (!cleanOrderId) {
    throw new Error('El parámetro orderId es requerido.');
  }

  const executeCoreLogic = async (client: PoolClient): Promise<DeductStockForOrderResult> => {
    // 1. Lock the order row
    const orderQuery = `
      SELECT * FROM orders
      WHERE id = $1
      FOR UPDATE
    `;
    const { rows: orderRows } = await client.query<OrderRecord>(orderQuery, [cleanOrderId]);

    if (orderRows.length === 0) {
      throw new OrderNotFoundError(cleanOrderId);
    }

    const order = orderRows[0];

    // 2. Idempotency Check
    if (order.stock_decremented) {
      return {
        success: true,
        orderId: cleanOrderId,
        alreadyProcessed: true,
        message: 'El stock para esta orden ya fue descontado previamente.',
        deductions: [],
      };
    }

    // 3. Retrieve and lock all items & marcos for this order
    // ORDER BY product_id ensures consistent lock order preventing deadlocks
    const itemsQuery = `
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.quantity,
        oi.product_name,
        m.stock,
        m.marca,
        m.modelo
      FROM order_items oi
      JOIN marcos m ON oi.product_id = m.id_ext
      WHERE oi.order_id = $1
      ORDER BY oi.product_id
      FOR UPDATE OF m
    `;

    interface LockedItemRow {
      order_item_id: string;
      product_id: string;
      quantity: number;
      product_name: string;
      stock: number | null;
      marca: string;
      modelo: string;
    }

    const { rows: items } = await client.query<LockedItemRow>(itemsQuery, [cleanOrderId]);

    if (items.length === 0) {
      throw new Error(`La orden "${cleanOrderId}" no contiene productos o los productos ya no existen en el catálogo.`);
    }

    // 4. Validate stock availability for all items
    for (const item of items) {
      const qty = assertValidQuantity(item.product_id, item.quantity);
      const stock = item.stock ?? 0;

      if (stock < qty) {
        throw new InsufficientStockError(
          item.product_id,
          qty,
          stock,
          item.product_name || `${item.marca} ${item.modelo}`
        );
      }
    }

    // 5. Apply deductions & record audit movements
    const deductions: StockDeductionDetail[] = [];

    for (const item of items) {
      const previousStock = Number(item.stock ?? 0);
      const newStock = previousStock - item.quantity;

      // Cuando el stock llega a 0 se actualiza stock = 0 sin eliminar la fila de public.marcos,
      // preservando la restricción FOREIGN KEY ON DELETE RESTRICT de public.inventory_movements
      // (supabase_migration_003.sql) y permitiendo futuras devoluciones o reposiciones.
      await client.query(`UPDATE marcos SET stock = stock - $1 WHERE id_ext = $2`, [
        item.quantity,
        item.product_id,
      ]);

      await client.query(
        `INSERT INTO inventory_movements (
          id, product_id, order_id, quantity, type, notes, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
        )`,
        [
          item.product_id,
          cleanOrderId,
          -item.quantity,
          'SALE',
          `Descuento transaccional por confirmación de orden ${cleanOrderId}`,
        ]
      );

      deductions.push({
        productId: item.product_id,
        requestedQuantity: item.quantity,
        previousStock,
        newStock,
      });
    }

    // 6. Update order state to mark stock_decremented = true
    await client.query(
      `UPDATE orders
       SET stock_decremented = true, updated_at = NOW()
       WHERE id = $1`,
      [cleanOrderId]
    );

    return {
      success: true,
      orderId: cleanOrderId,
      alreadyProcessed: false,
      message: 'Stock descontado exitosamente.',
      deductions,
    };
  };

  if (customClient) {
    return executeCoreLogic(customClient);
  }

  return withTransaction(executeCoreLogic);
}

/**
 * Adjusts or replenishes inventory stock atomically with row-level locking and ledger tracking.
 */
export async function adjustOrReplenishStockAtomic(
  params: AdjustStockInput,
  customClient?: PoolClient
): Promise<AdjustStockResult> {
  const productId = (params.productId || '').trim();
  if (!productId) {
    throw new Error('El parámetro productId es requerido.');
  }

  if (
    typeof params.quantityDelta !== 'number' ||
    !Number.isFinite(params.quantityDelta) ||
    !Number.isInteger(params.quantityDelta) ||
    params.quantityDelta === 0
  ) {
    throw new Error('quantityDelta debe ser un entero distinto de 0.');
  }

  const validTypes = ['RETURN', 'ADJUSTMENT', 'SALE'];
  if (!validTypes.includes(params.type)) {
    throw new Error(`Tipo de movimiento inválido "${params.type}". Permitidos: ${validTypes.join(', ')}`);
  }

  const executeCoreLogic = async (client: PoolClient): Promise<AdjustStockResult> => {
    // 1. Lock the marco row
    const lockQuery = `
      SELECT id_ext, stock, marca, modelo
      FROM marcos
      WHERE id_ext = $1
      FOR UPDATE
    `;
    const { rows } = await client.query<LockedMarcoRow>(lockQuery, [productId]);

    if (rows.length === 0) {
      throw new ProductNotFoundError(productId);
    }

    const marco = rows[0];
    const previousStock = Number(marco.stock ?? 0);
    const newStock = previousStock + params.quantityDelta;

    if (newStock < 0) {
      throw new InsufficientStockError(
        productId,
        Math.abs(params.quantityDelta),
        previousStock,
        `${marco.marca} ${marco.modelo}`
      );
    }

    // 2. Update stock (cuando llega a 0 se conserva la fila con stock = 0 sin ejecutar DELETE,
    // preservando la restricción FOREIGN KEY ON DELETE RESTRICT de public.inventory_movements
    // en supabase_migration_003.sql y permitiendo futuras devoluciones o reposiciones)
    await client.query(`UPDATE marcos SET stock = $1 WHERE id_ext = $2`, [
      newStock,
      productId,
    ]);

    // 3. Write movement ledger
    const insertMovement = `
      INSERT INTO inventory_movements (
        id, product_id, order_id, quantity, type, notes, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
      )
      RETURNING *
    `;

    const notes = params.notes || `Ajuste manual de stock (${params.type}): delta ${params.quantityDelta}`;
    const { rows: movRows } = await client.query<InventoryMovementRecord>(insertMovement, [
      productId,
      params.orderId || null,
      params.quantityDelta,
      params.type,
      notes,
    ]);

    return {
      success: true,
      productId,
      previousStock,
      newStock,
      quantityDelta: params.quantityDelta,
      movement: movRows[0],
    };
  };

  if (customClient) {
    return executeCoreLogic(customClient);
  }

  return withTransaction(executeCoreLogic);
}

/**
 * Checks stock availability for an array of product IDs in batch.
 */
export async function checkStockAvailability(
  productIds: string[]
): Promise<StockAvailabilityItem[]> {
  const cleanIds = Array.from(
    new Set((productIds || []).map((id) => (id || '').trim()).filter(Boolean))
  );

  if (cleanIds.length === 0) {
    return [];
  }

  const query = `
    SELECT id_ext, stock, marca, modelo, precio_neto_clp
    FROM marcos
    WHERE id_ext = ANY($1::text[])
  `;

  const { rows } = await executeQuery<{
    id_ext: string;
    stock: number | null;
    marca: string;
    modelo: string;
    precio_neto_clp: string | number | null;
  }>(query, [cleanIds]);

  const map = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    map.set(row.id_ext, row);
  }

  return cleanIds.map((pid) => {
    const row = map.get(pid);
    if (!row) {
      return {
        productId: pid,
        exists: false,
        availableStock: 0,
        isAvailable: false,
      };
    }

    const availableStock = Math.max(0, Number(row.stock || 0));
    return {
      productId: pid,
      exists: true,
      availableStock,
      brandName: row.marca,
      modelName: row.modelo,
      priceNetoClp: row.precio_neto_clp ? Number(row.precio_neto_clp) : undefined,
      isAvailable: availableStock > 0,
    };
  });
}
