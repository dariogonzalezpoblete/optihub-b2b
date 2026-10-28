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
    if (customPath && fs.existsSync(customPath)) {
      this.authStatePath = customPath;
    } else {
      this.authStatePath = this.resolveBestAuthStatePath();
    }
  }

  private resolveBestAuthStatePath(): string {
    const candidatePaths = [
      CONFIG.STORAGE.AUTH_STATE_PATH,
      path.resolve(__dirname, '../../auth_state.json'),
      path.resolve(process.cwd(), 'auth_state.json'),
      path.resolve(process.cwd(), 'backend/scraper/auth_state.json'),
    ];

    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        try {
          const stats = fs.statSync(p);
          if (stats.size > 20) {
            return p;
          }
        } catch {}
      }
    }

    return path.resolve(__dirname, '../../auth_state.json');
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
      const alt = this.resolveBestAuthStatePath();
      if (fs.existsSync(alt)) {
        this.authStatePath = alt;
      } else {
        return false;
      }
    }

    try {
      const stats = fs.statSync(this.authStatePath);
      if (stats.size < 20) return false;
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
      Logger.info('Verificando validez de la sesión con NYWD...');
      await page.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      });

      await page.waitForTimeout(1500);
      const currentUrl = page.url().toLowerCase();

      // If redirected to login, session has expired
      if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        Logger.warn('NYWD redirigió a la página de login. La sesión anterior ha expirado.');
        return false;
      }

      // Check for password inputs indicating login view
      const hasLoginForm = await page.$('input[type="password"]');
      if (hasLoginForm && !currentUrl.includes('wholesale') && !currentUrl.includes('listing-brand')) {
        Logger.warn('Formulario de login detectado en la página. Sesión expirada.');
        return false;
      }

      // Check for authenticated elements (e.g. brand navigation, account menu, prices)
      const isAuthenticated = await page.evaluate(() => {
        const url = window.location.href.toLowerCase();
        const hasBrands = !!document.querySelector('#shop-brands, a[data-target="#shop-brands"], a[href*="listing-brand"]');
        const hasAccount = !!document.querySelector('a[href*="logout"], a[href*="signout"], #account-dropdown, .user-name');
        const hasPrices = document.body.innerText.includes('$');
        return hasBrands || hasAccount || (url.includes('wholesale') && hasPrices);
      });

      if (isAuthenticated) {
        Logger.success('Sesión activa verificada: Acceso al catálogo mayorista confirmado.');
        return true;
      }

      Logger.warn('No se detectaron marcas de usuario autenticado en la página.');
      return false;
    } catch (err) {
      Logger.warn('Error al verificar el estado de la sesión:', err);
      return false;
    }
  }

  /**
   * Saves cookies and storage state to auth_state.json in both scraper and root directories
   */
  public async persistState(context: BrowserContext): Promise<void> {
    try {
      const dir = path.dirname(this.authStatePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await context.storageState({ path: this.authStatePath });

      // Always sync to root optihub and backend/scraper so both always have identical credentials
      const targets = [
        path.resolve(__dirname, '../../auth_state.json'),
        path.resolve(process.cwd(), 'auth_state.json'),
        path.resolve(process.cwd(), 'backend/scraper/auth_state.json'),
      ];

      for (const target of targets) {
        if (target !== this.authStatePath) {
          try {
            const tDir = path.dirname(target);
            if (!fs.existsSync(tDir)) fs.mkdirSync(tDir, { recursive: true });
            fs.copyFileSync(this.authStatePath, target);
          } catch {}
        }
      }

      const stats = fs.statSync(this.authStatePath);
      Logger.success(`Credenciales y cookies guardadas exitosamente en: ${this.authStatePath} (${stats.size} bytes).`);
      Logger.info('Las siguientes ejecuciones reutilizarán automáticamente esta sesión.');
    } catch (err) {
      Logger.error(`Error al guardar la sesión: ${err}`);
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
      rl.question(`\n${message}\n>>> Presiona [ENTER] en esta terminal una vez que hayas iniciado sesión: `, () => {
        rl.close();
        resolve();
      });
    });
  }

  /**
   * Launches or re-launches browser engine
   */
  private async launchBrowser(headless: boolean): Promise<Browser> {
    const launchArgs = [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ];

    try {
      return await chromium.launch({
        channel: 'chrome',
        headless,
        args: launchArgs,
      });
    } catch {
      return await chromium.launch({
        headless,
        args: launchArgs,
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
   * waits until user actually completes login, and saves state to auth_state.json.
   */
  public async ensureAuthenticated(requestedHeadless: boolean = false): Promise<AuthContextSession> {
    const hasState = this.hasSavedState();

    if (hasState) {
      Logger.info(`Sesión previa encontrada en: ${this.authStatePath}. Verificando validez...`);
      const testBrowser = await this.launchBrowser(requestedHeadless);
      const testContext = await this.createContext(testBrowser, true);
      const testPage = await testContext.newPage();

      const isValid = await this.isSessionValid(testPage);
      if (isValid) {
        Logger.success('Reutilizando sesión guardada. No es necesario volver a ingresar contraseña.');
        return {
          context: testContext,
          page: testPage,
          browser: testBrowser,
          wasInteractive: false,
        };
      }

      Logger.warn('La sesión guardada ha expirado en el servidor de NYWD. Se abrirá Chrome visible para reautenticar.');
      await testPage.close().catch(() => {});
      await testContext.close().catch(() => {});
      await testBrowser.close().catch(() => {});
    } else {
      Logger.info('No se encontró archivo de sesión activo. Es necesario autenticarse una vez en Chrome.');
    }

    // ─────────────────────────────────────────────────────────────
    // INTERACTIVE LOGIN FLOW (ALWAYS HEADLESS: FALSE FOR RECAPTCHA)
    // ─────────────────────────────────────────────────────────────
    Logger.info('Iniciando Google Chrome en modo visible para resolver Captcha e iniciar sesión...');
    const authBrowser = await this.launchBrowser(false);
    const authContext = await this.createContext(authBrowser, this.hasSavedState());
    const authPage = await authContext.newPage();

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        🔐 INICIO DE SESIÓN EN NYWD (nywd.com)                       ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log('║ 1. Se ha abierto Google Chrome en tu pantalla.                    ║');
    console.log('║ 2. Ingresa tu usuario y clave (o confírmalos si ya cargaron).     ║');
    console.log('║ 3. Marca la casilla "Remember username / Recordar sesión".        ║');
    console.log('║ 4. RESUELVE el reCAPTCHA y presiona el botón "SIGN IN".           ║');
    console.log('║ 5. El bot recordará tu sesión para las próximas veces.             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    await authPage.goto(CONFIG.PROVIDER.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
    });

    // Wait until login form is genuinely rendered in DOM (prevent premature auto-detection)
    await authPage.waitForSelector('#txtpassword, input[type="password"], #txtusername', {
      timeout: 15000,
    }).catch(() => {});

    // Attempt auto-filling credentials if provided in env
    const user = CONFIG.PROVIDER.USERNAME;
    const pass = CONFIG.PROVIDER.PASSWORD;
    if (user && pass) {
      try {
        const uInput = await authPage.$(
          '#txtusername, input[name="input-username"], input[name*="user" i], input[type="email"]'
        );
        if (uInput) await uInput.fill(user);

        const pInput = await authPage.$(
          '#txtpassword, input[name="input-password"], input[type="password"]'
        );
        if (pInput) await pInput.fill(pass);

        const rem = await authPage.$('#chkremember, input[type="checkbox"][name*="remember" i]');
        if (rem) await rem.check().catch(() => {});
      } catch (err) {
        Logger.debug('Nota de auto-rellenado:', err);
      }
    }

    // Wait for user confirmation OR robust automatic navigation detection
    let isDone = false;

    const autoDetector = (async () => {
      // Small initial wait to allow page load
      await new Promise((r) => setTimeout(r, 2000));

      while (!isDone) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const url = authPage.url().toLowerCase();

          // Must NOT be about:blank and must NOT be on login page
          const isNotOnLogin = url.startsWith('http') && !url.includes('/login') && !url.includes('signin');

          if (isNotOnLogin) {
            // Confirm password input is absent
            const hasPwd = await authPage.$('input[type="password"]');
            if (!hasPwd) {
              const cookies = await authContext.cookies();
              const hasAuthCookie = cookies.some(
                (c) => c.name === '.ASPXAUTH' || c.name === 'authdata' || c.name === 'ASP.NET_SessionId'
              );

              if (
                hasAuthCookie ||
                url.includes('wholesale') ||
                url.includes('new-home') ||
                url.includes('listing-brand') ||
                url.includes('account')
              ) {
                Logger.success(`¡Ingreso a NYWD detectado exitosamente en: ${authPage.url()}!`);
                isDone = true;
                break;
              }
            }
          }
        } catch {}
      }
    })();

    const userPrompt = (async () => {
      await this.promptUserKey('👉 Por favor resuelve el reCAPTCHA en Chrome y presiona "SIGN IN".');
      isDone = true;
    })();

    await Promise.race([autoDetector, userPrompt]);
    isDone = true;

    // Small delay to allow session cookies to settle
    await authPage.waitForTimeout(2000);

    // If still on login page, navigate to wholesale catalog to confirm
    if (authPage.url().toLowerCase().includes('login')) {
      await authPage.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      }).catch(() => {});
      await authPage.waitForTimeout(1500);
    }

    // Persist session to auth_state.json across both directories
    await this.persistState(authContext);

    return {
      context: authContext,
      page: authPage,
      browser: authBrowser,
      wasInteractive: true,
    };
  }
}
