import readline from 'readline';
import { BrowserContext, Page } from 'playwright';
import { NetworkInterceptor } from './interceptor';
import { ImageOptimizer } from './imageOptimizer';
import { SupabaseService } from './supabase';
import { SessionManager } from './auth';
import { calculateB2BPricing } from './pricing';
import {
  OptiHubProduct,
  ScraperOptions,
  ProductStockPriceUpdate,
  ExistingProductRecord,
  BrandSyncReport,
  SyncReportItem,
} from '../types';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function stringSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (str1 === str2) return 1.0;
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(str1, str2) / maxLen;
}

export function normalizeForFuzzy(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/([a-z])\1+/g, '$1');
}

export const BRAND_ALIASES: Record<string, string> = {
  'phillipp plein': 'Philipp Plein',
  'philip plein': 'Philipp Plein',
  'philipp plein': 'Philipp Plein',
  'plein': 'Philipp Plein',
  'ck': 'Calvin Klein',
  'calvin klein': 'Calvin Klein',
  'ic berlin': 'IC! Berlin',
  'ic! berlin': 'IC! Berlin',
  'ray ban': 'Ray-Ban',
  'ray-ban': 'Ray-Ban',
  'rayban': 'Ray-Ban',
  'tom ford': 'Tom Ford',
  'hugo boss': 'Hugo',
  'boss': 'Boss',
  'armani exchange': 'Armani Exchange',
  'emporio armani': 'Emporio Armani',
  'giorgio armani': 'Giorgio Armani',
  'dolce gabbana': 'Dolce & Gabbana',
  'dolce & gabbana': 'Dolce & Gabbana',
  'd&g': 'Dolce & Gabbana',
  'kate spade': 'Kate Spade',
  'marc jacobs': 'Marc Jacobs',
  'tiffany': 'Tiffany & Co.',
  'tiffany & co': 'Tiffany & Co.',
  'oakly': 'Oakley',
  'oakley': 'Oakley',
};

export class CatalogRunner {
  private interceptor: NetworkInterceptor;
  private imageOptimizer: ImageOptimizer;
  private supabaseService?: SupabaseService;
  private sessionManager?: SessionManager;
  private brandSyncReports: Map<string, BrandSyncReport> = new Map();

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

  public getBrandSyncReports(): Map<string, BrandSyncReport> {
    return this.brandSyncReports;
  }

