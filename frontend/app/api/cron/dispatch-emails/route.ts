// frontend/app/api/cron/dispatch-emails/route.ts
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchOrderEmailOutbox } from '@/lib/payments/orderEmailOutboxService';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates the caller using CRON_SECRET or OUTBOX_DISPATCH_SECRET.
 * Requires HTTP Authorization header: Bearer <SECRET>.
 * Uses constant-time comparison to prevent timing attacks.
 * URL query parameters are rejected to avoid secret exposure in logs and histories.
 */
function validateCronSecret(req: NextRequest): boolean {
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
 * GET/POST /api/cron/dispatch-emails
 *
 * Dedicated protected endpoint for scheduled background recovery of failed or pending outbox notifications.
 * Can be invoked on a schedule by Vercel Cron, GitHub Actions, or cloud schedulers.
 *
 * Optional query parameters:
 * - limit: Number of records to process (1..100, default 20)
 * - orderId: Specific UUID to isolate dispatch to a single order
 */
async function handleDispatch(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing authorization token.' },
      { status: 401 }
    );
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  const limitResult = parseLimit(limitParam);
  if (limitResult.error) {
    return NextResponse.json({ error: limitResult.error }, { status: 400 });
  }

  const orderIdParam = req.nextUrl.searchParams.get('orderId');
  const orderIdResult = parseOrderId(orderIdParam);
  if (orderIdResult.error) {
    return NextResponse.json({ error: orderIdResult.error }, { status: 400 });
  }

  try {
    const result = await dispatchOrderEmailOutbox({
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

export async function GET(req: NextRequest) {
  return handleDispatch(req);
}

export async function POST(req: NextRequest) {
  return handleDispatch(req);
}
