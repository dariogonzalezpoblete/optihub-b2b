// frontend/app/api/inventory/health/route.ts
import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inventory/health
 * Returns connection status, latency, and pool statistics for PostgreSQL.
 */
export async function GET() {
  const health = await checkDatabaseHealth();
  const statusCode = health.healthy ? 200 : 503;

  return NextResponse.json(
    {
      status: health.healthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      ...health,
    },
    { status: statusCode }
  );
}
