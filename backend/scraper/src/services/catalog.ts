import { BrowserContext, Page } from 'playwright';
import { NetworkInterceptor } from './interceptor';
import { ImageOptimizer } from './imageOptimizer';
import { SupabaseService } from './supabase';
import { SessionManager } from './auth';
import { calculateB2BPricing } from './pricing';
import { OptiHubProduct, ScraperOptions } from '../types';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export class CatalogRunner {
  private interceptor: NetworkInterceptor;
  private imageOptimizer: ImageOptimizer;
  private supabaseService?: SupabaseService;
  private sessionManager?: SessionManager;

  constructor(
    interceptor: NetworkInterceptor,
    imageOptimizer: ImageOptimizer,
    supabaseService?: SupabaseService,
    sessionManager?: SessionManager
  ) {
    this.interceptor = interceptor;
    this.imageOptimizer = imageOptimizer;
    this.supabaseService = supabaseService;
    this.sessionManager = sessionManager;
  }

  /**
   * Scrapes an entire brand catalog with smart synchronization:
   * 1. If an item exists with both images -> ONLY updates stock (preserves all data, runs in seconds).
   * 2. If an item exists but lacks secondary image -> enriches secondary image to WebP and updates DB.
   * 3. If an item is brand NEW -> full extraction (main + secondary image in WebP, material, gender, Gated Pricing).
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

    const cookieHeader = this.sessionManager ? this.sessionManager.getCookieHeader() : '';

    // ─────────────────────────────────────────────────────────────
    // 3. CLASSIFICATION: STOCK-ONLY VS REPAIR SECONDARY VS NEW
    // ─────────────────────────────────────────────────────────────
    const itemsStockOnly: Array<{ id_ext: string; stock: number }> = [];
    const itemsNeedingSecondaryImg: OptiHubProduct[] = [];
    const itemsBrandNew: OptiHubProduct[] = [];

    for (const prod of allValid) {
      const existing = existingCache.get(prod.id_ext);
      if (existing) {
        if (options.stockOnly) {
          itemsStockOnly.push({ id_ext: prod.id_ext, stock: prod.stock });
        } else {
          const hasSecImg = existing.imagenes_secundarias && existing.imagenes_secundarias.trim().length > 5;
          if (hasSecImg) {
            itemsStockOnly.push({ id_ext: prod.id_ext, stock: prod.stock });
          } else {
            itemsNeedingSecondaryImg.push(prod);
          }
        }
      } else if (!options.stockOnly) {
        itemsBrandNew.push(prod);
      }
    }

    Logger.info(
      `\n📊 Clasificación inteligente de inventario para '${brand}':\n` +
      `   • Ítems completos en base de datos: ${itemsStockOnly.length} (se actualizará SOLO stock)\n` +
      `   • Ítems existentes sin foto secundaria: ${itemsNeedingSecondaryImg.length} (se enriquecerá imagen secundaria en WebP)\n` +
      `   • Ítems nuevos a ingresar: ${itemsBrandNew.length} (ingesta completa: ambas fotos WebP + especificaciones)`
    );

    // ─────────────────────────────────────────────────────────────
    // 4. ACTUALIZACIÓN EXCLUSIVA DE STOCK
    // ─────────────────────────────────────────────────────────────
    if (itemsStockOnly.length > 0 && !options.dryRun && this.supabaseService?.isConfigured()) {
      Logger.info(`Actualizando stock únicamente para ${itemsStockOnly.length} productos completos...`);
      await this.supabaseService.updateStockBatch(itemsStockOnly);
    } else if (options.dryRun && itemsStockOnly.length > 0) {
      Logger.info(`[DRY-RUN] Simulación: Se actualizaría stock de ${itemsStockOnly.length} productos.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ENRIQUECER FOTO SECUNDARIA EN ÍTEMS EXISTENTES INCOMPLETOS
    // ─────────────────────────────────────────────────────────────
    if (itemsNeedingSecondaryImg.length > 0) {
      Logger.info(`\n🖼️ Enriqueciendo imágenes secundarias para ${itemsNeedingSecondaryImg.length} productos existentes...`);
      const concurrency = 5;

      for (let i = 0; i < itemsNeedingSecondaryImg.length; i += concurrency) {
        const chunk = itemsNeedingSecondaryImg.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (prod) => {
            try {
              const details = await this.fetchProductDetailsHttp(prod.id_nywd || prod.url_origen || '', cookieHeader);
              if (details.secImage) {
                const secWebp = await this.imageOptimizer.processAndUpload(
                  details.secImage,
                  prod.modelo,
                  prod.codigo_color,
                  'sec',
                  this.supabaseService
                );

                if (!options.dryRun && this.supabaseService?.isConfigured()) {
                  await this.supabaseService.updateProductPartial(prod.id_ext, {
                    imagenes_secundarias: secWebp,
                    stock: prod.stock,
                    material: details.material || prod.material,
                    genero: details.gender || prod.genero,
                  });
                }
              } else {
                // If no secondary image available at source, just update stock
                if (!options.dryRun && this.supabaseService?.isConfigured()) {
                  await this.supabaseService.updateProductPartial(prod.id_ext, { stock: prod.stock });
                }
              }
            } catch (err) {
              Logger.debug(`Error reparando secundaria para ${prod.id_ext}:`, err);
            }
          })
        );
        Logger.info(`Fotos secundarias enriquecidas: ${Math.min(i + concurrency, itemsNeedingSecondaryImg.length)}/${itemsNeedingSecondaryImg.length}`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. INGESTA COMPLETA DE PRODUCTOS NUEVOS
    // ─────────────────────────────────────────────────────────────
    const enrichedNewProducts: OptiHubProduct[] = [];

    if (itemsBrandNew.length > 0) {
      Logger.info(`\n🚀 Ingestando ${itemsBrandNew.length} productos NUEVOS con galería completa...`);
      const concurrency = 4;

      for (let i = 0; i < itemsBrandNew.length; i += concurrency) {
        const chunk = itemsBrandNew.slice(i, i + concurrency);
        const tasks = chunk.map(async (prod) => {
          return await this.enrichNewProduct(prod, cookieHeader);
        });

        const chunkEnriched = await Promise.all(tasks);
        enrichedNewProducts.push(...chunkEnriched);
        Logger.info(`Progreso productos nuevos: ${enrichedNewProducts.length}/${itemsBrandNew.length}`);
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
    // 7. CONCILIACIÓN DE DISCONTINUADOS (STOCK = 0)
    // ─────────────────────────────────────────────────────────────
    if (!options.dryRun && this.supabaseService?.isConfigured()) {
      await this.supabaseService.syncOutOfStock(brand, scannedIds);
    }

    const finalSummaryList = [
      ...enrichedNewProducts,
      ...itemsNeedingSecondaryImg,
      ...allValid.filter((p) => itemsStockOnly.some((s) => s.id_ext === p.id_ext)),
    ];

    Logger.success(
      `Marca '${brand}' finalizada con éxito: ${allValid.length} variantes sincronizadas.`
    );

    return finalSummaryList;
  }

  /**
   * Fast HTTP extraction of product gallery and optical attributes directly from provider HTML
   */
  private async fetchProductDetailsHttp(
    urlOrId: string,
    cookieHeader: string
  ): Promise<{
    mainImage: string;
    secImage: string;
    material: string;
    gender: string;
    shape: string;
    origin: string;
    size: string;
  }> {
    const url = urlOrId.startsWith('http')
      ? urlOrId
      : `${CONFIG.PROVIDER.BASE_URL}/new-product-${urlOrId}`;

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.nywd.com/wholesale',
    };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return { mainImage: '', secImage: '', material: '', gender: '', shape: '', origin: '', size: '' };

      const html = await res.text();

      const parseLabel = (label: string): string => {
        const regex = new RegExp(
          `<label>[\\s\\n\\r]*${label}[\\s\\n\\r]*<\\/label>[\\s\\S]*?<div[^>]*>([^<]+)<\\/div>`,
          'i'
        );
        const m = html.match(regex);
        return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
      };

      const material = parseLabel('Frame Material');
      const gender = parseLabel('Gender');
      const shape = parseLabel('Shape');
      const origin = parseLabel('Made in');
      const size = parseLabel('Size');

      // Extract all picture URLs from html
      const matches = Array.from(html.matchAll(/pictures\/([^\s"'<>&]+)/gi));
      const rawUrls = matches.map(
        (m) => 'https://www.nywd.com/pictures/' + m[1].replace(/^\/+/, '').split('?')[0]
      );
      const cleanImages = Array.from(new Set(rawUrls)).filter(
        (u) => !u.includes('thumb') && !u.includes('mid-') && !u.includes('swatch')
      );

      const mainImage = cleanImages[0] || '';
      const secImage = cleanImages[1] || '';

      return {
        mainImage,
        secImage,
        material,
        gender,
        shape,
        origin,
        size,
      };
    } catch {
      return { mainImage: '', secImage: '', material: '', gender: '', shape: '', origin: '', size: '' };
    }
  }

  /**
   * Enriches a brand new product with secondary images and detailed optical attributes
   */
  private async enrichNewProduct(prod: OptiHubProduct, cookieHeader: string): Promise<OptiHubProduct> {
    const details = await this.fetchProductDetailsHttp(prod.id_nywd || prod.url_origen || '', cookieHeader);

    const rawMain = details.mainImage || prod.imagen_principal || '';
    const rawSec = details.secImage || '';

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
      imagen_principal: optimizedMain || prod.imagen_principal,
      imagenes_secundarias: optimizedSec,
      material: details.material || prod.material,
      genero: details.gender || prod.genero,
      forma: details.shape || prod.forma,
      origen: details.origin || prod.origen,
      tamano: details.size || prod.tamano,
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
        let productBrand = brandName;
        const mUpper = (raw.model || '').toUpperCase();
        if (mUpper.startsWith('NIKE')) productBrand = 'Nike';
        else if (mUpper.startsWith('ADIDAS')) productBrand = 'Adidas';
        else if (mUpper.startsWith('GUESS')) productBrand = 'Guess';
        else if (mUpper.startsWith('TOM FORD')) productBrand = 'Tom Ford';
        else if (mUpper.startsWith('LACOSTE')) productBrand = 'Lacoste';
        else if (mUpper.startsWith('CALVIN KLEIN')) productBrand = 'Calvin Klein';
        else if (mUpper.startsWith('BOLLE')) productBrand = 'Bolle';
        else if (mUpper.startsWith('HARLEY')) productBrand = 'Harley Davidson';
        else if (mUpper.startsWith('HUGO')) productBrand = 'Hugo';
        else if (mUpper.startsWith('ZEISS')) productBrand = 'Zeiss';

        const cleanSku = (raw.model || 'OPT').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        const cleanColor = (raw.colorCode || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const idExt = `${cleanSku}-${cleanColor}`.toUpperCase();

        const pricing = calculateB2BPricing(raw.priceUsd);

        products.push({
          id_ext: idExt,
          id_nywd: raw.productId || raw.url.match(/product-(\d+)/)?.[1] || '',
          marca: productBrand,
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

    // 1. Check if current page is explicitly the requested brand's listing
    const isAlreadyOnBrand = await page.evaluate((targetBrand) => {
      const pageTitle = (document.title || '').toLowerCase();
      const h1Text = (document.querySelector('h1, .page-title, .brand-title')?.textContent || '').toLowerCase();
      const activeBrand = (document.querySelector('#shop-brands a.active, .breadcrumb')?.textContent || '').toLowerCase();
      const tb = targetBrand.toLowerCase().trim();
      return (pageTitle.includes(tb) || h1Text.includes(tb) || activeBrand.includes(tb)) && window.location.href.includes('listing-brand');
    }, brand);

    if (isAlreadyOnBrand) {
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
   * Advances pagination robustly using direct button click or Next arrow,
   * verifying DOM state change so all catalog pages are traversed until the end.
   */
  private async advancePage(page: Page, currentPageNum: number): Promise<boolean> {
    const nextPageNum = currentPageNum + 1;
    const targetNum = String(nextPageNum);

    try {
      // 1. Snapshot first few product IDs before navigating
      const currentIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.product-item'))
          .map((c) => c.getAttribute('data-product-id'))
          .filter(Boolean)
          .slice(0, 5)
      );

      // 2. Scroll to bottom of catalog to ensure pagination controls are rendered
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);

      // 3. Locate direct numeric page link (e.g. goToPage(2), '2', Page$2)
      const directBtn = page.locator(
        `a[onclick*="goToPage(${targetNum})"], a:text-matches('^${targetNum}$'), a[href*="Page$${targetNum}"]`
      ).first();

      let clicked = false;
      if (await directBtn.count() > 0 && await directBtn.isVisible().catch(() => false)) {
        Logger.info(`Navegando a página ${targetNum} mediante enlace numérico directo...`);
        await directBtn.scrollIntoViewIfNeeded().catch(() => {});
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
          directBtn.click().catch(() => directBtn.dispatchEvent('click')),
        ]);
        clicked = true;
      } else {
        // 4. Fallback: locate "Next" button / right arrow
        const nextArrow = page.locator(
          'a:has-text("Next"), a[rel="next"], [rel="next"] a, a:has-text("»"), a:has-text("›")'
        ).first();

        if (await nextArrow.count() > 0 && await nextArrow.isVisible().catch(() => false)) {
          Logger.info(`Navegando a página ${targetNum} mediante flecha 'Siguiente'...`);
          await nextArrow.scrollIntoViewIfNeeded().catch(() => {});
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
            nextArrow.click().catch(() => nextArrow.dispatchEvent('click')),
          ]);
          clicked = true;
        } else {
          // 5. Fallback: execute goToPage asynchronously via detached setTimeout so context destruction doesn't throw
          const hasGoToPage = await page.evaluate(() => typeof (window as any).goToPage === 'function');
          if (hasGoToPage) {
            Logger.info(`Ejecutando goToPage(${targetNum}) desacoplado...`);
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
              page.evaluate((target) => {
                setTimeout(() => (window as any).goToPage(target), 50);
              }, nextPageNum),
            ]);
            clicked = true;
          }
        }
      }

      if (!clicked) {
        Logger.info(`No se encontraron más controles de paginación para la página ${targetNum}.`);
        return false;
      }

      // Allow DOM to settle
      await page.waitForTimeout(1500);

      // 6. Verify page transition by inspecting newly loaded product IDs
      const newIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.product-item'))
          .map((c) => c.getAttribute('data-product-id'))
          .filter(Boolean)
          .slice(0, 5)
      );
      const newCount = await page.evaluate(() => document.querySelectorAll('.product-item').length);

      if (newCount > 0 && (currentIds.length === 0 || JSON.stringify(newIds) !== JSON.stringify(currentIds))) {
        Logger.success(`Página ${targetNum} cargada correctamente (${newCount} productos en vista).`);
        return true;
      }

      Logger.info(`La página ${targetNum} no arrojó nuevos productos diferentes. Fin del listado.`);
      return false;
    } catch (e) {
      Logger.debug(`Excepción durante cambio a página ${nextPageNum}:`, e);
      return false;
    }
  }
}
