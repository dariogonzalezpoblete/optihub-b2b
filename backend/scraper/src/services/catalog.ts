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

    // Preload existing Supabase records to reuse previously uploaded images
    let existingCache = new Map<string, { stock: number; imagen_principal?: string }>();
    if (this.supabaseService && this.supabaseService.isConfigured()) {
      existingCache = await this.supabaseService.getExistingBrandRecords(brand);
    }

    // 1. Navigate to brand catalog
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

      // Trigger lazy loads for fetch/xhr event triggers
      await this.triggerLazyLoading(page);
      await page.waitForTimeout(1000);

      // 2. Extract DOM product cards visible on current page
      const pageCards = await this.extractCardsFromListing(page, brand);
      Logger.info(`Tarjetas de producto encontradas en DOM: ${pageCards.length}`);

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
        `Total variantes activas acumuladas en pág. ${pageNum}: ${allProducts.size}`
      );

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

    Logger.info(`\n🖼️ Optimizando imágenes con Sharp (WebP @ Lanczos) para ${rawList.length} productos...`);

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
   * Scrapes product cards directly from the listing grid
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
        }> = [];

        // Common product card selectors on nywd.com
        const cardElements = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.product-item, .product-box, .listing-item, .col-item, .item-box, div[class*="product"]'
          )
        );

        for (const card of cardElements) {
          const text = (card.innerText || card.textContent || '').trim();
          if (!text || text.length < 5) continue;

          // Price match
          const priceMatch = text.match(/\$\s*([\d,.]+)/);
          if (!priceMatch) continue;
          const priceUsd = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (isNaN(priceUsd) || priceUsd <= 0) continue;

          // Link & NYWD ID
          const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="product-"], a[href*="listing"]');
          const href = linkEl?.href || '';

          // SKU & Model
          let model = '';
          const titleEl = card.querySelector('h2, h3, h4, .product-title, .product-name, .title');
          if (titleEl) {
            model = (titleEl.textContent || '').trim();
          }
          if (!model) {
            const mMatch = text.match(/Model\s*:?\s*([a-zA-Z0-9_-]+)/i);
            if (mMatch) model = mMatch[1].trim();
          }
          if (!model && href) {
            const urlMatch = href.match(/product-([a-zA-Z0-9]+)/i);
            if (urlMatch) model = urlMatch[1].toUpperCase();
          }

          if (!model || model.includes('$')) continue;

          // Color Code & Color Name
          let colorCode = '';
          let colorName = 'Único';
          const ccMatch = text.match(/Color\s*Code\s*:?\s*([a-zA-Z0-9]+)/i);
          if (ccMatch) colorCode = ccMatch[1].trim().toUpperCase();

          const cMatch = text.match(/Color\s*:?\s*([a-zA-Z0-9\s/]+)/i);
          if (cMatch && !cMatch[1].toLowerCase().includes('code')) {
            colorName = cMatch[1].trim();
          }

          // Size / Dimensions
          let size = '';
          const sizeMatch = text.match(/(?:Size|Dimensions?)\s*:?\s*([\d\s\-x/]+)/i);
          if (sizeMatch) size = sizeMatch[1].trim();

          // UPC
          let upc = '';
          const upcMatch = text.match(/UPC\s*:?\s*(\d+)/i);
          if (upcMatch) upc = upcMatch[1].trim();

          // Stock / Quantity
          let stock = 10;
          const stockMatch = text.match(/(?:Stock|Qty|Quantity|Available)\s*:?\s*(\d+)/i);
          if (stockMatch) {
            stock = parseInt(stockMatch[1], 10);
          }

          // Image
          const imgEl = card.querySelector<HTMLImageElement>(
            'img[src*="pictures/"], img[data-src*="pictures/"], img[data-zoom-image*="pictures/"], img'
          );
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
            stock,
            priceUsd,
            imageUrl,
            url: href,
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
          id_nywd: raw.url.match(/product-(\d+)/)?.[1] || '',
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
   * Navigates directly or via menu to the brand catalog
   */
  private async navigateToBrandCatalog(page: Page, brand: string): Promise<boolean> {
    const brandClean = brand.toLowerCase().trim();
    const currentUrl = page.url().toLowerCase();

    // Already on brand page
    if (currentUrl.includes('listing-brand') && currentUrl.includes(brandClean)) {
      Logger.info(`Ya en la página de '${brand}': ${page.url()}`);
      return true;
    }

    Logger.info(`Buscando catálogo de '${brand}' en menú de navegación...`);

    try {
      // 1. Try finding brand in menu
      const brandMenu = page.locator("a:text-matches('^BRANDS$', 'i'), text='BRANDS'").first();
      if (await brandMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await brandMenu.hover().catch(() => {});
        await page.waitForTimeout(400);

        const foundHref = await page.evaluate((targetBrand) => {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
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
          return null;
        }, brand);

        if (foundHref) {
          Logger.info(`Marca encontrada: ${foundHref}. Cargando...`);
          await page.goto(foundHref, { waitUntil: 'domcontentloaded', timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS });
          return true;
        }
      }

      // 2. Try direct search bar
      const searchInput = page
        .locator("input[type='search'], input[name*='search' i], input[placeholder*='search' i]")
        .first();
      if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchInput.fill(brand);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS }).catch(() => {});
        return true;
      }

      // 3. Direct URL fallback
      const directUrl = `${CONFIG.PROVIDER.BASE_URL}/listing-brand-${encodeURIComponent(brand.toLowerCase())}`;
      Logger.info(`Navegando directamente a URL de marca: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      return true;
    } catch (e) {
      Logger.warn(`Error al navegar a la marca ${brand}:`, e);
      return false;
    }
  }

  /**
   * Smooth scroll down to fire any fetch/XHR event triggers
   */
  private async triggerLazyLoading(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 200));
        window.scrollTo(0, document.body.scrollHeight);
      });
    } catch {}
  }

  /**
   * Advances pagination automatically
   */
  private async advancePage(page: Page, currentPageNum: number): Promise<boolean> {
    const nextPageNum = currentPageNum + 1;

    try {
      // 1. Selector rel="next" or 'Next' text
      const nextSelector = `a[rel="next"], [rel="next"] a, a:has-text("Next"), button:has-text("Next"), a:has-text("»"), a:text-matches('^${nextPageNum}$')`;
      const nextBtn = page.locator(nextSelector).first();

      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {}),
          nextBtn.click().catch(() => nextBtn.dispatchEvent('click')),
        ]);
        await page.waitForTimeout(1200);
        return true;
      }

      // 2. ASP.NET postback link
      const clicked = await page.evaluate((targetPage) => {
        const postback = document.querySelector(`a[href*="Page$${targetPage}"]`) as HTMLElement;
        if (postback) {
          postback.click();
          return true;
        }
        return false;
      }, nextPageNum);

      if (clicked) {
        await page.waitForTimeout(1500);
        return true;
      }
    } catch (e) {
      Logger.debug(`Paginación fallida en pág. ${currentPageNum}:`, e);
    }

    return false;
  }
}
