from fastapi import APIRouter, HTTPException
from supabase import create_client, Client

router = APIRouter()

# Configuración del cliente de Supabase
SUPABASE_URL = "https://yrdjnkbrvynmnzyrxlfx.supabase.co"
SUPABASE_KEY = "SUPABASE_SECRET_KEY_PLACEHOLDER"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@router.get("/marcos")
def get_marcos():
    try:
        # Consulta a la tabla marcos en Supabase
        response = supabase.table("marcos").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))