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
      return Array.isArray(parsed.cookies) && parsed.cookies.some((c: { name: string }) => c.name === '.ASPXAUTH');
    } catch {
      return false;
    }
  }

  /**
   * Validates if current page / session is authorized to view wholesale catalog
   */
  public async isSessionValid(page: Page): Promise<boolean> {
    try {
      // Fast check: verify if .ASPXAUTH cookie already exists in context
      const cookies = await page.context().cookies().catch(() => []);
      const hasAuthCookie = cookies.some(
        (c) => c.name === '.ASPXAUTH' && c.value && c.value.length > 10
      );

      if (!hasAuthCookie && !this.hasSavedState()) {
        Logger.info('No se encontraron credenciales de sesión activas (.ASPXAUTH). Abriendo ventana de login...');
        return false;
      }

      Logger.info('Verificando si la sesión en NYWD sigue activa...');

      // Navigate to new-home (the authenticated wholesale portal)
      await page.goto(`${CONFIG.PROVIDER.BASE_URL}/new-home`, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
      }).catch(() => {});
      await page.waitForTimeout(1500);

      const activeUrl = page.url().toLowerCase();

      // If redirected to login, session has expired
      if (activeUrl.includes('/login') || activeUrl.includes('signin') || activeUrl.includes('/404')) {
        Logger.warn('NYWD redirigió a login. La sesión anterior ha expirado.');
        return false;
      }

      // Check if password input is present
      const hasLoginForm = await page.$('input[type="password"]');
      if (hasLoginForm) {
        Logger.warn('Formulario de login detectado en la página. Sesión no activa.');
        return false;
      }

      // Check for genuine authenticated indicators in DOM or active cookies
      const updatedCookies = await page.context().cookies().catch(() => []);
      const activeAuthCookie = updatedCookies.some((c) => c.name === '.ASPXAUTH' && c.value && c.value.length > 10);

      const isAuthenticated = await page.evaluate(() => {
        const text = document.body ? document.body.innerText.toLowerCase() : '';
        const hasLogout = !!document.querySelector('a[href*="logout" i], a[href*="signout" i], .logout, #btnlogout');
        const hasAccount = !!document.querySelector('a[href*="my-account" i], a[href*="profile" i], .user-name, #account-dropdown');
        const hasMultifocus = text.includes('multifocus') || text.includes('my account') || text.includes('sign out');
        return hasLogout || hasAccount || hasMultifocus;
      }).catch(() => false);

      if (activeAuthCookie || isAuthenticated) {
        Logger.success('✅ Sesión activa verificada: Acceso a NYWD confirmado sin pedir clave.');
        return true;
      }

      Logger.warn('No se detectó sesión autenticada en NYWD. Abriendo ventana de login...');
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

  private activeRl: readline.Interface | null = null;

  /**
   * Prompts the user in console to press Enter after completing captcha
   */
  private async promptUserKey(message: string): Promise<void> {
    try {
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
    } catch {}

    if (this.activeRl) {
      try {
        this.activeRl.close();
      } catch {}
      this.activeRl = null;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.activeRl = rl;

    return new Promise((resolve) => {
      rl.question(`\n${message}\n>>> Presiona [ENTER] en esta terminal una vez que hayas iniciado sesión: `, () => {
        rl.close();
        this.activeRl = null;
        resolve();
      });
    });
  }

  private closeActivePrompt(): void {
    if (this.activeRl) {
      try {
        this.activeRl.close();
      } catch {}
      this.activeRl = null;
    }
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
      '--lang=es-ES,es,en-US,en',
    ];

    const contextOptions = {
      headless,
      args: launchArgs,
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: null, // allows true maximized window
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
    console.log('║ 2. Tus datos se han precargado automáticamente si están guardados.║');
    console.log('║ 3. Asegúrate de marcar "Remember me / Recordar sesión".           ║');
    console.log('║ 4. RESUELVE el reCAPTCHA y presiona el botón "SIGN IN".           ║');
    console.log('║ 5. El sincronizador detectará tu sesión y guardará las cookies.   ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    await page.goto(CONFIG.PROVIDER.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.SCRAPER.NAV_TIMEOUT_MS,
    });

    // Wait until login form is rendered in DOM
    await page.waitForSelector('#txtpassword, input[type="password"], #txtusername', {
      timeout: 15000,
    }).catch(() => {});

    // Gently auto-fill credentials ONCE if available
    const user = CONFIG.PROVIDER.USERNAME || 'multifocuslimitada@gmail.com';
    const pass = CONFIG.PROVIDER.PASSWORD;
    if (user) {
      try {
        const uInput = await page.$(
          '#txtusername, input[name="input-username"], input[name*="user" i], input[type="email"]'
        );
        if (uInput) {
          const currentU = await uInput.inputValue().catch(() => '');
          if (!currentU) await uInput.fill(user);
        }

        if (pass) {
          const pInput = await page.$(
            '#txtpassword, input[name="input-password"], input[type="password"]'
          );
          if (pInput) {
            const currentP = await pInput.inputValue().catch(() => '');
            if (!currentP) await pInput.fill(pass);
          }
        }

        const rem = await page.$('#chkremember, input[type="checkbox"][name*="remember" i]');
        if (rem) {
          const isChecked = await rem.isChecked().catch(() => false);
          if (!isChecked) await rem.check().catch(() => {});
        }
        Logger.info(`Usuario (${user}) preparado para inicio de sesión.`);
      } catch (err) {
        Logger.debug('Nota de auto-rellenado:', err);
      }
    }

    // Passive listener: check URL & cookies every 2s without touching DOM/inputs
    // This allows the user to solve reCAPTCHA without any automation interference!
    let isDone = false;

    const passiveDetector = (async () => {
      while (!isDone) {
        await new Promise((r) => setTimeout(r, 2000));
        if (isDone) break;

        try {
          const currentUrl = page.url().toLowerCase();
          const isOutsideLogin =
            currentUrl.startsWith('http') &&
            !currentUrl.includes('/login') &&
            !currentUrl.includes('signin') &&
            !currentUrl.includes('/404');

          if (isOutsideLogin) {
            const cookies = await context.cookies().catch(() => []);
            const hasAuthCookie = cookies.some(
              (c) => c.name === '.ASPXAUTH' && c.value && c.value.length > 10
            );

            if (hasAuthCookie) {
              Logger.success(`¡Ingreso a NYWD detectado exitosamente en: ${page.url()}!`);
              isDone = true;
              this.closeActivePrompt();
              break;
            }
          }
        } catch {}
      }
    })();

    const userPrompt = (async () => {
      await this.promptUserKey('👉 Resuelve el reCAPTCHA en Chrome, presiona "SIGN IN" y luego presiona [ENTER] aquí.');
      isDone = true;
    })();

    await Promise.race([passiveDetector, userPrompt]);
    isDone = true;
    this.closeActivePrompt();

    // Give time for any pending login POST request and redirects to complete
    Logger.info('Esperando confirmación del servidor de NYWD...');
    try {
      await page.waitForURL(
        (url) => {
          const p = url.pathname.toLowerCase();
          return !p.includes('login') && !p.includes('signin');
        },
        { timeout: 15000 }
      );
    } catch {}

    await page.waitForTimeout(2000);

    // Check if authenticated cookie is set
    const finalCookies = await context.cookies().catch(() => []);
    const hasAuth = finalCookies.some((c) => c.name === '.ASPXAUTH' && c.value && c.value.length > 10);

    if (hasAuth) {
      Logger.success('✅ Sesión autenticada confirmada con éxito.');
      // If entered credentials weren't in config, save them
      if (!CONFIG.PROVIDER.USERNAME || !CONFIG.PROVIDER.PASSWORD) {
        try {
          const uVal = await page.inputValue('#txtusername, input[name="input-username"]').catch(() => '');
          const pVal = await page.inputValue('#txtpassword, input[name="input-password"]').catch(() => '');
          if (uVal && pVal) {
            this.saveCredentialsToEnv(uVal, pVal);
          }
        } catch {}
      }
    } else {
      const currentUrl = page.url().toLowerCase();
      if (currentUrl.includes('login')) {
        const errorText = await page.evaluate(() => {
          const errEl = document.querySelector('.alert-danger, .validation-summary-errors, #lblerror, .text-danger');
          return errEl ? (errEl as HTMLElement).innerText : '';
        }).catch(() => '');

        if (errorText) {
          Logger.warn(`NYWD reportó: ${errorText}`);
        } else {
          Logger.warn('Aún en página de login. Navegando al catálogo para verificar sesión...');
          await page.goto(CONFIG.PROVIDER.CATALOG_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          }).catch(() => {});
          await page.waitForTimeout(2000);
        }
      }
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
