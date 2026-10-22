import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role Supabase client for administrative order management
function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configuración de servidor incompleta: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: Request) {
  try {
    const adminSupabase = getAdminSupabase();
    const body = await req.json();
    const { orderId, shipping_provider, tracking_number, stage, customNote } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId es requerido' }, { status: 400 });
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
      courier: shipping_provider || null,
      trackingNumber: tracking_number ? tracking_number.trim() : null,
      note: customNote ? customNote.trim() : null,
      updatedAt: new Date().toISOString()
    });

    const updatePayload: Record<string, any> = {
      status: mappedStatus,
      shipping_provider: shipping_provider ? shipping_provider.trim() : null,
      tracking_number: tracking_number ? tracking_number.trim() : null,
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
      console.error('Error updating order tracking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, order: data });
  } catch (err: any) {
    console.error('Exception updating order tracking:', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
