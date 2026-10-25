// frontend/app/api/payments/preference/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ENDPOINT DEPRECADO (HTTP 410 Gone).
 *
 * Esta ruta legada creaba preferencias de Mercado Pago sin autenticación Bearer (confiaba en el
 * `userId` enviado en el body) y sin lease OCC por usuario. La ruta canónica es
 * POST /api/mercadopago/create-preference, que exige token Bearer, recalcula precios en el servidor
 * y persiste la preferencia bajo lease.
 *
 * Esta implementación NO abre conexiones a la base de datos ni invoca a Mercado Pago.
 */
function goneResponse() {
  return NextResponse.json(
    {
      error:
        'Endpoint deprecado. Utilice /api/mercadopago/create-preference con autenticación Bearer.',
    },
    { status: 410 }
  );
}

export async function POST() {
  return goneResponse();
}

export async function GET() {
  return goneResponse();
}
