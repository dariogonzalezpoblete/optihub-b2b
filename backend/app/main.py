from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import product, order

app = FastAPI(title="OptiHub B2B API", version="1.0")

# Configuración de CORS para permitir la comunicación con el frontend (Next.js)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro de routers con el prefijo /api obligatorio
app.include_router(product.router, prefix="/api", tags=["Products"])
app.include_router(order.router, prefix="/api", tags=["Orders"])

@app.get("/")
def root():
    return {"message": "OptiHub B2B Backend funcionando correctamente"}