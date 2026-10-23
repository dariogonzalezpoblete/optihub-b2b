// frontend/app/api/inventory/deduct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deductStockForOrderAtomic } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';

export const dynamic = 'force-dynamic';

export async function handleDeductStock(
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

    // 2. Control de autorización: deduct manual es una operación exclusiva para administradores.
    // En los flujos normales de compra, el descuento es ejecutado atómicamente por el webhook
    // llamando directamente a deductStockForOrderAtomic en TypeScript, no por esta vía HTTP pública.
    if (!auth.isAdmin) {
      return NextResponse.json(
        {
          error: 'Acceso denegado: Se requieren permisos administrativos para ejecutar descuentos manuales de inventario.',
          code: 'FORBIDDEN',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    // 3. Control de aislamiento de entorno: bloqueado en Preview para proteger la base compartida
    const envGuard = checkBusinessMutationAllowed('deduct_inventory', options);
    if (!envGuard.allowed) {
      return envGuard.response;
    }

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

    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId) {
      return NextResponse.json(
        {
          error: 'El campo "orderId" es obligatorio y debe ser un UUID válido.',
          code: 'MISSING_ORDER_ID',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const deductFn =
      options?.customInventoryService?.deductStockForOrderAtomic ||
      deductStockForOrderAtomic;

    const result = await deductFn(orderId);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  return handleDeductStock(req);
}
