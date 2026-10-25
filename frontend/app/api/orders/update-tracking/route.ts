import { createClient } from '@supabase/supabase-js';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { checkBusinessMutationAllowed } from '@/lib/env/runtimeEnv';

// Service role Supabase client for administrative order management
function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configuración de servidor incompleta: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function handleUpdateTracking(
  req: Request,
  options?: { customAuthClient?: any; customAdminClient?: any }
) {
  try {
    // 1. Autenticar solicitud mediante Supabase Auth
    const auth = await authenticateServerRequest(req, {
      customAuthClient: options?.customAuthClient,
    });

    if (!auth.authenticated) {
      return auth.response;
    }

    // 2. Verificar rol administrativo del solicitante autenticado
    if (!auth.isAdmin) {
      return Response.json(
        { error: 'Acceso denegado: Se requieren permisos administrativos para actualizar el seguimiento.' },
        { status: 403 }
      );
    }

    // 3. Control de aislamiento de entorno: bloqueado en Preview para proteger la base compartida
    const envGuard = checkBusinessMutationAllowed('update_order_tracking', options);
    if (!envGuard.allowed) {
      return envGuard.response;
    }

    const adminSupabase = options?.customAdminClient || getAdminSupabase();
    const body = await req.json();
    const { orderId, shipping_provider, tracking_number, stage, customNote } = body;

    if (!orderId || typeof orderId !== 'string') {
      return Response.json({ error: 'orderId es requerido' }, { status: 400 });
    }

    // Determine DB status compatible with check constraint:
    // ['pending', 'payment_pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'requires_attention']
    let mappedStatus = 'preparing';
    if (stage === 'entregado') {
      mappedStatus = 'delivered';
    } else if (stage === 'reparto_chile') {
      mappedStatus = 'shipped';
    } else if (stage === 'desaduanamiento' || stage === 'viajando' || stage === 'logistica_usa') {
      mappedStatus = 'preparing';
    }

    const notesPayload = JSON.stringify({
      stage: stage || 'logistica_usa',
      courier: shipping_provider ? String(shipping_provider).trim() : null,
      trackingNumber: tracking_number ? String(tracking_number).trim() : null,
      note: customNote ? String(customNote).trim() : null,
      updatedAt: new Date().toISOString()
    });

    const updatePayload: Record<string, any> = {
      status: mappedStatus,
      shipping_provider: shipping_provider ? String(shipping_provider).trim() : null,
      tracking_number: tracking_number ? String(tracking_number).trim() : null,
      notes: notesPayload,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await adminSupabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('[UpdateTracking] Error updating order tracking:', error.message || error);
      return Response.json({ error: 'Error al actualizar el seguimiento del pedido' }, { status: 500 });
    }

    return Response.json({ success: true, order: data });
  } catch (err: any) {
    console.error('[UpdateTracking] Exception updating order tracking:', err?.message || err);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleUpdateTracking(req);
}
