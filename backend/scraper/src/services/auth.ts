import fs from 'fs';
import path from 'path';
import { Browser, BrowserContext, Page } from 'playwright';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export interface SessionStatus {
  isAuthenticated: boolean;
  source: 'state_file' | 'new_login' | 'none';
  statePath: string;
}

export class SessionManager {
  private authStatePath: string;

  constructor(customPath?: string) {
    this.authStatePath = customPath || CONFIG.STORAGE.AUTH_STATE_PATH;
  }

  /**
   * Returns true if a saved auth_state.json exists and is valid JSON
   */
  public hasSavedState(): boolean {
    if (!fs.existsSync(this.authStatePath)) {
      return false;
    }
    try {
      const stats = fs.statSync(this.authStatePath);
      if (stats.size < 10) return false;
      const content = fs.readFileSync(this.authStatePath, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.cookies) && parsed.cookies.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Creates a browser context with storage state if available
   */
  public async createContext(browser: Browser, headless: boolean = false): Promise<BrowserContext> {
    const hasState = this.hasSavedState();

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    };

    if (hasState) {
      Logger.info(`Found existing session state at: ${this.authStatePath}. Reusing session...`);
      contextOptions.storageState = this.authStatePath;
    } else {
      Logger.info('No prior session state found. A new login will be required.');
    }

    const context = await browser.newContext(contextOptions);

    // Mask automation markers
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return context;
  }

  /**
   * Tests if the current browser context has an active, authenticated session
   */
  public async isSessionValid(page: Page): Promise<boolean> {
    try {
      Logger.info('Checking session validity against provider portal...');
      await page.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      });

      const currentUrl = page.url().toLowerCase();

      // If redirected to login, session has expired
      if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        Logger.warn('Provider redirected to login. Session has expired or is invalid.');
        return false;
      }

      // Check for wholesale indicators or brand menu
      const isWholesale = currentUrl.includes('wholesale') || currentUrl.includes('listing-brand');
      const hasLoginForm = await page.$('input[type="password"]');

      if (hasLoginForm && !isWholesale) {
        Logger.warn('Login form detected on page. Session is expired.');
        return false;
      }

      Logger.success('Active provider session verified successfully.');
      return true;
    } catch (err) {
      Logger.warn('Error while validating session state:', err);
      return false;
    }
  }

  /**
   * Performs authentication and updates auth_state.json
   */
  public async loginAndSave(page: Page, context: BrowserContext): Promise<boolean> {
    Logger.info(`Initiating provider login flow at: ${CONFIG.PROVIDER.LOGIN_URL}`);

    await page.goto(CONFIG.PROVIDER.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
    });

    const username = CONFIG.PROVIDER.USERNAME;
    const password = CONFIG.PROVIDER.PASSWORD;

    // Automated credential fill if available
    if (username && password) {
      Logger.info(`Auto-filling credentials for user: ${username}`);
      try {
        const usernameInput = await page.waitForSelector(
          'input[name*="user" i], input[id*="user" i], input[name*="email" i], input[type="email"], #txtUsername',
          { timeout: 5000 }
        );
        if (usernameInput) {
          await usernameInput.fill(username);
        }

        const passwordInput = await page.waitForSelector(
          'input[name*="pass" i], input[id*="pass" i], input[type="password"], #txtPassword',
          { timeout: 5000 }
        );
        if (passwordInput) {
          await passwordInput.fill(password);
        }

        const rememberCheckbox = await page.$(
          'input[type="checkbox"][name*="remember" i], #chkRemember, input[id*="remember" i]'
        );
        if (rememberCheckbox) {
          await rememberCheckbox.check().catch(() => {});
        }

        // Try to submit if no captcha block
        const submitBtn = await page.$(
          'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Login"), #btnSubmit'
        );

        if (submitBtn) {
          await submitBtn.click().catch(() => {});
        }
      } catch (e) {
        Logger.debug('Auto-fill had partial match or encountered captcha challenge', e);
      }
    }

    // Check if session transitioned to authenticated portal
    Logger.info('Waiting for authentication completion (up to 45s for captcha/credentials)...');
    try {
      await page.waitForFunction(
        () => {
          const url = window.location.href.toLowerCase();
          const hasPwd = !!document.querySelector('input[type="password"]');
          return (url.includes('wholesale') || url.includes('listing-brand') || !url.includes('login')) && !hasPwd;
        },
        null,
        { timeout: 45000 }
      );
    } catch {
      Logger.warn('Automated navigation timeout. Checking if session is nonetheless authenticated...');
    }

    // Verify final state
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes('/login')) {
      Logger.error('Failed to complete login. Please verify provider credentials or captcha in browser.');
      return false;
    }

    // Persist storage state
    await this.persistState(context);
    return true;
  }

  /**
   * Saves storage state (cookies, localStorage, session tokens) to disk
   */
  public async persistState(context: BrowserContext): Promise<void> {
    try {
      const dir = path.dirname(this.authStatePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await context.storageState({ path: this.authStatePath });
      const stats = fs.statSync(this.authStatePath);
      Logger.success(`Session state successfully saved to ${this.authStatePath} (${stats.size} bytes).`);
    } catch (err) {
      Logger.error(`Failed to write session storage state: ${err}`);
      throw err;
    }
  }

  /**
   * Ensures an active authenticated session. Reuses state or logs in once.
   */
  public async ensureAuthenticated(page: Page, context: BrowserContext): Promise<boolean> {
    const isValid = await this.isSessionValid(page);
    if (isValid) {
      return true;
    }

    Logger.warn('Session is expired or absent. Performing automated single-run login...');
    const loginOk = await this.loginAndSave(page, context);
    if (!loginOk) {
      throw new Error('Unable to authenticate with provider. Please check credentials or solve captcha.');
    }

    Logger.success('Provider authentication completed and session state refreshed.');
    return true;
  }
}
