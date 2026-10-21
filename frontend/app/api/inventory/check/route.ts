// frontend/app/api/inventory/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkStockAvailability } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventory/check?ids=prod1,prod2
 * POST /api/inventory/check { productIds: ['prod1', 'prod2'] }
 * Checks real-time stock levels for specified products.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids') || searchParams.get('productIds') || '';
    const productIds = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (productIds.length === 0) {
      return NextResponse.json(
        {
          error: 'Debe especificar al menos un producto a través del parámetro "ids" (ej: ?ids=RB-2140,TF-501).',
          code: 'MISSING_PRODUCT_IDS',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const items = await checkStockAvailability(productIds);
    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { productIds?: string[] };
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

    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json(
        {
          error: 'Debe proveer un arreglo "productIds" no vacío con los identificadores a consultar.',
          code: 'MISSING_PRODUCT_IDS',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const items = await checkStockAvailability(productIds);
    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}
