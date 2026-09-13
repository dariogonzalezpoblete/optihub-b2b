import os
from fastapi import APIRouter, HTTPException
from app.database import supabase

router = APIRouter()

# Si necesitas usar la URL o la key directamente aquí por alguna razón específica:
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yrdjnkbrvynmnzyrxlfx.supabase.co")

@router.get("/")
def get_products():
    try:
        response = supabase.table("products").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))