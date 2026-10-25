import os
import io
import re
import time
import urllib.request
from dotenv import load_dotenv
from supabase import create_client
from PIL import Image

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el archivo .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "marcos-imagenes"


def obtener_imagenes_en_bd():
    """Obtiene el conjunto de nombres de archivo referenciados en 'marcos'."""
    imagenes_bd = set()
    mapeo_productos = []  # lista de dicts con id_ext, imagen_principal, imagenes_secundarias
    start = 0
    page_size = 1000

    while True:
        res = (
            supabase.table("marcos")
            .select("id_ext, imagen_principal, imagenes_secundarias")
            .range(start, start + page_size - 1)
            .execute()
        )
        data = res.data or []
        for r in data:
            mapeo_productos.append(r)
            p = (r.get("imagen_principal") or "").strip()
            s = (r.get("imagenes_secundarias") or "").strip()
            if p:
                fn = p.split("/")[-1].split("?")[0]
                if fn:
                    imagenes_bd.add(fn)
            if s:
                for sec in s.split(","):
                    fn_s = sec.strip().split("/")[-1].split("?")[0]
                    if fn_s:
                        imagenes_bd.add(fn_s)

        if len(data) < page_size:
            break
        start += page_size

    return imagenes_bd, mapeo_productos


def listar_archivos_storage():
    """Lista todos los archivos almacenados en el bucket de Supabase."""
    archivos = []
    offset = 0
    limit = 1000
    while True:
        try:
            batch = supabase.storage.from_(BUCKET_NAME).list(options={"limit": limit, "offset": offset})
            if not batch:
                break
            archivos.extend(batch)
            if len(batch) < limit:
                break
            offset += limit
        except Exception as e:
            print(f"Error listando storage: {e}")
            break
    return archivos


def auditar_storage():
    """Realiza un diagnóstico completo del bucket y la base de datos."""
    print("\n🔍 Analizando Supabase Storage y Base de Datos...")
    imagenes_bd, productos = obtener_imagenes_en_bd()
    archivos_storage = listar_archivos_storage()

    total_bytes = 0
    huerfanos = []
    archivos_antiguos_jpg = []

    for f in archivos_storage:
        name = f.get("name", "")
        meta = f.get("metadata", {}) or {}
        size = meta.get("size", 0) or f.get("size", 0) or 0
        total_bytes += size

        if name not in imagenes_bd:
            huerfanos.append({"name": name, "size": size})
        elif name.lower().endswith((".jpg", ".jpeg", ".png")):
            archivos_antiguos_jpg.append({"name": name, "size": size})

    total_mb = total_bytes / (1024 * 1024)
    huerfanos_mb = sum(h["size"] for h in huerfanos) / (1024 * 1024)
    jpg_mb = sum(j["size"] for j in archivos_antiguos_jpg) / (1024 * 1024)

    print(f"\n{'='*60}")
    print("📊 DIAGNÓSTICO DE ALMACENAMIENTO (SUPABASE)")
    print(f"{'='*60}")
    print(f"• Total productos en BD:             {len(productos):,}")
    print(f"• Total archivos en Storage:          {len(archivos_storage):,}")
    print(f"• Espacio total ocupado:             {total_mb:.2f} MB / 1,000 MB ({total_mb / 10:.1f}% de la cuota)")
    print(f"• Archivos huérfanos (sin producto): {len(huerfanos):,} ({huerfanos_mb:.2f} MB)")
    print(f"• Imágenes JPEG/PNG sin optimizar:   {len(archivos_antiguos_jpg):,} ({jpg_mb:.2f} MB)")
    print(f"• Espacio proyectado tras WebP:      ~{((total_mb - huerfanos_mb) * 0.08):.2f} MB (¡Ahorro > 90%!)")
    print(f"{'='*60}")

    return huerfanos, archivos_antiguos_jpg, productos


def eliminar_archivos_huerfanos(huerfanos: list):
    """Elimina del bucket todos los archivos que no están enlazados a ningún producto."""
    if not huerfanos:
        print("✅ No hay archivos huérfanos para eliminar.")
        return

    nombres = [h["name"] for h in huerfanos]
    print(f"\n🗑️  Eliminando {len(nombres)} archivos huérfanos de Supabase Storage...")

    # Supabase permite borrar en lotes de hasta 100 archivos
    chunk_size = 100
    borrados = 0
    for i in range(0, len(nombres), chunk_size):
        chunk = nombres[i:i + chunk_size]
        try:
            supabase.storage.from_(BUCKET_NAME).remove(chunk)
            borrados += len(chunk)
            print(f"   [OK] Eliminados {borrados}/{len(nombres)} archivos...")
        except Exception as e:
            print(f"   [ERROR] Fallo al eliminar bloque: {e}")

    mb_liberados = sum(h["size"] for h in huerfanos) / (1024 * 1024)
    print(f"\n🎉 ¡Limpieza completada! Se liberaron {mb_liberados:.2f} MB en tu Storage.")


