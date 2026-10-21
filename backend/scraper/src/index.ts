import { chromium, Browser } from 'playwright';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { SessionManager } from './services/auth';
import { NetworkInterceptor } from './services/interceptor';
import { CatalogRunner } from './services/catalog';
import { SupabaseService } from './services/supabase';
import { ScraperOptions, OptiHubProduct } from './types';
import { Logger } from './utils/logger';

function parseArgs(): ScraperOptions {
  const args = process.argv.slice(2);
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
      if (val) options.brands = val.split(',').map((b) => b.trim());
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
    } else if (arg === '--state') {
      const val = args[++i];
      if (val) options.authStatePath = path.resolve(process.cwd(), val);
    }
  }

  return options;
}

async function launchBrowser(headless: boolean): Promise<Browser> {
  // First attempt system Chrome channel for maximum anti-bot fidelity
  try {
    return await chromium.launch({
      channel: 'chrome',
      headless: headless,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
  } catch {
    Logger.warn('Google Chrome channel not found. Falling back to bundled Chromium...');
    return await chromium.launch({
      headless: headless,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
  }
}

async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       OptiHub Provider Catalog Scraper (v2.0 Architecture)     ║');
  console.log('║   • Session Persistence (Storage State)                        ║');
  console.log('║   • High-Velocity API Interception (Zero-DOM Parsing)          ║');
  console.log('║   • Chilean B2B Gated Pricing & VAT (IVA 19%) Engine          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  Logger.info('Starting scraper with options:', {
    brands: options.brands,
    headless: options.headless,
    maxPages: options.maxPages,
    minStock: options.minStock,
    dryRun: options.dryRun,
    authStateFile: options.authStatePath,
  });

  const sessionManager = new SessionManager(options.authStatePath);
  const supabaseService = new SupabaseService();
  const interceptor = new NetworkInterceptor({ minStock: options.minStock });
  const catalogRunner = new CatalogRunner(interceptor);

  let browser: Browser | null = null;
  const allExtractedProducts: OptiHubProduct[] = [];

  try {
    // 1. Launch Browser
    Logger.info('Launching browser engine...');
    browser = await launchBrowser(options.headless);

    // 2. Initialize Context with Session State Persistence
    const context = await sessionManager.createContext(browser, options.headless);
    const page = await context.newPage();

    // 3. Ensure Authenticated Session (checks auth_state.json, logs in once if expired)
    await sessionManager.ensureAuthenticated(page, context);

    // 4. Attach API Network Interceptor to Page
    interceptor.attach(page);

    // 5. Ingest Catalogs Brand by Brand
    for (const brand of options.brands) {
      const brandProducts = await catalogRunner.scrapeBrand(page, context, brand, options);
      allExtractedProducts.push(...brandProducts);

      if (brandProducts.length > 0) {
        // Save backup JSON artifact locally
        const exportFile = `catalog_${brand.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
        fs.writeFileSync(exportFile, JSON.stringify(brandProducts, null, 2), 'utf-8');
        Logger.info(`Saved raw export of ${brandProducts.length} items to ${exportFile}`);

        // Sync to Supabase unless dry-run
        if (!options.dryRun && supabaseService.isConfigured()) {
          Logger.info(`Upserting ${brandProducts.length} products of '${brand}' to Supabase...`);
          await supabaseService.upsertBatch(brandProducts);

          const scannedIds = new Set(brandProducts.map((p) => p.id_ext));
          await supabaseService.syncOutOfStock(brand, scannedIds);
        } else if (options.dryRun) {
          Logger.info(`[DRY-RUN] Skipping database upsert for '${brand}'.`);
        }
      }
    }

    // 6. Summary Report
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalStats = interceptor.getStats();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('                 📊 EXECUTION METRICS SUMMARY                   ');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`• Total Execution Time:         ${elapsedSec}s`);
    console.log(`• Brands Processed:             ${options.brands.join(', ')}`);
    console.log(`• Total Products Extracted:     ${allExtractedProducts.length}`);
    console.log(`• Total API Packets Intercepted: ${totalStats.totalPackets}`);
    console.log(`• Unique Endpoints Intercepted:  ${totalStats.endpoints.size}`);
    console.log(`• Session State File:           ${options.authStatePath}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    await context.close();
  } catch (fatalError) {
    Logger.error('Fatal scraper error occurred:', fatalError);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main();
}

export { main, parseArgs };
