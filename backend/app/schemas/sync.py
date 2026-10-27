from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class SyncRequest(BaseModel):
    brand: Optional[str] = Field(None, description="Marca o marcas separadas por coma a sincronizar (ej: Guess, Nike)")
    all_brands: bool = Field(False, description="Sincronizar todas las marcas registradas en catálogo")
    headless: bool = Field(True, description="Ejecutar navegador en modo invisible")
    dry_run: bool = Field(False, description="Simulación sin modificar la base de datos")
    max_pages: Optional[int] = Field(None, description="Límite de páginas de catálogo a recorrer")
    dolar: Optional[float] = Field(None, description="Valor del dólar para cálculo de landed cost")
    margin_percentage: Optional[float] = Field(None, description="Margen porcentual comercial sobre landed cost")
    background: bool = Field(False, description="Ejecutar en segundo plano como tarea asíncrona")

class BulkUpdateItem(BaseModel):
    id_ext: str
    stock: int
    precio_usd: Optional[float] = None
    precio_neto_clp: Optional[int] = None

class BulkUpdateRequest(BaseModel):
    items: List[BulkUpdateItem]
    dolar: Optional[float] = 950.0
    margin_percentage: Optional[float] = None

class SyncReportItemSchema(BaseModel):
    id_ext: str
    status: str
    oldStock: Optional[int] = None
    newStock: Optional[int] = None
    oldPriceNeto: Optional[float] = None
    newPriceNeto: Optional[float] = None
    oldPriceUsd: Optional[float] = None
    newPriceUsd: Optional[float] = None
    changeReason: Optional[str] = None

class BrandSyncReportSchema(BaseModel):
    brand: str
    totalScanned: int
    updated: int
    outOfStock: int
    unchanged: int
    items: List[SyncReportItemSchema] = []

class FastSyncSummarySchema(BaseModel):
    timestamp: str
    durationSeconds: float
    brandsProcessed: List[str]
    totalScanned: int
    totalUpdated: int
    totalOutOfStock: int
    totalUnchanged: int
    brandReports: List[BrandSyncReportSchema] = []
