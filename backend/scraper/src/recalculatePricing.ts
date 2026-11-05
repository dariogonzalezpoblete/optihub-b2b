import { SupabaseService } from './services/supabase';
import { calculateB2BPricing, getTieredProfitClp } from './services/pricing';
import { CONFIG } from './config';
import { Logger } from './utils/logger';
import { ProductStockPriceUpdate } from './types';

interface SimulatedItem {
  id_ext: string;
  marca: string;
  modelo: string;
  stock: number;
  precio_usd: number;
  fob_casilla_usd: number;
  costo_landed_clp: number;
  tramo_ganancia_clp: number;
  old_precio_b2b: number;
  new_precio_b2b: number;
  diff_clp: number;
  variation_pct: number;
  updatePayload: ProductStockPriceUpdate;
}

const BENCHMARK_SKUS = [
  'GU00276-90A',
  'GU00254-69Z',
  'GU00252-72S',
  'OR0098-53S',
  'SP817269-0000',
];

function formatClp(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(amount)).toLocaleString('es-CL')} CLP`;
}

function formatDiffClp(diff: number): string {
  if (diff > 0) return `+$${Math.round(diff).toLocaleString('es-CL')} CLP`;
  if (diff < 0) return `-$${Math.abs(Math.round(diff)).toLocaleString('es-CL')} CLP`;
  return '$0 CLP';
}

async function main() {
  const startTime = Date.now();
  const isDryRun = process.argv.includes('--dry-run');
  const dolar = CONFIG.FINANCIAL.DOLAR_CLP;
  const factorLogistico = CONFIG.FINANCIAL.FACTOR_LOGISTICO_NETO_CLP ?? 6192;

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║     OptiHub B2B - Modelo de Costo Logístico Neto ($6.192 CLP) + Margen   ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ • 1. FOB en CLP:         Precio_FOB_USD * $${dolar} CLP                        ║`);
  console.log(`║ • 2. Costo Total Neto:   (FOB en CLP) + $${factorLogistico} CLP (Factor Logístico)        ║`);
  console.log('║ • 3. Margen Comercial:   Marcas Medias: 30% | Alta Gama: 40%             ║');
  console.log('║ • 4. Ganancia Limpia:    Piso mínimo de $15.000 CLP en gama de entrada   ║');
  console.log('║ • 5. precio_neto_clp:    Costo Total Neto + MAX(Margen %, $15.000 CLP)   ║');
  console.log('║ • 6. Redondeo B2B:       Centena más cercana (Math.round(p / 100) * 100) ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  const supabaseService = new SupabaseService();
  if (!supabaseService.isConfigured()) {
    Logger.error('Supabase no está configurado. Revisa tus variables de entorno.');
    process.exit(1);
  }

  const supabase = supabaseService.getClient();
  if (!supabase) {
    Logger.error('Supabase client no configurado');
    process.exit(1);
  }

  Logger.info('Cargando catálogo completo de marcos desde Supabase...');
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

  Logger.info(`Total registros cargados desde Supabase: ${allProducts.length}`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SIMULACIÓN DE NUEVOS PRECIOS B2B
  // ─────────────────────────────────────────────────────────────────────────
  const simulatedItems: SimulatedItem[] = [];
  let skippedNoUsd = 0;

  for (const prod of allProducts) {
    const priceUsd = prod.precio_usd ? parseFloat(prod.precio_usd) : 0;
    if (priceUsd <= 0 || isNaN(priceUsd)) {
      skippedNoUsd++;
      continue;
    }

    const brand = (prod.marca || '').trim();
    const modelo = (prod.modelo || prod.id_ext || '').trim();
    const calculated = calculateB2BPricing(priceUsd, brand);
    const fobClp = priceUsd * dolar;

    const oldPriceB2B = prod.precio_neto_clp ? Number(prod.precio_neto_clp) : 0;
    const newPriceB2B = calculated.precio_neto_clp;
    const diffClp = newPriceB2B - oldPriceB2B;
    const variationPct = oldPriceB2B > 0 ? ((newPriceB2B - oldPriceB2B) / oldPriceB2B) * 100 : 0;

    simulatedItems.push({
      id_ext: prod.id_ext,
      marca: brand,
      modelo,
      stock: prod.stock ?? 0,
      precio_usd: priceUsd,
      fob_casilla_usd: Number((fobClp / dolar).toFixed(2)),
      costo_landed_clp: calculated.costo_total_chile_clp,
      tramo_ganancia_clp: calculated.ganancia_clp,
      old_precio_b2b: oldPriceB2B,
      new_precio_b2b: newPriceB2B,
      diff_clp: diffClp,
      variation_pct: variationPct,
      updatePayload: {
        id_ext: prod.id_ext,
        stock: prod.stock ?? 0,
        precio_usd: priceUsd,
        precio_neto_clp: calculated.precio_neto_clp,
        precio_bruto_clp: calculated.precio_bruto_clp,
        ganancia_clp: calculated.ganancia_clp,
        costo_flete_usd: calculated.costo_flete_usd,
        costo_cif_clp: calculated.costo_cif_clp,
        ad_valorem_clp: calculated.ad_valorem_clp,
        costo_despacho_local_clp: calculated.costo_despacho_local_clp,
        costo_total_chile_clp: calculated.costo_total_chile_clp,
      },
    });
  }

  // Estadísticas por SKU (variantes individuales en catálogo)
  let skusSubieron = 0;
  let skusBajaron = 0;
  let skusMantuvieron = 0;
  let sumVariationPct = 0;
  let countWithValidOldPrice = 0;
  let totalOldClp = 0;
  let totalNewClp = 0;

  for (const item of simulatedItems) {
    if (item.diff_clp > 0) {
      skusSubieron++;
    } else if (item.diff_clp < 0) {
      skusBajaron++;
    } else {
      skusMantuvieron++;
    }

    if (item.old_precio_b2b > 0) {
      sumVariationPct += item.variation_pct;
      countWithValidOldPrice++;
      totalOldClp += item.old_precio_b2b;
      totalNewClp += item.new_precio_b2b;
    }
  }

  // Estadísticas agrupadas por Modelo único (Marca + Modelo)
  const modelMap = new Map<string, { oldAvg: number; newAvg: number; count: number }>();
  for (const item of simulatedItems) {
    const key = `${item.marca.toLowerCase()}###${item.modelo.toLowerCase()}`;
    const current = modelMap.get(key) || { oldAvg: 0, newAvg: 0, count: 0 };
    current.oldAvg += item.old_precio_b2b;
    current.newAvg += item.new_precio_b2b;
    current.count += 1;
    modelMap.set(key, current);
  }

  let modelosUnicosSubieron = 0;
  let modelosUnicosBajaron = 0;
  let modelosUnicosMantuvieron = 0;
  for (const m of modelMap.values()) {
    const diff = m.newAvg - m.oldAvg;
    if (diff > 0) modelosUnicosSubieron++;
    else if (diff < 0) modelosUnicosBajaron++;
    else modelosUnicosMantuvieron++;
  }

  const avgVariationPct = countWithValidOldPrice > 0 ? sumVariationPct / countWithValidOldPrice : 0;
  const weightedVariationPct = totalOldClp > 0 ? ((totalNewClp - totalOldClp) / totalOldClp) * 100 : 0;

  // Selección de los 5 productos solicitados: GU00276, GU00254, GU00252, OR0098 y SP817269
  const benchmarkSamples: SimulatedItem[] = [];
  for (const sku of BENCHMARK_SKUS) {
    const found = simulatedItems.find((item) => item.id_ext === sku || item.modelo.toUpperCase() === sku.split('-')[0]);
    if (found) benchmarkSamples.push(found);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. REPORTE DETALLADO DE IMPACTO (PRE-UPDATE)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('          📊 REPORTE DE SIMULACIÓN E IMPACTO DE PRECIOS B2B               ');
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log(`• Total de SKUs en tabla marcos:             ${allProducts.length}`);
  console.log(`• Total de SKUs procesados (con FOB USD):    ${simulatedItems.length}${skippedNoUsd > 0 ? ` (${skippedNoUsd} omitidos sin USD)` : ''}`);
  console.log(`• Total de Modelos únicos (Marca + Modelo):  ${modelMap.size}`);
  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log('📈 VARIACIÓN DE PRECIOS EN COMPARACIÓN CON ACTUALIZACIÓN ANTERIOR:');
  console.log(`  • Subieron de precio:      ${String(skusSubieron).padStart(5)} SKUs  (${modelosUnicosSubieron} modelos únicos)`);
  console.log(`  • Bajaron de precio:       ${String(skusBajaron).padStart(5)} SKUs  (${modelosUnicosBajaron} modelos únicos)`);
  console.log(`  • Se mantuvieron igual:    ${String(skusMantuvieron).padStart(5)} SKUs  (${modelosUnicosMantuvieron} modelos únicos)`);
  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log(`• Variación promedio por SKU del catálogo:   ${avgVariationPct >= 0 ? '+' : ''}${avgVariationPct.toFixed(2)}%`);
  console.log(`• Variación ponderada global del catálogo:   ${weightedVariationPct >= 0 ? '+' : ''}${weightedVariationPct.toFixed(2)}%`);
  console.log('══════════════════════════════════════════════════════════════════════════\n');

  console.log('📋 NUEVOS PRECIOS B2B PARA LOS 5 SKUs DE REFERENCIA:');
  const sampleTable = benchmarkSamples.map((item) => ({
    Modelo: `${item.marca} ${item.modelo} (${item.id_ext})`,
    'FOB (USD)': `$${item.precio_usd.toFixed(2)}`,
    'FOB Casilla (+5.5%)': `$${item.fob_casilla_usd.toFixed(2)}`,
    'Costo Landed': formatClp(item.costo_landed_clp),
    'Tramo Ganancia': formatDiffClp(item.tramo_ganancia_clp),
    'Precio B2B Anterior': formatClp(item.old_precio_b2b),
    'Nuevo Precio B2B': formatClp(item.new_precio_b2b),
    'Diferencia Neta (CLP)': `${formatDiffClp(item.diff_clp)} (${item.variation_pct >= 0 ? '+' : ''}${item.variation_pct.toFixed(1)}%)`,
  }));
  console.table(sampleTable);

  if (isDryRun) {
    Logger.info('[DRY-RUN] Simulación finalizada. No se realizaron escrituras en Supabase.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. UPDATE FINAL EN BASE DE DATOS SUPABASE
  // ─────────────────────────────────────────────────────────────────────────
  const itemsToUpdate = simulatedItems.map((s) => s.updatePayload);
  Logger.info(`Ejecutando UPDATE masivo de ${itemsToUpdate.length} SKUs en Supabase...`);
  const updatedCount = await supabaseService.updateStockAndPricingBatch(itemsToUpdate, 25);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log(`✅ MIGRACIÓN COMPLETADA EN ${duration}s: ${updatedCount}/${itemsToUpdate.length} SKUs actualizados en Supabase.`);
  console.log('══════════════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fallo en migración y recálculo de precios:', err);
  process.exit(1);
});
