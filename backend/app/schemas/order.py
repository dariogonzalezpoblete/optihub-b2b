from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict

# Detalle individual de un ítem de la orden
class OrderItemBase(BaseModel):
    product_id: int
    cantidad: int
    precio_unitario_neto: float

class OrderItemCreate(OrderItemBase):
    pass

class OrderItem(OrderItemBase):
    id: int
    order_id: int

    model_config = ConfigDict(from_attributes=True)

# Estructura principal de la Orden
class OrderBase(BaseModel):
    cliente_nombre: str
    cliente_email: str
    cliente_telefono: Optional[str] = None
    total_neto: float
    total_iva: float
    total_bruto: float
    estado: str = "pendiente"

class OrderCreate(OrderBase):
    items: List[OrderItemCreate]

class Order(OrderBase):
    id: int
    fecha_creacion: Optional[datetime] = None
    items: List[OrderItem] = []

    model_config = ConfigDict(from_attributes=True)