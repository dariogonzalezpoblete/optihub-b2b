// frontend/app/api/inventory/deduct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deductStockForOrderAtomic } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inventory/deduct
 * Atomically decrements stock for an existing order with row-level locking.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { orderId?: string };
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

    const orderId = body?.orderId?.trim();
    if (!orderId) {
      return NextResponse.json(
        {
          error: 'El campo "orderId" es obligatorio.',
          code: 'MISSING_ORDER_ID',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await deductStockForOrderAtomic(orderId);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}
