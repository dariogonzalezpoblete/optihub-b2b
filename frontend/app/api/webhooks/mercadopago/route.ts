// frontend/app/api/webhooks/mercadopago/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { processMercadoPagoWebhookEvent } from '@/lib/payments/mercadopagoWebhookHandler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/mercadopago
 * Secure, strictly idempotent receiver for Mercado Pago payment webhook notifications.
 */
export async function POST(req: NextRequest) {
  try {
    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');

    let dataId = req.nextUrl.searchParams.get('data.id') || req.nextUrl.searchParams.get('id');
    let type = req.nextUrl.searchParams.get('type') || req.nextUrl.searchParams.get('topic');

    let bodyPayload: unknown = null;
    try {
      const cloned = await req.clone().json();
      bodyPayload = cloned;
      if (!dataId && cloned?.data?.id) {
        dataId = String(cloned.data.id);
      }
      if (!type && (cloned?.type || cloned?.topic)) {
        type = String(cloned.type || cloned.topic);
      }
    } catch {
      // Body might be empty or non-JSON for query-based notifications
    }

    const result = await processMercadoPagoWebhookEvent({
      xSignature,
      xRequestId,
      dataId,
      type,
      bodyPayload,
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error: unknown) {
    console.error('[API Webhooks MercadoPago] Unhandled error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
