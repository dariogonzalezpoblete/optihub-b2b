import { B2BPricingResult } from '../types';
import { CONFIG } from '../config';
import brandRules from '../config/brandPricingRules.json';

export interface PricingOverrides {
  dolar?: number;
  fleteUsd?: number;
  fleteLocalClp?: number;
  adValoremRate?: number;
  ivaRate?: number;
  marginPercentage?: number;
  customMultiplier?: number;
}

/**
 * Returns the configured commercial margin % for a given brand.
 * - Alta gama (Gucci, Tom Ford, Burberry, IC! Berlin, etc.): 70%
 * - Marcas medias (Guess, Adidas, Nike, Calvin Klein, etc.): 40%
 * - Default: 40%
 */
export function getBrandMarginPercentage(brand?: string): number {
  if (!brand) return brandRules.DEFAULT || 40;
  const cleanBrand = brand.trim();
  const lower = cleanBrand.toLowerCase();

  const brandsMap = brandRules.brands as Record<string, number>;

  // 1. Direct match
  if (cleanBrand in brandsMap) {
    return brandsMap[cleanBrand];
  }

  // 2. Case-insensitive / substring match
  for (const [key, margin] of Object.entries(brandsMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower === lower || lower.includes(keyLower) || keyLower.includes(lower)) {
      return margin;
    }
  }

  return brandRules.DEFAULT || 40;
}

/**
 * Calculates OptiHub's B2B Gated Pricing based on wholesale provider USD cost.
 *
 * Implements landed cost in Chile (CIF + 6% Ad Valorem + Local dispatch)
 * and brand-specific commercial markup rules (40% marcas medias, 70% alta gama).
 */
export function calculateB2BPricing(
  priceUsd: number,
  brandOrOverrides?: string | PricingOverrides,
  explicitOverrides?: PricingOverrides
): B2BPricingResult {
  if (!priceUsd || priceUsd <= 0 || isNaN(priceUsd)) {
    return {
      precio_bruto_clp: 0,
      precio_neto_clp: 0,
      iva_clp: 0,
      ganancia_clp: 0,
      costo_flete_usd: 0,
      costo_cif_clp: 0,
      ad_valorem_clp: 0,
      costo_despacho_local_clp: 0,
      costo_total_chile_clp: 0,
    };
  }

  let brand: string | undefined;
  let overrides: PricingOverrides | undefined;

  if (typeof brandOrOverrides === 'string') {
    brand = brandOrOverrides;
    overrides = explicitOverrides;
  } else {
    overrides = brandOrOverrides;
  }

  const dolar = overrides?.dolar ?? CONFIG.FINANCIAL.DOLAR_CLP;
  const fleteUsd = overrides?.fleteUsd ?? CONFIG.FINANCIAL.FLETE_USD;
  const fleteLocal = overrides?.fleteLocalClp ?? CONFIG.FINANCIAL.FLETE_LOCAL_CLP;
  const adValoremRate = overrides?.adValoremRate ?? CONFIG.FINANCIAL.AD_VALOREM_RATE;
  const ivaRate = overrides?.ivaRate ?? CONFIG.FINANCIAL.IVA_RATE;

  // 1. Landed Cost in Chile (CIF + 6% Ad Valorem + Local dispatch)
  const cifClp = (priceUsd + fleteUsd) * dolar;
  const adValoremClp = cifClp * adValoremRate;
  const costoTotalChile = cifClp + adValoremClp + fleteLocal;

  // 2. Commercial Pricing Tiers & Margins
  let precioVentaNetoRaw: number;

  if (typeof overrides?.marginPercentage === 'number' && overrides.marginPercentage > 0) {
    precioVentaNetoRaw = costoTotalChile * (1 + overrides.marginPercentage / 100.0);
  } else if (typeof overrides?.customMultiplier === 'number' && overrides.customMultiplier > 0) {
    precioVentaNetoRaw = priceUsd * overrides.customMultiplier;
  } else {
    // Regla OptiHub de Ganancia Neta por Tramo de Costo Puesto en Chile / USD:
    // • Tramo 1 (Costo Chile <= $45.000): Ganancia de $18.000 CLP (Modelos de entrada / Guess / Converse)
    // • Tramo 2 (Costo Chile de $45.001 a $85.000): Ganancia de $28.000 CLP (Gama media / Adidas / Nike / CK / Emporio Armani)
    // • Tramo 3 (Costo Chile > $85.000 y USD < 200): Ganancia de $50.000 CLP (Gama alta y Lujo / Tom Ford / Burberry / IC! Berlin)
    // • Tramo 4 (USD >= 200): Ganancia de $80.000 CLP (Ultra Lujo / Gucci)
    let gananciaFija: number;
    if (priceUsd >= 200) {
      gananciaFija = 80000;
    } else if (costoTotalChile <= 45000) {
      gananciaFija = 18000;
    } else if (costoTotalChile <= 85000) {
      gananciaFija = 28000;
    } else {
      gananciaFija = 50000;
    }
    precioVentaNetoRaw = costoTotalChile + gananciaFija;
  }

  // 3. Round to nearest 1,000 CLP for market standard B2B pricing
  const precioNetoClp = Math.round(precioVentaNetoRaw / 1000) * 1000;
  const ivaClp = Math.round(precioNetoClp * ivaRate);
  const precioBrutoClp = Math.round((precioNetoClp * (1 + ivaRate)) / 1000) * 1000;
  const gananciaClp = Math.round((precioNetoClp - costoTotalChile) / 1000) * 1000;

  return {
    precio_bruto_clp: precioBrutoClp,
    precio_neto_clp: precioNetoClp,
    iva_clp: ivaClp,
    ganancia_clp: gananciaClp,
    costo_flete_usd: fleteUsd,
    costo_cif_clp: Math.round(cifClp),
    ad_valorem_clp: Math.round(adValoremClp),
    costo_despacho_local_clp: fleteLocal,
    costo_total_chile_clp: Math.round(costoTotalChile),
  };
}
