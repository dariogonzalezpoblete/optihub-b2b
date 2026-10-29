import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Validar autenticación de la solicitud
    const authResult = await authenticateServerRequest(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          error: 'Acceso no autorizado. Se requiere sesión activa para consultar tarifas mayoristas.',
          verified: false,
          pending: false,
          items: [],
        },
        { status: 401 }
      );
    }

    const { isB2BApproved: approved } = authResult;

    // 2. Control de Acceso B2B: Cuenta debe estar verificada (KYC SII) o ser admin
    if (!approved) {
      return NextResponse.json(
        {
          verified: false,
          pending: true,
          message:
            'Su cuenta de óptica se encuentra en proceso de validación comercial y tributaria SII. Los precios mayoristas se activarán una vez verificado el giro.',
          items: [],
        },
        { status: 200 }
      );
    }

    // 3. Obtener lista de IDs solicitados
    let body: { ids?: string[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud inválido. Formato JSON requerido.', items: [] },
        { status: 400 }
      );
    }

    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 150)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ verified: true, pending: false, items: [] }, { status: 200 });
    }

    // 4. Conexión segura de servidor (Service Role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Pricing API] Faltan variables de entorno Supabase Service Role');
      return NextResponse.json(
        { error: 'Error de configuración del servicio de precios.', items: [] },
        { status: 500 }
      );
    }

    const serverClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 5. Consulta restringida: ÚNICAMENTE columnas comerciales B2B permitidas
    // NUNCA selecciona ni expone costos/márgenes internos (costo_cif, ganancia, precio_usd, etc.)
    const { data, error } = await serverClient
      .from('marcos')
      .select('id_ext, precio_neto_clp, precio_bruto_clp, stock')
      .in('id_ext', ids);

    if (error) {
      console.error('[Pricing API] Error al consultar precios mayoristas:', error);
      return NextResponse.json(
        { error: 'Error al recuperar tarifas mayoristas.', items: [] },
        { status: 500 }
      );
    }

    // 6. Sanitización estricta defensiva
    const sanitizedItems = (data || []).map((row) => ({
      id_ext: row.id_ext,
      precio_neto_clp: typeof row.precio_neto_clp === 'number' ? row.precio_neto_clp : null,
      precio_bruto_clp: typeof row.precio_bruto_clp === 'number' ? row.precio_bruto_clp : null,
      stock: typeof row.stock === 'number' ? row.stock : null,
    }));

    return NextResponse.json(
      {
        verified: true,
        pending: false,
        items: sanitizedItems,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error('[Pricing API] Excepción inesperada:', err);
    return NextResponse.json(
      { error: 'Error interno en el servidor de precios mayoristas.', items: [] },
      { status: 500 }
    );
  }
}
