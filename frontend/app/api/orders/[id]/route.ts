import { createClient } from '@supabase/supabase-js';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configuración de servidor incompleta: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function handleGetOrderDetail(
  req: Request,
  context: { params: Promise<{ id: string }>; customAuthClient?: any; customAdminClient?: any },
  options?: { customAuthClient?: any; customAdminClient?: any }
) {
  try {
    // 1. Autenticar identidad mediante Supabase Auth (Bearer <token>)
    const auth = await authenticateServerRequest(req, {
      customAuthClient: options?.customAuthClient || context?.customAuthClient,
    });

    if (!auth.authenticated) {
      return auth.response;
    }

    const { id: orderId } = await context.params;
    if (!orderId || typeof orderId !== 'string') {
      return Response.json({ error: 'orderId inválido' }, { status: 400 });
    }

    const adminSupabase = options?.customAdminClient || context?.customAdminClient || getAdminSupabase();

    // 2. Obtener la orden
    let query = adminSupabase.from('orders').select('*').eq('id', orderId);

    // Si NO es admin, restringir estrictamente la consulta al user_id verificado
    if (!auth.isAdmin) {
      query = query.eq('user_id', auth.user.id);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      // 404 intencional: no revela la existencia ni pertenencia de órdenes ajenas
      return Response.json({ error: 'Pedido no encontrado o sin permisos' }, { status: 404 });
    }

    // 3. Obtener los ítems de la orden (SKUs para comprar a NYWD)
    const { data: items, error: itemsError } = await adminSupabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('[OrderDetail] Error fetching order items:', itemsError.message || itemsError);
    }

    return Response.json({
      order,
      items: items || [],
      isAdmin: auth.isAdmin
    });
  } catch (err: any) {
    console.error('[OrderDetail] Exception fetching order detail:', err?.message || err);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetOrderDetail(req, context);
}
