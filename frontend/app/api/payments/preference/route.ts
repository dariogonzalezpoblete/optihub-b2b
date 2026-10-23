// frontend/app/api/payments/preference/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createOrderPaymentPreference } from '@/lib/payments/mercadopagoService';
import { checkCheckoutPreferenceAllowed } from '@/lib/env/runtimeEnv';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/preference
 * Generates an official Mercado Pago payment preference for an order,
 * with strict database price and catalog truth validation.
 */
export async function POST(req: NextRequest) {
  try {
    const checkoutGuard = checkCheckoutPreferenceAllowed();
    if (!checkoutGuard.allowed) {
      return (
        checkoutGuard.response ||
        NextResponse.json(
          {
            error: checkoutGuard.reason,
            code: checkoutGuard.code || 'CHECKOUT_BLOCKED',
            environment: checkoutGuard.environment,
            statusCode: 403,
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        )
      );
    }
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
    const errObj = error as Record<string, any>;
    const message = error instanceof Error ? error.message : 'Error interno al crear preferencia de pago';
    const originalError = errObj?.originalError;

    console.error('[API Payments Preference] Error detallado:', {
      message,
      name: errObj?.name,
      status: errObj?.status,
      originalError: originalError ? {
        name: originalError?.name,
        message: originalError?.message,
        status: originalError?.status,
        error: originalError?.error,
        causes: originalError?.causes,
        cause: originalError?.cause,
        apiResponse: originalError?.api_response?.body,
      } : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const isBadRequest =
      message.includes('DISCREPANCIA_MONTOS') ||
      message.includes('no existe') ||
      message.includes('requerido') ||
      message.includes('no es elegible') ||
      message.includes('unit_price') ||
      message.includes('invalid_items');

    const status = errObj?.status && Number(errObj.status) >= 400 && Number(errObj.status) < 600
      ? Number(errObj.status)
      : isBadRequest
      ? 400
      : 502;

    const details =
      originalError?.causes ||
      originalError?.error ||
      originalError?.message ||
      undefined;

    return NextResponse.json({ error: message, details }, { status });
  }
}
