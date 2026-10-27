import os
import json
import subprocess
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, status

from app.database import supabase
from app.services.pricing import calculate_b2b_pricing
from app.schemas.sync import (
    SyncRequest,
    BulkUpdateRequest,
    FastSyncSummarySchema
)

router = APIRouter(prefix="/sync", tags=["Sync"])

BASE_SCRAPER_DIR = Path(__file__).resolve().parent.parent.parent / "scraper"
REPORT_PATH = BASE_SCRAPER_DIR / "sync_report_latest.json"

# In-memory tracking of background sync state
sync_state: Dict[str, Any] = {
    "is_running": False,
    "current_brand": None,
    "last_started_at": None,
    "last_finished_at": None,
    "last_error": None,
    "last_summary": None,
}

def _run_fast_sync_process(
    brand: Optional[str],
    all_brands: bool,
    headless: bool,
    dry_run: bool,
    max_pages: Optional[int],
    dolar: Optional[float],
    margin_percentage: Optional[float]
) -> Dict[str, Any]:
    global sync_state

    cmd = ["npx", "tsx", "src/fastSync.ts"]
    if all_brands:
        cmd.append("--all-brands")
    elif brand:
        cmd.extend(["--brand", brand])
    
    if headless:
        cmd.append("--headless")
    if dry_run:
        cmd.append("--dry-run")
    if max_pages:
        cmd.extend(["--pages", str(max_pages)])
    if dolar:
        cmd.extend(["--dolar", str(dolar)])
    if margin_percentage:
        cmd.extend(["--margin", str(margin_percentage)])

    sync_state["is_running"] = True
    sync_state["last_error"] = None
    sync_state["current_brand"] = "ALL" if all_brands else (brand or "Default")
    
    try:
        # Run process in backend/scraper directory
        result = subprocess.run(
            cmd,
            cwd=str(BASE_SCRAPER_DIR),
            capture_output=True,
            text=True,
            shell=True,
            timeout=600  # 10 minutes timeout
        )

        if result.returncode != 0:
            err_msg = result.stderr or result.stdout or "Error desconocido en el proceso de scraping"
            sync_state["last_error"] = err_msg
            raise RuntimeError(f"Fallo en fastSync: {err_msg}")

        # Read JSON report if exists
        if REPORT_PATH.exists():
            with open(REPORT_PATH, "r", encoding="utf-8") as f:
                summary = json.load(f)
                sync_state["last_summary"] = summary
                return summary

        return {
            "status": "success",
            "message": "Sincronización ejecutada correctamente",
            "stdout": result.stdout
        }
    except Exception as e:
        sync_state["last_error"] = str(e)
        raise e
    finally:
        sync_state["is_running"] = False
        sync_state["current_brand"] = None

def _run_full_catalog_process(
    brand: Optional[str],
    all_brands: bool,
    headless: bool,
    dry_run: bool,
    max_pages: Optional[int]
) -> Dict[str, Any]:
    global sync_state

    cmd = ["npx", "tsx", "src/index.ts"]
    if all_brands:
        cmd.append("--all-brands")
    elif brand:
        cmd.extend(["--brand", brand])
    
    if headless:
        cmd.append("--headless")
    if dry_run:
        cmd.append("--dry-run")
    if max_pages:
        cmd.extend(["--pages", str(max_pages)])

    sync_state["is_running"] = True
    sync_state["last_error"] = None
    sync_state["current_brand"] = "ALL" if all_brands else (brand or "Default")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=str(BASE_SCRAPER_DIR),
            capture_output=True,
            text=True,
            shell=True,
            timeout=1800  # 30 minutes timeout for full catalog
        )

        if result.returncode != 0:
            err_msg = result.stderr or result.stdout or "Error en el scraper de catálogo completo"
            sync_state["last_error"] = err_msg
            raise RuntimeError(f"Fallo en full scraper: {err_msg}")

        return {
            "status": "success",
            "message": "Extracción completa de catálogo finalizada con éxito.",
            "stdout": result.stdout
        }
    except Exception as e:
        sync_state["last_error"] = str(e)
        raise e
    finally:
        sync_state["is_running"] = False
        sync_state["current_brand"] = None

@router.post("/full-catalog", status_code=status.HTTP_200_OK)
def trigger_full_catalog(request: SyncRequest, background_tasks: BackgroundTasks):
    """
    Ejecuta el scraper de catálogo completo (imágenes WebP, descripciones y especificaciones).
    """
    global sync_state
    if sync_state["is_running"]:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un proceso de extracción o sincronización en curso."
        )

    # Por defecto, la extracción completa corre en segundo plano debido a su duración
    def bg_runner():
        try:
            _run_full_catalog_process(
                brand=request.brand,
                all_brands=request.all_brands,
                headless=request.headless,
                dry_run=request.dry_run,
                max_pages=request.max_pages
            )
        except Exception as e:
            print(f"Error en extracción completa background: {e}")

    background_tasks.add_task(bg_runner)
    return {
        "status": "started",
        "message": "Extracción completa de catálogo iniciada en segundo plano.",
        "brand": request.brand or ("TODAS" if request.all_brands else "Default")
    }

