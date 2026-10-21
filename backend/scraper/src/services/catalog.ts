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
   * Scrapes an entire brand catalog using API network interception and rapid DOM card extraction
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

    // Preload existing Supabase records to reuse previously uploaded WebP images
    let existingCache = new Map<string, { stock: number; imagen_principal?: string }>();
    if (this.supabaseService && this.supabaseService.isConfigured()) {
      existingCache = await this.supabaseService.getExistingBrandRecords(brand);
    }

    // 1. Navigate to brand catalog (using BRANDS mega-menu hover or Search bar)
    const opened = await this.navigateToBrandCatalog(page, brand);
    if (!opened) {
      Logger.warn(`No se pudo acceder automáticamente al catálogo de '${brand}'.`);
      return [];
    }

    const allProducts = new Map<string, OptiHubProduct>();
    const scannedIds = new Set<string>();

    let pageNum = 1;
    const maxPages = options.maxPages || CONFIG.SCRAPER.DEFAULT_MAX_PAGINATION;

    while (pageNum <= maxPages) {
      Logger.info(`\n📄 Procesando página ${pageNum}/${maxPages} de '${brand.toUpperCase()}'...`);

      // Trigger lazy loads for fetch/xhr event triggers and image rendering
      await this.triggerLazyLoading(page);
      await page.waitForTimeout(800);

      // 2. Extract DOM product cards visible on current page
      const pageCards = await this.extractCardsFromListing(page, brand);
      Logger.info(`Tarjetas de producto estructuradas en página ${pageNum}: ${pageCards.length}`);

      // Combine intercepted API products and DOM cards
      const interceptedItems = this.interceptor.getCapturedProducts();
      for (const item of interceptedItems) {
        if (!allProducts.has(item.id_ext)) {
          allProducts.set(item.id_ext, item);
          scannedIds.add(item.id_ext);
        }
      }

      for (const card of pageCards) {
        if (!allProducts.has(card.id_ext)) {
          allProducts.set(card.id_ext, card);
          scannedIds.add(card.id_ext);
        }
      }

      Logger.info(
        `Total variantes activas acumuladas en catálogo: ${allProducts.size}`
      );

      if (pageCards.length === 0 && interceptedItems.length === 0) {
        Logger.info(`No se encontraron productos en la página ${pageNum}. Fin del catálogo.`);
        break;
      }

      // 3. Advance to next page
      const hasNext = await this.advancePage(page, pageNum);
      if (!hasNext) {
        Logger.info(`Fin del catálogo de '${brand}' alcanzado en página ${pageNum}.`);
        break;
      }

      pageNum++;
    }

    const rawList = Array.from(allProducts.values()).filter(
      (p) => p.stock > options.minStock
    );

    Logger.info(`\n🖼️ Optimizando imágenes con Sharp (WebP @ Lanczos-3) para ${rawList.length} productos...`);

    // 4. Image Optimization Pipeline
    const processedProducts: OptiHubProduct[] = [];
    const concurrency = 6;

    for (let i = 0; i < rawList.length; i += concurrency) {
      const chunk = rawList.slice(i, i + concurrency);
      const tasks = chunk.map(async (prod) => {
        let mainImg = prod.imagen_principal || '';
        let secImg = prod.imagenes_secundarias || '';

        // If product already has an optimized Supabase URL in cache, reuse it!
        const cachedItem = existingCache.get(prod.id_ext);
        if (cachedItem && cachedItem.imagen_principal && cachedItem.imagen_principal.includes('supabase.co')) {
          mainImg = cachedItem.imagen_principal;
        } else if (mainImg) {
          mainImg = await this.imageOptimizer.processAndUpload(
            mainImg,
            prod.modelo,
            prod.codigo_color,
            this.supabaseService
          );
        }

        if (secImg && !secImg.includes('supabase.co')) {
          secImg = await this.imageOptimizer.processAndUpload(
            secImg,
            prod.modelo,
            `${prod.codigo_color}-sec`,
            this.supabaseService
          );
        }

        return {
          ...prod,
          imagen_principal: mainImg,
          imagenes_secundarias: secImg,
        };
      });

      const chunkResults = await Promise.all(tasks);
      processedProducts.push(...chunkResults);
    }

    Logger.success(
      `Marca '${brand}' finalizada: ${processedProducts.length} productos estructurados y optimizados.`
    );

    return processedProducts;
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

        // All product cards on nywd.com listing pages
        const cardElements = Array.from(
          document.querySelectorAll<HTMLElement>('.product-item, div[data-product-id]')
        );

        for (const card of cardElements) {
          const text = (card.innerText || card.textContent || '').trim();
          if (!text || text.length < 5) continue;

          // In-stock & product ID from data attributes
          const attrStock = card.getAttribute('data-instock');
          const productId = card.getAttribute('data-product-id') || '';

          // Price extraction: look for all dollar values ($21.50, $5.99)
          const priceMatches = text.match(/\$\s*([\d,.]+)/g);
          let priceUsd = 0;
          if (priceMatches && priceMatches.length > 0) {
            const parsed = priceMatches
              .map((p) => parseFloat(p.replace(/[^0-9.]/g, '')))
              .filter((p) => !isNaN(p) && p > 0);
            // The active wholesale price is the last/lowest price displayed
            priceUsd = parsed[parsed.length - 1] || parsed[0] || 0;
          }

          if (priceUsd <= 0) continue;

          // Product Link & NYWD ID
          const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="product-"], figure[href]');
          const href = linkEl?.getAttribute('href') || linkEl?.href || (productId ? `/new-product-${productId}` : '');

          // Model extraction: check prominent title headers or regex
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

          // Color Code & Color Name
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

          // Size / Dimensions (e.g. "47X16X130" or "54-17-140")
          let size = '';
          const sizeMatch = text.match(/(?:Size|Dimensions?)\s*:?\s*([\d\s\-xX/]+)/i);
          if (sizeMatch) size = sizeMatch[1].trim();

          // UPC
          let upc = '';
          const upcMatch = text.match(/UPC\s*:?\s*(\d+)/i);
          if (upcMatch) upc = upcMatch[1].trim();

          // Stock / Quantity
          let stock = attrStock ? parseInt(attrStock, 10) : 0;
          if (isNaN(stock) || stock <= 0) {
            const stockMatch = text.match(/(?:Qty|Stock|Quantity)\s*:?\s*(\d+)/i);
            if (stockMatch) stock = parseInt(stockMatch[1], 10);
          }

          // Image URL
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

    // Ensure we are on home or wholesale
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

        // Exact match (e.g. "Guess (412)" -> "guess")
        for (const a of links) {
          const text = (a.innerText || a.textContent || '').trim().replace(/\s*\(\d+\)$/, '').toLowerCase();
          if (text === tb && a.href && !a.href.endsWith('#')) {
            return a.href;
          }
        }

        // Starts with brand name (e.g. "Guess by Marciano")
        for (const a of links) {
          const text = (a.innerText || a.textContent || '').trim().toLowerCase();
          if (text.startsWith(tb) && a.href && a.href.includes('listing-brand')) {
            return a.href;
          }
        }

        // Contains brand name
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

    // 3. Fallback: Search bar with searchToggle & searchInput
    try {
      Logger.info(`Buscando '${brand}' usando la barra de búsqueda superior...`);

      // Click search icon if present
      const searchToggle = page.locator('#searchToggle, img[alt*="search" i], .search-icon').first();
      if (await searchToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchToggle.click().catch(() => {});
        await page.waitForTimeout(400);
      }

      const searchInput = page.locator('#searchInput, input[name="searchTerm"], input[type="search"]').first();
      if (await searchInput.count() > 0) {
        // Force display if hidden by CSS
        await page.evaluate(() => {
          const input = document.querySelector<HTMLElement>('#searchInput');
          if (input) {
            input.classList.remove('hidden');
            input.style.display = 'block';
          }
        });

        await searchInput.fill(brand);
        await searchInput.press('Enter');

        // Or click search submit link if present
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

    // 4. Interactive fallback: allow user to click brand in Chrome with live detection
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
    const urlBefore = page.url();

    try {
      // 1. Check if goToPage function exists on window (nywd standard ASP.NET)
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

        // Verify products on new page
        const newCardsCount = await page.evaluate(() => {
          return document.querySelectorAll('.product-item').length;
        });

        if (newCardsCount > 0) {
          Logger.success(`Página ${nextPageNum} cargada exitosamente.`);
          return true;
        }
      }

      // 2. Check for next page link or button
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
