import { NextRequest, NextResponse } from 'next/server';
import { preferenceClient } from '@/lib/mercadopago';
import { sendOrderConfirmationEmails } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cart, billing } = body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
    }

    // 1. Validar regla B2B de 10 unidades mínimas
    const totalUnits = cart.reduce((acc: number, item: any) => acc + (item.cantidad || 0), 0);
    if (totalUnits < 10) {
      return NextResponse.json(
        { error: `El pedido debe contener al menos 10 unidades. Actualmente tienes ${totalUnits}.` },
        { status: 400 }
      );
    }

    // 2. Calcular montos en CLP (Neto, IVA 19%, Total)
    const montoNeto = cart.reduce(
      (acc: number, item: any) => acc + (item.producto.precio_neto_clp || 0) * item.cantidad,
      0
    );
    const montoIva = Math.round(montoNeto * 0.19);
    const montoTotal = montoNeto + montoIva;

    const externalReference = `OPTI-${Date.now()}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const itemsFormatted = cart.map((item: any) => ({
      id_ext: item.producto.id_ext || 'SKU',
      marca: item.producto.marca || '',
      modelo: item.producto.modelo || '',
      codigo_color: item.producto.codigo_color || '',
      cantidad: item.cantidad,
      precio_unitario_neto: item.producto.precio_neto_clp || 0,
      subtotal_neto: (item.producto.precio_neto_clp || 0) * item.cantidad,
    }));

    // 3. Verificar si se tienen credenciales reales de Mercado Pago
    const mpToken = process.env.MP_ACCESS_TOKEN || '';
    const isMock = !mpToken || mpToken.includes('TEST-0000000000000000');

    if (isMock) {
      // En modo simulación para desarrollo, disparar correos de prueba
      await sendOrderConfirmationEmails({
        externalReference,
        paymentId: 'MOCK-PAYMENT-DEV',
        items: itemsFormatted,
        billing,
        totals: {
          totalUnits,
          montoNeto,
          montoIva,
          montoTotal,
        },
      });

      return NextResponse.json({
        id: `mock-pref-${Date.now()}`,
        init_point: `${siteUrl}/checkout/resultado?status=approved&mock=true&ref=${externalReference}`,
        external_reference: externalReference,
        monto_total: montoTotal,
        total_units: totalUnits,
        is_mock: true,
      });
    }

    // 4. Crear preferencia oficial en Mercado Pago
    const preferenceData = {
      body: {
        items: [
          {
            id: externalReference,
            title: `OptiHub B2B - Pedido Mayorista (${totalUnits} armazones surtidos)`,
            description: `Compra mayorista B2B para óptica ${billing.razon_social} (RUT: ${billing.rut}). Incluye IVA 19%.`,
            quantity: 1,
            unit_price: montoTotal,
            currency_id: 'CLP',
          },
        ],
        payer: {
          name: billing.razon_social || billing.contacto_nombre,
          email: billing.contacto_email,
          phone: {
            number: billing.contacto_telefono || '',
          },
          identification: {
            type: 'RUT',
            number: billing.rut || '',
          },
          address: {
            street_name: `${billing.direccion || ''}, ${billing.comuna || ''}`,
            zip_code: billing.region || 'Chile',
          },
        },
        back_urls: {
          success: `${siteUrl}/checkout/resultado?status=approved&ref=${externalReference}`,
          failure: `${siteUrl}/checkout/resultado?status=rejected&ref=${externalReference}`,
          pending: `${siteUrl}/checkout/resultado?status=pending&ref=${externalReference}`,
        },
        auto_return: 'approved' as const,
        external_reference: externalReference,
        statement_descriptor: 'OPTIHUB MAYORISTA',
        metadata: {
          rut_empresa: billing.rut,
          razon_social: billing.razon_social,
          giro: billing.giro,
          contacto_nombre: billing.contacto_nombre,
          contacto_telefono: billing.contacto_telefono,
          contacto_email: billing.contacto_email,
          direccion_despacho: `${billing.direccion}, ${billing.comuna}, ${billing.region}`,
          total_unidades: totalUnits,
          monto_neto_clp: montoNeto,
          monto_iva_clp: montoIva,
          monto_total_clp: montoTotal,
          items: itemsFormatted,
        },
      },
    };

    const response = await preferenceClient.create(preferenceData);

    return NextResponse.json({
      id: response.id,
      init_point: response.init_point || response.sandbox_init_point,
      sandbox_init_point: response.sandbox_init_point,
      external_reference: externalReference,
      monto_total: montoTotal,
      is_mock: false,
    });
  } catch (error: any) {
    console.error('Error al generar preferencia en Mercado Pago:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno al procesar el pago con Mercado Pago' },
      { status: 500 }
    );
  }
}
