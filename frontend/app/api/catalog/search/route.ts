import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '6'), 12);

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const cleanQ = q.trim();

    // Consultamos marcos usando ilike sobre modelo, marca o id_ext
    // (solo columnas públicas no sensibles; RLS marcos_select_anon_public filtra stock > 0 para anon)
    const { data, count, error } = await supabase
      .from('marcos')
      .select('id_ext, marca, modelo, color, codigo_color, imagen_principal', { count: 'exact' })
      .or(`modelo.ilike.%${cleanQ}%,marca.ilike.%${cleanQ}%,id_ext.ilike.%${cleanQ}%`)
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      items: data || [], 
      total: count || 0 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
