// frontend/app/api/inventory/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPurchaseOrderWithAtomicStockDeduction } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import { CreatePurchaseOrderInput } from '@/lib/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inventory/orders
 * Creates a purchase order with atomic stock deduction and row-level locking.
 */
export async function POST(req: NextRequest) {
  try {
    let body: CreatePurchaseOrderInput;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Cuerpo de solicitud inválido. Se espera formato JSON.',
          code: 'INVALID_JSON_BODY',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          error: 'El cuerpo de la solicitud no puede estar vacío.',
          code: 'EMPTY_BODY',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (!body.userId || typeof body.userId !== 'string') {
      return NextResponse.json(
        {
          error: 'El campo "userId" es obligatorio.',
          code: 'MISSING_USER_ID',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          error: 'El campo "items" es obligatorio y debe contener al menos un producto.',
          code: 'MISSING_ITEMS',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await createPurchaseOrderWithAtomicStockDeduction(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}
