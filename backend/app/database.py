import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from various candidate paths
base_dir = Path(__file__).resolve().parent.parent
candidate_envs = [
    base_dir / ".env",
    base_dir / "scraper" / ".env",
    base_dir.parent / ".env",
    base_dir.parent / "frontend" / ".env.local"
]
for env_path in candidate_envs:
    if env_path.exists():
        load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://yrdjnkbrvynmnzyrxlfx.supabase.co")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or "tu_clave_aqui"
)

# Validación y creación del cliente
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan las credenciales de Supabase en las variables de entorno.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
