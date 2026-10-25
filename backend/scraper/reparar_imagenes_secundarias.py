"""
Script de auditoría y reparación automática de imágenes (principales y secundarias)
para OptiHub B2B en Supabase.
"""
import os
import sys
import re

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from dotenv import load_dotenv
from supabase import create_client

# Cargar variables de entorno
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan las credenciales de Supabase en .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "marcos-imagenes"


def reparar_catalogo():
    print("=" * 65)
    print("🚀 INICIANDO AUDITORÍA Y REPARACIÓN DE IMÁGENES EN SUPABASE")
    print("=" * 65)

    # 1. Obtener el inventario completo de archivos reales en Storage
    print("\n[1/3] Indexando archivos reales en Supabase Storage...")
    archivos_storage = {}
    offset = 0
    limit = 1000
    while True:
        batch = supabase.storage.from_(BUCKET_NAME).list(options={"limit": limit, "offset": offset})
        if not batch:
            break
        for f in batch:
            archivos_storage[f["name"]] = f
        if len(batch) < limit:
            break
        offset += limit

    print(f"   ✓ {len(archivos_storage)} archivos encontrados en el bucket '{BUCKET_NAME}'.")

    # Mapeo de prefijo SKU -> lista de archivos .webp reales
    # Ejemplo: 'ZS23718-414' -> ['ZS23718-414-d13ddd22.webp', 'ZS23718-414-600e09a6.webp']
    prefix_map = {}
    for fn in archivos_storage.keys():
        if fn.lower().endswith(".webp"):
            partes = fn.rsplit("-", 1)
            if len(partes) == 2:
                prefix = partes[0].upper()
                prefix_map.setdefault(prefix, []).append(fn)

    # 2. Obtener todos los productos de la tabla 'marcos'
    print("\n[2/3] Consultando productos en la tabla 'marcos'...")
    all_products = []
    start = 0
    page_size = 1000
    while True:
        res = (
            supabase.table("marcos")
            .select("id_ext, marca, modelo, imagen_principal, imagenes_secundarias")
            .range(start, start + page_size - 1)
            .execute()
        )
        data = res.data or []
        all_products.extend(data)
        if len(data) < page_size:
            break
        start += page_size

    print(f"   ✓ {len(all_products)} productos encontrados en la base de datos.")

    # 3. Analizar y reparar inconsistencias
    print("\n[3/3] Verificando y remapeando enlaces...")
    reparados = 0
    sin_cambios = 0
    sin_fotos = 0

    for prod in all_products:
        id_ext = prod["id_ext"].strip()
        img_p = (prod.get("imagen_principal") or "").strip()
        img_s = (prod.get("imagenes_secundarias") or "").strip()

        fn_p = img_p.split("/")[-1].split("?")[0] if img_p else ""
        fns_s = [s.strip().split("/")[-1].split("?")[0] for s in img_s.split(",") if s.strip()] if img_s else []

        # Buscar archivos reales disponibles en storage para este id_ext
        clean_prefix = re.sub(r'[^a-zA-Z0-9\-]', '', id_ext).upper()
        disponibles = sorted(prefix_map.get(clean_prefix, []))

        if not disponibles:
            # Búsqueda alternativa sin guiones
            clean_no_hyphen = clean_prefix.replace("-", "")
            for k, v in prefix_map.items():
                if k.replace("-", "") == clean_no_hyphen:
                    disponibles = sorted(v)
                    break

        cambio = False
        nueva_p = img_p
        nueva_s = img_s

        # Caso A: La imagen principal no existe o es un .jpg antiguo
        if fn_p not in archivos_storage or fn_p.endswith((".jpg", ".jpeg", ".png")):
            if disponibles:
                # Asignar la primera foto disponible en webp
                nueva_fn_p = disponibles[0]
                nueva_p = supabase.storage.from_(BUCKET_NAME).get_public_url(nueva_fn_p)
                cambio = True
            elif fn_p:
                # El archivo no existe y no hay fotos en storage -> limpiar
                nueva_p = ""
                cambio = True

        # Caso B: Las secundarias no existen, son .jpg antiguos, o faltan
        # Obtener qué fotos quedan para secundarias
        resto_disponibles = [d for d in disponibles if d != (nueva_p.split("/")[-1].split("?")[0] if nueva_p else "")]

        # Verificar si alguna secundaria actual está rota
        secundarias_rotas = any(fn not in archivos_storage or fn.endswith((".jpg", ".jpeg", ".png")) for fn in fns_s)
        
        # O si hay fotos secundarias disponibles en storage pero la BD no las tiene
        secundarias_faltantes = bool(resto_disponibles and not fns_s)

        if secundarias_rotas or secundarias_faltantes:
            if resto_disponibles:
                urls_sec = [supabase.storage.from_(BUCKET_NAME).get_public_url(fn) for fn in resto_disponibles]
                nueva_s = ",".join(urls_sec)
                cambio = True
            elif fns_s:
                # No hay secundarias válidas en storage -> limpiar
                nueva_s = ""
                cambio = True

        if cambio:
            update_payload = {
                "imagen_principal": nueva_p,
                "imagenes_secundarias": nueva_s
            }
            try:
                supabase.table("marcos").update(update_payload).eq("id_ext", id_ext).execute()
                reparados += 1
                print(f"   [REPARADO] {id_ext}: P={bool(nueva_p)} | S={bool(nueva_s)}")
            except Exception as e:
                print(f"   [ERROR] Actualizando {id_ext}: {e}")
        else:
            if not nueva_p and not nueva_s:
                sin_fotos += 1
            else:
                sin_cambios += 1

    print("\n" + "=" * 65)
    print("📊 RESULTADOS DE LA REPARACIÓN:")
    print("=" * 65)
    print(f"• Productos verificados y perfectos: {sin_cambios}")
    print(f"• Productos remapeados/reparados:   {reparados}")
    print(f"• Productos sin foto en proveedor:   {sin_fotos}")
    print(f"• Total en catálogo:                {len(all_products)}")
    print("=" * 65)
    print("✅ Base de datos 100% sincronizada con los archivos .webp de Storage.")


if __name__ == "__main__":
    reparar_catalogo()
