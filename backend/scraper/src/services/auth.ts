import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export interface AuthContextSession {
  context: BrowserContext;
  page: Page;
  browser: Browser;
  wasInteractive: boolean;
}

export class SessionManager {
  private authStatePath: string;

  constructor(customPath?: string) {
    this.authStatePath = customPath || CONFIG.STORAGE.AUTH_STATE_PATH;
  }

  public getAuthStatePath(): string {
    return this.authStatePath;
  }

  /**
   * Returns a formatted Cookie header string from the saved storage state
   */
  public getCookieHeader(): string {
    if (!this.hasSavedState()) return '';
    try {
      const content = fs.readFileSync(this.authStatePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.cookies)) {
        return parsed.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ');
      }
    } catch {}
    return '';
  }

  /**
   * Checks if an auth_state.json exists and contains saved cookies
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
   * Validates if current page / session is authorized to view wholesale catalog
   */
  public async isSessionValid(page: Page): Promise<boolean> {
    try {
      Logger.info('Verifying provider session state against catalog portal...');
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

      // Check for password inputs indicating login view
      const hasLoginForm = await page.$('input[type="password"]');
      if (hasLoginForm && !currentUrl.includes('wholesale')) {
        Logger.warn('Login form detected on portal page. Session is expired.');
        return false;
      }

      Logger.success('Session verified: Authenticated access to wholesale catalog confirmed.');
      return true;
    } catch (err) {
      Logger.warn('Error while validating session state:', err);
      return false;
    }
  }

  /**
   * Saves cookies and storage state to auth_state.json
   */
  public async persistState(context: BrowserContext): Promise<void> {
    try {
      const dir = path.dirname(this.authStatePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await context.storageState({ path: this.authStatePath });
      const stats = fs.statSync(this.authStatePath);
      Logger.success(`Session state successfully saved to: ${this.authStatePath} (${stats.size} bytes).`);
      Logger.info('Subsequent executions will be 100% automated reusing this session state.');
    } catch (err) {
      Logger.error(`Failed to write session storage state: ${err}`);
      throw err;
    }
  }

  /**
   * Prompts the user in console to press Enter after completing captcha
   */
  private async promptUserKey(message: string): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`\n${message}\n>>> Presiona [ENTER] para continuar: `, () => {
        rl.close();
        resolve();
      });
    });
  }

  /**
   * Launches or re-launches browser engine
   */
  private async launchBrowser(headless: boolean): Promise<Browser> {
    try {
      return await chromium.launch({
        channel: 'chrome',
        headless,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      });
    } catch {
      return await chromium.launch({
        headless,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      });
    }
  }

  /**
   * Creates a browser context with storageState if available
   */
  private async createContext(browser: Browser, useStorageState: boolean): Promise<BrowserContext> {
    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    };

    if (useStorageState && this.hasSavedState()) {
      contextOptions.storageState = this.authStatePath;
    }

    const context = await browser.newContext(contextOptions);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return context;
  }

  /**
   * Ensures an active, verified session.
   * If session state exists and is valid -> runs 100% automated (respecting requested headless mode).
   * If state does not exist or expired -> switches to visible (headless: false), displays captcha instructions,
   * pauses execution until user completes reCAPTCHA, and saves state to auth_state.json.
   */
  public async ensureAuthenticated(requestedHeadless: boolean = false): Promise<AuthContextSession> {
    const hasState = this.hasSavedState();

    if (hasState) {
      Logger.info(`Found existing session file: ${this.authStatePath}. Testing session validity...`);
      const testBrowser = await this.launchBrowser(requestedHeadless);
      const testContext = await this.createContext(testBrowser, true);
      const testPage = await testContext.newPage();

      const isValid = await this.isSessionValid(testPage);
      if (isValid) {
        Logger.success('Reusing existing valid session state without login.');
        return {
          context: testContext,
          page: testPage,
          browser: testBrowser,
          wasInteractive: false,
        };
      }

      Logger.warn('Saved session has expired. Closing test instance and switching to interactive visible mode...');
      await testPage.close().catch(() => {});
      await testContext.close().catch(() => {});
      await testBrowser.close().catch(() => {});
    } else {
      Logger.info('No auth_state.json found. An initial visible authentication session is required.');
    }

    // ─────────────────────────────────────────────────────────────
    // INTERACTIVE LOGIN FLOW (FORCED HEADLESS: FALSE FOR RECAPTCHA)
    // ─────────────────────────────────────────────────────────────
    Logger.info('Launching visible Google Chrome window (headless: false) for manual reCAPTCHA authentication...');
    const authBrowser = await this.launchBrowser(false); // ALWAYS visible for captcha
    const authContext = await this.createContext(authBrowser, false);
    const authPage = await authContext.newPage();

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        🔐 AUTENTICACIÓN ASISTIDA REQUERIDA (nywd.com)              ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log('║ 1. Se ha abierto Google Chrome en modo visible.                   ║');
    console.log('║ 2. Ingresa tu correo y contraseña si no están precargados.         ║');
    console.log('║ 3. Marca la casilla "Remember me / Recordar sesión".               ║');
    console.log('║ 4. RESUELVE el reCAPTCHA y haz clic en "SIGN IN".                  ║');
    console.log('║ 5. El bot detectará tu ingreso al catálogo o puedes presionar      ║');
    console.log('║    [ENTER] en esta terminal tras estar autenticado.                ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    await authPage.goto(CONFIG.PROVIDER.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
    });

    // Attempt auto-filling credentials if provided in env
    const user = CONFIG.PROVIDER.USERNAME;
    const pass = CONFIG.PROVIDER.PASSWORD;
    if (user && pass) {
      try {
        const uInput = await authPage.$(
          'input[name*="user" i], input[id*="user" i], input[name*="email" i], input[type="email"], #txtUsername'
        );
        if (uInput) await uInput.fill(user);

        const pInput = await authPage.$(
          'input[name*="pass" i], input[id*="pass" i], input[type="password"], #txtPassword'
        );
        if (pInput) await pInput.fill(pass);

        const rem = await authPage.$('input[type="checkbox"][name*="remember" i], #chkRemember');
        if (rem) await rem.check().catch(() => {});
      } catch (err) {
        Logger.debug('Auto-fill note:', err);
      }
    }

    // Wait for user confirmation OR automatic navigation detection
    let isDone = false;

    const autoDetector = (async () => {
      while (!isDone) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const url = authPage.url().toLowerCase();
          const hasPwd = await authPage.$('input[type="password"]');
          if ((url.includes('wholesale') || url.includes('listing-brand') || !url.includes('login')) && !hasPwd) {
            Logger.success(`¡Ingreso detectado automáticamente en la URL!: ${authPage.url()}`);
            isDone = true;
            break;
          }
        } catch {}
      }
    })();

    const userPrompt = (async () => {
      await this.promptUserKey('👉 Por favor, resuelve el reCAPTCHA en Chrome y haz clic en "SIGN IN".');
      isDone = true;
    })();

    await Promise.race([autoDetector, userPrompt]);
    isDone = true;

    // Small delay to allow session cookies to settle
    await authPage.waitForTimeout(2000);

    // Navigate to catalog to guarantee full wholesale cookies
    if (authPage.url().toLowerCase().includes('login')) {
      await authPage.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      }).catch(() => {});
    }

    // Persist session to auth_state.json
    await this.persistState(authContext);

    return {
      context: authContext,
      page: authPage,
      browser: authBrowser,
      wasInteractive: true,
    };
  }
}
