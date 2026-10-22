import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { CONFIG } from './config';
import { SessionManager } from './services/auth';
import { NetworkInterceptor } from './services/interceptor';
import { ImageOptimizer } from './services/imageOptimizer';
import { CatalogRunner } from './services/catalog';
import { SupabaseService } from './services/supabase';
import { ScraperOptions, OptiHubProduct } from './types';
import { Logger } from './utils/logger';

interface ParsedArgs {
  options: ScraperOptions;
  hasExplicitBrand: boolean;
}

export function formatBrandName(b: string): string {
  const trimmed = b.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'ic berlin' || lower === 'ic! berlin') return 'IC! Berlin';
  if (lower === 'bmw') return 'BMW';
  if (lower === 'dkny') return 'DKNY';
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let hasExplicitBrand = false;

  const options: ScraperOptions = {
    brands: CONFIG.SCRAPER.DEFAULT_BRANDS,
    headless: false,
    maxPages: CONFIG.SCRAPER.DEFAULT_MAX_PAGINATION,
    minStock: CONFIG.SCRAPER.DEFAULT_MIN_STOCK,
    dryRun: false,
    authStatePath: CONFIG.STORAGE.AUTH_STATE_PATH,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--brand' || arg === '-b') {
      const val = args[++i];
      if (val) {
        options.brands = val
          .split(',')
          .map((b) => formatBrandName(b))
          .filter(Boolean);
        hasExplicitBrand = true;
      }
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--pages' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) options.maxPages = val;
    } else if (arg === '--min-stock' || arg === '-s') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) options.minStock = val;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--stock-only' || arg === '--inventory-only') {
      options.stockOnly = true;
      options.minStock = 0; // In inventory sync, do not filter out low-stock variants
    } else if (arg === '--all-brands' || arg === '--all') {
      options.allBrands = true;
      hasExplicitBrand = true;
    } else if (arg === '--state') {
      const val = args[++i];
      if (val) options.authStatePath = path.resolve(process.cwd(), val);
    }
  }

  return { options, hasExplicitBrand };
}

/**
 * Prompts user interactively in the terminal to specify one or multiple brands
 */
async function promptBrandsInteractive(): Promise<{ brands: string[]; allBrands: boolean }> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n🏷️  Marcas a extraer (separadas por coma, ej: Guess, Nike, o escribe TODAS para todo tu catálogo) [Guess]: ',
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (!trimmed) {
          resolve({ brands: ['Guess'], allBrands: false });
        } else if (trimmed.toUpperCase() === 'TODAS' || trimmed.toUpperCase() === 'ALL') {
          resolve({ brands: [], allBrands: true });
        } else {
          const list = trimmed
            .split(',')
            .map((b) => formatBrandName(b))
            .filter(Boolean);
          resolve({ brands: list.length > 0 ? list : ['Guess'], allBrands: false });
        }
      }
    );
  });
}