  public getLastReportForBrand(brand: string): BrandSyncReport | undefined {
    return this.brandSyncReports.get(brand);
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
    let existingCache = new Map<string, ExistingProductRecord>();
    if (this.supabaseService && this.supabaseService.isConfigured()) {
      existingCache = await this.supabaseService.getExistingBrandRecords(brand);
    }

    // 2. Navigate to brand catalog in nywd.com
    const opened = await this.navigateToBrandCatalog(page, brand);
    if (!opened) {
      Logger.warn(`No se pudo acceder automáticamente al catálogo de '${brand}'. Se omitirá de forma segura.`);
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

    if (scannedProducts.size === 0) {
      Logger.warn(`No se encontraron productos para '${brand}'. Protegiendo catálogo: se mantiene intacto.`);
      return [];
    }

    const allValid = Array.from(scannedProducts.values()).filter(
      (p) => p.stock > options.minStock
    );

    const cookieHeader = this.sessionManager ? this.sessionManager.getCookieHeader() : '';

    // ─────────────────────────────────────────────────────────────
    // 3. FAST SYNC BRANCH (STOCK AND PRICES ONLY)
    // ─────────────────────────────────────────────────────────────
    if (options.stockOnly) {
      Logger.info(`\n⚡ MODO RÁPIDO: Sincronizando exclusivamente Stock y Precios para '${brand}'...`);

      const itemsToUpdate: ProductStockPriceUpdate[] = [];
      const reportItems: SyncReportItem[] = [];
      let unchangedCount = 0;

      for (const prod of scannedProducts.values()) {
        const existing = existingCache.get(prod.id_ext);
        if (!existing) {
          continue;
        }

        const pricing = calculateB2BPricing(prod.precio_usd, brand, options.pricingOverrides);
        const newStock = Math.min(50, Math.max(0, prod.stock));
        const prevStock = existing.stock ?? 0;
        const prevPriceNeto = existing.precio_neto_clp ?? 0;
        const prevPriceUsd = existing.precio_usd ?? 0;

        const stockChanged = prevStock !== newStock;
        const priceChanged =
          Math.abs(prevPriceNeto - pricing.precio_neto_clp) >= 1 ||
          Math.abs(prevPriceUsd - prod.precio_usd) >= 0.01;

        if (stockChanged || priceChanged) {
          itemsToUpdate.push({
            id_ext: prod.id_ext,
            stock: newStock,
            precio_usd: prod.precio_usd,
            precio_neto_clp: pricing.precio_neto_clp,
            precio_bruto_clp: pricing.precio_bruto_clp,
            ganancia_clp: pricing.ganancia_clp,
            costo_flete_usd: pricing.costo_flete_usd,
            costo_cif_clp: pricing.costo_cif_clp,
            ad_valorem_clp: pricing.ad_valorem_clp,
            costo_despacho_local_clp: pricing.costo_despacho_local_clp,
            costo_total_chile_clp: pricing.costo_total_chile_clp,
          });

          const reasons: string[] = [];
          if (stockChanged) reasons.push(`stock ${prevStock} -> ${newStock}`);
          if (priceChanged) reasons.push(`precio neto $${prevPriceNeto} -> $${pricing.precio_neto_clp} (USD $${prevPriceUsd} -> $${prod.precio_usd})`);

          reportItems.push({
            id_ext: prod.id_ext,
            status: 'updated',
            oldStock: prevStock,
            newStock,
            oldPriceNeto: prevPriceNeto,
            newPriceNeto: pricing.precio_neto_clp,
            oldPriceUsd: prevPriceUsd,
            newPriceUsd: prod.precio_usd,
            changeReason: reasons.join('; '),
          });
        } else {
          unchangedCount++;
          reportItems.push({
            id_ext: prod.id_ext,
            status: 'unchanged',
            oldStock: prevStock,
            newStock,
            oldPriceNeto: prevPriceNeto,
            newPriceNeto: pricing.precio_neto_clp,
            oldPriceUsd: prevPriceUsd,
            newPriceUsd: prod.precio_usd,
          });
        }
      }

      // 1. Bulk update masivo de stock y precios calculados
      if (itemsToUpdate.length > 0 && !options.dryRun && this.supabaseService?.isConfigured()) {
        Logger.info(`Actualizando de forma masiva (bulk update) stock y precios para ${itemsToUpdate.length} productos...`);
        await this.supabaseService.updateStockAndPricingBatch(itemsToUpdate);
      } else if (options.dryRun && itemsToUpdate.length > 0) {
        Logger.info(`[DRY-RUN] Simulación: Se actualizaría stock y precios de ${itemsToUpdate.length} productos.`);
      }

      // 2. Conciliación controlada: productos en DB que ya no aparecen en el proveedor quedan con stock 0
      let outOfStockCount = 0;
      if (!options.dryRun && this.supabaseService?.isConfigured()) {
        const outRes = await this.supabaseService.markOutOfStockBatch(brand, scannedIds, existingCache);
        outOfStockCount = outRes.markedCount;
        for (const outId of outRes.outOfStockIds) {
          const rec = existingCache.get(outId);
          reportItems.push({
            id_ext: outId,
            status: 'out_of_stock',
            oldStock: rec?.stock,
            newStock: 0,
            oldPriceNeto: rec?.precio_neto_clp,
            newPriceNeto: rec?.precio_neto_clp,
            oldPriceUsd: rec?.precio_usd,
            newPriceUsd: rec?.precio_usd,
            changeReason: 'Producto no presente en web de proveedor: marcado sin stock (0)',
          });
        }
      } else if (options.dryRun) {
        for (const [idExt, rec] of existingCache.entries()) {
          if (!scannedIds.has(idExt) && rec.stock > 0) {
            outOfStockCount++;
            reportItems.push({
              id_ext: idExt,
              status: 'out_of_stock',
              oldStock: rec.stock,
              newStock: 0,
              changeReason: '[DRY-RUN] Marcado stock 0 por ausencia en proveedor',
            });
          }
        }
      }

      const brandReport: BrandSyncReport = {
        brand,
        totalScanned: scannedIds.size,
        updated: itemsToUpdate.length,
        outOfStock: outOfStockCount,
        unchanged: unchangedCount,
        items: reportItems,
      };

      this.brandSyncReports.set(brand, brandReport);

      console.log('\n┌────────────────────────────────────────────────────────────┐');
      console.log(`│ 📊 REPORTE DE SINCRONIZACIÓN RÁPIDA: ${brand.toUpperCase().padEnd(21)} │`);
      console.log('├────────────────────────────────────────────────────────────┤');
      console.log(`│ • Total SKUs escaneados:     ${String(scannedIds.size).padEnd(28)} │`);
      console.log(`│ • Se actualizaron:           ${String(itemsToUpdate.length + ' productos').padEnd(28)} │`);
      console.log(`│ • Productos sin stock (0):   ${String(outOfStockCount + ' productos').padEnd(28)} │`);
      console.log(`│ • Productos sin cambios:     ${String(unchangedCount + ' productos').padEnd(28)} │`);
      console.log('└────────────────────────────────────────────────────────────┘\n');

      return Array.from(scannedProducts.values());
    }

    // ─────────────────────────────────────────────────────────────
    // 4. CLASIFICACIÓN PARA INGESTA COMPLETA DE CATÁLOGO
    // ─────────────────────────────────────────────────────────────
    const itemsStockOnly: Array<{ id_ext: string; stock: number }> = [];
    const itemsNeedingSecondaryImg: OptiHubProduct[] = [];
    const itemsBrandNew: OptiHubProduct[] = [];

    for (const prod of allValid) {
      const existing = existingCache.get(prod.id_ext);
      if (existing) {
        const hasSecImg = existing.imagenes_secundarias && existing.imagenes_secundarias.trim().length > 5;
        if (hasSecImg) {
          itemsStockOnly.push({ id_ext: prod.id_ext, stock: Math.min(50, Math.max(0, prod.stock)) });
        } else {
          itemsNeedingSecondaryImg.push(prod);
        }
      } else {
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
    // 5. ACTUALIZACIÓN EXCLUSIVA DE STOCK
    // ─────────────────────────────────────────────────────────────
    if (itemsStockOnly.length > 0 && !options.dryRun && this.supabaseService?.isConfigured()) {
      Logger.info(`Actualizando stock únicamente para ${itemsStockOnly.length} productos completos...`);
      await this.supabaseService.updateStockBatch(itemsStockOnly);
    } else if (options.dryRun && itemsStockOnly.length > 0) {
      Logger.info(`[DRY-RUN] Simulación: Se actualizaría stock de ${itemsStockOnly.length} productos.`);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. ENRIQUECER FOTO SECUNDARIA EN ÍTEMS EXISTENTES INCOMPLETOS
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
                    stock: Math.min(50, Math.max(0, prod.stock)),
                    material: details.material || prod.material,
                    genero: details.gender || prod.genero,
                  });
                }
              } else {
                if (!options.dryRun && this.supabaseService?.isConfigured()) {
                  await this.supabaseService.updateProductPartial(prod.id_ext, { stock: Math.min(50, Math.max(0, prod.stock)) });
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
    // 7. INGESTA COMPLETA DE PRODUCTOS NUEVOS
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

      if (!options.dryRun && this.supabaseService?.isConfigured()) {
        Logger.info(`Insertando ${enrichedNewProducts.length} productos nuevos en Supabase...`);
        await this.supabaseService.upsertBatch(enrichedNewProducts);
      } else if (options.dryRun) {
        Logger.info(`[DRY-RUN] Simulación: Se insertarían ${enrichedNewProducts.length} productos nuevos.`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. CONCILIACIÓN CONTROLADA DE DISCONTINUADOS (STOCK = 0)
    // ─────────────────────────────────────────────────────────────
    if (!options.dryRun && this.supabaseService?.isConfigured() && scannedIds.size > 0) {
      await this.supabaseService.markOutOfStockBatch(brand, scannedIds, existingCache);
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
    cookieHeader?: string
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
          stock = Math.min(50, Math.max(0, stock || 1));

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
        const bLower = (brandName || '').toLowerCase();
        if (bLower.includes('plein')) productBrand = 'Philipp Plein';
        else if (bLower.includes('berlin')) productBrand = 'IC! Berlin';
        else if (bLower === 'bmw') productBrand = 'BMW';
        else if (bLower === 'dkny') productBrand = 'DKNY';
        else if (bLower === 'ck' || bLower.includes('calvin')) productBrand = 'Calvin Klein';
        else if (brandName) {
          productBrand = brandName.trim();
        } else {
          productBrand = 'Desconocida';
        }

        const cleanSku = (raw.model || 'OPT').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        const cleanColor = (raw.colorCode || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const idExt = `${cleanSku}-${cleanColor}`.toUpperCase();

        const pricing = calculateB2BPricing(raw.priceUsd, productBrand);

        products.push({
          id_ext: idExt,
          id_nywd: raw.productId || raw.url.match(/product-(\d+)/)?.[1] || '',
          marca: productBrand,
          modelo: raw.model,
          color: raw.color,
          codigo_color: cleanColor,
          tamano: raw.size,
          upc: raw.upc,
          stock: Math.min(50, Math.max(0, raw.stock)),
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
   * Navigates to the brand catalog with intelligent fuzzy matching and validation
   */
  private async navigateToBrandCatalog(page: Page, brand: string): Promise<boolean> {
    const brandLower = brand.toLowerCase().trim();
    const resolvedBrand = BRAND_ALIASES[brandLower] || brand;
    const resolvedLower = resolvedBrand.toLowerCase().trim();
    const normTarget = normalizeForFuzzy(resolvedLower);

    // 1. Check if current page is explicitly the requested brand's listing
    const isAlreadyOnBrand = await page.evaluate((target) => {
      const pageTitle = (document.title || '').toLowerCase();
      const h1Text = (document.querySelector('h1, .page-title, .brand-title')?.textContent || '').toLowerCase();
      const activeBrand = (document.querySelector('#shop-brands a.active, .breadcrumb')?.textContent || '').toLowerCase();
      const t = target.toLowerCase().trim();
      return (pageTitle.includes(t) || h1Text.includes(t) || activeBrand.includes(t)) && window.location.href.includes('listing-brand');
    }, resolvedBrand);

    if (isAlreadyOnBrand) {
      Logger.info(`Ya estás en la página de '${resolvedBrand}': ${page.url()}`);
      return true;
    }

    Logger.info(`Buscando marca '${resolvedBrand}' en catálogo de NYWD...`);

    // Ensure we are on a page that contains the full brand index (new-home contains all 232 brands)
    const currentUrl = page.url().toLowerCase();
    if (!currentUrl.includes('new-home') && !currentUrl.includes('listing-brand')) {
      await page.goto(`${CONFIG.PROVIDER.BASE_URL}/new-home`, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    // 2. Open BRANDS mega-menu if present
    try {
      const brandsMenuActivator = page
        .locator('a[data-target="#shop-brands"], a:has-text("Brands"), a:text-matches("^BRANDS$", "i")')
        .first();

      if (await brandsMenuActivator.isVisible({ timeout: 2000 }).catch(() => false)) {
        await brandsMenuActivator.hover().catch(() => {});
        await brandsMenuActivator.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    } catch {}

    // Extract all candidate brand links from the entire DOM
    let candidateLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
      const list: Array<{ text: string; cleanText: string; href: string }> = [];
      const seen = new Set<string>();

      for (const a of links) {
        const href = a.href || '';
        if (!href || href.endsWith('#') || href.includes('javascript:')) continue;
        const text = (a.innerText || a.textContent || '').trim();
        if (!text || text.length < 2) continue;

        const cleanText = text.replace(/\s*\(\d+\)$/, '').trim();
        const key = `${cleanText.toLowerCase()}|${href}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ text, cleanText, href });
        }
      }
      return list;
    });

    // If brand links are not loaded, navigate to new-home explicitly to retrieve all 232 brands
    if (candidateLinks.filter((l) => l.href.includes('listing-brand')).length === 0) {
      await page.goto(`${CONFIG.PROVIDER.BASE_URL}/new-home`, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      }).catch(() => {});
      await page.waitForTimeout(1200);

      candidateLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
        const list: Array<{ text: string; cleanText: string; href: string }> = [];
        const seen = new Set<string>();

        for (const a of links) {
          const href = a.href || '';
          if (!href || href.endsWith('#') || href.includes('javascript:')) continue;
          const text = (a.innerText || a.textContent || '').trim();
          if (!text || text.length < 2) continue;

          const cleanText = text.replace(/\s*\(\d+\)$/, '').trim();
          const key = `${cleanText.toLowerCase()}|${href}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({ text, cleanText, href });
          }
        }
        return list;
      });
    }

    Logger.info(`Enlaces de marcas detectados en menú: ${candidateLinks.length}`);

    // Match candidate link using multi-tiered fuzzy matching
    let bestLink: { text: string; cleanText: string; href: string; score: number } | null = null;

    for (const item of candidateLinks) {
      const itemLower = item.cleanText.toLowerCase().trim();
      const itemNorm = normalizeForFuzzy(itemLower);

      // Exact match
      if (itemLower === resolvedLower || itemLower === brandLower) {
        bestLink = { ...item, score: 1.0 };
        break;
      }

      // Normalized match (handles duplicate letters, hyphens, accents)
      if (itemNorm === normTarget) {
        bestLink = { ...item, score: 0.98 };
        break;
      }

      // Word-containment match (e.g. "Plein" in "Philipp Plein")
      if (itemLower.includes(resolvedLower) || resolvedLower.includes(itemLower)) {
        const score = 0.90;
        if (!bestLink || score > bestLink.score) {
          bestLink = { ...item, score };
        }
      }

      // String similarity score (Levenshtein distance)
      const sim = stringSimilarity(itemNorm, normTarget);
      if (sim >= 0.80 && (!bestLink || sim > bestLink.score)) {
        bestLink = { ...item, score: sim };
      }
    }

    if (bestLink && bestLink.score >= 0.80) {
      Logger.success(`Marca '${resolvedBrand}' encontrada en NYWD: '${bestLink.cleanText}' (confianza ${(bestLink.score * 100).toFixed(0)}%). Navegando...`);
      await page.goto(bestLink.href, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      });
      await page.waitForTimeout(2000);
      return true;
    }

    // 3. Fallback: Search bar with strict brand verification
    try {
      Logger.info(`Buscando '${resolvedBrand}' mediante la barra de búsqueda de NYWD...`);
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

        await searchInput.fill(resolvedBrand);
        await searchInput.press('Enter');

        const searchHeaderBtn = page.locator('#ctl00_ctl03_SearchHeader').first();
        if (await searchHeaderBtn.count() > 0) {
          await searchHeaderBtn.dispatchEvent('click').catch(() => {});
        }

        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(2000);

        // Verify search result genuinely belongs to the target brand (not Calvin Klein or empty)
        const searchValid = await page.evaluate((target) => {
          const t = target.toLowerCase();
          const pageTitle = (document.title || '').toLowerCase();
          const h1Text = (document.querySelector('h1, .page-title, .brand-title')?.textContent || '').toLowerCase();
          if (pageTitle.includes(t) || h1Text.includes(t)) return true;

          const cards = Array.from(document.querySelectorAll('.product-item, div[data-product-id]'));
          if (cards.length === 0) return false;
          let matches = 0;
          for (const c of cards.slice(0, 10)) {
            if ((c.textContent || '').toLowerCase().includes(t)) matches++;
          }
          return matches >= 1;
        }, resolvedBrand);

        if (searchValid) {
          Logger.success(`Búsqueda verificada: '${resolvedBrand}' confirmada en: ${page.url()}`);
          return true;
        } else {
          Logger.warn(`La búsqueda de '${resolvedBrand}' no arrojó productos de esa marca.`);
        }
      }
    } catch (e) {
      Logger.debug(`Nota en búsqueda por texto:`, e);
    }

    // 4. Interactive fallback with user assistance
    const startUrl = page.url();
    Logger.info(`Esperando selección manual de '${resolvedBrand}' en Chrome...`);
    console.log('\n' + '═'.repeat(65));
    console.log(`👉 Por favor, ve a Chrome y haz clic en '${resolvedBrand}' en el menú BRANDS.`);
    console.log(`   (El bot detectará automáticamente cuando abras '${resolvedBrand}').`);
    console.log('═'.repeat(65) + '\n');

    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const currUrl = page.url();
      if (currUrl !== startUrl || currUrl.includes('listing-brand')) {
        const matchesTarget = await page.evaluate((target) => {
          const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
          const t = target.toLowerCase();
          const cards = document.querySelectorAll('.product-item, div[data-product-id]');
          return (bodyText.includes(t) || window.location.href.toLowerCase().includes(t.replace(/\s+/g, '-')) || cards.length > 0) &&
            (window.location.href.includes('listing-brand') || window.location.href.includes('search') || window.location.href.includes('product'));
        }, resolvedBrand);

        if (matchesTarget) {
          Logger.success(`¡Navegación al catálogo de '${resolvedBrand}' detectada en Chrome!: ${page.url()}`);
          await page.waitForTimeout(1500);
          return true;
        }
      }
    }

    // Prompt user to press ENTER in terminal instead of aborting
    console.log('\n' + '═'.repeat(65));
    console.log(`⏳ Si ya navegaste al catálogo de '${resolvedBrand}' en Chrome:`);
    try {
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
    } catch {}
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(`>>> Presiona [ENTER] en esta terminal para comenzar a extraer '${resolvedBrand}': `, () => {
        rl.close();
        resolve();
      });
    });

    const hasCards = await page.evaluate(() => {
      return document.querySelectorAll('.product-item, div[data-product-id]').length > 0;
    });

    if (!hasCards && !page.url().includes('listing-brand')) {
      Logger.warn(`Aviso: La página actual (${page.url()}) no es un catálogo de productos con armazones.`);
      return false;
    }

    Logger.success(`Continuando con la extracción de '${resolvedBrand}' en: ${page.url()}`);
    return true;
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
   * Advances pagination robustly using direct button click or Next arrow.
   * If brand has only 1 page, exits immediately without hanging.
   */
  private async advancePage(page: Page, currentPageNum: number): Promise<boolean> {
    const nextPageNum = currentPageNum + 1;
    const targetNum = String(nextPageNum);

    try {
      // 0. Check if pagination exists at all on this page
      const hasPagination = await page.evaluate(() => {
        const pagers = document.querySelectorAll(
          '.pagination, .pager, #ctl00_ctl03_Pager, a[onclick*="goToPage"], a[href*="Page$"]'
        );
        return pagers.length > 0;
      });

      if (!hasPagination) {
        Logger.info(`La marca tiene una sola página (sin controles de paginación adicionales).`);
        return false;
      }

      // 1. Snapshot first few product IDs before navigating
      const currentIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.product-item'))
          .map((c) => c.getAttribute('data-product-id'))
          .filter(Boolean)
          .slice(0, 5)
      );

      // 2. Scroll to bottom of catalog
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);

      // 3. Locate direct numeric page link
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
        }
      }

      if (!clicked) {
        Logger.info(`No se encontraron más controles de paginación para la página ${targetNum}.`);
        return false;
      }

      // Allow DOM to settle
      await page.waitForTimeout(1500);

      // 5. Verify page transition
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
