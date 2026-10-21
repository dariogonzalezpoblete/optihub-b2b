import { BrowserContext, Page } from 'playwright';
import { NetworkInterceptor } from './interceptor';
import { OptiHubProduct, ScraperOptions } from '../types';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export class CatalogRunner {
  private interceptor: NetworkInterceptor;

  constructor(interceptor: NetworkInterceptor) {
    this.interceptor = interceptor;
  }

  /**
   * Scrapes an entire brand catalog using API network interception and rapid pagination
   */
  public async scrapeBrand(
    page: Page,
    context: BrowserContext,
    brand: string,
    options: ScraperOptions
  ): Promise<OptiHubProduct[]> {
    Logger.info(`════════════════════════════════════════════════════════════`);
    Logger.info(`🚀 Starting API Catalog Ingestion for Brand: [${brand.toUpperCase()}]`);
    Logger.info(`════════════════════════════════════════════════════════════`);

    this.interceptor.reset(brand);

    // 1. Navigate to brand page or search
    const opened = await this.navigateToBrandCatalog(page, brand);
    if (!opened) {
      Logger.warn(`Could not locate catalog for brand '${brand}'.`);
      return [];
    }

    // 2. Paginate through catalog while capturing intercepted API responses
    let pageNum = 1;
    const maxPages = options.maxPages || CONFIG.SCRAPER.DEFAULT_MAX_PAGINATION;

    while (pageNum <= maxPages) {
      Logger.info(`Processing page ${pageNum}/${maxPages} for brand: ${brand}`);

      // Scroll to trigger lazy fetch requests
      await this.triggerLazyLoading(page);

      // Wait a moment for network responses to be captured
      await page.waitForTimeout(1200);

      const capturedSoFar = this.interceptor.getCapturedProducts().length;
      Logger.info(`Page ${pageNum} complete: ${capturedSoFar} active products accumulated.`);

      // Check if we can advance to next page
      const hasNext = await this.advancePage(page, pageNum);
      if (!hasNext) {
        Logger.info(`Reached end of catalog for brand '${brand}' at page ${pageNum}.`);
        break;
      }

      pageNum++;
    }

    const finalProducts = this.interceptor.getCapturedProducts();
    const stats = this.interceptor.getStats();

    Logger.success(
      `Finished brand '${brand}': ${finalProducts.length} unique products extracted across ${stats.totalPackets} intercepted API packets.`
    );

    return finalProducts;
  }

  /**
   * Navigates directly or via menu to the brand catalog
   */
  private async navigateToBrandCatalog(page: Page, brand: string): Promise<boolean> {
    const brandClean = brand.toLowerCase().trim();
    const currentUrl = page.url().toLowerCase();

    // Already on brand page
    if (currentUrl.includes('listing-brand') && currentUrl.includes(brandClean)) {
      Logger.info(`Already on catalog page for ${brand}: ${page.url()}`);
      return true;
    }

    Logger.info(`Searching for brand '${brand}' in navigation menu...`);

    try {
      // 1. Try finding brand in menu
      const brandMenu = page.locator("a:text-matches('^BRANDS$', 'i'), text='BRANDS'").first();
      if (await brandMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await brandMenu.hover().catch(() => {});
        await page.waitForTimeout(400);

        // Find brand link
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
          Logger.info(`Brand link found in menu: ${foundHref}. Navigating...`);
          await page.goto(foundHref, { waitUntil: 'domcontentloaded', timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS });
          return true;
        }
      }

      // 2. Try direct search bar
      const searchInput = page.locator("input[type='search'], input[name*='search' i], input[placeholder*='search' i]").first();
      if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchInput.fill(brand);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS }).catch(() => {});
        return true;
      }

      // 3. Fallback: navigate to listing-brand search
      const directUrl = `${CONFIG.PROVIDER.BASE_URL}/listing-brand-${encodeURIComponent(brand.toLowerCase())}`;
      Logger.info(`Attempting direct URL: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      return true;
    } catch (e) {
      Logger.warn(`Navigation error for brand ${brand}:`, e);
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
    const urlBefore = page.url();

    try {
      // Check for 'Next' button or page number link
      const nextSelector = `a[rel="next"], [rel="next"] a, a:has-text("Next"), button:has-text("Next"), a:has-text("»"), a:text-matches('^${nextPageNum}$')`;
      const nextBtn = page.locator(nextSelector).first();

      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {}),
          nextBtn.click().catch(() => nextBtn.dispatchEvent('click')),
        ]);
        await page.waitForTimeout(1000);
        return true;
      }

      // Check ASP.NET postback or pagination links
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
      Logger.debug(`Pagination attempt failed on page ${currentPageNum}:`, e);
    }

    return false;
  }
}
