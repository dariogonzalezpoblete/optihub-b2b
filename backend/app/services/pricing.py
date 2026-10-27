from typing import Optional, Dict, Any
import math

def calculate_b2b_pricing(
    price_usd: float,
    dolar: float = 950.0,
    flete_usd: float = 8.0,
    flete_local_clp: int = 2500,
    ad_valorem_rate: float = 0.06,
    iva_rate: float = 0.19,
    margin_percentage: Optional[float] = None,
    custom_multiplier: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calculates OptiHub's B2B Gated Pricing based on wholesale provider USD cost.
    Mirrors the exact rules in backend/scraper/src/services/pricing.ts.
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

    # 1. Landed Cost in Chile
    cif_clp = (price_usd + flete_usd) * dolar
    ad_valorem_clp = cif_clp * ad_valorem_rate
    costo_total_chile = cif_clp + ad_valorem_clp + flete_local_clp
    costo_origen_clp = price_usd * dolar

    # 2. Commercial Pricing Tiers & Margins
    if margin_percentage is not None and margin_percentage > 0:
        precio_venta_neto_raw = costo_total_chile * (1 + margin_percentage / 100.0)
    elif custom_multiplier is not None and custom_multiplier > 0:
        precio_venta_neto_raw = price_usd * custom_multiplier
    elif costo_origen_clp < 20000:
        precio_venta_neto_raw = price_usd * 2500.0
    elif costo_origen_clp <= 70000:
        precio_venta_neto_raw = price_usd * 1900.0
    elif costo_origen_clp <= 120000:
        precio_venta_neto_raw = costo_total_chile + 60000.0
    else:
        precio_venta_neto_raw = costo_total_chile + 100000.0

    # 3. Rounding to nearest 1,000 CLP (Chilean B2B standard)
    precio_neto_clp = int(round(precio_venta_neto_raw / 1000.0) * 1000)
    iva_clp = int(round(precio_neto_clp * iva_rate))
    precio_bruto_clp = int(round((precio_venta_neto_raw * (1.0 + iva_rate)) / 1000.0) * 1000)
    ganancia_clp = int(round((precio_venta_neto_raw - costo_total_chile) / 1000.0) * 1000)

    return {
        "precio_bruto_clp": precio_bruto_clp,
        "precio_neto_clp": precio_neto_clp,
        "iva_clp": iva_clp,
        "ganancia_clp": ganancia_clp,
        "costo_flete_usd": flete_usd,
        "costo_cif_clp": int(round(cif_clp)),
        "ad_valorem_clp": int(round(ad_valorem_clp)),
        "costo_despacho_local_clp": flete_local_clp,
        "costo_total_chile_clp": int(round(costo_total_chile)),
    }
