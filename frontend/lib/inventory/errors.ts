// frontend/lib/inventory/errors.ts
import { NextResponse } from 'next/server';
import { isPoolConnectionError, isTransientConcurrencyError } from '../db/postgres';
import type { InventoryApiErrorResponse } from './types';

/**
 * Base custom error class for inventory domain errors
 */
export class InventoryDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | Array<unknown> | null;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown> | Array<unknown> | null) {
    super(message);
    this.name = 'InventoryDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an invalid quantity is provided (non-integer, <= 0, etc.)
 */
export class InvalidQuantityError extends InventoryDomainError {
  constructor(productId: string, quantity: unknown, message?: string) {
    super(
      message || `Cantidad inválida "${quantity}" para el producto "${productId}". Debe ser un número entero mayor a 0.`,
      'INVALID_QUANTITY',
      400,
      { productId, quantity }
    );
    this.name = 'InvalidQuantityError';
  }
}

/**
 * Thrown when a product is not found in the catalog database
 */
export class ProductNotFoundError extends InventoryDomainError {
  constructor(productId: string) {
    super(
      `El producto con identificador "${productId}" no existe en el catálogo maestro.`,
      'PRODUCT_NOT_FOUND',
      404,
      { productId }
    );
    this.name = 'ProductNotFoundError';
  }
}

/**
 * Thrown when attempting to purchase or deduct more stock than available
 */
export class InsufficientStockError extends InventoryDomainError {
  constructor(productId: string, requested: number, available: number, productName?: string) {
    super(
      `Stock insuficiente para el producto "${productName || productId}". Solicitado: ${requested}, Disponible: ${available}.`,
      'INSUFFICIENT_STOCK',
      409, // 409 Conflict represents state conflict with current inventory
      { productId, requested, available, productName }
    );
    this.name = 'InsufficientStockError';
  }
}

/**
 * Thrown when an order is not found
 */
export class OrderNotFoundError extends InventoryDomainError {
  constructor(orderId: string) {
    super(
      `La orden de compra "${orderId}" no fue encontrada.`,
      'ORDER_NOT_FOUND',
      404,
      { orderId }
    );
    this.name = 'OrderNotFoundError';
  }
}

/**
 * Thrown when an order has already had its stock decremented (idempotency guard)
 */
export class OrderAlreadyProcessedError extends InventoryDomainError {
  constructor(orderId: string) {
    super(
      `El stock para la orden "${orderId}" ya fue descontado previamente.`,
      'ORDER_ALREADY_PROCESSED',
      409,
      { orderId }
    );
    this.name = 'OrderAlreadyProcessedError';
  }
}

/**
 * Thrown when a database pool connection fails or is exhausted
 */
export class DatabasePoolError extends InventoryDomainError {
  constructor(originalMessage: string, details?: Record<string, unknown>) {
    super(
      'El servicio de base de datos no se encuentra disponible temporalmente. Intente nuevamente en unos instantes.',
      'DATABASE_POOL_UNAVAILABLE',
      503, // 503 Service Unavailable
      { originalMessage, ...details }
    );
    this.name = 'DatabasePoolError';
  }
}

/**
 * Thrown when high concurrency lock acquisition or serialization fails
 */
export class ConcurrencyConflictError extends InventoryDomainError {
  constructor(message = 'Conflicto de concurrencia al procesar el inventario. Por favor reintente.') {
    super(
      message,
      'CONCURRENCY_CONFLICT',
      409,
      null
    );
    this.name = 'ConcurrencyConflictError';
  }
}

/**
 * Translates any error into a standardized JSON API error response and HTTP status code.
 */
export function formatInventoryErrorResponse(error: unknown): NextResponse<InventoryApiErrorResponse> {
  const timestamp = new Date().toISOString();

  // 1. Handled Inventory Domain Errors
  if (error instanceof InventoryDomainError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        timestamp,
      },
      { status: error.statusCode }
    );
  }

  // 2. Connection Pool Errors (pg / Supabase pool exhaustion or network drop)
  if (isPoolConnectionError(error)) {
    const originalMessage = error instanceof Error ? error.message : String(error);
    console.error('[Inventory Service] Database Pool Error:', originalMessage);
    return NextResponse.json(
      {
        error: 'Error de conexión con el pool de base de datos. Servicio temporalmente no disponible.',
        code: 'DATABASE_POOL_ERROR',
        statusCode: 503,
        details: { hint: 'El pool de conexiones no pudo completar la solicitud' },
        timestamp,
      },
      { status: 503 }
    );
  }

  // 3. PostgreSQL Concurrency / Deadlock
  if (isTransientConcurrencyError(error)) {
    console.warn('[Inventory Service] Concurrency lock conflict:', error);
    return NextResponse.json(
      {
        error: 'Conflicto de bloqueo por alta concurrencia en la transacción. Por favor reintente.',
        code: 'CONCURRENCY_LOCK_TIMEOUT',
        statusCode: 409,
        timestamp,
      },
      { status: 409 }
    );
  }

  // 4. PostgreSQL Constraint Violations
  const pgError = error as { code?: string; constraint?: string; detail?: string };
  if (pgError?.code === '23514') {
    // Check constraint violation, e.g. chk_marcos_stock_nonnegative
    return NextResponse.json(
      {
        error: 'Restricción de inventario violada: el stock no puede ser negativo.',
        code: 'STOCK_CHECK_CONSTRAINT_VIOLATION',
        statusCode: 409,
        details: { constraint: pgError.constraint, detail: pgError.detail },
        timestamp,
      },
      { status: 409 }
    );
  }

  if (pgError?.code === '23505') {
    // Unique constraint violation (e.g., duplicate order sale ledger entry)
    return NextResponse.json(
      {
        error: 'Operación duplicada: el movimiento ya fue registrado previamente.',
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        statusCode: 409,
        details: { constraint: pgError.constraint },
        timestamp,
      },
      { status: 409 }
    );
  }

  // 5. Unhandled generic errors
  const message = error instanceof Error ? error.message : 'Error interno inesperado';
  console.error('[Inventory Service] Unhandled error:', error);

  return NextResponse.json(
    {
      error: 'Ocurrió un error inesperado al procesar la operación transaccional de inventario.',
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      details: process.env.NODE_ENV === 'development' ? { message } : undefined,
      timestamp,
    },
    { status: 500 }
  );
}
