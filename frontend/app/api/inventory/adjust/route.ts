// frontend/app/api/inventory/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adjustOrReplenishStockAtomic } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import type { AdjustStockInput } from '@/lib/inventory/types';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';
import { z } from 'zod'; // Zod for payload validation

export const dynamic = 'force-dynamic';

const MAX_QUANTITY_DELTA = 100000;
const VALID_TYPES = new Set(['RETURN', 'ADJUSTMENT', 'SALE']);

// Zod schema for the incoming payload
const AdjustStockSchema = z.object({
  productId: z.string().trim().min(1, { message: 'productId is required' }),
  quantityDelta: z.number()
    .int()
    .refine((n) => n !== 0, { message: 'quantityDelta must be non‑zero' })
    .refine((n) => Math.abs(n) <= MAX_QUANTITY_DELTA, { message: 'quantityDelta out of range' }),
  type: z.enum(['RETURN', 'ADJUSTMENT', 'SALE']).optional(),
  notes: z.string().optional(),
  orderId: z.string().optional(),
});

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

    // 2. Sólo administradores pueden ajustar inventario
    if (!auth.isAdmin) {
      return NextResponse.json(
        {
          error: 'Acceso denegado: Se requieren permisos administrativos.',
          code: 'FORBIDDEN',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    // 3. Bloqueo en entornos preview para evitar mutaciones en BD compartida
    const envGuard = checkBusinessMutationAllowed('adjust_inventory', options);
    if (!envGuard.allowed) {
      return envGuard.response;
    }

    // 4. Parsear y validar JSON con Zod
    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch (e) {
      return NextResponse.json(
        {
          error: 'Cuerpo de solicitud no es JSON válido.',
          code: 'INVALID_JSON_BODY',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const parseResult = AdjustStockSchema.safeParse(rawBody);
    if (!parseResult.success) {
      // Log detailed validation errors server‑side
      console.error('[AdjustStock] Zod validation error:', parseResult.error.format());
      return NextResponse.json(
        {
          error: 'Datos de solicitud inválidos.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const body: AdjustStockInput = parseResult.data;

    // 5. Normalizar campos y construir payload sanitizado
    const sanitizedInput: AdjustStockInput = {
      productId: body.productId,
      quantityDelta: body.quantityDelta,
      type: body.type ?? 'ADJUSTMENT',
      notes: body.notes?.trim(),
      orderId: body.orderId?.trim(),
    };

    const adjustFn =
      options?.customInventoryService?.adjustOrReplenishStockAtomic ||
      adjustOrReplenishStockAtomic;

    const result = await adjustFn(sanitizedInput);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    // Garantizar que cualquier excepción interna se traduce a mensaje genérico
    console.error('[AdjustStock] Excepción inesperada:', error);
    return formatInventoryErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  return handleAdjustStock(req);
}
