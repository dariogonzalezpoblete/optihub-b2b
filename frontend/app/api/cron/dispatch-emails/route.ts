// frontend/app/api/cron/dispatch-emails/route.ts
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchOrderEmailOutbox } from '@/lib/payments/orderEmailOutboxService';
import { checkCronDispatchAllowed } from '@/lib/env/runtimeEnv';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates the caller using CRON_SECRET or OUTBOX_DISPATCH_SECRET.
 * Requires HTTP Authorization header: Bearer <SECRET>.
 * Uses constant-time comparison to prevent timing attacks.
 * URL query parameters are rejected to avoid secret exposure in logs and histories.
 */
function validateCronSecret(req: NextRequest | Request): boolean {
  const cronSecret = process.env.CRON_SECRET || process.env.OUTBOX_DISPATCH_SECRET;
  if (!cronSecret) {
    // If no secret configured, fail-closed
    return false;
  }

  const authHeader = req.headers.get('authorization') || '';
  const expectedBearer = `Bearer ${cronSecret}`;

  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expectedBearer);

  if (authBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(authBuffer, expectedBuffer);
}

/**
 * Validates and parses the limit parameter.
 * Must be an integer between 1 and 100. Defaults to 20 if omitted.
 */
function parseLimit(limitParam: string | null): { value?: number; error?: string } {
  if (!limitParam) {
    return { value: 20 };
  }

  const trimmed = limitParam.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'Invalid limit: Must be a positive integer.' };
  }

  const parsed = parseInt(trimmed, 10);
  if (parsed < 1 || parsed > 100) {
    return { error: 'Invalid limit: Must be between 1 and 100.' };
  }

  return { value: parsed };
}

/**
 * Validates the optional orderId parameter.
 * If provided, must match canonical UUID v4 format.
 */
function parseOrderId(orderIdParam: string | null): { value?: string; error?: string } {
  if (!orderIdParam) {
    return { value: undefined };
  }

  const trimmed = orderIdParam.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return { error: 'Invalid orderId: Must be a valid UUID format.' };
  }

  return { value: trimmed.toLowerCase() };
}

/**
 * Core handler for email outbox background recovery.
 *
 * Guarantees:
 * 1. Environment isolation: ONLY runs when VERCEL_ENV === 'production'.
 *    Preview, local, and unknown environments are strictly rejected (HTTP 403)
 *    before touching the database or outbox queue.
 * 2. Authenticated caller required (HTTP 401).
 * 3. Sanitized query parameters (HTTP 400 on malformed input).
 */
export async function handleDispatch(
  req: NextRequest | Request,
  options?: {
    customDispatchService?: typeof dispatchOrderEmailOutbox;
  }
) {
  // 1. Control de aislamiento de entorno: exclusivo para Producción confirmada.
  // Preview, desarrollo local y entornos no verificados son rechazados inmediatamente (HTTP 403),
  // impidiendo cualquier consulta, reclamo o modificación sobre la tabla order_email_outbox compartida.
  const envGuard = checkCronDispatchAllowed();
  if (!envGuard.allowed) {
    console.warn(`[Cron Dispatch Emails] ${envGuard.reason}`);
    return (
      envGuard.response ||
      NextResponse.json(
        {
          error: envGuard.reason,
          code: 'PREVIEW_CRON_BLOCKED',
          environment: envGuard.environment,
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      )
    );
  }

  // 2. Validación de credencial de cron (CRON_SECRET o OUTBOX_DISPATCH_SECRET)
  if (!validateCronSecret(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing authorization token.' },
      { status: 401 }
    );
  }

  // 3. Extracción y validación de parámetros de consulta
  const url = 'nextUrl' in req && req.nextUrl ? req.nextUrl : new URL(req.url, 'http://localhost');
  const limitParam = url.searchParams.get('limit');
  const limitResult = parseLimit(limitParam);
  if (limitResult.error) {
    return NextResponse.json({ error: limitResult.error }, { status: 400 });
  }

  const orderIdParam = url.searchParams.get('orderId');
  const orderIdResult = parseOrderId(orderIdParam);
  if (orderIdResult.error) {
    return NextResponse.json({ error: orderIdResult.error }, { status: 400 });
  }

  const dispatchFn = options?.customDispatchService || dispatchOrderEmailOutbox;

  try {
    const result = await dispatchFn({
      limit: limitResult.value!,
      orderId: orderIdResult.value,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      isolatedOrderId: orderIdResult.value || null,
      ...result,
    });
  } catch (error: unknown) {
    console.error('[Cron Dispatch Emails] Unhandled error during dispatch execution:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export { handleDispatch as handleDispatchEmails };

export async function GET(req: NextRequest) {
  return handleDispatch(req);
}

export async function POST(req: NextRequest) {
  return handleDispatch(req);
}
