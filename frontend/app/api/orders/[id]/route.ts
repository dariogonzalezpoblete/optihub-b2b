import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const ADMIN_EMAILS = ['multifocuslimitada@gmail.com'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!userId && !email) {
      return NextResponse.json({ error: 'Identificación requerida' }, { status: 401 });
    }

    const isAdmin = Boolean(email && ADMIN_EMAILS.includes(email.toLowerCase().trim()));

    // 1. Obtener la orden
    let query = adminSupabase.from('orders').select('*').eq('id', orderId);

    if (!isAdmin) {
      if (!userId) {
        return NextResponse.json({ error: 'userId requerido para clientes' }, { status: 400 });
      }
      query = query.eq('user_id', userId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado o sin permisos' }, { status: 404 });
    }

    // 2. Obtener los ítems de la orden (SKUs para comprar a NYWD)
    const { data: items, error: itemsError } = await adminSupabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    return NextResponse.json({
      order,
      items: items || [],
      isAdmin
    });
  } catch (err: any) {
    console.error('Exception fetching order detail:', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
