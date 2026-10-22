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

export async function handleGetOrders(
  req: Request,
  options?: { customAuthClient?: any; customAdminClient?: any }
) {
  try {
    // 1. Autenticar identidad mediante Supabase Auth (Bearer <token>)
    const auth = await authenticateServerRequest(req, {
      customAuthClient: options?.customAuthClient,
    });

    if (!auth.authenticated) {
      return auth.response;
    }

    const adminSupabase = options?.customAdminClient || getAdminSupabase();
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');

    let query = adminSupabase
      .from('orders')
      .select('*')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    // 2. Control de autorización estricto:
    // - Para administradores legítimos (user.email verificado en lista de admins):
    //   pueden ver todos los pedidos, o filtrar por un cliente específico si proporcionan ?userId=.
    // - Para clientes comunes:
    //   se restringe obligatoriamente a su propio user.id verificado por Supabase Auth.
    //   Cualquier parámetro 'userId' o 'email' enviado en la URL por el cliente es estrictamente ignorado.
    if (auth.isAdmin) {
      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }
    } else {
      query = query.eq('user_id', auth.user.id);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('[Orders] Error fetching orders:', error.message || error);
      return Response.json({ error: 'Error al obtener pedidos' }, { status: 500 });
    }

    // Filtrar sesiones de checkout abandonadas sin pago
    const validOrders = (orders || []).filter((order: any) =>
      order.status !== 'cancelled' &&
      !(order.status === 'pending' && order.payment_status === 'pending')
    );

    return Response.json({ orders: validOrders, isAdmin: auth.isAdmin });
  } catch (err: any) {
    console.error('[Orders] Exception fetching orders:', err?.message || err);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleGetOrders(req);
}
