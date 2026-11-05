import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env from backend/scraper or root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

function resolveAuthStatePath(): string {
  if (process.env.AUTH_STATE_FILE) {
    return path.resolve(process.cwd(), process.env.AUTH_STATE_FILE);
  }
  const scraperPath = path.resolve(__dirname, '../../auth_state.json');
  if (fs.existsSync(scraperPath)) return scraperPath;
  const rootPath = path.resolve(process.cwd(), 'auth_state.json');
  if (fs.existsSync(rootPath)) return rootPath;
  return scraperPath;
}

function resolveSessionDir(): string {
  if (process.env.SESSION_DIR) {
    return path.resolve(process.cwd(), process.env.SESSION_DIR);
  }
  return path.resolve(__dirname, '../../sesion_navegador');
}

export const CONFIG = {
  // Provider URLs
  PROVIDER: {
    BASE_URL: process.env.PROVIDER_BASE_URL || 'https://www.nywd.com',
    LOGIN_URL: process.env.PROVIDER_LOGIN_URL || 'https://www.nywd.com/login',
    CATALOG_URL: process.env.PROVIDER_CATALOG_URL || 'https://www.nywd.com/index',
    USERNAME: process.env.PROVIDER_USERNAME || process.env.NYWD_USERNAME || '',
    PASSWORD: process.env.PROVIDER_PASSWORD || process.env.NYWD_PASSWORD || '',
  },

  // Session & Storage
  STORAGE: {
    AUTH_STATE_PATH: resolveAuthStatePath(),
    SESSION_DIR: resolveSessionDir(),
  },

  // Supabase
  SUPABASE: {
    URL: process.env.SUPABASE_URL || '',
    KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
    TABLE_MARCOS: 'marcos',
    BUCKET_NAME: 'marcos-imagenes',
  },

  // Commercial / Pricing defaults (Chile B2B)
  FINANCIAL: {
    DOLAR_CLP: parseFloat(process.env.DOLAR_CLP || '950.0'),
    UPS_FREIGHT_FACTOR: parseFloat(process.env.UPS_FREIGHT_FACTOR || '1.055'), // +5.5% UPS domestic US freight to mailbox
    IMPORT_FACTOR: parseFloat(process.env.IMPORT_FACTOR || '1.66'), // 1.66 legacy landed cost factor
    FACTOR_LOGISTICO_NETO_CLP: parseInt(process.env.FACTOR_LOGISTICO_NETO_CLP || '6192', 10), // $6.192 CLP fixed net logistics per unit (flete + logístico + 6% Ad Valorem sin IVA importación)
    FLETE_USD: parseFloat(process.env.FLETE_USD || '8.0'),
    FLETE_LOCAL_CLP: parseInt(process.env.FLETE_LOCAL_CLP || '2500', 10),
    AD_VALOREM_RATE: 0.06, // 6% customs tariff
    IVA_RATE: 0.19,        // 19% Chilean VAT
    DEFAULT_MARGIN: 0.45,  // 45% default commercial margin
    MIN_PROFIT_CLP: parseInt(process.env.MIN_PROFIT_CLP || '20000', 10), // Piso mínimo de ganancia limpia de $20.000 CLP en productos de bajo costo
  },

  // Scraper engine tuning
  SCRAPER: {
    DEFAULT_MIN_STOCK: 5,
    DEFAULT_MAX_PAGINATION: 60,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1500,
    NAV_TIMEOUT_MS: 30000,
    ACTION_TIMEOUT_MS: 10000,
    DEFAULT_BRANDS: ['Guess'],
    EXCLUDED_SKUS: ['GORDON55-573497849000', 'GORDON55'],
  },
};
