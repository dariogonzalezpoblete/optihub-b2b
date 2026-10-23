// frontend/app/api/inventory/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adjustOrReplenishStockAtomic } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import type { AdjustStockInput } from '@/lib/inventory/types';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';

export const dynamic = 'force-dynamic';

const MAX_QUANTITY_DELTA = 100000;
const VALID_TYPES = new Set(['RETURN', 'ADJUSTMENT', 'SALE']);

export async function handleAdjustStock(
  req: Request,
  options?: { customAuthClient?: any; customInventoryService?: any }
) {
  try {
    // 1. Autenticar identidad mediante Supabase Auth (Bearer <token>)
    const auth = await authenticateServerRequest(req, {
      customAuthClient: options?.customAuthClient,
    });

    if (!auth.authenticated) {
      return auth.response;
    }

    // 2. Control de autorización: exclusivo para administradores
    if (!auth.isAdmin) {
      return NextResponse.json(
        {
          error: 'Acceso denegado: Se requieren permisos administrativos para ajustar el inventario.',
          code: 'FORBIDDEN',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    // 3. Control de aislamiento de entorno: bloqueado en Preview para proteger la base compartida
    const envGuard = checkBusinessMutationAllowed('adjust_inventory', options);
    if (!envGuard.allowed) {
      return envGuard.response;
    }

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

    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    if (!productId) {
      return NextResponse.json(
        {
          error: 'El campo "productId" es obligatorio y debe ser una cadena no vacía.',
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

    if (Math.abs(body.quantityDelta) > MAX_QUANTITY_DELTA) {
      return NextResponse.json(
        {
          error: `El campo "quantityDelta" excede el límite máximo permitido (±${MAX_QUANTITY_DELTA}).`,
          code: 'QUANTITY_DELTA_OUT_OF_RANGE',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    let movementType: 'RETURN' | 'ADJUSTMENT' | 'SALE' = 'ADJUSTMENT';
    if (body.type) {
      const normalizedType = String(body.type).toUpperCase().trim();
      if (!VALID_TYPES.has(normalizedType)) {
        return NextResponse.json(
          {
            error: 'El campo "type" debe ser uno de los siguientes: RETURN, ADJUSTMENT, SALE.',
            code: 'INVALID_MOVEMENT_TYPE',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
      movementType = normalizedType as 'RETURN' | 'ADJUSTMENT' | 'SALE';
    }

    const sanitizedInput: AdjustStockInput = {
      productId,
      quantityDelta: body.quantityDelta,
      type: movementType,
      notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
      orderId: typeof body.orderId === 'string' ? body.orderId.trim() : undefined,
    };

    const adjustFn =
      options?.customInventoryService?.adjustOrReplenishStockAtomic ||
      adjustOrReplenishStockAtomic;

    const result = await adjustFn(sanitizedInput);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  return handleAdjustStock(req);
}
