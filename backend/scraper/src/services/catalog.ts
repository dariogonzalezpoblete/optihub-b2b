import { BrowserContext, Page } from 'playwright';
import { NetworkInterceptor } from './interceptor';
import { ImageOptimizer } from './imageOptimizer';
import { SupabaseService } from './supabase';
import { calculateB2BPricing } from './pricing';
import { OptiHubProduct, ScraperOptions } from '../types';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export class CatalogRunner {
  private interceptor: NetworkInterceptor;
  private imageOptimizer: ImageOptimizer;
  private supabaseService?: SupabaseService;

  constructor(
    interceptor: NetworkInterceptor,
    imageOptimizer: ImageOptimizer,
    supabaseService?: SupabaseService
  ) {
    this.interceptor = interceptor;
    this.imageOptimizer = imageOptimizer;
    this.supabaseService = supabaseService;
  }

  /**
   * Scrapes an entire brand catalog with smart synchronization:
   * - If an item is already in Supabase -> ONLY updates stock (preserves existing images and specs).
   * - If an item is NEW -> performs full extraction (main + secondary images, material, gender, Gated Pricing).
   */
  public async scrapeBrand(
    page: Page,
    context: BrowserContext,
    brand: string,
    options: ScraperOptions
  ): Promise<OptiHubProduct[]> {
    Logger.info(`════════════════════════════════════════════════════════════`);
    Logger.info(`🚀 INICIANDO INGESTA DE CATÁLOGO: [${brand.toUpperCase()}]`);
    Logger.info(`════════════════════════════════════════════════════════════`);

    this.interceptor.reset(brand);

    // 1. Preload existing Supabase records for this brand
    let existingCache = new Map<
      string,
      { stock: number; imagen_principal?: string; imagenes_secundarias?: string }
    >();
    if (this.supabaseService && this.supabaseService.isConfigured()) {
      existingCache = await this.supabaseService.getExistingBrandRecords(brand);
    }

    // 2. Navigate to brand catalog in nywd.com
    const opened = await this.navigateToBrandCatalog(page, brand);
    if (!opened) {
      Logger.warn(`No se pudo acceder automáticamente al catálogo de '${brand}'.`);
      return [];
    }

    const scannedProducts = new Map<string, OptiHubProduct>();
    const scannedIds = new Set<string>();

    let pageNum = 1;
    const maxPages = options.maxPages || CONFIG.SCRAPER.DEFAULT_MAX_PAGINATION;

    while (pageNum <= maxPages) {
      Logger.info(`\n📄 Procesando página ${pageNum}/${maxPages} de '${brand.toUpperCase()}'...`);

      // Trigger lazy load
      await this.triggerLazyLoading(page);
      await page.waitForTimeout(800);

      // Extract listing cards from current page
      const pageCards = await this.extractCardsFromListing(page, brand);
      Logger.info(`Tarjetas de producto estructuradas en página ${pageNum}: ${pageCards.length}`);

      // Collect items from API interceptor and DOM cards
      const interceptedItems = this.interceptor.getCapturedProducts();
      for (const item of interceptedItems) {
        if (!scannedProducts.has(item.id_ext)) {
          scannedProducts.set(item.id_ext, item);
          scannedIds.add(item.id_ext);
        }
      }

      for (const card of pageCards) {
        if (!scannedProducts.has(card.id_ext)) {
          scannedProducts.set(card.id_ext, card);
          scannedIds.add(card.id_ext);
        }
      }

      Logger.info(
        `Total variantes detectadas en catálogo hasta ahora: ${scannedProducts.size}`
      );

      if (pageCards.length === 0 && interceptedItems.length === 0) {
        Logger.info(`No se encontraron más productos en la página ${pageNum}. Fin del catálogo.`);
        break;
      }

      // Advance to next page
      const hasNext = await this.advancePage(page, pageNum);
      if (!hasNext) {
        Logger.info(`Fin del catálogo de '${brand}' alcanzado en página ${pageNum}.`);
        break;
      }

      pageNum++;
    }

    const allValid = Array.from(scannedProducts.values()).filter(
      (p) => p.stock > options.minStock
    );

    // ─────────────────────────────────────────────────────────────
    // 3. SEGREGATE: EXISTING (STOCK-ONLY) VS NEW (FULL ENRICHMENT)
    // ─────────────────────────────────────────────────────────────
    const existingItemsToUpdate: Array<{ id_ext: string; stock: number }> = [];
    const newItemsToEnrich: OptiHubProduct[] = [];

    for (const prod of allValid) {
      if (existingCache.has(prod.id_ext)) {
        existingItemsToUpdate.push({
          id_ext: prod.id_ext,
          stock: prod.stock,
        });
      } else {
        newItemsToEnrich.push(prod);
      }
    }

    Logger.info(
      `\n📊 Clasificación de catálogo '${brand}':\n` +
      `   • Existentes en base de datos: ${existingItemsToUpdate.length} (se actualizará solo stock)\n` +
      `   • Nuevos productos a ingresar: ${newItemsToEnrich.length} (se extraerá galería completa + WebP + specs)`
    );

    // ─────────────────────────────────────────────────────────────
    // 4. UPDATE STOCK ONLY FOR EXISTING ITEMS
    // ─────────────────────────────────────────────────────────────
    if (existingItemsToUpdate.length > 0 && !options.dryRun && this.supabaseService?.isConfigured()) {
      Logger.info(`Actualizando stock únicamente para ${existingItemsToUpdate.length} productos existentes...`);
      await this.supabaseService.updateStockBatch(existingItemsToUpdate);
    } else if (options.dryRun && existingItemsToUpdate.length > 0) {
      Logger.info(`[DRY-RUN] Simulación: Se actualizaría stock de ${existingItemsToUpdate.length} productos.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ENRICH & UPLOAD IMAGES FOR NEW ITEMS ONLY
    // ─────────────────────────────────────────────────────────────
    const enrichedNewProducts: OptiHubProduct[] = [];

    if (newItemsToEnrich.length > 0) {
      Logger.info(`\n🚀 Extrayendo galería completa e información técnica para ${newItemsToEnrich.length} productos NUEVOS...`);

      const concurrency = 4;
      for (let i = 0; i < newItemsToEnrich.length; i += concurrency) {
        const chunk = newItemsToEnrich.slice(i, i + concurrency);
        const tasks = chunk.map(async (prod) => {
          return await this.enrichProductWithFullGallery(context, prod);
        });

        const chunkEnriched = await Promise.all(tasks);
        enrichedNewProducts.push(...chunkEnriched);
        Logger.info(`Progreso productos nuevos: ${enrichedNewProducts.length}/${newItemsToEnrich.length} procesados.`);
      }

      // Upsert full records for new products
      if (!options.dryRun && this.supabaseService?.isConfigured()) {
        Logger.info(`Insertando ${enrichedNewProducts.length} productos nuevos en Supabase...`);
        await this.supabaseService.upsertBatch(enrichedNewProducts);
      } else if (options.dryRun) {
        Logger.info(`[DRY-RUN] Simulación: Se insertarían ${enrichedNewProducts.length} productos nuevos.`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. RECONCILE OUT OF STOCK (STOCK = 0)
    // ─────────────────────────────────────────────────────────────
    if (!options.dryRun && this.supabaseService?.isConfigured()) {
      await this.supabaseService.syncOutOfStock(brand, scannedIds);
    }

    const finalSummaryList = [...enrichedNewProducts, ...allValid.filter(p => existingCache.has(p.id_ext))];
    Logger.success(
      `Marca '${brand}' finalizada con éxito: ${allValid.length} variantes sincronizadas.`
    );

    return finalSummaryList;
  }

  /**
   * Enriches a new product with secondary images and detailed optical attributes
   */
  private async enrichProductWithFullGallery(
    context: BrowserContext,
    prod: OptiHubProduct
  ): Promise<OptiHubProduct> {
    const detailUrl = prod.url_origen || `${CONFIG.PROVIDER.BASE_URL}/new-product-${prod.id_nywd}`;
    let page: Page | null = null;

    let galleryImages: string[] = [];
    let material = prod.material || '';
    let gender = prod.genero || '';
    let shape = prod.forma || '';
    let origin = prod.origen || '';

    try {
      page = await context.newPage();
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(600);

      const pageData = await page.evaluate(() => {
        const text = document.body.innerText || '';

        // Extract gallery images
        const rawImgs = Array.from(document.querySelectorAll('img'))
          .map((i) => i.src || i.getAttribute('data-src') || i.getAttribute('data-zoom-image') || '')
          .filter((s) => s && s.includes('pictures/') && !s.includes('thumb') && !s.includes('mid-') && !s.includes('swatch'));

        const cleanList: string[] = [];
        for (const u of rawImgs) {
          const m = u.match(/pictures\/(.+)$/);
          if (m) {
            const clean = 'https://www.nywd.com/pictures/' + m[1].replace(/^\/+/, '').split('?')[0];
            if (!cleanList.includes(clean)) {
              cleanList.push(clean);
            }
          }
        }

        const parseField = (pattern: RegExp) => {
          const m = text.match(pattern);
          return m ? m[1].trim() : '';
        };

        return {
          material: parseField(/Frame\s*Material\s*:?\s*([^\n\r]+)/i),
          gender: parseField(/Gender\s*:?\s*([^\n\r]+)/i),
          shape: parseField(/Shape\s*:?\s*([^\n\r]+)/i),
          origin: parseField(/Made\s*in\s*:?\s*([^\n\r]+)/i),
          images: cleanList,
        };
      });

      galleryImages = pageData.images;
      if (pageData.material) material = pageData.material;
      if (pageData.gender) gender = pageData.gender;
      if (pageData.shape) shape = pageData.shape;
      if (pageData.origin) origin = pageData.origin;
    } catch (err) {
      Logger.debug(`Detail fetch note for ${prod.id_ext}:`, err);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    // Determine raw main and secondary image URLs
    const rawMain = galleryImages[0] || prod.imagen_principal || '';
    const rawSec = galleryImages[1] || '';

    // Process and optimize images with Sharp to WebP
    let optimizedMain = '';
    let optimizedSec = '';

    if (rawMain) {
      optimizedMain = await this.imageOptimizer.processAndUpload(
        rawMain,
        prod.modelo,
        prod.codigo_color,
        undefined,
        this.supabaseService
      );
    }

    if (rawSec) {
      optimizedSec = await this.imageOptimizer.processAndUpload(
        rawSec,
        prod.modelo,
        prod.codigo_color,
        'sec',
        this.supabaseService
      );
    }

    return {
      ...prod,
      imagen_principal: optimizedMain,
      imagenes_secundarias: optimizedSec,
      material: material || prod.material,
      genero: gender || prod.genero,
      forma: shape || prod.forma,
      origen: origin || prod.origen,
    };
  }

  /**
   * Scrapes product cards directly from the nywd.com listing grid
   */
  public async extractCardsFromListing(page: Page, brandName: string): Promise<OptiHubProduct[]> {
    try {
      const rawCards = await page.evaluate((brand) => {
        const results: Array<{
          sku: string;
          model: string;
          brand: string;
          color: string;
          colorCode: string;
          size: string;
          upc: string;
          stock: number;
          priceUsd: number;
          imageUrl: string;
          url: string;
          productId: string;
        }> = [];

        const cardElements = Array.from(
          document.querySelectorAll<HTMLElement>('.product-item, div[data-product-id]')
        );

        for (const card of cardElements) {
          const text = (card.innerText || card.textContent || '').trim();
          if (!text || text.length < 5) continue;

          const attrStock = card.getAttribute('data-instock');
          const productId = card.getAttribute('data-product-id') || '';

          const priceMatches = text.match(/\$\s*([\d,.]+)/g);
          let priceUsd = 0;
          if (priceMatches && priceMatches.length > 0) {
            const parsed = priceMatches
              .map((p) => parseFloat(p.replace(/[^0-9.]/g, '')))
              .filter((p) => !isNaN(p) && p > 0);
            priceUsd = parsed[parsed.length - 1] || parsed[0] || 0;
          }

          if (priceUsd <= 0) continue;

          const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="product-"], figure[href]');
          const href = linkEl?.getAttribute('href') || linkEl?.href || (productId ? `/new-product-${productId}` : '');

          let model = '';
          const titleEl = card.querySelector(
            'h2.font-serif, a[href*="product-"] h2, .product-title, .product-name, h2:not(.text-primary)'
          );
          if (titleEl) {
            model = (titleEl.textContent || '').trim();
          }

          if (!model || model.includes('$') || model.toLowerCase() === brand.toLowerCase()) {
            const mMatch = text.match(/(?:Model\s*:?\s*|GU\s+|TF\s+|NK\s+)([a-zA-Z0-9_-]+)/i);
            if (mMatch) model = mMatch[0].trim();
          }

          if (!model && href) {
            const urlMatch = href.match(/product-([a-zA-Z0-9]+)/i);
            if (urlMatch) model = urlMatch[1].toUpperCase();
          }

          if (!model) continue;

          let colorCode = '';
          let colorName = 'Único';
          const ccMatch = text.match(/Color\s*Code\s*:?\s*([a-zA-Z0-9]+)/i);
          if (ccMatch) colorCode = ccMatch[1].trim().toUpperCase();

          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === model && i + 1 < lines.length) {
              const candidateColor = lines[i + 1];
              if (!candidateColor.includes('$') && !candidateColor.includes('Qty') && !candidateColor.includes('Color Code')) {
                colorName = candidateColor;
              }
            }
          }

          let size = '';
          const sizeMatch = text.match(/(?:Size|Dimensions?)\s*:?\s*([\d\s\-xX/]+)/i);
          if (sizeMatch) size = sizeMatch[1].trim();

          let upc = '';
          const upcMatch = text.match(/UPC\s*:?\s*(\d+)/i);
          if (upcMatch) upc = upcMatch[1].trim();

          let stock = attrStock ? parseInt(attrStock, 10) : 0;
          if (isNaN(stock) || stock <= 0) {
            const stockMatch = text.match(/(?:Qty|Stock|Quantity)\s*:?\s*(\d+)/i);
            if (stockMatch) stock = parseInt(stockMatch[1], 10);
          }

          const imgEl = card.querySelector<HTMLImageElement>('img[src*="pictures/"], img');
          let imageUrl =
            imgEl?.getAttribute('data-zoom-image') ||
            imgEl?.getAttribute('data-src') ||
            imgEl?.src ||
            '';

          if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
          if (imageUrl.startsWith('/')) imageUrl = 'https://www.nywd.com' + imageUrl;

          results.push({
            sku: model,
            model,
            brand,
            color: colorName,
            colorCode: colorCode || '001',
            size,
            upc,
            stock: stock || 1,
            priceUsd,
            imageUrl,
            url: href.startsWith('/') ? 'https://www.nywd.com' + href : href,
            productId,
          });
        }

        return results;
      }, brandName);

      const products: OptiHubProduct[] = [];
      for (const raw of rawCards) {
        const cleanSku = (raw.model || 'OPT').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        const cleanColor = (raw.colorCode || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const idExt = `${cleanSku}-${cleanColor}`.toUpperCase();

        const pricing = calculateB2BPricing(raw.priceUsd);

        products.push({
          id_ext: idExt,
          id_nywd: raw.productId || raw.url.match(/product-(\d+)/)?.[1] || '',
          marca: brandName,
          modelo: raw.model,
          color: raw.color,
          codigo_color: cleanColor,
          tamano: raw.size,
          upc: raw.upc,
          stock: raw.stock,
          precio_usd: raw.priceUsd,
          precio_neto_clp: pricing.precio_neto_clp,
          precio_bruto_clp: pricing.precio_bruto_clp,
          ganancia_clp: pricing.ganancia_clp,
          costo_flete_usd: pricing.costo_flete_usd,
          costo_cif_clp: pricing.costo_cif_clp,
          ad_valorem_clp: pricing.ad_valorem_clp,
          costo_despacho_local_clp: pricing.costo_despacho_local_clp,
          costo_total_chile_clp: pricing.costo_total_chile_clp,
          imagen_principal: raw.imageUrl,
          imagenes_secundarias: '',
          url_origen: raw.url,
        });
      }

      return products;
    } catch (e) {
      Logger.debug('Listing card extraction error:', e);
      return [];
    }
  }

  /**
   * Navigates to the brand catalog by hovering/clicking BRANDS mega-menu or searching
   */
  private async navigateToBrandCatalog(page: Page, brand: string): Promise<boolean> {
    const brandClean = brand.toLowerCase().trim();
    const currentUrl = page.url().toLowerCase();

    // 1. If already on a valid listing page for the brand
    if (currentUrl.includes('listing-brand') || (currentUrl.includes('search') && currentUrl.includes(brandClean))) {
      Logger.info(`Ya estás en la página de '${brand}': ${page.url()}`);
      return true;
    }

    Logger.info(`Buscando marca '${brand}' en menú BRANDS y barra de búsqueda...`);

    if (!currentUrl.includes('new-home') && !currentUrl.includes('wholesale')) {
      await page.goto(`${CONFIG.PROVIDER.BASE_URL}/new-home`, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    // 2. Hover over BRANDS to open the mega-menu
    try {
      const brandsMenuActivator = page
        .locator('a[data-target="#shop-brands"], a:has-text("Brands"), a:text-matches("^BRANDS$", "i")')
        .first();

      if (await brandsMenuActivator.isVisible({ timeout: 3000 }).catch(() => false)) {
        await brandsMenuActivator.hover().catch(() => {});
        await page.waitForTimeout(600);
      }

      // Check #shop-brands container links
      const foundHref = await page.evaluate((targetBrand) => {
        const brandBox = document.querySelector('#shop-brands') || document.querySelector('#ctl00_ctl03_BrandList') || document;
        const links = Array.from(brandBox.querySelectorAll<HTMLAnchorElement>('a'));
        const tb = targetBrand.toLowerCase().trim();

        for (const a of links) {
          const text = (a.innerText || a.textContent || '').trim().replace(/\s*\(\d+\)$/, '').toLowerCase();
          if (text === tb && a.href && !a.href.endsWith('#')) {
            return a.href;
          }
        }

        for (const a of links) {
          const text = (a.innerText || a.textContent || '').trim().toLowerCase();
          if (text.startsWith(tb) && a.href && a.href.includes('listing-brand')) {
            return a.href;
          }
        }

        for (const a of links) {
          const text = (a.innerText || a.textContent || '').trim().toLowerCase();
          if (text.includes(tb) && a.href && a.href.includes('listing-brand')) {
            return a.href;
          }
        }

        return null;
      }, brand);

      if (foundHref) {
        Logger.success(`Enlace de marca encontrado en menú BRANDS: ${foundHref}`);
        await page.goto(foundHref, {
          waitUntil: 'domcontentloaded',
          timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
        });
        await page.waitForTimeout(2000);
        return true;
      }
    } catch (e) {
      Logger.debug('Menu hover attempt note:', e);
    }

    // 3. Fallback: Search bar
    try {
      Logger.info(`Buscando '${brand}' usando la barra de búsqueda superior...`);

      const searchToggle = page.locator('#searchToggle, img[alt*="search" i], .search-icon').first();
      if (await searchToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchToggle.click().catch(() => {});
        await page.waitForTimeout(400);
      }

      const searchInput = page.locator('#searchInput, input[name="searchTerm"], input[type="search"]').first();
      if (await searchInput.count() > 0) {
        await page.evaluate(() => {
          const input = document.querySelector<HTMLElement>('#searchInput');
          if (input) {
            input.classList.remove('hidden');
            input.style.display = 'block';
          }
        });

        await searchInput.fill(brand);
        await searchInput.press('Enter');

        const searchHeaderBtn = page.locator('#ctl00_ctl03_SearchHeader').first();
        if (await searchHeaderBtn.count() > 0) {
          await searchHeaderBtn.dispatchEvent('click').catch(() => {});
        }

        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(2000);

        if (page.url().toLowerCase().includes('search') || page.url().toLowerCase().includes('listing')) {
          Logger.success(`Búsqueda de '${brand}' aplicada: ${page.url()}`);
          return true;
        }
      }
    } catch (e) {
      Logger.warn(`Error en búsqueda por barra de texto:`, e);
    }

    // 4. Interactive fallback
    Logger.info('Esperando selección manual de la marca en Chrome...');
    console.log('\n' + '═'.repeat(65));
    console.log(`👉 Por favor, ve a Chrome y haz clic en '${brand}' dentro de BRANDS.`);
    console.log('   (El bot detectará automáticamente cuando ingreses al catálogo).');
    console.log('═'.repeat(65) + '\n');

    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000);
      const curr = page.url().toLowerCase();
      if (curr.includes('listing-brand') || curr.includes('search') || curr.includes('product')) {
        Logger.success(`¡Navegación al catálogo detectada en Chrome!: ${page.url()}`);
        await page.waitForTimeout(1500);
        return true;
      }
    }

    return false;
  }

  /**
   * Smooth scroll down to fire any fetch/XHR event triggers
   */
  private async triggerLazyLoading(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 200));
        window.scrollTo(0, document.body.scrollHeight / 2);
        await new Promise((r) => setTimeout(r, 200));
        window.scrollTo(0, document.body.scrollHeight);
      });
    } catch {}
  }

  /**
   * Advances pagination using goToPage(page) or next button
   */
  private async advancePage(page: Page, currentPageNum: number): Promise<boolean> {
    const nextPageNum = currentPageNum + 1;

    try {
      const hasGoToPage = await page.evaluate(() => {
        return typeof (window as any).goToPage === 'function';
      });

      if (hasGoToPage) {
        Logger.info(`Invocando paginación nativa goToPage(${nextPageNum})...`);

        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {}),
          page.evaluate((target) => {
            (window as any).goToPage(target);
          }, nextPageNum),
        ]);

        await page.waitForTimeout(2000);

        const newCardsCount = await page.evaluate(() => {
          return document.querySelectorAll('.product-item').length;
        });

        if (newCardsCount > 0) {
          Logger.success(`Página ${nextPageNum} cargada exitosamente.`);
          return true;
        }
      }

      const nextSelector = `a[onclick*="goToPage(${nextPageNum})"], a:text-matches('^${nextPageNum}$'), a[rel="next"], [rel="next"] a, a:has-text("Next")`;
      const nextBtn = page.locator(nextSelector).first();

      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {}),
          nextBtn.click().catch(() => nextBtn.dispatchEvent('click')),
        ]);
        await page.waitForTimeout(1500);
        return true;
      }
    } catch (e) {
      Logger.debug(`Paginación a pág. ${nextPageNum} falló:`, e);
    }

    return false;
  }
}
