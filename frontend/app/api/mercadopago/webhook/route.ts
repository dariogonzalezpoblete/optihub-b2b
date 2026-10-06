import { NextRequest, NextResponse } from 'next/server';
import { paymentClient } from '@/lib/mercadopago';
import { sendOrderConfirmationEmails } from '@/lib/email';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // Mercado Pago puede enviar el ID en el body o en los searchParams
    const type = body.type || body.topic || searchParams.get('type') || searchParams.get('topic');
    const paymentId = body.data?.id || body.id || searchParams.get('data.id') || searchParams.get('id');

    if (type === 'payment' && paymentId) {
      const mpToken = process.env.MP_ACCESS_TOKEN || '';
      const isMock = !mpToken || mpToken.includes('TEST-0000000000000000');

      if (!isMock) {
        // Consultar el estado real del pago en los servidores de Mercado Pago
        const payment = await paymentClient.get({ id: paymentId });

        if (payment.status === 'approved') {
          console.log(`✓ Pago B2B Aprobado ID: ${paymentId} para referencia: ${payment.external_reference}`);
          
          const metadata = payment.metadata || {};

          // 1. Actualizar orden en Supabase si existe
          try {
            await supabase
              .from('pedidos')
              .update({
                estado_pago: 'pagado',
                estado_pedido: 'en_preparacion',
              })
              .eq('external_reference', payment.external_reference);
          } catch (dbErr) {
            console.error('Error actualizando pedido en BD:', dbErr);
          }

          // 2. Disparar correos electrónicos automáticos (Óptica y Administrador)
          await sendOrderConfirmationEmails({
            externalReference: payment.external_reference || `OPTI-${paymentId}`,
            paymentId: String(paymentId),
            items: metadata.items || [],
            billing: {
              razon_social: metadata.razon_social || 'Óptica Cliente',
              rut: metadata.rut_empresa || 'N/A',
              giro: metadata.giro || 'Artículos ópticos',
              contacto_nombre: metadata.contacto_nombre || 'Cliente',
              contacto_telefono: metadata.contacto_telefono || '',
              contacto_email: metadata.contacto_email || payment.payer?.email || '',
              direccion: metadata.direccion_despacho || '',
              comuna: metadata.comuna || '',
              region: metadata.region || '',
            },
            totals: {
              totalUnits: Number(metadata.total_unidades) || 10,
              montoNeto: Number(metadata.monto_neto_clp) || 0,
              montoIva: Number(metadata.monto_iva_clp) || 0,
              montoTotal: Number(metadata.monto_total_clp) || payment.transaction_amount || 0,
            },
          });
        } else {
          console.log(`ℹ Estado de pago recibido: ${payment.status} para ID: ${paymentId}`);
        }
      } else {
        console.log(`ℹ Webhook en modo simulación para ID: ${paymentId}`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error procesando webhook de Mercado Pago:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 200 });
  }
}
