// frontend/app/api/payments/preference/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createOrderPaymentPreference } from '@/lib/payments/mercadopagoService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/preference
 * Generates an official Mercado Pago payment preference for an order,
 * with strict database price and catalog truth validation.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud inválido. Se espera formato JSON.' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'El cuerpo de la solicitud no puede estar vacío.' },
        { status: 400 }
      );
    }

    const { orderId, userId, items, billingDetails, shippingAmount, customBackUrls } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json(
        { error: 'El parámetro "orderId" es obligatorio.' },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'El parámetro "userId" es obligatorio.' },
        { status: 400 }
      );
    }

    const result = await createOrderPaymentPreference({
      orderId,
      userId,
      items,
      billingDetails,
      shippingAmount,
      customBackUrls,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno al crear preferencia de pago';
    console.error('[API Payments Preference] Error:', error);

    const isBadRequest =
      message.includes('DISCREPANCIA_MONTOS') ||
      message.includes('no existe') ||
      message.includes('requerido') ||
      message.includes('no es elegible');

    const status = isBadRequest ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
