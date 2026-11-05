import { B2BPricingResult } from '../types';
import { CONFIG } from '../config';
import brandRules from '../config/brandPricingRules.json';

export interface PricingOverrides {
  dolar?: number;
  upsFreightFactor?: number;
  importFactor?: number;
  factorLogisticoNetoClp?: number;
  fleteUsd?: number;
  fleteLocalClp?: number;
  adValoremRate?: number;
  ivaRate?: number;
  marginPercentage?: number;
  minProfitClp?: number;
  customMultiplier?: number;
  mercadoPagoRate?: number;
}

/**
 * Returns the configured commercial margin % for a given brand.
 * - Alta gama (Gucci, Tom Ford, Burberry, Cartier, Prada, etc.): 50%
 * - Marcas medias (Guess, Adidas, Nike, Calvin Klein, Spy, etc.): 45%
 * - Default: 45%
 */
export function getBrandMarginPercentage(brand?: string): number {
  if (!brand) return brandRules.DEFAULT ?? 45;
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

  return brandRules.DEFAULT ?? 45;
}

/**
 * Deprecated profit tiers retained for compatibility.
 */
export function getTieredProfitClp(costoLandedClp: number): number {
  if (costoLandedClp < 50000) {
    return 15000;
  }
  if (costoLandedClp <= 120000) {
    return 25000;
  }
  return 40000;
}

/**
 * Calculates OptiHub's B2B Gated Pricing based on wholesale provider FOB USD cost.
 *
 * Estructura de Costos Logísticos Netos (Caja estándar de 1.6 KG / ~10 armazones):
 *   - Imputación neta unitaria: flete + servicio logístico 2ebox + 6% Ad Valorem.
 *   - Excluye 100% el 19% de IVA de importación (crédito fiscal, no costo).
 *   - Factor Fijo Logístico Neto: $6.192 CLP por armazón.
 *
 * Fórmula de cálculo y guardado:
 *   1. Costo Total Neto = (FOB convertido a CLP) + 6.192 CLP
 *   2. precio_neto_clp  = Costo Total Neto * (1 + margen_ganancia)
 *   3. Redondeo B2B a la centena más cercana: Math.round(precio / 100) * 100
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
  } else if (brandOrOverrides && typeof brandOrOverrides === 'object') {
    overrides = brandOrOverrides;
  } else {
    overrides = explicitOverrides;
  }

  const dolar = overrides?.dolar ?? CONFIG.FINANCIAL.DOLAR_CLP;
  const factorLogistico =
    overrides?.factorLogisticoNetoClp ?? CONFIG.FINANCIAL.FACTOR_LOGISTICO_NETO_CLP ?? 6192;
  const minProfitClp = overrides?.minProfitClp ?? CONFIG.FINANCIAL.MIN_PROFIT_CLP ?? 20000;
  const ivaRate = overrides?.ivaRate ?? CONFIG.FINANCIAL.IVA_RATE;
  const adValoremRate = overrides?.adValoremRate ?? CONFIG.FINANCIAL.AD_VALOREM_RATE;
  const mercadoPagoRate = overrides?.mercadoPagoRate ?? 0.0319; // 3.19% + IVA

  // 1. Costo Total Neto = (FOB convertido a CLP) + 6192 (flete + logística + aduana)
  const fobClp = priceUsd * dolar;
  const costoTotalNeto = fobClp + factorLogistico;

  // 2. Margen comercial de ganancia
  let marginPct: number;
  if (typeof overrides?.marginPercentage === 'number' && overrides.marginPercentage > 0) {
    marginPct = overrides.marginPercentage > 1 ? overrides.marginPercentage : overrides.marginPercentage * 100;
  } else {
    marginPct = getBrandMarginPercentage(brand);
  }

  const margenGanancia = marginPct / 100.0;
  const gananciaMargen = costoTotalNeto * margenGanancia;
  const gananciaLimpia = Math.max(gananciaMargen, minProfitClp);

  // 3. Provisión de pasarela de pago (Mercado Pago 3.19% + IVA = 3.7961%)
  // Garantiza que la ganancia neta no sufra deducciones bancarias
  const mpEffectiveRate = mercadoPagoRate * (1 + ivaRate);
  let precioVentaNetoRaw: number;

  if (typeof overrides?.customMultiplier === 'number' && overrides.customMultiplier > 0) {
    precioVentaNetoRaw = priceUsd * overrides.customMultiplier;
  } else {
    const subtotalNeto = costoTotalNeto + gananciaLimpia;
    precioVentaNetoRaw = subtotalNeto / (1 - mpEffectiveRate);
  }

  // 4. Redondeo comercial a la centena más cercana
  const precioNetoClp = Math.round(precioVentaNetoRaw / 100) * 100;
  const ivaClp = Math.round(precioNetoClp * ivaRate);
  const precioBrutoClp = Math.round((precioNetoClp * (1 + ivaRate)) / 100) * 100;
  const costoComisionMpClp = Math.round(precioBrutoClp * mpEffectiveRate);
  const gananciaClp = Math.round((precioNetoClp - costoTotalNeto) / 100) * 100;
  const adValoremClp = Math.round(fobClp * adValoremRate);

  return {
    precio_bruto_clp: precioBrutoClp,
    precio_neto_clp: precioNetoClp,
    iva_clp: ivaClp,
    ganancia_clp: gananciaClp,
    costo_comision_mp_clp: costoComisionMpClp,
    costo_flete_usd: 0,
    costo_cif_clp: Math.round(fobClp),
    ad_valorem_clp: adValoremClp,
    costo_despacho_local_clp: factorLogistico,
    costo_total_chile_clp: Math.round(costoTotalNeto),
  };
}
