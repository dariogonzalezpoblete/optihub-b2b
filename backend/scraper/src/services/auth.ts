import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export interface AuthContextSession {
  context: BrowserContext;
  page: Page;
  browser?: Browser;
  wasInteractive: boolean;
}

export class SessionManager {
  private authStatePath: string;
  private sessionDir: string;

  constructor(customPath?: string) {
    this.sessionDir = CONFIG.STORAGE.SESSION_DIR || path.resolve(__dirname, '../../sesion_navegador');
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

  public getSessionDir(): string {
    return this.sessionDir;
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
      Logger.info('Verificando si la sesión en NYWD ya está activa...');
      await page.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      });

      await page.waitForTimeout(1800);
      const currentUrl = page.url().toLowerCase();

      // If redirected to login, session has expired
      if (currentUrl.includes('/login') || currentUrl.includes('signin')) {
        Logger.warn('NYWD redirigió a la página de login. La sesión anterior ha expirado.');
        return false;
      }

      // Check for password inputs indicating login view
      const hasLoginForm = await page.$('input[type="password"]');
      if (hasLoginForm && !currentUrl.includes('wholesale') && !currentUrl.includes('listing-brand') && !currentUrl.includes('new-home')) {
        Logger.warn('Formulario de login detectado en la página. Sesión expirada.');
        return false;
      }

