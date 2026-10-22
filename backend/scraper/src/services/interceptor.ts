import { Page, Response } from 'playwright';
import { OptiHubProduct, RawCatalogItem } from '../types';
import { calculateB2BPricing } from './pricing';
import { Logger } from '../utils/logger';

export interface InterceptorStats {
  totalPackets: number;
  totalProductsExtracted: number;
  endpoints: Set<string>;
}

export class NetworkInterceptor {
  private capturedProducts: Map<string, OptiHubProduct> = new Map();
  private stats: InterceptorStats = {
    totalPackets: 0,
    totalProductsExtracted: 0,
    endpoints: new Set<string>(),
  };
  private minStock: number;
  private targetBrand?: string;

  constructor(options?: { minStock?: number; targetBrand?: string }) {
    this.minStock = options?.minStock ?? 5;
    this.targetBrand = options?.targetBrand;
  }

  /**
   * Resets captured items and stats for a new brand or batch
   */
  public reset(targetBrand?: string): void {
    this.capturedProducts.clear();
    this.stats = {
      totalPackets: 0,
      totalProductsExtracted: 0,
      endpoints: new Set<string>(),
    };
    if (targetBrand) {
      this.targetBrand = targetBrand;
    }
  }

  public getCapturedProducts(): OptiHubProduct[] {
    return Array.from(this.capturedProducts.values());
  }

  public getStats(): InterceptorStats {
    return this.stats;
  }

  /**
   * Attaches network listener to Playwright Page to intercept all catalog JSON payloads
   */
  public attach(page: Page): void {
    Logger.info('Attaching high-speed network API interceptor to page...');

    page.on('response', async (response: Response) => {
      try {
        await this.handleResponse(response);
      } catch (err) {
        Logger.debug(`Interceptor handling error on ${response.url()}:`, err);
      }
    });
  }

  /**
   * Intercepts and parses XHR/Fetch JSON responses
   */
  private async handleResponse(response: Response): Promise<void> {
    const request = response.request();
    const resourceType = request.resourceType();
    const url = response.url();

    // Only inspect XHR/Fetch, JSON or catalog-related endpoints
    const isXhrOrFetch = resourceType === 'fetch' || resourceType === 'xhr';
    const contentType = response.headers()['content-type'] || '';
    const isJson = contentType.includes('application/json') || contentType.includes('text/json');
    const isRelevantUrl =
      url.includes('api') ||
      url.includes('ajax') ||
      url.includes('product') ||
      url.includes('catalog') ||
      url.includes('search') ||
      url.includes('wholesale') ||
      url.includes('listing');

    if (!isJson && !isXhrOrFetch && !isRelevantUrl) {
      return;
    }

    // Ignore telemetry, tracking, fonts, css
    if (
      url.includes('google-analytics') ||
      url.includes('hotjar') ||
      url.includes('facebook') ||
      url.includes('clarity') ||
      url.includes('doubleclick')
    ) {
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // Not a valid JSON payload; skip
      return;
    }

    if (!payload || typeof payload !== 'object') {
      return;
    }

    this.stats.totalPackets++;
    this.stats.endpoints.add(url);

    // Extract structured items from payload
    const items = this.extractItemsFromPayload(payload);
    if (items.length === 0) {
      return;
    }

    let batchCount = 0;
    for (const item of items) {
      const normalized = this.normalizeItem(item, url);
      if (normalized) {
        // Enforce minimum stock constraint
        if (normalized.stock <= this.minStock) {
          Logger.debug(`Skipping ${normalized.id_ext}: stock (${normalized.stock}) <= minimum (${this.minStock})`);
          continue;
        }

        // Optional brand filtering
        if (this.targetBrand && !this.matchesBrand(normalized.marca, this.targetBrand)) {
          continue;
        }

        if (!this.capturedProducts.has(normalized.id_ext)) {
          this.capturedProducts.set(normalized.id_ext, normalized);
          this.stats.totalProductsExtracted++;
          batchCount++;
        }
      }
    }

    if (batchCount > 0) {
      Logger.apiIntercept(url, batchCount);
    }
  }

  /**
   * Heuristically searches for arrays of catalog/product objects inside any JSON structure
   */
  private extractItemsFromPayload(data: unknown): RawCatalogItem[] {
    const results: RawCatalogItem[] = [];

    const search = (node: unknown, depth = 0) => {
      if (depth > 6 || !node || typeof node !== 'object') return;

      if (Array.isArray(node)) {
        // Check if elements look like products
        if (node.length > 0 && typeof node[0] === 'object' && node[0] !== null) {
          const sample = node[0] as Record<string, unknown>;
          const hasProductKeys =
            'sku' in sample ||
            'model' in sample ||
            'price' in sample ||
            'stock' in sample ||
            'quantity' in sample ||
            'brand' in sample ||
            'itemNumber' in sample ||
            'productId' in sample ||
            'color' in sample ||
            'name' in sample;

          if (hasProductKeys) {
            results.push(...(node as RawCatalogItem[]));
            return;
          }
        }

        for (const item of node) {
          search(item, depth + 1);
        }
        return;
      }

      const obj = node as Record<string, unknown>;
      // Look for common array wrappers
      const candidateKeys = ['products', 'items', 'data', 'results', 'catalog', 'variants', 'models', 'list'];
      for (const key of candidateKeys) {
        if (Array.isArray(obj[key])) {
          search(obj[key], depth + 1);
        }
      }

      // Check remaining keys if nothing found
      if (results.length === 0) {
        for (const key of Object.keys(obj)) {
          if (!candidateKeys.includes(key) && typeof obj[key] === 'object') {
            search(obj[key], depth + 1);
          }
        }
      }
    };

    search(data);
    return results;
  }

