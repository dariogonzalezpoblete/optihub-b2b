import { createClient } from '@supabase/supabase-js';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { sendOpticaApprovedEmail } from '@/lib/email';

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configuración de servidor incompleta: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validar autenticación de administrador
    const auth = await authenticateServerRequest(req);
    if (!auth.authenticated) {
      return auth.response;
    }
    if (!auth.isAdmin) {
      return Response.json(
        { error: 'Acceso denegado: Se requieren permisos de administrador.' },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await context.params;
    if (!targetUserId || typeof targetUserId !== 'string') {
      return Response.json({ error: 'targetUserId inválido' }, { status: 400 });
    }

    const body = await req.json();
    const { action } = body;

    if (!['approve', 'reject', 'reset'].includes(action)) {
      return Response.json(
        { error: 'Acción inválida. Debe ser approve, reject o reset' },
        { status: 400 }
      );
    }

    const adminSupabase = getAdminSupabase();

    // 2. Obtener datos actuales del usuario en auth.users
    const { data: userData, error: getUserError } = await adminSupabase.auth.admin.getUserById(targetUserId);

    if (getUserError || !userData?.user) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const currentUser = userData.user;
    const currentMeta = currentUser.user_metadata || {};
    const currentAppMeta = currentUser.app_metadata || {};

    let updatedUserMeta: Record<string, any> = { ...currentMeta };
    let updatedAppMeta: Record<string, any> = { ...currentAppMeta };

    if (action === 'approve') {
      updatedUserMeta = {
        ...updatedUserMeta,
        verificado_b2b: true,
        estado_verificacion: 'verificado',
        estado: 'activo',
        fecha_aprobacion: new Date().toISOString(),
      };
      updatedAppMeta = {
        ...updatedAppMeta,
        b2b_approved: true,
        b2b_status: 'approved',
      };
    } else if (action === 'reject') {
      updatedUserMeta = {
        ...updatedUserMeta,
        verificado_b2b: false,
        estado_verificacion: 'rechazado',
        estado: 'bloqueado',
        fecha_rechazo: new Date().toISOString(),
      };
      updatedAppMeta = {
        ...updatedAppMeta,
        b2b_approved: false,
        b2b_status: 'rejected',
      };
    } else if (action === 'reset') {
      updatedUserMeta = {
        ...updatedUserMeta,
        verificado_b2b: false,
        estado_verificacion: 'pendiente',
        estado: 'pendiente',
      };
      updatedAppMeta = {
        ...updatedAppMeta,
        b2b_approved: false,
        b2b_status: 'pending',
      };
    }

    // 3. Aplicar actualización vía Supabase Auth Service Role
    const { data: updateData, error: updateError } = await adminSupabase.auth.admin.updateUserById(
      targetUserId,
      {
        user_metadata: updatedUserMeta,
        app_metadata: updatedAppMeta,
      }
    );

    if (updateError) {
      console.error('[AdminUsers] Error al actualizar estado de usuario:', updateError);
      return Response.json({ error: 'Error al actualizar usuario: ' + updateError.message }, { status: 500 });
    }

    // 4. Si la acción es 'approve', enviar correo de bienvenida y confirmación a la óptica
    let emailSent = false;
    if (action === 'approve' && currentUser.email) {
      try {
        const emailResult = await sendOpticaApprovedEmail({
          email: currentUser.email,
          nombre_contacto: currentMeta.nombre_contacto || currentMeta.nombre || 'Estimado(a) Cliente',
          razon_social: currentMeta.razon_social || currentMeta.nombre_optica || 'Óptica Mayorista',
        });
        emailSent = emailResult.success;
      } catch (emailErr) {
        console.warn('[AdminUsers] No se pudo enviar el correo de aprobación al cliente:', emailErr);
      }
    }

    return Response.json({
      success: true,
      action,
      user: updateData.user,
      emailSent,
    });
  } catch (error: any) {
    console.error('[AdminUsers] Excepción actualizando usuario:', error);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
