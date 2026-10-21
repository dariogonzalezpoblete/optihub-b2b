// frontend/app/api/inventory/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adjustOrReplenishStockAtomic } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import { AdjustStockInput } from '@/lib/inventory/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inventory/adjust
 * Atomically adjusts or replenishes inventory stock with row-level locking.
 */
export async function POST(req: NextRequest) {
  try {
    let body: AdjustStockInput;
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

    if (!body.productId || typeof body.productId !== 'string') {
      return NextResponse.json(
        {
          error: 'El campo "productId" es obligatorio.',
          code: 'MISSING_PRODUCT_ID',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (
      typeof body.quantityDelta !== 'number' ||
      !Number.isFinite(body.quantityDelta) ||
      !Number.isInteger(body.quantityDelta) ||
      body.quantityDelta === 0
    ) {
      return NextResponse.json(
        {
          error: 'El campo "quantityDelta" debe ser un número entero diferente de cero.',
          code: 'INVALID_QUANTITY_DELTA',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await adjustOrReplenishStockAtomic(body);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}