  /**
   * Normalizes a raw provider item into OptiHub's standardized schema with Gated Pricing
   */
  public normalizeItem(raw: RawCatalogItem, sourceUrl: string): OptiHubProduct | null {
    try {
      const getStr = (val: unknown): string => {
        if (val === undefined || val === null) return '';
        const s = String(val).trim();
        return s.toLowerCase() === 'select' || s.toLowerCase() === 'none' ? '' : s;
      };
      const getNum = (val: unknown): number => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const cleaned = String(val).replace(/[^0-9.-]+/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      };

      let rawBrand = getStr(raw.brand || raw.marca || raw.manufacturer || this.targetBrand || 'Unknown');
      const rawModel = getStr(raw.model || raw.modelo || raw.sku || raw.itemNumber || raw.name || '');

      // Intelligent Brand Sanitization: Ensure model name prefix overrides any mislabeled brand context
      const mUpper = rawModel.toUpperCase();
      if (mUpper.startsWith('NIKE')) rawBrand = 'Nike';
      else if (mUpper.startsWith('ADIDAS')) rawBrand = 'Adidas';
      else if (mUpper.startsWith('GUESS')) rawBrand = 'Guess';
      else if (mUpper.startsWith('TOM FORD')) rawBrand = 'Tom Ford';
      else if (mUpper.startsWith('LACOSTE')) rawBrand = 'Lacoste';
      else if (mUpper.startsWith('CALVIN KLEIN')) rawBrand = 'Calvin Klein';
      else if (mUpper.startsWith('BOLLE')) rawBrand = 'Bolle';
      else if (mUpper.startsWith('HARLEY')) rawBrand = 'Harley Davidson';
      else if (mUpper.startsWith('HUGO')) rawBrand = 'Hugo';
      else if (mUpper.startsWith('ZEISS')) rawBrand = 'Zeiss';
      else if (mUpper.startsWith('IC BERLIN') || mUpper.startsWith('IC! BERLIN') || (rawBrand || '').toLowerCase().includes('berlin')) rawBrand = 'IC! Berlin';
      else if ((rawBrand || '').toLowerCase() === 'bmw') rawBrand = 'BMW';
      else if ((rawBrand || '').toLowerCase() === 'dkny') rawBrand = 'DKNY';
      else {
        rawBrand = (rawBrand || '').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      const rawColor = getStr(raw.color || raw.color_name || raw.colorName || 'Único');
      const rawColorCode = getStr(raw.color_code || raw.colorCode || raw.code || '001').toUpperCase();
      const rawIdNywd = getStr(raw.id || raw.id_nywd || raw.productId || raw.item_id || '');

      const baseSku = (rawModel || raw.sku || 'OPT').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
      const colorCodeClean = (rawColorCode || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const idExt = `${baseSku}-${colorCodeClean}`.toUpperCase();

      const priceUsd = getNum(raw.wholesale_price ?? raw.price ?? raw.cost ?? raw.base_price ?? 0);
      const stock = Math.round(getNum(raw.stock ?? raw.quantity ?? raw.qty ?? raw.available ?? 0));

      // Calculate Gated Pricing
      const pricing = calculateB2BPricing(priceUsd);

      // Extract image gallery
      let mainImg = '';
      let secImg = '';

      if (Array.isArray(raw.images) && raw.images.length > 0) {
        mainImg = this.cleanImageUrl(String(raw.images[0]));
        if (raw.images.length > 1) {
          secImg = this.cleanImageUrl(String(raw.images[1]));
        }
      } else if (raw.image_url || raw.image) {
        mainImg = this.cleanImageUrl(String(raw.image_url || raw.image));
      }

      const product: OptiHubProduct = {
        id_ext: idExt,
        id_nywd: rawIdNywd,
        marca: rawBrand,
        modelo: rawModel || baseSku,
        color: rawColor,
        codigo_color: colorCodeClean,
        genero: getStr(raw.gender || raw.genero),
        forma: getStr(raw.shape || raw.forma),
        material: getStr(raw.material || raw.frame_material),
        tamano: getStr(raw.size || raw.tamano),
        upc: getStr(raw.upc),
        origen: getStr(raw.origin || raw.made_in),
        stock: stock,
        precio_usd: priceUsd,
        precio_neto_clp: pricing.precio_neto_clp,
        precio_bruto_clp: pricing.precio_bruto_clp,
        ganancia_clp: pricing.ganancia_clp,
        costo_flete_usd: pricing.costo_flete_usd,
        costo_cif_clp: pricing.costo_cif_clp,
        ad_valorem_clp: pricing.ad_valorem_clp,
        costo_despacho_local_clp: pricing.costo_despacho_local_clp,
        costo_total_chile_clp: pricing.costo_total_chile_clp,
        imagen_principal: mainImg,
        imagenes_secundarias: secImg,
        url_origen: getStr(raw.url) || sourceUrl,
      };

      return product;
    } catch (e) {
      Logger.debug('Failed to normalize raw catalog item:', e);
      return null;
    }
  }

  private cleanImageUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://www.nywd.com' + url;
    if (url.includes('pictures/')) {
      const parts = url.split('pictures/');
      return 'https://www.nywd.com/pictures/' + parts.pop()?.split('?')[0];
    }
    return url;
  }

  private matchesBrand(productBrand: string, targetBrand: string): boolean {
    const cleanP = productBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanT = targetBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanP.includes(cleanT) || cleanT.includes(cleanP);
  }
}
