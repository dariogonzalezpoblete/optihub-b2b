from typing import Optional, Dict, Any
import math


def get_tiered_profit_clp(costo_landed_clp: float) -> float:
    """
    Returns the fixed CLP profit tier for a given Landed Cost in CLP:
    - Costo_Landed < 50,000: +15,000 CLP
    - Costo_Landed >= 50,000 and <= 120,000: +25,000 CLP
    - Costo_Landed > 120,000: +40,000 CLP
    """
    if costo_landed_clp < 50000:
        return 15000.0
    if costo_landed_clp <= 120000:
        return 25000.0
    return 40000.0


def round_to_hundred(value: float) -> int:
    """
    Matches JavaScript's Math.round(value / 100) * 100.
    """
    return int(math.floor(value / 100.0 + 0.5) * 100)


def calculate_b2b_pricing(
    price_usd: float,
    brand: Optional[str] = None,
    dolar: float = 950.0,
    factor_logistico_neto_clp: int = 6192,
    min_profit_clp: int = 20000,
    ad_valorem_rate: float = 0.06,
    iva_rate: float = 0.19,
    margin_percentage: Optional[float] = None,
    custom_multiplier: Optional[float] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """
    Calculates OptiHub's B2B Gated Pricing based on wholesale provider FOB USD cost.

    Estructura de Costos Logísticos Netos (Caja estándar de 1.6 KG / ~10 armazones):
      - Factor Fijo Logístico Neto: $6.192 CLP por armazón (flete + logístico + 6% Ad Valorem sin IVA importación).
      - Costo Total Neto = (FOB convertido a CLP) + 6.192 CLP
      - Piso Mínimo de Ganancia Limpia: $20.000 CLP en productos de bajo costo.
      - precio_neto_clp = Costo Total Neto + MAX(Margen %, $20.000 CLP)
      - Redondeo a la centena más cercana: Math.round(precio / 100) * 100
    """
    if not price_usd or price_usd <= 0 or math.isnan(price_usd):
        return {
            "precio_bruto_clp": 0,
            "precio_neto_clp": 0,
            "iva_clp": 0,
            "ganancia_clp": 0,
            "costo_flete_usd": 0,
            "costo_cif_clp": 0,
            "ad_valorem_clp": 0,
            "costo_despacho_local_clp": 0,
            "costo_total_chile_clp": 0,
        }

    # 1. Costo Total Neto = (FOB convertido a CLP) + 6192
    fob_clp = price_usd * dolar
    costo_total_neto = fob_clp + factor_logistico_neto_clp

    # 2. Margen de ganancia
    if margin_percentage is not None and margin_percentage > 0:
        margin_pct = margin_percentage if margin_percentage > 1 else margin_percentage * 100.0
    else:
        margin_pct = 45.0

    margen_ganancia = margin_pct / 100.0

    # 3. precio_neto_clp = Costo Total Neto + MAX(Margen %, min_profit_clp)
    if custom_multiplier is not None and custom_multiplier > 0:
        precio_venta_neto_raw = price_usd * custom_multiplier
    else:
        ganancia_margen = costo_total_neto * margen_ganancia
        ganancia_limpia = max(ganancia_margen, min_profit_clp)
        precio_venta_neto_raw = costo_total_neto + ganancia_limpia

    # 4. Redondeo a la centena más cercana
    precio_neto_clp = round_to_hundred(precio_venta_neto_raw)
    iva_clp = int(math.floor(precio_neto_clp * iva_rate + 0.5))
    precio_bruto_clp = round_to_hundred(precio_neto_clp * (1.0 + iva_rate))
    ganancia_clp = round_to_hundred(precio_neto_clp - costo_total_neto)
    ad_valorem_clp = int(math.floor(fob_clp * ad_valorem_rate + 0.5))

    return {
        "precio_bruto_clp": precio_bruto_clp,
        "precio_neto_clp": precio_neto_clp,
        "iva_clp": iva_clp,
        "ganancia_clp": ganancia_clp,
        "costo_flete_usd": 0,
        "costo_cif_clp": int(math.floor(fob_clp + 0.5)),
        "ad_valorem_clp": ad_valorem_clp,
        "costo_despacho_local_clp": factor_logistico_neto_clp,
        "costo_total_chile_clp": int(math.floor(costo_total_neto + 0.5)),
    }
