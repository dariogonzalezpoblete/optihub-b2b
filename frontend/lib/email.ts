import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface OrderItemEmail {
  id_ext: string;
  marca: string;
  modelo: string;
  codigo_color?: string;
  cantidad: number;
  precio_unitario_neto: number;
  subtotal_neto: number;
}

export interface BillingEmailData {
  razon_social: string;
  rut: string;
  giro: string;
  contacto_nombre: string;
  contacto_telefono: string;
  contacto_email: string;
  direccion: string;
  comuna: string;
  region: string;
  instrucciones_entrega?: string;
}

export interface OrderEmailPayload {
  externalReference: string;
  paymentId?: string;
  items: OrderItemEmail[];
  billing: BillingEmailData;
  totals: {
    totalUnits: number;
    montoNeto: number;
    montoIva: number;
    montoTotal: number;
  };
}

// Generador de plantilla HTML para la Óptica (Cliente B2B)
function generateClientEmailHtml(data: OrderEmailPayload): string {
  const { externalReference, items, billing, totals } = data;

  const rowsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 8px; font-weight: bold; color: #0f172a;">${item.marca} ${item.modelo}</td>
        <td style="padding: 12px 8px; color: #64748b; font-family: monospace; font-size: 12px;">${item.id_ext} ${item.codigo_color ? `(${item.codigo_color})` : ''}</td>
        <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: #0f172a;">${item.cantidad}</td>
        <td style="padding: 12px 8px; text-align: right; color: #334155;">$${item.precio_unitario_neto.toLocaleString('es-CL')}</td>
        <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: #059669;">$${item.subtotal_neto.toLocaleString('es-CL')}</td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Confirmación de Pedido B2B</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 24px; color: #f8fafc;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">OPTIHUB B2B WHOLESALE</h1>
          <p style="color: #e6fffa; margin: 8px 0 0 0; font-size: 14px;">Confirmación de Pedido Mayorista • Ref: <strong>${externalReference}</strong></p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #f1f5f9; margin-top: 0;">Estimado/a <strong>${billing.contacto_nombre}</strong> (${billing.razon_social}),</p>
          <p style="font-size: 14px; color: #94a3b8; line-height: 1.6;">
            Tu orden mayorista de <strong style="color: #10b981;">${totals.totalUnits} armazones</strong> ha sido confirmada con éxito a través de Mercado Pago. Nuestro equipo ya inició el proceso de consolidación de importación directa desde Estados Unidos.
          </p>

          <!-- Tiempos de Entrega -->
          <div style="background-color: #1e293b; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #e2e8f0;">
              📦 <strong>Plazo estimado de entrega:</strong> 10 a 15 días hábiles directo en tu óptica.<br>
              📄 <strong>Facturación:</strong> Emitiremos la factura electrónica a nombre de <strong>${billing.razon_social}</strong> (RUT: ${billing.rut}).
            </p>
          </div>

          <!-- Tabla de Productos -->
          <h3 style="color: #ffffff; font-size: 15px; margin: 24px 0 12px 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">Detalle de Armazones Adquiridos</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f8fafc; color: #475569; text-transform: uppercase; font-size: 11px;">
                <th style="padding: 10px 8px; text-align: left;">Modelo</th>
                <th style="padding: 10px 8px; text-align: left;">SKU</th>
                <th style="padding: 10px 8px; text-align: center;">Cant.</th>
                <th style="padding: 10px 8px; text-align: right;">Neto Unit.</th>
                <th style="padding: 10px 8px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- Desglose de Totales -->
          <div style="margin-top: 20px; background-color: #1e293b; padding: 16px; border-radius: 12px;">
            <table style="width: 100%; font-size: 14px; color: #cbd5e1;">
              <tr>
                <td style="padding: 4px 0;">Subtotal Neto CLP:</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #ffffff;">$${totals.montoNeto.toLocaleString('es-CL')}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">IVA (19% Chile):</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #10b981;">$${totals.montoIva.toLocaleString('es-CL')}</td>
              </tr>
              <tr style="border-top: 1px solid #334155;">
                <td style="padding: 10px 0 4px 0; font-size: 16px; font-weight: bold; color: #ffffff;">Total Facturado CLP:</td>
                <td style="padding: 10px 0 4px 0; text-align: right; font-size: 20px; font-weight: 900; color: #10b981;">$${totals.montoTotal.toLocaleString('es-CL')}</td>
              </tr>
            </table>
          </div>

          <!-- Dirección de Entrega -->
          <div style="margin-top: 20px; font-size: 13px; color: #94a3b8; border-top: 1px solid #1f2937; pt: 16px;">
            <p style="margin: 4px 0;"><strong style="color: #e2e8f0;">Dirección de Entrega:</strong> ${billing.direccion}, ${billing.comuna}, ${billing.region}</p>
            <p style="margin: 4px 0;"><strong style="color: #e2e8f0;">Teléfono de Contacto:</strong> ${billing.contacto_telefono}</p>
          </div>

          <div style="margin-top: 32px; text-align: center; border-top: 1px solid #1f2937; padding-top: 20px;">
            <p style="font-size: 12px; color: #64748b; margin: 0;">OptiHub Chile • Plataforma Mayorista B2B de Armazones Ópticos</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generador de plantilla HTML de Alerta para el Administrador (Tú)
function generateAdminEmailHtml(data: OrderEmailPayload): string {
  const { externalReference, paymentId, items, billing, totals } = data;

  const skuListHtml = items
    .map(
      (item) => `
      <li style="margin-bottom: 8px;">
        <strong>${item.cantidad}x</strong> ${item.marca} - <strong>${item.modelo}</strong> 
        (SKU: <span style="font-family: monospace; color: #0284c7;">${item.id_ext}</span> ${item.codigo_color ? `Color: ${item.codigo_color}` : ''})
        - Subtotal: $${item.subtotal_neto.toLocaleString('es-CL')} CLP
      </li>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Nueva Venta B2B</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        
        <!-- Header -->
        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 4px solid #10b981;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">🚨 ¡NUEVA ORDEN MAYORISTA B2B PAGADA!</h2>
          <p style="color: #10b981; font-weight: bold; margin: 6px 0 0 0; font-size: 14px;">Ref: ${externalReference} • ${totals.totalUnits} Armazones</p>
        </div>

        <div style="padding: 24px;">
          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
            <p style="margin: 0; color: #065f46; font-size: 15px; font-weight: bold;">
              Total Cobrado en Mercado Pago: $${totals.montoTotal.toLocaleString('es-CL')} CLP
            </p>
            <p style="margin: 4px 0 0 0; color: #047857; font-size: 12px;">
              Neto: $${totals.montoNeto.toLocaleString('es-CL')} | IVA (19%): $${totals.montoIva.toLocaleString('es-CL')} | MP ID: #${paymentId || 'N/A'}
            </p>
          </div>

          <h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 0;">
            1. SKUs a Comprar a Proveedor USA:
          </h3>
          <ul style="font-size: 14px; color: #334155; padding-left: 20px; line-height: 1.6;">
            ${skuListHtml}
          </ul>

          <h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px;">
            2. Datos de Facturación Electrónica (SII):
          </h3>
          <table style="width: 100%; font-size: 13px; color: #334155;">
            <tr><td><strong>Razón Social:</strong></td><td>${billing.razon_social}</td></tr>
            <tr><td><strong>RUT:</strong></td><td>${billing.rut}</td></tr>
            <tr><td><strong>Giro:</strong></td><td>${billing.giro}</td></tr>
            <tr><td><strong>Email Facturación:</strong></td><td>${billing.contacto_email}</td></tr>
          </table>

          <h3 style="color: #0f172a; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px;">
            3. Datos de Despacho en Chile:
          </h3>
          <table style="width: 100%; font-size: 13px; color: #334155;">
            <tr><td><strong>Receptor:</strong></td><td>${billing.contacto_nombre} (${billing.contacto_telefono})</td></tr>
            <tr><td><strong>Dirección:</strong></td><td>${billing.direccion}</td></tr>
            <tr><td><strong>Comuna / Región:</strong></td><td>${billing.comuna}, ${billing.region}</td></tr>
            ${billing.instrucciones_entrega ? `<tr><td><strong>Instrucciones:</strong></td><td>${billing.instrucciones_entrega}</td></tr>` : ''}
          </table>

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
            Notificación automática del sistema OptiHub B2B
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Función principal de envío de correos automáticos
export async function sendOrderConfirmationEmails(
  data: OrderEmailPayload,
  options?: { idempotencyKey?: string }
) {
  const adminEmail = process.env.ADMIN_EMAIL || 'contacto@optihub.cl';
  const fromEmail = process.env.EMAIL_FROM || 'OptiHub B2B <onboarding@resend.dev>';
  const isSimulationMode = process.env.EMAIL_SIMULATION_MODE === 'true';

  console.log(`📧 Preparando envío de correos automáticos para orden ${data.externalReference}...`);

  if (!resend || isSimulationMode) {
    const simulationReason = isSimulationMode
      ? 'EMAIL_SIMULATION_MODE activado'
      : 'RESEND_API_KEY no detectada';
    console.log(`ℹ Simulación de envío de correos (${simulationReason}):`);
    console.log(`-> Correo Óptica simulado a: ${data.billing.contacto_email}`);
    console.log(`-> Correo Admin simulado a: ${adminEmail}`);
    return {
      success: true,
      simulated: true,
      simulationReason,
      recipients: {
        client: data.billing.contacto_email,
        admin: adminEmail,
      },
    };
  }

  try {
    const clientHeaders: Record<string, string> = {};
    const adminHeaders: Record<string, string> = {};

    if (options?.idempotencyKey) {
      clientHeaders['X-Entity-Ref-ID'] = `${options.idempotencyKey}_client`;
      adminHeaders['X-Entity-Ref-ID'] = `${options.idempotencyKey}_admin`;
    }

    const clientReqOptions = options?.idempotencyKey
      ? { headers: { 'Idempotency-Key': `${options.idempotencyKey}_client` } }
      : undefined;

    const adminReqOptions = options?.idempotencyKey
      ? { headers: { 'Idempotency-Key': `${options.idempotencyKey}_admin` } }
      : undefined;

    // 1. Enviar correo a la Óptica (Cliente)
    const clientPromise = resend.emails.send(
      {
        from: fromEmail,
        to: data.billing.contacto_email,
        subject: `👓 Pedido Mayorista Confirmado #${data.externalReference} | OptiHub B2B`,
        html: generateClientEmailHtml(data),
        headers: Object.keys(clientHeaders).length > 0 ? clientHeaders : undefined,
      },
      clientReqOptions
    );

    // 2. Enviar correo de alerta al Administrador (Tú)
    const adminPromise = resend.emails.send(
      {
        from: fromEmail,
        to: adminEmail,
        subject: `🚨 [NUEVA VENTA B2B] #${data.externalReference} - ${data.billing.razon_social} (${data.totals.totalUnits} un.)`,
        html: generateAdminEmailHtml(data),
        headers: Object.keys(adminHeaders).length > 0 ? adminHeaders : undefined,
      },
      adminReqOptions
    );

    const [clientRes, adminRes] = await Promise.all([clientPromise, adminPromise]);

    if (clientRes.error || adminRes.error) {
      const err = clientRes.error || adminRes.error;
      const errMsg = err?.message || 'Error reportado por el proveedor Resend.';
      console.error('Error reportado por la API de Resend:', err);
      return { success: false, error: errMsg };
    }

    console.log('✓ Ambos correos automáticos enviados con éxito vía Resend:', {
      client: clientRes,
      admin: adminRes,
    });

    return { success: true, clientRes, adminRes };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error enviando correos con Resend:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ---------------------------------------------------------------------------
// NOTIFICACIÓN DE NUEVA ÓPTICA REGISTRADA (ALERTA INMEDIATA AL ADMINISTRADOR)
// ---------------------------------------------------------------------------

export interface NewRegistrationEmailPayload {
  email: string;
  razon_social: string;
  nombre_optica?: string;
  rut_empresa: string;
  giro_comercial?: string;
  nombre_contacto: string;
  telefono: string;
  comuna?: string;
  region?: string;
  fecha_solicitud?: string;
  adminUrl?: string;
}

function generateAdminNewRegistrationEmailHtml(data: NewRegistrationEmailPayload): string {
  const {
    email,
    razon_social,
    nombre_optica,
    rut_empresa,
    giro_comercial,
    nombre_contacto,
    telefono,
    comuna,
    region,
    fecha_solicitud,
    adminUrl,
  } = data;

  const targetAdminUrl =
    adminUrl ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin?tab=opticas`
      : 'https://frontend-gules-three-41.vercel.app/admin?tab=opticas');

  const cleanPhone = telefono.replace(/\D/g, '');
  const waUrl = cleanPhone.length >= 8 ? `https://wa.me/56${cleanPhone.slice(-9)}` : null;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Nueva Solicitud de Registro B2B</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); border-bottom: 3px solid #f59e0b; padding: 28px 24px; text-align: center;">
          <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 10px;">
            🔔 Nueva Solicitud B2B
          </span>
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
            ¡Nueva Óptica Registrada en OptiHub!
          </h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 6px 0 0 0;">
            Requiere tu revisión y aprobación para acceder a precios mayoristas.
          </p>
        </div>

        <div style="padding: 24px;">
          <!-- Card Resumen -->
          <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8; width: 35%;">Razón Social:</td>
                <td style="padding: 8px 0; color: #ffffff; font-weight: bold;">${razon_social}</td>
              </tr>
              ${
                nombre_optica && nombre_optica !== razon_social
                  ? `
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Nombre Fantasía:</td>
                <td style="padding: 8px 0; color: #e2e8f0;">${nombre_optica}</td>
              </tr>`
                  : ''
              }
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">RUT Empresa:</td>
                <td style="padding: 8px 0; color: #38bdf8; font-weight: bold; font-family: monospace;">${rut_empresa}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Giro Comercial:</td>
                <td style="padding: 8px 0; color: #e2e8f0;">${giro_comercial || 'No especificado'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Contacto:</td>
                <td style="padding: 8px 0; color: #ffffff; font-weight: 600;">${nombre_contacto}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Email:</td>
                <td style="padding: 8px 0; color: #38bdf8;"><a href="mailto:${email}" style="color: #38bdf8; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 8px 0; color: #94a3b8;">Teléfono:</td>
                <td style="padding: 8px 0; color: #ffffff;">
                  ${telefono} 
                  ${
                    waUrl
                      ? `<a href="${waUrl}" target="_blank" style="display: inline-block; margin-left: 8px; background-color: #22c55e; color: #ffffff; font-size: 11px; padding: 2px 8px; border-radius: 4px; text-decoration: none; font-weight: bold;">WhatsApp</a>`
                      : ''
                  }
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94a3b8;">Ubicación:</td>
                <td style="padding: 8px 0; color: #e2e8f0;">${comuna || 'N/A'}, ${region || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <!-- Botón de Acción Principal -->
          <div style="text-align: center; margin: 28px 0 16px 0;">
            <a href="${targetAdminUrl}" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);">
              ⚡ Revisar y Aprobar Óptica en el Panel
            </a>
          </div>

          <div style="text-align: center; font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #334155; padding-top: 16px;">
            OptiHub B2B Sistema de Seguridad y Verificación • ${fecha_solicitud ? new Date(fecha_solicitud).toLocaleString('es-CL') : 'Ahora'}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendAdminNewRegistrationEmail(data: NewRegistrationEmailPayload) {
  const adminEmail = process.env.ADMIN_EMAIL || 'contacto@optihub.cl';
  const fromEmail = process.env.EMAIL_FROM || 'OptiHub B2B <onboarding@resend.dev>';
  const isSimulationMode = process.env.EMAIL_SIMULATION_MODE === 'true';

  console.log(`📧 Preparando notificación de nueva óptica (${data.razon_social}) para el Administrador...`);

  if (!resend || isSimulationMode) {
    console.log(`ℹ Simulación de notificación de registro a Admin (${adminEmail}):`, data);
    return { success: true, simulated: true };
  }

  try {
    const res = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `🔔 [NUEVA ÓPTICA REGISTRADA] ${data.razon_social || data.nombre_optica} (${data.rut_empresa})`,
      html: generateAdminNewRegistrationEmailHtml(data),
    });

    if (res.error) {
      console.error('Error reportado por Resend al notificar registro:', res.error);
      return { success: false, error: res.error.message };
    }

    console.log('✓ Notificación de nueva óptica enviada exitosamente al admin:', res);
    return { success: true, res };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Excepción enviando notificación de registro:', msg);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// CONFIRMACIÓN DE CUENTA APROBADA (ENVIADA A LA ÓPTICA)
// ---------------------------------------------------------------------------

export interface OpticaApprovedEmailPayload {
  email: string;
  nombre_contacto: string;
  razon_social: string;
  loginUrl?: string;
}

function generateOpticaApprovedEmailHtml(data: OpticaApprovedEmailPayload): string {
  const targetLoginUrl =
    data.loginUrl ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
      : 'https://frontend-gules-three-41.vercel.app/login');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Cuenta Mayorista Aprobada</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 24px; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">OPTIHUB B2B WHOLESALE</h1>
          <p style="color: #e6fffa; margin: 8px 0 0 0; font-size: 14px;">Plataforma Mayorista para Ópticas de Chile</p>
        </div>

        <div style="padding: 32px 24px;">
          <div style="display: inline-block; background-color: #064e3b; border: 1px solid #059669; color: #34d399; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px;">
            ✓ Cuenta Verificada y Habilitada
          </div>

          <h2 style="color: #ffffff; font-size: 20px; margin: 0 0 12px 0;">
            ¡Bienvenido/a a OptiHub, ${data.nombre_contacto}!
          </h2>

          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Nos complace informarte que la cuenta de <strong style="color: #f1f5f9;">${data.razon_social}</strong> ha sido verificada y activada exitosamente por nuestro equipo comercial.
          </p>

          <div style="background-color: #1e293b; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #ffffff; font-weight: bold;">
              Tus beneficios comerciales ya están activos:
            </p>
            <ul style="margin: 0; padding-left: 20px; color: #94a3b8; font-size: 13px; line-height: 1.6;">
              <li>Visualización de <strong style="color: #34d399;">precios netos mayoristas</strong> en todo el catálogo.</li>
              <li>Acceso a más de 700 armazones de marcas de prestigio (Ray-Ban, Carrera, Lacoste, Tommy Hilfiger, Tom Ford y más).</li>
              <li>Consolidación e importación garantizada directo a tu óptica con factura electrónica.</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0 20px 0;">
            <a href="${targetLoginUrl}" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 32px; border-radius: 8px; letter-spacing: 0.02em;">
              Acceder al Catálogo Mayorista →
            </a>
          </div>

          <div style="text-align: center; font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #1f2937; padding-top: 16px;">
            OptiHub Chile • Importación y Distribución Mayorista para Ópticas
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendOpticaApprovedEmail(data: OpticaApprovedEmailPayload) {
  const fromEmail = process.env.EMAIL_FROM || 'OptiHub B2B <onboarding@resend.dev>';
  const isSimulationMode = process.env.EMAIL_SIMULATION_MODE === 'true';

  console.log(`📧 Preparando correo de aprobación para la óptica (${data.email})...`);

  if (!resend || isSimulationMode) {
    console.log(`ℹ Simulación de correo de aprobación a: ${data.email}`, data);
    return { success: true, simulated: true };
  }

  try {
    const res = await resend.emails.send({
      from: fromEmail,
      to: data.email,
      subject: `🎉 ¡Cuenta Aprobada! Ya puedes acceder a Precios Mayoristas | OptiHub B2B`,
      html: generateOpticaApprovedEmailHtml(data),
    });

    if (res.error) {
      console.error('Error reportado por Resend al enviar bienvenida aprobada:', res.error);
      return { success: false, error: res.error.message };
    }

    console.log('✓ Correo de bienvenida y aprobación enviado exitosamente a la óptica:', res);
    return { success: true, res };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Excepción enviando correo de aprobación a óptica:', msg);
    return { success: false, error: msg };
  }
}

