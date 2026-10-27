import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { SessionManager } from './services/auth';
import { NetworkInterceptor } from './services/interceptor';
import { ImageOptimizer } from './services/imageOptimizer';
import { CatalogRunner } from './services/catalog';
import { SupabaseService } from './services/supabase';
import {
  ScraperOptions,
  FastSyncOptions,
  FastSyncSummary,
  BrandSyncReport,
} from './types';
import { Logger } from './utils/logger';
import { formatBrandName } from './index';

/**
 * Fast inventory and pricing synchronization engine.
 *
 * Visits supplier catalog pages, extracts exclusively current cost price & available stock,
 * calculates B2B landed cost & margins, compares with Supabase records, and executes
 * high-speed bulk updates without touching images or product descriptions.
 */
export async function runFastSync(customOptions?: FastSyncOptions): Promise<FastSyncSummary> {
  const startTime = Date.now();
  const supabaseService = new SupabaseService();

  let brands: string[] = customOptions?.brands || [];
  if (
    customOptions?.allBrands ||
    brands.length === 0 ||
    brands.some((b) => b.toUpperCase() === 'TODAS' || b.toUpperCase() === 'ALL')
  ) {
    Logger.info('Descubriendo marcas registradas en Supabase...');
    const dbBrands = await supabaseService.getAllCatalogBrands();
    brands = dbBrands.length > 0 ? dbBrands : CONFIG.SCRAPER.DEFAULT_BRANDS;
  }

  const options: ScraperOptions = {
    brands,
    headless: customOptions?.headless ?? true,
    maxPages: customOptions?.maxPages ?? CONFIG.SCRAPER.DEFAULT_MAX_PAGINATION,
    minStock: 0,
    dryRun: customOptions?.dryRun ?? false,
    authStatePath: customOptions?.authStatePath || CONFIG.STORAGE.AUTH_STATE_PATH,
    stockOnly: true,
    pricingOverrides: customOptions?.pricingOverrides,
  };

  Logger.info('⚡ INICIANDO MÓDULO DE ACTUALIZACIÓN RÁPIDA (STOCK Y PRECIOS)', {
    brands: options.brands,
    headless: options.headless,
    dryRun: options.dryRun,
    pricingOverrides: options.pricingOverrides,
  });

  const sessionManager = new SessionManager(options.authStatePath);
  const imageOptimizer = new ImageOptimizer({ maxDimension: 1000, quality: 82 });
  const interceptor = new NetworkInterceptor({ minStock: 0 });
  const catalogRunner = new CatalogRunner(interceptor, imageOptimizer, supabaseService, sessionManager);

  let session: Awaited<ReturnType<typeof sessionManager.ensureAuthenticated>> | null = null;
  const brandReports: BrandSyncReport[] = [];

  try {
    session = await sessionManager.ensureAuthenticated(options.headless);
    const { context, page } = session;
    interceptor.attach(page);

    for (let i = 0; i < options.brands.length; i++) {
      const brand = options.brands[i];
      Logger.info(`\n[${i + 1}/${options.brands.length}] 🔄 Sincronizando stock y precios para '${brand}'...`);
      await catalogRunner.scrapeBrand(page, context, brand, options);

      const rep = catalogRunner.getLastReportForBrand(brand);
      if (rep) {
        brandReports.push(rep);
      }
    }

    await context.close().catch(() => {});
  } catch (err) {
    Logger.error('Error durante la sincronización rápida:', err);
    throw err;
  } finally {
    if (session && session.browser) {
      await session.browser.close().catch(() => {});
    }
  }

  const durationSeconds = Math.round(((Date.now() - startTime) / 1000) * 10) / 10;
  const totalScanned = brandReports.reduce((acc, r) => acc + r.totalScanned, 0);
  const totalUpdated = brandReports.reduce((acc, r) => acc + r.updated, 0);
  const totalOutOfStock = brandReports.reduce((acc, r) => acc + r.outOfStock, 0);
  const totalUnchanged = brandReports.reduce((acc, r) => acc + r.unchanged, 0);

  const summary: FastSyncSummary = {
    timestamp: new Date().toISOString(),
    durationSeconds,
    brandsProcessed: options.brands,
    totalScanned,
    totalUpdated,
    totalOutOfStock,
    totalUnchanged,
    brandReports,
  };

  // Save latest report locally
  try {
    const reportPath = path.resolve(process.cwd(), 'sync_report_latest.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf-8');
    Logger.info(`Reporte de cambios guardado en ${reportPath}`);
  } catch (writeErr) {
    Logger.warn('No se pudo guardar sync_report_latest.json:', writeErr);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        📊 RESUMEN GLOBAL DE ACTUALIZACIÓN RÁPIDA               ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ • Duración total:        ${String(durationSeconds + ' segundos').padEnd(38)} ║`);
  console.log(`║ • Marcas sincronizadas:  ${String(options.brands.join(', ')).slice(0, 38).padEnd(38)} ║`);
  console.log(`║ • Total SKUs procesados: ${String(totalScanned).padEnd(38)} ║`);
  console.log(`║ • Se actualizaron:       ${String(totalUpdated + ' productos').padEnd(38)} ║`);
  console.log(`║ • Productos sin stock:   ${String(totalOutOfStock + ' productos (stock 0)').padEnd(38)} ║`);
  console.log(`║ • Productos sin cambios: ${String(totalUnchanged + ' productos').padEnd(38)} ║`);
  console.log(`║ • Modo de base de datos: ${String(options.dryRun ? 'DRY-RUN (Simulación)' : 'SUPABASE ACTUALIZADO').padEnd(38)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  return summary;
}

/**
 * CLI runner when executed directly via Node / tsx
 */
export async function cli() {
  const args = process.argv.slice(2);
  const options: FastSyncOptions = {
    brands: ['Guess'],
    headless: false,
    dryRun: false,
    allBrands: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--brand' || arg === '-b') {
      const val = args[++i];
      if (val) {
        options.brands = val.split(',').map((b) => formatBrandName(b)).filter(Boolean);
      }
    } else if (arg === '--all-brands' || arg === '--all') {
      options.allBrands = true;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--pages' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) options.maxPages = val;
    } else if (arg === '--dolar') {
      const val = parseFloat(args[++i]);
      if (!isNaN(val)) {
        options.pricingOverrides = { ...(options.pricingOverrides || {}), dolar: val };
      }
    } else if (arg === '--margin') {
      const val = parseFloat(args[++i]);
      if (!isNaN(val)) {
        options.pricingOverrides = { ...(options.pricingOverrides || {}), marginPercentage: val };
      }
    }
  }

  try {
    const summary = await runFastSync(options);
    console.log(`Sincronización finalizada: Se actualizaron ${summary.totalUpdated} productos, ${summary.totalOutOfStock} sin stock, ${summary.totalUnchanged} sin cambios.`);
  } catch (e) {
    Logger.error('Fallo en ejecución CLI:', e);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  cli();
}
