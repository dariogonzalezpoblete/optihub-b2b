// frontend/app/api/inventory/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPurchaseOrderWithAtomicStockDeduction } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import type { CreatePurchaseOrderInput } from '@/lib/inventory/types';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';

export const dynamic = 'force-dynamic';

export async function handleCreateInventoryOrder(
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

    // 2. Control de aislamiento de entorno: bloqueado en Preview para proteger la base compartida
    const envGuard = checkBusinessMutationAllowed('create_inventory_order', options);
    if (!envGuard.allowed) {
      return envGuard.response;
    }

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

    // 2. Control de identidad estricto (Neutralización de suplantación / IDOR):
    // Nunca confiar en el body.userId provisto por el cliente.
    // Para usuarios comunes, forzar obligatoriamente auth.user.id.
    // Si un usuario común intenta especificar un userId diferente al suyo, se ignora y se sobreescribe con su identidad real.
    // Solo un administrador autenticado puede generar órdenes para otro userId si así lo especifica explícitamente.
    let effectiveUserId = auth.user.id;
    if (auth.isAdmin && typeof body.userId === 'string' && body.userId.trim()) {
      effectiveUserId = body.userId.trim();
    }

    const sanitizedPayload: CreatePurchaseOrderInput = {
      ...body,
      userId: effectiveUserId,
    };

    const createOrderFn =
      options?.customInventoryService?.createPurchaseOrderWithAtomicStockDeduction ||
      createPurchaseOrderWithAtomicStockDeduction;

    const result = await createOrderFn(sanitizedPayload);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  return handleCreateInventoryOrder(req);
}
