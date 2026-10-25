// frontend/app/api/inventory/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db/postgres';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import type { AuthenticateServerRequestOptions } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventory/health
 * Diagnóstico de conectividad de PostgreSQL (latencia y estadísticas del pool).
 *
 * Acceso restringido a administradores autenticados:
 * - Sin token válido: 401 (respuesta de authenticateServerRequest).
 * - Usuario autenticado no administrador: 403.
 * - Fallo interno: el detalle se registra solo en el servidor; al cliente se devuelve un mensaje
 *   genérico sin cadenas de conexión, hosts ni mensajes crudos del driver PostgreSQL.
 */
export async function handleInventoryHealth(
  req: Request,
  options?: {
    customAuthClient?: AuthenticateServerRequestOptions['customAuthClient'];
    customHealthCheck?: typeof checkDatabaseHealth;
  }
) {
  const auth = await authenticateServerRequest(req, {
    customAuthClient: options?.customAuthClient,
  });

  if (!auth.authenticated) {
    return auth.response;
  }

  if (!auth.isAdmin) {
    return NextResponse.json(
      {
        error: 'Acceso denegado: Se requieren permisos administrativos para consultar el estado de la base de datos.',
        code: 'FORBIDDEN',
        statusCode: 403,
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  const timestamp = new Date().toISOString();

  try {
    const healthCheck = options?.customHealthCheck ?? checkDatabaseHealth;
    const health = await healthCheck();

    if (!health.healthy) {
      console.error('[Inventory Health] Base de datos no saludable:', health.error);
      return NextResponse.json(
        {
          status: 'DOWN',
          timestamp,
          healthy: false,
          error: 'Servicio de base de datos no disponible.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: 'UP',
        timestamp,
        healthy: true,
        latencyMs: health.latencyMs,
        poolStats: health.poolStats,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[Inventory Health] Error inesperado en el diagnóstico:', error);
    return NextResponse.json(
      {
        status: 'DOWN',
        timestamp,
        healthy: false,
        error: 'Servicio de base de datos no disponible.',
      },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleInventoryHealth(req);
}
