from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class ProductoBase(BaseModel):
    id_ext: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    color: Optional[str] = None
    codigo_color: Optional[str] = None
    genero: Optional[str] = None
    forma: Optional[str] = None
    material: Optional[str] = None
    tamano: Optional[str] = None
    upc: Optional[str] = None
    origen: Optional[str] = None
    stock: Optional[int] = 0
    precio_usd: Optional[float] = None
    precio_neto_clp: Optional[int] = None
    precio_bruto_clp: Optional[int] = None
    ganancia_clp: Optional[int] = None
    imagen_principal: Optional[str] = None
    imagenes_secundarias: Optional[str] = None
    url_origen: Optional[str] = None
    costo_flete_usd: Optional[float] = None
    costo_cif_clp: Optional[int] = None
    ad_valorem_clp: Optional[int] = None
    costo_total_chile_clp: Optional[int] = None
    costo_despacho_local_clp: Optional[int] = None

class ProductoCreate(ProductoBase):
    pass

class ProductoUpdate(ProductoBase):
    pass

class Producto(ProductoBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True