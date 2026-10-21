// frontend/lib/inventory/types.ts

/**
 * Basic inventory item request representation
 */
export interface InventoryItemRequest {
  productId: string;
  quantity: number;
}

/**
 * Item specification for creating an order item within a purchase order
 */
export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  unitPriceNet?: number;
  productName?: string;
  brandName?: string;
  sku?: string;
}

/**
 * Input payload for atomic purchase order creation with immediate stock deduction
 */
export interface CreatePurchaseOrderInput {
  userId: string;
  items: CreateOrderItemInput[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  businessName?: string;
  businessRut?: string;
  billingAddress?: string;
  shippingAddress?: string;
  shippingRegion?: string;
  shippingCommune?: string;
  shippingAmount?: number;
  notes?: string;
  currency?: string;
}

/**
 * Database record for the `orders` table
 */
export interface OrderRecord {
  id: string;
  user_id: string;
  status:
    | 'pending'
    | 'payment_pending'
    | 'paid'
    | 'preparing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'refunded'
    | 'requires_attention';
  payment_status: 'pending' | 'approved' | 'rejected' | 'refunded';
  payment_provider: string | null;
  payment_id: string | null;
  subtotal_net: number;
  tax_amount: number;
  shipping_amount: number;
  total_amount: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  business_name: string | null;
  business_rut: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  shipping_region: string | null;
  shipping_commune: string | null;
  tracking_number: string | null;
  shipping_provider: string | null;
  notes: string | null;
  stock_decremented: boolean;
  stock_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database record for the `order_items` table
 */
export interface OrderItemRecord {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  brand_name: string;
  unit_price_net: number;
  quantity: number;
  subtotal_net: number;
  created_at: string;
}

/**
 * Database record for the `inventory_movements` ledger table
 */
export interface InventoryMovementRecord {
  id: string;
  product_id: string;
  order_id: string | null;
  quantity: number; // Negative for SALE deductions, positive for RETURN / RESTOCK
  type: 'SALE' | 'RETURN' | 'ADJUSTMENT';
  notes: string | null;
  created_at: string;
}

/**
 * Details of an individual item stock deduction
 */
export interface StockDeductionDetail {
  productId: string;
  requestedQuantity: number;
  previousStock: number;
  newStock: number;
}

/**
 * Result returned upon successful purchase order creation with atomic stock reservation
 */
export interface CreatePurchaseOrderResult {
  success: boolean;
  order: OrderRecord;
  orderItems: OrderItemRecord[];
  movements: InventoryMovementRecord[];
  deductions: StockDeductionDetail[];
}

/**
 * Result returned upon deducting stock for an existing order
 */
export interface DeductStockForOrderResult {
  success: boolean;
  orderId: string;
  alreadyProcessed: boolean;
  message: string;
  deductions: StockDeductionDetail[];
}

/**
 * Input payload for replenishing, returning, or adjusting inventory stock
 */
export interface AdjustStockInput {
  productId: string;
  quantityDelta: number; // Positive to add stock, negative to reduce
  type: 'RETURN' | 'ADJUSTMENT' | 'SALE';
  notes?: string;
  orderId?: string;
}

/**
 * Result returned upon adjusting or replenishing stock
 */
export interface AdjustStockResult {
  success: boolean;
  productId: string;
  previousStock: number;
  newStock: number;
  quantityDelta: number;
  movement: InventoryMovementRecord;
}

/**
 * Stock availability check for a product
 */
export interface StockAvailabilityItem {
  productId: string;
  exists: boolean;
  availableStock: number;
  brandName?: string;
  modelName?: string;
  priceNetoClp?: number;
  isAvailable: boolean;
}

/**
 * API Error payload standard
 */
export interface InventoryApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown> | Array<unknown> | null;
  timestamp: string;
}