@router.post("/stock-prices", status_code=status.HTTP_200_OK)
def trigger_fast_sync(request: SyncRequest, background_tasks: BackgroundTasks):
    """
    Ejecuta el módulo de actualización rápida de stock y precios.
    Extrae costo y stock de los proveedores, aplica reglas B2B y actualiza Supabase.
    """
    global sync_state
    if sync_state["is_running"]:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una sincronización de inventario en curso."
        )

    if request.background:
        def bg_runner():
            try:
                _run_fast_sync_process(
                    brand=request.brand,
                    all_brands=request.all_brands,
                    headless=request.headless,
                    dry_run=request.dry_run,
                    max_pages=request.max_pages,
                    dolar=request.dolar,
                    margin_percentage=request.margin_percentage
                )
            except Exception as e:
                print(f"Error en sincronización background: {e}")

        background_tasks.add_task(bg_runner)
        return {
            "status": "started",
            "message": "Sincronización de stock y precios iniciada en segundo plano.",
            "mode": "background"
        }

    try:
        summary = _run_fast_sync_process(
            brand=request.brand,
            all_brands=request.all_brands,
            headless=request.headless,
            dry_run=request.dry_run,
            max_pages=request.max_pages,
            dolar=request.dolar,
            margin_percentage=request.margin_percentage
        )
        return {
            "status": "completed",
            "message": "Sincronización de stock y precios finalizada con éxito.",
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
def get_sync_status():
    """
    Consulta el estado del proceso de sincronización y el resumen de la última ejecución.
    """
    return {
        "is_running": sync_state["is_running"],
        "current_brand": sync_state["current_brand"],
        "last_error": sync_state["last_error"],
        "has_last_summary": sync_state["last_summary"] is not None or REPORT_PATH.exists(),
        "latest_summary": sync_state.get("last_summary") or (_read_latest_report())
    }

def _read_latest_report() -> Optional[Dict[str, Any]]:
    if REPORT_PATH.exists():
        try:
            with open(REPORT_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

@router.get("/report/latest")
def get_latest_report():
    """
    Obtiene el último reporte detallado en formato JSON.
    """
    report = _read_latest_report()
    if not report:
        raise HTTPException(status_code=404, detail="No hay reportes de sincronización disponibles.")
    return report

@router.post("/bulk-update")
def bulk_update_products(req: BulkUpdateRequest):
    """
    Actualización masiva directa de stock y precios sin pasar por el navegador.
    Aplica automáticamente márgenes comerciales B2B y actualiza Supabase solo en stock y precios.
    """
    if not req.items:
        raise HTTPException(status_code=400, detail="La lista de items no puede estar vacía.")

    updated_count = 0
    results: List[Dict[str, Any]] = []

    for item in req.items:
        update_data: Dict[str, Any] = {
            "stock": max(0, min(50, item.stock))
        }

        # Si se especifica precio USD, recalculamos el precio neto B2B y landed costs
        if item.precio_usd is not None and item.precio_usd > 0:
            pricing = calculate_b2b_pricing(
                price_usd=item.precio_usd,
                dolar=req.dolar or 950.0,
                margin_percentage=req.margin_percentage
            )
            update_data.update({
                "precio_usd": item.precio_usd,
                "precio_neto_clp": pricing["precio_neto_clp"],
                "precio_bruto_clp": pricing["precio_bruto_clp"],
                "ganancia_clp": pricing["ganancia_clp"],
                "costo_flete_usd": pricing["costo_flete_usd"],
                "costo_cif_clp": pricing["costo_cif_clp"],
                "ad_valorem_clp": pricing["ad_valorem_clp"],
                "costo_despacho_local_clp": pricing["costo_despacho_local_clp"],
                "costo_total_chile_clp": pricing["costo_total_chile_clp"],
            })
        elif item.precio_neto_clp is not None and item.precio_neto_clp > 0:
            # Si solo se especifica precio neto en CLP directamente
            iva_clp = int(round(item.precio_neto_clp * 0.19))
            update_data.update({
                "precio_neto_clp": item.precio_neto_clp,
                "precio_bruto_clp": item.precio_neto_clp + iva_clp,
            })

        try:
            res = supabase.table("marcos").update(update_data).eq("id_ext", item.id_ext).execute()
            if res.data and len(res.data) > 0:
                updated_count += 1
                results.append({
                    "id_ext": item.id_ext,
                    "status": "updated",
                    "stock": update_data["stock"],
                    "precio_neto_clp": update_data.get("precio_neto_clp")
                })
            else:
                results.append({
                    "id_ext": item.id_ext,
                    "status": "not_found"
                })
        except Exception as e:
            results.append({
                "id_ext": item.id_ext,
                "status": "error",
                "detail": str(e)
            })

    return {
        "status": "success",
        "total_solicitados": len(req.items),
        "total_actualizados": updated_count,
        "detalles": results
    }
