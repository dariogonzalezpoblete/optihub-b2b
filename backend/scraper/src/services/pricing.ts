import { B2BPricingResult } from '../types';
import { CONFIG } from '../config';

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
 * Calculates OptiHub's B2B Gated Pricing based on wholesale provider USD cost.
 *
 * Implements landed cost in Chile (CIF + 6% Ad Valorem + Local dispatch)
 * and tiered commercial markup brackets for optical retail partners.
 */
export function calculateB2BPricing(priceUsd: number, overrides?: PricingOverrides): B2BPricingResult {
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

  const dolar = overrides?.dolar ?? CONFIG.FINANCIAL.DOLAR_CLP;
  const fleteUsd = overrides?.fleteUsd ?? CONFIG.FINANCIAL.FLETE_USD;
  const fleteLocal = overrides?.fleteLocalClp ?? CONFIG.FINANCIAL.FLETE_LOCAL_CLP;
  const adValoremRate = overrides?.adValoremRate ?? CONFIG.FINANCIAL.AD_VALOREM_RATE;
  const ivaRate = overrides?.ivaRate ?? CONFIG.FINANCIAL.IVA_RATE;

  // 1. Landed Cost (Chile)
  const cifClp = (priceUsd + fleteUsd) * dolar;
  const adValoremClp = cifClp * adValoremRate;
  const costoTotalChile = cifClp + adValoremClp + fleteLocal;
  const costoOrigenClp = priceUsd * dolar;

  // 2. Commercial Pricing Tiers & Margins
  let precioVentaNetoRaw: number;
  if (typeof overrides?.marginPercentage === 'number' && overrides.marginPercentage > 0) {
    // Custom percentage markup over landed cost (e.g. 35% margin)
    precioVentaNetoRaw = costoTotalChile * (1 + overrides.marginPercentage / 100);
  } else if (typeof overrides?.customMultiplier === 'number' && overrides.customMultiplier > 0) {
    // Custom flat USD multiplier (e.g. 2000 CLP per USD)
    precioVentaNetoRaw = priceUsd * overrides.customMultiplier;
  } else if (costoOrigenClp < 20000) {
    precioVentaNetoRaw = priceUsd * 2500.0;
  } else if (costoOrigenClp <= 70000) {
    precioVentaNetoRaw = priceUsd * 1900.0;
  } else if (costoOrigenClp <= 120000) {
    precioVentaNetoRaw = costoTotalChile + 60000.0;
  } else {
    precioVentaNetoRaw = costoTotalChile + 100000.0;
  }

  // 3. Round to nearest 1,000 CLP for market standard B2B pricing
  const precioNetoClp = Math.round(precioVentaNetoRaw / 1000) * 1000;
  const ivaClp = Math.round(precioNetoClp * ivaRate);
  const precioBrutoClp = Math.round((precioVentaNetoRaw * (1 + ivaRate)) / 1000) * 1000;
  const gananciaClp = Math.round((precioVentaNetoRaw - costoTotalChile) / 1000) * 1000;

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
