import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendAdminNewRegistrationEmail } from '@/lib/email';

const RegisterNotifySchema = z.object({
  email: z.string().email(),
  razon_social: z.string().min(1),
  nombre_optica: z.string().optional(),
  rut_empresa: z.string().min(1),
  giro_comercial: z.string().optional(),
  nombre_contacto: z.string().min(1),
  telefono: z.string().min(1),
  region: z.string().optional(),
  comuna: z.string().optional(),
  fecha_solicitud: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parseResult = RegisterNotifySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Datos de registro incompletos o inválidos', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const payload = parseResult.data;

    // Disparar correo de notificación inmediata al administrador
    const emailResult = await sendAdminNewRegistrationEmail({
      email: payload.email,
      razon_social: payload.razon_social,
      nombre_optica: payload.nombre_optica || payload.razon_social,
      rut_empresa: payload.rut_empresa,
      giro_comercial: payload.giro_comercial,
      nombre_contacto: payload.nombre_contacto,
      telefono: payload.telefono,
      comuna: payload.comuna,
      region: payload.region,
      fecha_solicitud: payload.fecha_solicitud || new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      notified: emailResult.success,
      simulated: emailResult.simulated || false,
    });
  } catch (error: any) {
    console.error('[RegisterNotify] Error al procesar notificación de nuevo registro:', error);
    return NextResponse.json(
      { error: 'Error interno al procesar notificación' },
      { status: 500 }
    );
  }
}