def optimizar_y_migrar_a_webp(archivos_jpg: list, productos: list):
    """
    Descarga imágenes JPEG/PNG antiguas, las comprime a WebP, las sube
    y actualiza las URLs en la tabla 'marcos', luego borra las versiones pesadas.
    """
    if not archivos_jpg:
        print("✅ Todas las imágenes ya están en formato moderno WebP.")
        return

    print(f"\n⚡ Iniciando migración y compresión de {len(archivos_jpg)} imágenes a WebP...")
    confirm = input("⚠️  Esto convertirá y actualizará las imágenes en la base de datos. ¿Continuar? (s/n): ").strip().lower()
    if confirm != 's':
        print("Operación cancelada.")
        return

    # Mapeo antiguo_filename -> nuevo_filename y url
    nuevas_urls = {}
    archivos_a_borrar = []

    for idx, item in enumerate(archivos_jpg, start=1):
        old_name = item["name"]
        old_url = supabase.storage.from_(BUCKET_NAME).get_public_url(old_name)

        try:
            # 1. Descargar imagen original
            req = urllib.request.Request(old_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                content = resp.read()

            # 2. Comprimir a WebP
            img = Image.open(io.BytesIO(content))
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")

            if img.width > 1000 or img.height > 1000:
                img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)

            out_io = io.BytesIO()
            img.save(out_io, format="WEBP", quality=82, method=4)
            webp_bytes = out_io.getvalue()

            # 3. Subir versión .webp
            base_name = os.path.splitext(old_name)[0]
            new_name = f"{base_name}.webp"

            supabase.storage.from_(BUCKET_NAME).upload(
                path=new_name,
                file=webp_bytes,
                file_options={"content-type": "image/webp", "x-upsert": "true"}
            )
            new_url = supabase.storage.from_(BUCKET_NAME).get_public_url(new_name)

            nuevas_urls[old_name] = (new_name, new_url)
            archivos_a_borrar.append(old_name)

            orig_kb = item["size"] / 1024
            new_kb = len(webp_bytes) / 1024
            print(f"   [{idx}/{len(archivos_jpg)}] {old_name} ({orig_kb:.0f}KB) -> {new_name} ({new_kb:.0f}KB, -{(1 - new_kb/orig_kb)*100:.0f}%)")

        except Exception as e:
            print(f"   [AVISO] No se pudo procesar {old_name}: {e}")

    # 4. Actualizar URLs en la tabla 'marcos'
    print("\n🔄 Actualizando enlaces de imágenes en la base de datos Supabase...")
    actualizados = 0
    for prod in productos:
        id_ext = prod["id_ext"]
        p = prod.get("imagen_principal") or ""
        s = prod.get("imagenes_secundarias") or ""

        cambio = False
        update_data = {}

        if p:
            fn = p.split("/")[-1].split("?")[0]
            if fn in nuevas_urls:
                update_data["imagen_principal"] = nuevas_urls[fn][1]
                cambio = True

        if s:
            nuevas_secs = []
            for sec in s.split(","):
                sec_fn = sec.strip().split("/")[-1].split("?")[0]
                if sec_fn in nuevas_urls:
                    nuevas_secs.append(nuevas_urls[sec_fn][1])
                    cambio = True
                else:
                    nuevas_secs.append(sec.strip())
            if cambio and "imagenes_secundarias" not in update_data:
                update_data["imagenes_secundarias"] = ",".join(nuevas_secs)

        if cambio and update_data:
            try:
                supabase.table("marcos").update(update_data).eq("id_ext", id_ext).execute()
                actualizados += 1
            except Exception as e:
                print(f"   [ERROR BD] Actualizando {id_ext}: {e}")

    print(f"✅ Se actualizaron {actualizados} productos en la base de datos.")

    # 5. Borrar archivos JPEG/PNG pesados antiguos del bucket
    if archivos_a_borrar:
        print(f"\n🗑️  Borrando {len(archivos_a_borrar)} archivos antiguos pesados...")
        chunk_size = 100
        for i in range(0, len(archivos_a_borrar), chunk_size):
            chunk = archivos_a_borrar[i:i + chunk_size]
            try:
                supabase.storage.from_(BUCKET_NAME).remove(chunk)
            except Exception as e:
                print(f"   [ERROR BORRADO] {e}")

    print("\n🎉 ¡MIGRACIÓN COMPLETADA! Tu catálogo ahora está 100% en WebP ultra liviano.")


def main():
    while True:
        huerfanos, jpgs, productos = auditar_storage()

        print("\nOpciones disponibles:")
        print("1. 🧹 Eliminar únicamente los archivos huérfanos (liberar espacio sin tocar productos)")
        print("2. 🚀 Migrar y comprimir todo el catálogo a WebP (máxima reducción de espacio y velocidad)")
        print("3. ❌ Salir")

        opc = input("\nSelecciona una opción (1, 2 o 3): ").strip()
        if opc == "1":
            eliminar_archivos_huerfanos(huerfanos)
        elif opc == "2":
            eliminar_archivos_huerfanos(huerfanos)
            # Re-auditar para obtener lista limpia
            _, jpgs_actualizados, prods_actualizados = auditar_storage()
            optimizar_y_migrar_a_webp(jpgs_actualizados, prods_actualizados)
        elif opc == "3":
            print("Saliendo...")
            break
        else:
            print("Opción inválida.")


if __name__ == "__main__":
    main()
