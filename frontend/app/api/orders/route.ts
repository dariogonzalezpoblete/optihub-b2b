import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = ['multifocuslimitada@gmail.com'];

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yrdjnkbrvynmnzyrxlfx.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_X4iaZ7islKo9js4bvdpl3w_T_Ka3dVD';
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: NextRequest) {
  try {
    const adminSupabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!userId && !email) {
      return NextResponse.json({ error: 'Identificación de usuario requerida' }, { status: 401 });
    }

    const isAdmin = Boolean(email && ADMIN_EMAILS.includes(email.toLowerCase().trim()));

    let query = adminSupabase
      .from('orders')
      .select('*')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    // Si NO es admin, filtrar estrictamente solo los pedidos del usuario
    if (!isAdmin) {
      if (!userId) {
        return NextResponse.json({ error: 'userId requerido para clientes' }, { status: 400 });
      }
      query = query.eq('user_id', userId);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtrar sesiones de checkout abandonadas sin pago
    const validOrders = (orders || []).filter(order => 
      order.status !== 'cancelled' && 
      !(order.status === 'pending' && order.payment_status === 'pending')
    );

    return NextResponse.json({ orders: validOrders, isAdmin });
  } catch (err: any) {
    console.error('Exception fetching orders:', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
