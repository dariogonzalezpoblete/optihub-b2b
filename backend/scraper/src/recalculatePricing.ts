import { SupabaseService } from './services/supabase';
import { calculateB2BPricing, getBrandMarginPercentage } from './services/pricing';
import { Logger } from './utils/logger';

async function main() {
  const startTime = Date.now();
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       OptiHub B2B - Recalculador de Márgenes por Marca         ║');
  console.log('║   • Marcas Medias:    40% de ganancia (Guess, Nike, Adidas...) ║');
  console.log('║   • Alta Gama:        70% de ganancia (Gucci, Tom Ford, etc.)  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const supabaseService = new SupabaseService();
  if (!supabaseService.isConfigured()) {
    Logger.error('Supabase no está configurado. Revisa tus variables de entorno.');
    process.exit(1);
  }

  const supabase = supabaseService.getClient();

  Logger.info('Cargando catálogo completo desde Supabase...');
  const allProducts: any[] = [];
  let pageStart = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('marcos')
      .select('id_ext, marca, modelo, precio_usd, precio_neto_clp, precio_bruto_clp, stock')
      .range(pageStart, pageStart + pageSize - 1);

    if (error) {
      Logger.error('Error consultando Supabase:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < pageSize) break;
    pageStart += pageSize;
  }

  Logger.info(`Total productos cargados: ${allProducts.length}`);

  const itemsToUpdate: any[] = [];
  const brandStats: Record<string, { count: number; margin: number; sampleBefore: number; sampleAfter: number }> = {};

  for (const prod of allProducts) {
    const priceUsd = prod.precio_usd ? parseFloat(prod.precio_usd) : 0;
    if (priceUsd <= 0) continue;

    const brand = (prod.marca || '').trim();
    const margin = getBrandMarginPercentage(brand);
    const calculated = calculateB2BPricing(priceUsd, brand);

    if (!brandStats[brand]) {
      brandStats[brand] = {
        count: 0,
        margin,
        sampleBefore: prod.precio_neto_clp || 0,
        sampleAfter: calculated.precio_neto_clp,
      };
    }
    brandStats[brand].count++;

    itemsToUpdate.push({
      id_ext: prod.id_ext,
      stock: prod.stock,
      precio_usd: priceUsd,
      precio_neto_clp: calculated.precio_neto_clp,
      precio_bruto_clp: calculated.precio_bruto_clp,
      ganancia_clp: calculated.ganancia_clp,
      costo_flete_usd: calculated.costo_flete_usd,
      costo_cif_clp: calculated.costo_cif_clp,
      ad_valorem_clp: calculated.ad_valorem_clp,
      costo_despacho_local_clp: calculated.costo_despacho_local_clp,
      costo_total_chile_clp: calculated.costo_total_chile_clp,
    });
  }

  Logger.info(`Actualizando ${itemsToUpdate.length} productos en Supabase en lotes...`);
  await supabaseService.updateStockAndPricingBatch(itemsToUpdate);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('              📊 REPORTE DE REGLAS Y PRECIOS APLICADOS           ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`• Tiempo de ejecución:      ${duration} segundos`);
  console.log(`• Total productos ajustados: ${itemsToUpdate.length}`);
  console.log('\nDesglose de marcas procesadas:');

  const sortedBrands = Object.entries(brandStats).sort((a, b) => b[1].count - a[1].count);
  for (const [bName, stats] of sortedBrands) {
    const tier = stats.margin === 70 ? '👑 ALTA GAMA (70%)' : '📦 MARCA MEDIA (40%)';
    console.log(`  • ${bName.padEnd(20)} [${tier}]: ${String(stats.count).padStart(4)} items | Ejemplo: $${stats.sampleBefore.toLocaleString('es-CL')} -> $${stats.sampleAfter.toLocaleString('es-CL')}`);
  }

  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('✅ Base de datos Supabase y tienda web actualizadas con éxito.\n');
}

main().catch((err) => {
  console.error('Fallo en recálculo:', err);
  process.exit(1);
});
