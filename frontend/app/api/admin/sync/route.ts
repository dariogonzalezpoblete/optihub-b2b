import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { calculateB2BPricing } from '@/lib/pricing/b2bPricing';

const BACKEND_API_URL = process.env.BACKEND_API_URL;
const REPORT_FILE_PATH = path.resolve(process.cwd(), '..', 'backend', 'scraper', 'sync_report_latest.json');

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Variables de entorno de Supabase no configuradas.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET() {
  try {
    const supabase = getAdminSupabase();

    // Fetch total products and brand counts
    const { count: totalCount } = await supabase
      .from('marcos')
      .select('id_ext', { count: 'exact', head: true });

    // Fetch all brands in batches to avoid PostgREST 1000-row limit
    let brandRows: Array<{ marca?: string }> = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('marcos')
        .select('marca')
        .range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      brandRows = brandRows.concat(data);
      if (data.length < step) break;
      from += step;
    }

    const brandCounts: Record<string, number> = {};
    if (brandRows) {
      for (const row of brandRows) {
        const m = (row.marca || '').trim();
        if (m) {
          brandCounts[m] = (brandCounts[m] || 0) + 1;
        }
      }
    }

    const brandList = Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Check report file
    let latestSummary = null;
    if (fs.existsSync(REPORT_FILE_PATH)) {
      try {
        const content = fs.readFileSync(REPORT_FILE_PATH, 'utf-8');
        latestSummary = JSON.parse(content);
      } catch {}
    }

    return NextResponse.json({
      total_catalog_products: totalCount || 0,
      brands: brandList,
      has_last_summary: latestSummary !== null,
      latest_summary: latestSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error consultando catálogo' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { brand, all_brands, dry_run, dolar, margin_percentage } = body;

    // 1. If external backend is explicitly defined and reachable, delegate to it
    if (BACKEND_API_URL) {
      try {
        const res = await fetch(`${BACKEND_API_URL}/api/sync/stock-prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch {
        // Backend unreachable, fallback to native direct Supabase sync below
      }
    }

    // 2. NATIVE CLOUD SYNC DIRECTLY ON SUPABASE (WITH PAGINATION)
    // Ensures all 1,097+ products are completely processed without pagination truncation
    const supabase = getAdminSupabase();
    const isAll = all_brands || !brand || brand === 'TODAS' || brand === 'ALL';
    const targetBrand = isAll ? null : brand;
    const dolarRate = typeof dolar === 'number' && dolar > 0 ? dolar : 950.0;
    const marginExtra = typeof margin_percentage === 'number' && margin_percentage > 0 ? margin_percentage : undefined;

    const products: any[] = [];
    const pageSize = 1000;
    let pageStart = 0;

    while (true) {
      let q = supabase
        .from('marcos')
        .select('id_ext, marca, modelo, stock, precio_usd, precio_neto_clp, precio_bruto_clp')
        .range(pageStart, pageStart + pageSize - 1);

      if (targetBrand) {
        q = q.ilike('marca', `%${targetBrand}%`);
      }

      const { data: pageData, error: dbError } = await q;
      if (dbError) {
        throw new Error(`Error consultando catálogo en Supabase: ${dbError.message}`);
      }
      if (!pageData || pageData.length === 0) break;
      products.push(...pageData);
      if (pageData.length < pageSize) break;
      pageStart += pageSize;
    }

    const itemsToUpdate: Array<{ id_ext: string; payload: Record<string, any> }> = [];
    const reportItems: any[] = [];
    let unchangedCount = 0;

    for (const prod of products) {
      const priceUsd = prod.precio_usd ? parseFloat(prod.precio_usd) : 0;
      if (priceUsd <= 0) {
        unchangedCount++;
        reportItems.push({
          id_ext: prod.id_ext,
          status: 'unchanged',
          oldStock: prod.stock || 0,
          newStock: prod.stock || 0,
          oldPriceNeto: prod.precio_neto_clp,
          newPriceNeto: prod.precio_neto_clp,
          changeReason: 'Sin precio USD de costo registrado',
        });
        continue;
      }

      const calculated = calculateB2BPricing(priceUsd, prod.marca, {
        dolar: dolarRate,
        marginPercentage: marginExtra,
      });

      const prevNeto = prod.precio_neto_clp || 0;
      const newNeto = calculated.precio_neto_clp;
      const priceChanged = Math.abs(prevNeto - newNeto) >= 1;

      if (priceChanged) {
        const payload = {
          precio_neto_clp: newNeto,
          precio_bruto_clp: calculated.precio_bruto_clp,
          ganancia_clp: calculated.ganancia_clp,
          costo_flete_usd: calculated.costo_flete_usd,
          costo_cif_clp: calculated.costo_cif_clp,
          ad_valorem_clp: calculated.ad_valorem_clp,
          costo_despacho_local_clp: calculated.costo_despacho_local_clp,
          costo_total_chile_clp: calculated.costo_total_chile_clp,
          stock: prod.stock ?? 0,
        };

        itemsToUpdate.push({ id_ext: prod.id_ext, payload });
        reportItems.push({
          id_ext: prod.id_ext,
          status: 'updated',
          oldStock: prod.stock || 0,
          newStock: prod.stock || 0,
          oldPriceNeto: prevNeto,
          newPriceNeto: newNeto,
          oldPriceUsd: priceUsd,
          newPriceUsd: priceUsd,
          changeReason: `Recálculo B2B (Dólar $${dolarRate}): $${prevNeto.toLocaleString('es-CL')} -> $${newNeto.toLocaleString('es-CL')}`,
        });
      } else {
        unchangedCount++;
        reportItems.push({
          id_ext: prod.id_ext,
          status: 'unchanged',
          oldStock: prod.stock || 0,
          newStock: prod.stock || 0,
          oldPriceNeto: prevNeto,
          newPriceNeto: newNeto,
          oldPriceUsd: priceUsd,
          newPriceUsd: priceUsd,
        });
      }
    }

    // Execute bulk update if not dry run
    let updatedCount = 0;
    if (!dry_run && itemsToUpdate.length > 0) {
      const concurrency = 20;
      for (let i = 0; i < itemsToUpdate.length; i += concurrency) {
        const chunk = itemsToUpdate.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (item) => {
            const { error } = await supabase
              .from('marcos')
              .update(item.payload)
              .eq('id_ext', item.id_ext);
            if (!error) updatedCount++;
          })
        );
      }
    } else if (dry_run) {
      updatedCount = itemsToUpdate.length;
    }

    const durationSeconds = Math.round(((Date.now() - startTime) / 1000) * 10) / 10;
    const brandName = targetBrand || 'TODAS';

    const summary = {
      timestamp: new Date().toISOString(),
      durationSeconds,
      brandsProcessed: [brandName],
      totalScanned: products.length,
      totalUpdated: updatedCount,
      totalOutOfStock: 0,
      totalUnchanged: unchangedCount,
      brandReports: [
        {
          brand: brandName,
          totalScanned: products.length,
          updated: updatedCount,
          outOfStock: 0,
          unchanged: unchangedCount,
          items: reportItems,
        },
      ],
    };

    return NextResponse.json({
      status: 'completed',
      mode: 'direct_cloud_sync',
      message: dry_run
        ? `[SIMULACIÓN] Se revisaron ${products.length} productos: ${updatedCount} con nuevo precio B2B.`
        : `Sincronización finalizada: ${products.length} productos revisados (${updatedCount} actualizados, ${unchangedCount} sin cambios) con dólar $${dolarRate}.`,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error en proceso de sincronización' },
      { status: 500 }
    );
  }
}
