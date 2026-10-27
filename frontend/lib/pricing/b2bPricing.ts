export interface PricingOverrides {
  dolar?: number;
  fleteUsd?: number;
  fleteLocalClp?: number;
  adValoremRate?: number;
  ivaRate?: number;
  marginPercentage?: number;
  customMultiplier?: number;
}

export interface B2BPricingResult {
  precio_bruto_clp: number;
  precio_neto_clp: number;
  iva_clp: number;
  ganancia_clp: number;
  costo_flete_usd: number;
  costo_cif_clp: number;
  ad_valorem_clp: number;
  costo_despacho_local_clp: number;
  costo_total_chile_clp: number;
}

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

  const dolar = overrides?.dolar ?? 950.0;
  const fleteUsd = overrides?.fleteUsd ?? 8.0;
  const fleteLocal = overrides?.fleteLocalClp ?? 2500;
  const adValoremRate = overrides?.adValoremRate ?? 0.06;
  const ivaRate = overrides?.ivaRate ?? 0.19;

  // 1. Landed Cost in Chile
  const cifClp = (priceUsd + fleteUsd) * dolar;
  const adValoremClp = cifClp * adValoremRate;
  const costoTotalChile = cifClp + adValoremClp + fleteLocal;
  const costoOrigenClp = priceUsd * dolar;

  // 2. Commercial Pricing Tiers
  let precioVentaNetoRaw: number;
  if (typeof overrides?.marginPercentage === 'number' && overrides.marginPercentage > 0) {
    precioVentaNetoRaw = costoTotalChile * (1 + overrides.marginPercentage / 100.0);
  } else if (typeof overrides?.customMultiplier === 'number' && overrides.customMultiplier > 0) {
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

  // 3. Chilean Market B2B Rounding (to nearest 1,000 CLP)
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
