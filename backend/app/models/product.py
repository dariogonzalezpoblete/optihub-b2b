from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    
    # Datos de origen y catálogo NYWD
    nywd_url = Column(String, nullable=True)
    brand = Column(String, index=True)               # ej: Salvatore Ferragamo
    model = Column(String, index=True)               # ej: SF2986
    color_code = Column(String)                      # ej: 616
    upc = Column(String, unique=True, index=True)     # ej: 886895630023
    
    # Atributos técnicos del armazón
    gender = Column(String)                          # ej: Women
    shape = Column(String)                           # ej: Rectangular
    frame_material = Column(String)                  # ej: Injected Propionate
    made_in = Column(String)                         # ej: Italy
    size = Column(String)                            # ej: 53X16X145
    
    # Precios e Inventario
    price_usd_fob = Column(Float, nullable=False)    # ej: 58.00 (Costo Miami)
    quantity = Column(Integer, default=0)            # ej: 9 (Stock en NYWD)
    
    # Multimedia
    image_url = Column(String, nullable=True)        # URL imagen del producto
    
    # Trazabilidad
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)