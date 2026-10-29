/**
 * OPTIHUB B2B - Telemetría y Analítica Comercial
 * Compatible con Google Analytics 4 (gtag / dataLayer) y Microsoft Clarity.
 * 
 * Reglas de Privacidad y Seguridad:
 * - Tolerante a bloqueadores de anuncios (AdBlock, uBlock, Brave Shields).
 * - Sanitización estricta: NUNCA envía RUT, contraseñas, correos ni teléfonos.
 */

// Tipado estricto del embudo de conversión B2B
export type B2BEventMap = {
  view_catalog: {
    brand?: string;
    category?: string;
    search_term?: string;
    filter_count?: number;
  };
  view_product_sheet: {
    brand: string;
    model: string;
    sku: string;
    price_neto?: number;
  };
  moq_progress_update: {
    total_units: number;
    moq_reached: boolean;
    units_missing?: number;
  };
  start_b2b_registration: {
    step?: string;
    entry_point?: string;
  };
  rut_validation_result: {
    is_valid: boolean;
  };
  complete_b2b_registration: {
    region?: string;
    comuna?: string;
    giro_type?: string;
  };
  click_whatsapp_b2b: {
    source: 'footer' | 'product_sheet' | 'registration' | 'cart' | 'faq' | 'home' | 'catalog' | (string & {});
    brand?: string;
    model?: string;
    sku?: string;
  };
  download_b2b_quote: {
    quote_number?: string;
    total_units: number;
    total_neto?: number;
    item_count?: number;
  };
};

export type B2BEventName = keyof B2BEventMap;

// Declaración global segura para GA4 y Clarity
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: Array<Record<string, any>>;
    clarity?: (...args: any[]) => void;
  }
}

// Lista negra de claves que NUNCA deben enviarse a plataformas de terceros
const SENSITIVE_KEY_REGEX = /^(rut|rut_empresa|password|pass|clave|email|correo|phone|telefono|celular|token|secret|auth)/i;

// Regex para detectar valores tipo RUT chileno (ej: 12.345.678-9 o 12345678-9) o emails
const RUT_VALUE_REGEX = /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/i;
const EMAIL_VALUE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sanitiza recursivamente el objeto para garantizar que ningún dato personal o tributario sensible
 * (RUT, contraseña, email, teléfono) escape a GA4 o Clarity.
 */
function sanitizeEventParams(params: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};

  for (const [key, val] of Object.entries(params)) {
    // 1. Filtrar claves prohibidas
    if (SENSITIVE_KEY_REGEX.test(key)) {
      continue;
    }

    // 2. Filtrar valores que contengan patrones de RUT o Email
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (RUT_VALUE_REGEX.test(trimmed) || EMAIL_VALUE_REGEX.test(trimmed)) {
        continue;
      }
      cleaned[key] = trimmed;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      cleaned[key] = val;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      cleaned[key] = sanitizeEventParams(val);
    }
  }

  return cleaned;
}

/**
 * Registra un evento del embudo comercial B2B de forma segura.
 * Es tolerante a bloqueadores de publicidad y fallos de script.
 */
export function trackB2BEvent<E extends B2BEventName>(
  eventName: E,
  params: B2BEventMap[E]
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const sanitized = sanitizeEventParams(params);

    // 1. Google Analytics 4 (vía window.gtag)
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, sanitized);
    }

    // 2. Fallback Google Tag Manager (vía dataLayer)
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: eventName,
        ...sanitized,
        b2b_platform: 'OPTIHUB_CHILE',
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Microsoft Clarity (vía window.clarity)
    if (typeof window.clarity === 'function') {
      window.clarity('event', eventName);
      // Asignar etiquetas dimensionales si están presentes
      if ('brand' in sanitized && typeof sanitized.brand === 'string') {
        window.clarity('set', 'catalog_brand', sanitized.brand);
      }
      if ('moq_reached' in sanitized) {
        window.clarity('set', 'moq_reached', String(sanitized.moq_reached));
      }
      if ('source' in sanitized && typeof sanitized.source === 'string') {
        window.clarity('set', 'whatsapp_source', sanitized.source);
      }
    }

    // Log opcional en entorno de desarrollo para auditoría
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`📊 [B2B Analytics] ${eventName}:`, sanitized);
    }
  } catch (err) {
    // Tolerancia absoluta a AdBlockers o restricciones de CSP
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('⚠️ [B2B Analytics] Event tracking silenced due to blocker or environment:', err);
    }
  }
}