      // Check for authenticated elements (e.g. brand navigation, account menu, prices)
      const isAuthenticated = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const hasPrices = text.includes('$');
        const hasAccount = !!document.querySelector('a[href*="logout"], a[href*="signout"], #account-dropdown, .user-name, a[href*="account"]');
        const hasBrands = !!document.querySelector('#shop-brands, a[data-target="#shop-brands"], a[href*="listing-brand"]');
        return hasAccount || (hasPrices && hasBrands);
      });

      if (isAuthenticated) {
        Logger.success('✅ Sesión activa verificada: Acceso al catálogo mayorista confirmado sin pedir clave.');
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
    } catch (err) {
      Logger.debug(`Error al guardar storageState JSON: ${err}`);
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
   * Launches a persistent Chromium/Chrome browser context.
   * This retains cookies, session, and local storage on disk across runs.
   */
  private async launchPersistentBrowserContext(headless: boolean): Promise<BrowserContext> {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    // Clean stale SingletonLock if left over from a previous killed session
    const lockFile = path.join(this.sessionDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch {}
    }

    const launchArgs = [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
    ];

    const contextOptions = {
      headless,
      args: launchArgs,
      viewport: null, // allows true maximized window
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    };

    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(this.sessionDir, {
        ...contextOptions,
        channel: 'chrome',
      });
    } catch {
      // Fallback to bundled chromium if Google Chrome is not installed in standard path
      context = await chromium.launchPersistentContext(this.sessionDir, contextOptions);
    }

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return context;
  }

  /**
   * Saves credentials to .env file so user NEVER has to enter password again
   */
  public saveCredentialsToEnv(username: string, pass: string): void {
    if (!username || !pass) return;
    try {
      const envPaths = [
        path.resolve(__dirname, '../../.env'),
        path.resolve(process.cwd(), 'backend/scraper/.env'),
        path.resolve(process.cwd(), '.env'),
      ];

      for (const envPath of envPaths) {
        let content = '';
        if (fs.existsSync(envPath)) {
          content = fs.readFileSync(envPath, 'utf-8');
        }

        let updated = content;
        if (updated.includes('PROVIDER_USERNAME=')) {
          updated = updated.replace(/PROVIDER_USERNAME=.*/g, `PROVIDER_USERNAME=${username}`);
        } else {
          updated += `\nPROVIDER_USERNAME=${username}`;
        }

        if (updated.includes('PROVIDER_PASSWORD=')) {
          updated = updated.replace(/PROVIDER_PASSWORD=.*/g, `PROVIDER_PASSWORD=${pass}`);
        } else {
          updated += `\nPROVIDER_PASSWORD=${pass}`;
        }

        const dir = path.dirname(envPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(envPath, updated.trim() + '\n', 'utf-8');
      }

      CONFIG.PROVIDER.USERNAME = username;
      CONFIG.PROVIDER.PASSWORD = pass;
      Logger.success('Credenciales de NYWD guardadas de forma segura en .env para auto-completado.');
    } catch (e) {
      Logger.debug('Could not save credentials to .env:', e);
    }
  }

  /**
   * Ensures an active, verified session.
   * If session state exists and is valid -> runs 100% automated.
   * If state does not exist or expired -> switches to visible (headless: false), auto-fills credentials,
   * waits until user actually completes login, and saves state to sesion_navegador + auth_state.json.
   */
  public async ensureAuthenticated(requestedHeadless: boolean = false): Promise<AuthContextSession> {
    Logger.info(`Iniciando contexto de navegador persistente en: ${this.sessionDir}`);
    let context = await this.launchPersistentBrowserContext(requestedHeadless);
    let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    const isValid = await this.isSessionValid(page);
    if (isValid) {
      Logger.success('🎉 Reutilizando sesión guardada. No es necesario volver a ingresar contraseña ni resolver Captcha.');
      await this.persistState(context);
      return {
        context,
        page,
        wasInteractive: false,
      };
    }

    // If requested headless but session is expired, we MUST open Chrome visible to solve reCAPTCHA
    if (requestedHeadless) {
      Logger.warn('La sesión ha expirado y se requiere resolver reCAPTCHA. Abriendo Chrome en modo visible...');
      await context.close().catch(() => {});
      context = await this.launchPersistentBrowserContext(false);
      page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    }

    // ─────────────────────────────────────────────────────────────
    // INTERACTIVE LOGIN FLOW (VISIBLE CHROME FOR RECAPTCHA)
    // ─────────────────────────────────────────────────────────────
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        🔐 INICIO DE SESIÓN EN NYWD (nywd.com)                       ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log('║ 1. Se ha abierto Google Chrome en tu pantalla.                    ║');
    console.log('║ 2. Si tus datos no cargan solos, ingresa tu usuario y clave.      ║');
    console.log('║ 3. Marca la casilla "Remember username / Recordar sesión".        ║');
    console.log('║ 4. RESUELVE el reCAPTCHA y presiona el botón "SIGN IN".           ║');
    console.log('║ 5. El bot recordará tu sesión y clave para las próximas veces.    ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    await page.goto(CONFIG.PROVIDER.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
    });

    // Wait until login form is rendered in DOM
    await page.waitForSelector('#txtpassword, input[type="password"], #txtusername', {
      timeout: 15000,
    }).catch(() => {});

    // Attempt auto-filling credentials if available
    const user = CONFIG.PROVIDER.USERNAME;
    const pass = CONFIG.PROVIDER.PASSWORD;
    if (user && pass) {
      try {
        const uInput = await page.$(
          '#txtusername, input[name="input-username"], input[name*="user" i], input[type="email"]'
        );
        if (uInput) await uInput.fill(user);

        const pInput = await page.$(
          '#txtpassword, input[name="input-password"], input[type="password"]'
        );
        if (pInput) await pInput.fill(pass);

        const rem = await page.$('#chkremember, input[type="checkbox"][name*="remember" i]');
        if (rem) await rem.check().catch(() => {});
        Logger.info('Usuario y contraseña auto-completados exitosamente.');
      } catch (err) {
        Logger.debug('Nota de auto-rellenado:', err);
      }
    }

    // Wait for user confirmation OR automatic navigation detection
    let isDone = false;

    const autoDetector = (async () => {
      await new Promise((r) => setTimeout(r, 2000));

      while (!isDone) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const url = page.url().toLowerCase();
          const isNotOnLogin = url.startsWith('http') && !url.includes('/login') && !url.includes('signin');

          if (isNotOnLogin) {
            const hasPwd = await page.$('input[type="password"]');
            if (!hasPwd) {
              const cookies = await context.cookies();
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
                Logger.success(`¡Ingreso a NYWD detectado exitosamente en: ${page.url()}!`);
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
    await page.waitForTimeout(2000);

    // If still on login page, navigate to wholesale catalog to confirm
    if (page.url().toLowerCase().includes('login')) {
      await page.goto(CONFIG.PROVIDER.CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Capture entered username/password if they weren't in config
    if (!CONFIG.PROVIDER.USERNAME || !CONFIG.PROVIDER.PASSWORD) {
      try {
        const uVal = await page.inputValue('#txtusername, input[name="input-username"]').catch(() => '');
        const pVal = await page.inputValue('#txtpassword, input[name="input-password"]').catch(() => '');
        if (uVal && pVal) {
          this.saveCredentialsToEnv(uVal, pVal);
        }
      } catch {}
    }

    // Persist session to auth_state.json across both directories
    await this.persistState(context);

    return {
      context,
      page,
      wasInteractive: true,
    };
  }
}
