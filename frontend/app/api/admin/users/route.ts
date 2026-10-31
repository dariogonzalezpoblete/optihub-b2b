import { createClient } from '@supabase/supabase-js';
import { authenticateServerRequest, isUserAdmin } from '@/lib/auth/serverAuth';

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configuración de servidor incompleta: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: Request) {
  try {
    // 1. Autenticación y Verificación de Rol Administrador
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

    const adminSupabase = getAdminSupabase();

    // 2. Obtener usuarios desde Supabase Auth (auth.users)
    const { data: usersData, error: authUsersError } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authUsersError) {
      console.error('[AdminUsers] Error listUsers:', authUsersError);
      return Response.json({ error: 'Error al listar usuarios registrados' }, { status: 500 });
    }

    // 3. Obtener perfiles comerciales de public.profiles para enriquecer información
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('*');

    if (profilesError) {
      console.warn('[AdminUsers] Advertencia al consultar profiles:', profilesError.message);
    }

    const profilesMap = new Map<string, any>();
    if (profiles && Array.isArray(profiles)) {
      profiles.forEach((p) => {
        if (p.id) profilesMap.set(p.id, p);
      });
    }

    // 4. Mapear y normalizar información de cada óptica / usuario
    const mappedUsers = (usersData?.users || []).map((u) => {
      const meta = u.user_metadata || {};
      const appMeta = u.app_metadata || {};
      const profile = profilesMap.get(u.id) || {};

      const isAdmin = isUserAdmin(u);

      const isApproved = Boolean(
        isAdmin ||
        appMeta.b2b_approved === true ||
        appMeta.b2b_status === 'approved' ||
        meta.verificado_b2b === true ||
        meta.estado_verificacion === 'verificado' ||
        meta.estado === 'activo'
      );

      let estadoVerificacion = 'pendiente';
      if (meta.estado_verificacion === 'rechazado' || meta.estado === 'bloqueado' || appMeta.b2b_status === 'rejected') {
        estadoVerificacion = 'rechazado';
      } else if (isApproved) {
        estadoVerificacion = 'verificado';
      }

      return {
        id: u.id,
        email: u.email || 'Sin email',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        email_confirmed: Boolean(u.email_confirmed_at),
        razon_social: profile.business_name || meta.razon_social || meta.nombre_optica || (isAdmin ? 'Administrador OptiHub' : 'Sin Razón Social'),
        nombre_optica: meta.nombre_optica || profile.business_name || meta.razon_social || 'Óptica',
        rut_empresa: profile.rut || meta.rut_empresa || meta.rut || (isAdmin ? 'N/A' : 'Sin RUT'),
        giro_comercial: profile.business_giro || meta.giro_comercial || meta.giro || 'Venta de productos ópticos al por mayor y menor',
        nombre_contacto: profile.first_name || meta.nombre_contacto || meta.nombre || 'Contacto no informado',
        telefono: profile.phone || meta.telefono || '',
        region: profile.region || meta.region || '',
        comuna: profile.commune || meta.comuna || '',
        direccion: profile.billing_address || meta.ciudad || '',
        estado_verificacion: estadoVerificacion,
        verificado_b2b: isApproved,
        isAdmin,
        fecha_solicitud: meta.fecha_solicitud || u.created_at,
        fecha_aprobacion: meta.fecha_aprobacion || null,
      };
    });

    // Ordenar: primero los pendientes (para rápida acción), luego por fecha de creación descendente
    mappedUsers.sort((a, b) => {
      if (a.estado_verificacion === 'pendiente' && b.estado_verificacion !== 'pendiente') return -1;
      if (a.estado_verificacion !== 'pendiente' && b.estado_verificacion === 'pendiente') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return Response.json({
      success: true,
      users: mappedUsers,
      total: mappedUsers.length,
      pendingCount: mappedUsers.filter((u) => u.estado_verificacion === 'pendiente' && !u.isAdmin).length,
    });
  } catch (error: any) {
    console.error('[AdminUsers] Excepción listando usuarios:', error);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
