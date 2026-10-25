// frontend/app/api/mercadopago/webhook/route.ts
import { NextRequest } from 'next/server';
import { POST as canonicalMercadoPagoWebhookPost } from '@/app/api/webhooks/mercadopago/route';

export const dynamic = 'force-dynamic';

/**
 * Alias legado de POST /api/webhooks/mercadopago.
 *
 * Delega íntegramente en el handler canónico, de modo que cualquier notificación recibida en esta
 * URL ejecute exactamente el mismo pipeline transaccional: guard de entorno, validación de firma,
 * verificación server-to-server del pago, idempotencia en processed_webhooks, descuento atómico de
 * inventario y encolado atómico en order_email_outbox. No contiene lógica de negocio propia.
 */
export async function POST(req: NextRequest) {
  return canonicalMercadoPagoWebhookPost(req);
}
