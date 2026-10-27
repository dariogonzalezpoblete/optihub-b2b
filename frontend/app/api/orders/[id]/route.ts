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
      isAdmin: auth.isAdmin,
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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateServerRequest(req);
    if (!auth.authenticated) {
      return auth.response;
    }
    if (!auth.isAdmin) {
      return Response.json(
        { error: 'Acceso denegado: Se requieren permisos de administrador para modificar pedidos.' },
        { status: 403 }
      );
    }

    const { id: orderId } = await context.params;
    if (!orderId || typeof orderId !== 'string') {
      return Response.json({ error: 'orderId inválido' }, { status: 400 });
    }

    const body = await req.json();
    const adminSupabase = getAdminSupabase();

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      const allowedStatuses = [
        'pending',
        'payment_pending',
        'paid',
        'preparing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'requires_attention',
      ];
      if (!allowedStatuses.includes(body.status)) {
        return Response.json({ error: `Estado inválido: ${body.status}` }, { status: 400 });
      }
      updatePayload.status = body.status;
    }

    if (body.payment_status !== undefined) {
      const allowedPaymentStatuses = ['pending', 'approved', 'rejected', 'refunded'];
      if (!allowedPaymentStatuses.includes(body.payment_status)) {
        return Response.json({ error: `Estado de pago inválido: ${body.payment_status}` }, { status: 400 });
      }
      updatePayload.payment_status = body.payment_status;
    }

    if (body.shipping_provider !== undefined) {
      updatePayload.shipping_provider = body.shipping_provider ? String(body.shipping_provider).trim() : null;
    }

    if (body.tracking_number !== undefined) {
      updatePayload.tracking_number = body.tracking_number ? String(body.tracking_number).trim() : null;
    }

    if (body.stage !== undefined || body.customNote !== undefined) {
      const notesPayload = JSON.stringify({
        stage: body.stage || 'logistica_usa',
        courier: body.shipping_provider ? String(body.shipping_provider).trim() : null,
        trackingNumber: body.tracking_number ? String(body.tracking_number).trim() : null,
        note: body.customNote ? String(body.customNote).trim() : null,
        updatedAt: new Date().toISOString(),
      });
      updatePayload.notes = notesPayload;
    } else if (body.notes !== undefined) {
      updatePayload.notes = body.notes;
    }

    const { data: updatedOrder, error } = await adminSupabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('[OrderDetail] Error updating order:', error.message || error);
      return Response.json({ error: 'Error al actualizar el pedido: ' + error.message }, { status: 500 });
    }

    return Response.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    console.error('[OrderDetail] Exception updating order:', err?.message || err);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
