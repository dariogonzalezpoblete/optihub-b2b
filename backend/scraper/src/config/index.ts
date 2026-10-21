import path from 'path';
import dotenv from 'dotenv';

// Load .env from backend/scraper or root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const CONFIG = {
  // Provider URLs
  PROVIDER: {
    BASE_URL: process.env.PROVIDER_BASE_URL || 'https://www.nywd.com',
    LOGIN_URL: process.env.PROVIDER_LOGIN_URL || 'https://www.nywd.com/login',
    CATALOG_URL: process.env.PROVIDER_CATALOG_URL || 'https://www.nywd.com/wholesale',
    USERNAME: process.env.PROVIDER_USERNAME || process.env.NYWD_USERNAME || '',
    PASSWORD: process.env.PROVIDER_PASSWORD || process.env.NYWD_PASSWORD || '',
  },

  // Session & Storage
  STORAGE: {
    AUTH_STATE_PATH: path.resolve(process.cwd(), process.env.AUTH_STATE_FILE || 'auth_state.json'),
    SESSION_DIR: path.resolve(process.cwd(), 'sesion_navegador'),
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
    FLETE_USD: parseFloat(process.env.FLETE_USD || '8.0'),
    FLETE_LOCAL_CLP: parseInt(process.env.FLETE_LOCAL_CLP || '2500', 10),
    AD_VALOREM_RATE: 0.06, // 6% customs tariff
    IVA_RATE: 0.19,        // 19% Chilean VAT
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
  },
};