async function main() {
  const startTime = Date.now();
  const { options, hasExplicitBrand } = parseArgs();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       OptiHub Provider Catalog Scraper (v2.2 Enterprise)       ║');
  console.log('║   • Interactive reCAPTCHA Login & Session State Persistence    ║');
  console.log('║   • Multi-Brand Batch Extraction & Interactive Selection       ║');
  console.log('║   • Rapid Inventory-Only Sync Mode (--stock-only)              ║');
  console.log('║   • Sharp WebP Image Optimization & Lanczos-3 Resampling       ║');
  console.log('║   • Landed Cost (CIF + Ad Valorem 6% + VAT 19%) Gated Pricing  ║');
  console.log('║   • Dual-Image (Main + Secondary) & Smart Stock Only Sync      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const supabaseService = new SupabaseService();

  // If no --brand was provided on the command line, prompt interactively
  if (!hasExplicitBrand && process.stdin.isTTY) {
    const promptRes = await promptBrandsInteractive();
    if (promptRes.allBrands) {
      options.allBrands = true;
    } else {
      options.brands = promptRes.brands;
    }
  }

  // If allBrands requested, dynamically discover all brands loaded in Supabase
  if (options.allBrands || options.brands.some((b) => b.toUpperCase() === 'ALL' || b.toUpperCase() === 'TODAS')) {
    Logger.info('Descubriendo todas las marcas registradas en tu catálogo de Supabase...');
    const dbBrands = await supabaseService.getAllCatalogBrands();
    if (dbBrands.length > 0) {
      options.brands = dbBrands;
      Logger.success(`Marcas descubiertas en catálogo (${dbBrands.length}): ${dbBrands.join(', ')}`);
    } else {
      Logger.warn('No se encontraron marcas en Supabase. Usando marca por defecto: Guess');
      options.brands = ['Guess'];
    }
  }

  Logger.info(`Modo de ejecución: ${options.stockOnly ? '⚡ ACTUALIZACIÓN RÁPIDA DE INVENTARIO (STOCK-ONLY)' : '🚀 INGESTA COMPLETA DE CATÁLOGO'}`);
  Logger.info(`Marcas seleccionadas para procesar (${options.brands.length}): ${options.brands.join(', ')}`);
  Logger.info('Starting scraper with options:', {
    brands: options.brands,
    headless: options.headless,
    maxPages: options.maxPages,
    minStock: options.minStock,
    stockOnly: !!options.stockOnly,
    dryRun: options.dryRun,
    authStateFile: options.authStatePath,
  });

  const sessionManager = new SessionManager(options.authStatePath);
  const imageOptimizer = new ImageOptimizer({ maxDimension: 1000, quality: 82 });
  const interceptor = new NetworkInterceptor({ minStock: options.minStock });
  const catalogRunner = new CatalogRunner(interceptor, imageOptimizer, supabaseService, sessionManager);

  const allExtractedProducts: OptiHubProduct[] = [];

  let session: Awaited<ReturnType<typeof sessionManager.ensureAuthenticated>> | null = null;

  try {
    // 1. Authenticate (handles reCAPTCHA visibly if needed; reuses auth_state.json if valid)
    session = await sessionManager.ensureAuthenticated(options.headless);
    const { context, page } = session;

    // 2. Attach API Network Interceptor to Page
    interceptor.attach(page);

    // 3. Process each selected brand sequentially
    for (let bIndex = 0; bIndex < options.brands.length; bIndex++) {
      const brand = options.brands[bIndex];
      Logger.info(`\n[${bIndex + 1}/${options.brands.length}] 🔄 Iniciando procesamiento de marca: '${brand}'...`);

      const brandProducts = await catalogRunner.scrapeBrand(page, context, brand, options);
      allExtractedProducts.push(...brandProducts);

      if (brandProducts.length > 0) {
        // Save local backup JSON
        const exportFile = `catalog_${brand.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
        fs.writeFileSync(exportFile, JSON.stringify(brandProducts, null, 2), 'utf-8');
        Logger.info(`Saved local JSON backup of ${brandProducts.length} items to ${exportFile}`);
      }
    }

    // 4. Summary Report
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalStats = interceptor.getStats();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('                 📊 RESUMEN FINAL DE EJECUCIÓN                  ');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`• Tiempo Total de Ejecución:      ${elapsedSec}s`);
    console.log(`• Marcas Procesadas:              ${options.brands.join(', ')}`);
    console.log(`• Total Productos Estructurados:  ${allExtractedProducts.length}`);
    console.log(`• Paquetes API Interceptados:     ${totalStats.totalPackets}`);
    console.log(`• Estado de Sesión Persistido:    ${options.authStatePath}`);
    console.log(`• Base de Datos Supabase:         ${options.dryRun ? 'DRY-RUN' : 'SINCRONIZADO'}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    await context.close().catch(() => {});
  } catch (fatalError) {
    Logger.error('Error fatal durante la ejecución del scraper:', fatalError);
    process.exitCode = 1;
  } finally {
    if (session && session.browser) {
      await session.browser.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main();
}

export { main, parseArgs };
