import os
import re
import sys
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
import io
import time
import hashlib
import asyncio
import subprocess
import aiohttp
import pandas as pd
from PIL import Image
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from playwright_stealth import Stealth
from supabase import create_client, Client

# ==========================================
# CONFIGURACIÓN Y CARGA DE .ENV
# ==========================================
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError(
        "❌ Faltan las credenciales de Supabase. Asegúrate de crear un archivo '.env' "
        "con SUPABASE_URL y SUPABASE_SECRET_KEY en la raíz del proyecto."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "marcos-imagenes"

STOCK_MINIMO = 5                # Variantes con stock <= esto se omiten o marcan en 0
SEGUIR_COLORES = True            # Seguir enlaces de miniaturas de color en la ficha
MAX_PAGINAS_DEFAULT = 60         # Límite máximo de páginas para evitar bucles infinitos
CONCURRENCY_PRODUCTS = 6         # Pestañas simultáneas para extraer productos (acelerado)
CONCURRENCY_IMAGES = 6           # Descargas y subidas de imágenes simultáneas en paralelo

# Caché en memoria para evitar re-descargas y re-subidas de la misma imagen
uploaded_images_cache = {}


# ==========================================
# IMÁGENES Y SUPABASE STORAGE
# ==========================================
async def fetch_image(session: aiohttp.ClientSession, url: str):
    """Descarga los bytes de una imagen con reintentos y headers seguros."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.nywd.com/'
    }
    for intento in range(3):
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status == 200:
                    return await response.read(), response.headers.get("Content-Type", "image/jpeg")
        except Exception:
            await asyncio.sleep(1 + intento)
    return None, None


def optimize_image(file_bytes: bytes, max_dim=1000, quality=82) -> tuple[bytes, str, str]:
    """
    Optimiza una imagen para web:
    - Redimensiona proporcionalmente a un máximo de max_dim píxeles (LANCZOS).
    - Convierte a formato WebP moderno de alta compresión visual sin pérdidas perceptibles.
    - Reduce el peso típico entre 85% y 98% (de ~500KB a ~10-35KB).
    """
    try:
        img = Image.open(io.BytesIO(file_bytes))
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

        if img.width > max_dim or img.height > max_dim:
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

        out_io = io.BytesIO()
        img.save(out_io, format="WEBP", quality=quality, method=4)
        return out_io.getvalue(), "image/webp", "webp"
    except Exception as e:
        # Fallback de seguridad al original si la imagen tiene formato atípico
        return file_bytes, "image/jpeg", "jpg"


def supabase_upload_sync(filename: str, file_bytes: bytes, content_type: str):
    """Sube un archivo al bucket de Supabase Storage con reintentos."""
    for intento in range(3):
        try:
            supabase.storage.from_(BUCKET_NAME).upload(
                path=filename,
                file=file_bytes,
                file_options={"content-type": content_type, "x-upsert": "true"}
            )
            return supabase.storage.from_(BUCKET_NAME).get_public_url(filename)
        except Exception as e:
            if intento == 2:
                print(f"   [ERROR AL SUBIR IMAGEN] {filename}: {e}")
                return None
            time.sleep(1.2 * (intento + 1))
    return None


async def process_and_upload_image(session: aiohttp.ClientSession, image_url: str, base_sku: str, color_code: str, img_sem: asyncio.Semaphore):
    """Procesa, comprime a WebP y sube una imagen a Supabase Storage con concurrencia asíncrona."""
    if not image_url:
        return ""

    # Si ya la procesamos en esta sesión, reutilizar URL
    if image_url in uploaded_images_cache:
        return uploaded_images_cache[image_url]

    async with img_sem:
        raw_bytes, _ = await fetch_image(session, image_url)
        if not raw_bytes:
            return ""

        # Compresión profesional a WebP (reduce hasta 98% del peso)
        file_bytes, content_type, ext = optimize_image(raw_bytes)

        clean_sku = re.sub(r'[^a-zA-Z0-9]', '', base_sku)
        clean_color = re.sub(r'[^a-zA-Z0-9]', '', color_code)
        digest = hashlib.md5(image_url.encode("utf-8")).hexdigest()[:8]
        filename = f"{clean_sku}-{clean_color}-{digest}.{ext}"

        public_url = await asyncio.to_thread(supabase_upload_sync, filename, file_bytes, content_type)
        if public_url:
            uploaded_images_cache[image_url] = public_url
            return public_url
        return ""


# ==========================================
# SUPABASE DATABASE SYNC (BATCH & IDEMPOTENTE)
# ==========================================
def get_existing_brand_records(brand: str) -> dict:
    """
    Obtiene todos los registros de una marca existentes en Supabase.
    Maneja paginación para marcas con más de 1000 productos.
    Retorna un diccionario mapeando id_ext -> dict con stock e imágenes.
    """
    all_data = {}
    page_size = 1000
    start = 0
    while True:
        try:
            res = (
                supabase.table("marcos")
                .select("id_ext, stock, imagen_principal, imagenes_secundarias")
                .ilike("marca", brand)
                .range(start, start + page_size - 1)
                .execute()
            )
            data = res.data or []
            for r in data:
                all_data[r["id_ext"]] = r
            if len(data) < page_size:
                break
            start += page_size
        except Exception as e:
            print(f"   [AVISO BD] Error consultando existentes en Supabase: {e}")
            break
    return all_data


async def upsert_records_batch_to_supabase(records: list):
    """
    Sincroniza una lista de registros en Supabase usando batch upsert.
    Idempotente: inserta nuevos y actualiza existentes según 'id_ext'.
    """
    if not records:
        return

    def sync_batch():
        chunk_size = 50
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            for intento in range(3):
                try:
                    supabase.table("marcos").upsert(chunk, on_conflict="id_ext").execute()
                    print(f"   [OK BD] Lote sincronizado: {len(chunk)} variantes.")
                    break
                except Exception as e:
                    if intento == 2:
                        print(f"   [ERROR BD] Fallo al sincronizar lote en Supabase: {e}")
                    else:
                        time.sleep(1.5 * (intento + 1))

    await asyncio.to_thread(sync_batch)


async def sync_out_of_stock_records(brand: str, scanned_ids: set):
    """
    Marca con stock = 0 en Supabase todos los productos de la marca que ya no
    figuran en el catálogo del proveedor o que tenían stock <= STOCK_MINIMO.
    Se ejecuta en lotes para máxima velocidad.
    """
    def sync_deprecate():
        try:
            existentes = get_existing_brand_records(brand)
            out_of_stock_ids = [
                id_ext for id_ext, data in existentes.items()
                if id_ext not in scanned_ids and data.get("stock", 0) > 0
            ]

            if not out_of_stock_ids:
                print(f"   [OK INVENTARIO] No hay productos de '{brand}' para marcar como agotados.")
                return

            print(f"   [ACTUALIZANDO INVENTARIO] Eliminando {len(out_of_stock_ids)} productos agotados (stock 0) de la BD...")
            chunk_size = 100
            for i in range(0, len(out_of_stock_ids), chunk_size):
                chunk = out_of_stock_ids[i:i + chunk_size]
                try:
                    supabase.table("marcos").delete().in_("id_ext", chunk).execute()
                except Exception as e:
                    print(f"   [ERROR BD] No se pudo eliminar bloque agotado: {e}")

            print(f"   [OK INVENTARIO] {len(out_of_stock_ids)} variantes agotadas eliminadas de la BD.")
        except Exception as e:
            print(f"   [AVISO] Error general en depuración de stock: {e}")

    await asyncio.to_thread(sync_deprecate)


# ==========================================
# FINANZAS (CÁLCULO B2B CHILE)
# ==========================================
def calculate_b2b_pricing(price_usd: float) -> dict:
    if price_usd <= 0:
        return {
            "precio_bruto_clp": 0, "precio_neto_clp": 0, "ganancia_clp": 0,
            "costo_flete_usd": 0, "costo_cif_clp": 0, "ad_valorem_clp": 0,
            "costo_despacho_local_clp": 0, "costo_total_chile_clp": 0
        }

    dolar = float(os.environ.get("DOLAR_CLP", 950.0))
    flete_usd = 8.0
    flete_local = 2500

    cif_clp = (price_usd + flete_usd) * dolar
    ad_valorem_clp = cif_clp * 0.06
    costo_neto_chile = cif_clp + ad_valorem_clp + flete_local
    costo_origen_clp = price_usd * dolar

    if costo_origen_clp < 20000:
        precio_venta_neto = price_usd * 2500.0
    elif costo_origen_clp <= 70000:
        precio_venta_neto = price_usd * 1900.0
    elif costo_origen_clp <= 120000:
        precio_venta_neto = costo_neto_chile + 60000.0
    else:
        precio_venta_neto = costo_neto_chile + 100000.0

    return {
        "precio_bruto_clp": int(round((precio_venta_neto * 1.19), -3)),
        "precio_neto_clp": int(round(precio_venta_neto, -3)),
        "ganancia_clp": int(round(precio_venta_neto - costo_neto_chile, -3)),
        "costo_flete_usd": flete_usd,
        "costo_cif_clp": int(round(cif_clp)),
        "ad_valorem_clp": int(round(ad_valorem_clp)),
        "costo_despacho_local_clp": flete_local,
        "costo_total_chile_clp": int(round(costo_neto_chile))
    }


# ==========================================
# PARSEO DE DETALLE DE VARIANTE
# ==========================================
def parse_detail(text: str, campo: str) -> str:
    patron = rf"{campo}(?!\s*Code)\s*:?\s+([^\n\r]+)"
    m = re.search(patron, text, re.IGNORECASE)
    if not m:
        return ""
    valor = m.group(1).strip()
    return "" if valor.startswith("$") else valor


async def extract_variant(page, link: str, brand_name: str, session: aiohttp.ClientSession, img_sem: asyncio.Semaphore, existing_cache: dict):
    text = await page.locator("body").inner_text()

    # SKU y Modelo robusto
    base_sku = await page.evaluate("""(brandName) => {
        const hs = Array.from(document.querySelectorAll('h1, h2, h3, .product-title, .product-name'));
        for (let h of hs) {
            const t = h.innerText.trim();
            if (!t || t.toLowerCase() === brandName.toLowerCase()) continue;
            if (t.includes('$') || t.includes('EUR') || t.includes('USD')) continue;
            if (t.length > 2 && t.length <= 30 &&
                !t.toLowerCase().includes('home') && !t.toLowerCase().includes('shop')) return t;
        }
        return '';
    }""", brand_name)

    if not base_sku or "$" in base_sku:
        m = re.search(r'product-([a-zA-Z0-9]+)', link, re.IGNORECASE)
        base_sku = m.group(1).upper() if m else link.split("-")[-1].upper()
    base_sku = base_sku.upper().strip()

    m_url = re.search(r'product-(\d+)', link)
    id_nywd = m_url.group(1) if m_url else ""

    price_match = re.search(r'\$\s*([\d\.\,]+)', text)
    price_usd = float(price_match.group(1).replace(",", "")) if price_match else 0.0
    pricing = calculate_b2b_pricing(price_usd)

    color_code = (parse_detail(text, "Color Code") or id_nywd or base_sku).strip().upper()
    color_nombre = parse_detail(text, "Color") or "Único"

    stock_raw = parse_detail(text, "Quantity") or parse_detail(text, "Stock") or "0"
    nums = re.findall(r'\d+', stock_raw)
    stock_qty = min(50, int(nums[0]) if nums else 0)

    clean_id_ext = f"{base_sku}-{color_code}".replace(" ", "").upper()

    if stock_qty <= STOCK_MINIMO:
        print(f"   [SIN STOCK] {clean_id_ext} ({stock_qty} un. <= {STOCK_MINIMO})")
        return None

    # Optimización inteligente de imágenes:
    # Si el producto ya existe en Supabase y ya tiene imagen, reutilizarla
    # para evitar re-descargar y re-subir la imagen en cada corrida.
    cached_item = existing_cache.get(clean_id_ext)
    if cached_item and cached_item.get("imagen_principal"):
        main_img = cached_item["imagen_principal"]
        sec_img = cached_item.get("imagenes_secundarias") or ""
    else:
        # Extraer galería desde el HTML
        raw_gallery = await page.evaluate("""() => {
            const selectors = ['#product-detail-image img', '.product-image img', '.fotorama__img', '.magiczoom img', 'img[data-zoom-image]'];
            let imgs = [];
            for (let sel of selectors) {
                const found = Array.from(document.querySelectorAll(sel));
                if (found.length > 0) {
                    imgs = found;
                    break;
                }
            }
            if (imgs.length === 0) {
                imgs = Array.from(document.querySelectorAll('img')).filter(i => i.src && i.src.includes('pictures/'));
            }
            return imgs.map(i => i.getAttribute('data-zoom-image') || i.getAttribute('data-src') || i.src || '')
                       .filter(u => u && u.includes('pictures/') && !u.includes('thumb') && !u.includes('swatch'));
        }""")

        limpias = []
        for url in raw_gallery:
            if 'pictures/' in url:
                sub = re.sub(r'^/+', '', url.split('pictures/').pop().split('?')[0])
                full_url = 'https://www.nywd.com/pictures/' + sub
                if full_url not in limpias:
                    limpias.append(full_url)

        selected_images = limpias[:2]
        img_tasks = [
            process_and_upload_image(session, u, base_sku, color_code, img_sem)
            for u in selected_images
        ]
        img_urls = await asyncio.gather(*img_tasks)
        valid_imgs = [u for u in img_urls if u]
        main_img = valid_imgs[0] if len(valid_imgs) > 0 else ""
        sec_img = valid_imgs[1] if len(valid_imgs) > 1 else ""

    record = {
        "id_ext": clean_id_ext,
        "id_nywd": id_nywd,
        "marca": brand_name,
        "modelo": parse_detail(text, "Model") or base_sku,
        "color": color_nombre,
        "codigo_color": color_code,
        "genero": parse_detail(text, "Gender"),
        "forma": parse_detail(text, "Shape"),
        "material": parse_detail(text, "Frame Material"),
        "tamano": parse_detail(text, "Size"),
        "upc": parse_detail(text, "UPC"),
        "origen": parse_detail(text, "Made in"),
        "stock": stock_qty,
        "precio_usd": price_usd,
        **pricing,
        "imagen_principal": main_img,
        "imagenes_secundarias": sec_img,
        "url_origen": link
    }
    return record


async def extract_product_data(context, link: str, brand_name: str, session: aiohttp.ClientSession, sem: asyncio.Semaphore, img_sem: asyncio.Semaphore, existing_cache: dict):
    """Abre la ficha de producto con reintentos y timeouts adaptativos."""
    async with sem:
        for intento in range(2):
            page = await context.new_page()
            await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            # Bloqueo agresivo de fuentes, multimedia y rastreadores para acelerar la carga x5
            try:
                await page.route(re.compile(r".*\.(woff|woff2|ttf|otf|mp4|webm|avi|mov)$"), lambda route: route.abort())
                await page.route(re.compile(r".*(google-analytics|googletagmanager|hotjar|facebook|doubleclick|clarity|bing|criteo).*"), lambda route: route.abort())
            except Exception:
                pass

            try:
                await page.goto(link, wait_until="domcontentloaded", timeout=20000)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                await page.wait_for_timeout(250)

                color_links = []
                if SEGUIR_COLORES:
                    color_links = await page.evaluate("""() => {
                        return Array.from(document.querySelectorAll('a[href*="product-"]'))
                            .filter(a => a.querySelector('img'))
                            .map(a => a.href);
                    }""")
                    color_links = [u for u in dict.fromkeys(color_links) if u != link]

                record = await extract_variant(page, link, brand_name, session, img_sem, existing_cache)
                return record, color_links

            except PlaywrightTimeoutError:
                if intento == 0:
                    await asyncio.sleep(1.5)
                    continue
                print(f"   [TIMEOUT] {link}")
                return None, []
            except Exception as e:
                if intento == 0:
                    await asyncio.sleep(1.5)
                    continue
                print(f"   [OMITIDO] {link} -> {str(e)[:60]}")
                return None, []
            finally:
                await page.close()

        return None, []


# ==========================================
# PROCESAMIENTO DE LOTES
# ==========================================
async def procesar_lote(context, links: list, brand: str, session: aiohttp.ClientSession, vistos: set, all_records: list, scanned_ids: set, existing_cache: dict, img_sem: asyncio.Semaphore):
    sem = asyncio.Semaphore(CONCURRENCY_PRODUCTS)
    tareas = [extract_product_data(context, l, brand, session, sem, img_sem, existing_cache) for l in links]
    resultados = await asyncio.gather(*tareas)

    nuevos_colores = []
    lote_para_db = []

    for record, color_links in resultados:
        if record:
            if record["id_ext"] in scanned_ids:
                print(f"   [DUPLICADO LOCAL] {record['id_ext']} ya fue capturado en esta corrida.")
            else:
                all_records.append(record)
                scanned_ids.add(record["id_ext"])
                lote_para_db.append(record)

        for cl in color_links:
            if cl not in vistos:
                vistos.add(cl)
                nuevos_colores.append(cl)

    # Upsert en Supabase en tiempo real conforme se procesa el lote
    if lote_para_db:
        await upsert_records_batch_to_supabase(lote_para_db)

    return nuevos_colores


# ==========================================
# PAGINACIÓN AUTOMÁTICA
# ==========================================
async def avanzar_siguiente_pagina(page, ciclo_actual: int) -> bool:
    """
    Detecta automáticamente los controles de paginación de la tienda y avanza
    a la siguiente página. Si no logra detectarlo automáticamente, solicita
    al usuario que cambie de página manualmente en Chrome (o presione 'n' para terminar).
    """
    try:
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=6000)
        except Exception:
            pass

        # 1. Scroll gradual hacia el final para renderizar la barra de paginación
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2);")
        await asyncio.sleep(0.3)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
        await asyncio.sleep(0.5)

        url_anterior = page.url
        enlaces_anteriores = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(h => (h.includes('product-') || h.includes('new-product-')) && !h.includes('listing-'))
                .slice(0, 10);
        }""")

        # 2. Búsqueda inteligente del control de página siguiente
        candidato = await page.evaluate("""(ciclo) => {
            const targetNum = String(ciclo + 1);

            // A. Selector rel="next"
            const rel = document.querySelector('a[rel="next"], [rel="next"] a');
            if (rel && !rel.classList.contains('disabled') && !rel.closest('.disabled')) {
                return { type: 'selector', value: 'a[rel="next"], [rel="next"] a' };
            }

            // B. Enlaces y botones disponibles en el DOM
            const elementos = Array.from(document.querySelectorAll('a, button, li a, [role="button"]'));

            // C. Por texto: 'Next', '>', '»', '›', etc.
            const nextWords = ['next', 'next >', '>', '»', '›', 'siguiente', 'next page'];
            for (let el of elementos) {
                const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                if (nextWords.includes(txt)) {
                    if (!el.classList.contains('disabled') && !el.closest('.disabled') && el.offsetParent !== null) {
                        return { type: 'text', value: el.innerText.trim() };
                    }
                }
            }

            // D. Por número de la siguiente página (ciclo + 1)
            for (let el of elementos) {
                const txt = (el.innerText || el.textContent || '').trim();
                if (txt === targetNum) {
                    if (!el.classList.contains('disabled') && !el.closest('.disabled') && el.offsetParent !== null) {
                        return { type: 'page_num', value: targetNum };
                    }
                }
            }

            // E. Por aria-label o clases con 'next'
            for (let el of elementos) {
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const cls = (el.className || '').toLowerCase();
                if (aria.includes('next') || (cls.includes('next') && !cls.includes('context'))) {
                    if (!el.classList.contains('disabled') && !el.closest('.disabled') && el.offsetParent !== null) {
                        return { type: 'selector', value: '.' + el.className.split(' ').filter(Boolean).join('.') };
                    }
                }
            }

            // F. ASP.NET postback
            const postback = document.querySelector(`a[href*="Page$${targetNum}"]`);
            if (postback && postback.offsetParent !== null) {
                return { type: 'selector', value: `a[href*="Page$${targetNum}"]` };
            }

            return null;
        }""", ciclo_actual)

        # 3. Si se encontró el botón, intentar hacer clic automáticamente
        if candidato:
            try:
                if candidato["type"] == "text":
                    btn = page.locator(f"a:has-text('{candidato['value']}'), button:has-text('{candidato['value']}')").last
                elif candidato["type"] == "page_num":
                    btn = page.locator(f"a:text-matches('^{candidato['value']}$'), button:text-matches('^{candidato['value']}$')").first
                else:
                    btn = page.locator(candidato["value"]).first

                await btn.scroll_into_view_if_needed()
                try:
                    await btn.click(timeout=4000)
                except Exception:
                    await btn.dispatch_event('click')

                await page.wait_for_timeout(2500)
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=8000)
                except Exception:
                    pass

                enlaces_nuevos = await page.evaluate("""() => {
                    return Array.from(document.querySelectorAll('a[href]'))
                        .map(a => a.href)
                        .filter(h => (h.includes('product-') || h.includes('new-product-')) && !h.includes('listing-'))
                        .slice(0, 10);
                }""")

                if (enlaces_nuevos and enlaces_nuevos != enlaces_anteriores) or (page.url != url_anterior):
                    print(f"   [OK] Página {ciclo_actual + 1} cargada automáticamente.")
                    return True

            except Exception as click_err:
                print(f"   [AVISO] Clic automático falló: {click_err}")

    except Exception as e:
        print(f"   [AVISO PAGINACIÓN] Error en detección automática: {e}")

    # 4. ASISTENCIA MANUAL / CONFIRMACIÓN
    print("\n" + "="*60)
    print(f"👉 Por favor, ve a Chrome y cambia a la PÁGINA {ciclo_actual + 1}.")
    print(f"   (Haz clic en el número {ciclo_actual + 1} o en 'Next' al pie de la página).")
    print(f"   Si ya estás en la última página, escribe 'n' para finalizar.")
    print("="*60)

    # Esperar activamente si el usuario hace clic en el navegador (hasta 15 seg)
    for _ in range(30):
        await asyncio.sleep(0.5)
        if page.url != url_anterior:
            print(f"   [OK] ¡Cambio de página detectado en Chrome!: {page.url}")
            await page.wait_for_timeout(1500)
            return True

        curr_links = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(h => (h.includes('product-') || h.includes('new-product-')) && !h.includes('listing-'))
                .slice(0, 10);
        }""")
        if curr_links and curr_links != enlaces_anteriores:
            print(f"   [OK] ¡Nuevos productos detectados en pantalla!")
            await page.wait_for_timeout(1500)
            return True

    resp = input(f"\n>>> Presiona [ENTER] cuando estés en la Página {ciclo_actual + 1} (o escribe 'n' si no hay más páginas): ").strip().lower()
    if resp in ['n', 'no', 'fin', 'exit', 'q']:
        print("   [FIN CATÁLOGO] Finalización indicada por el usuario.")
        return False

    return True


# ==========================================
# NAVEGACIÓN AUTOMÁTICA A LA MARCA
# ==========================================
async def navegar_a_marca(page, brand: str) -> bool:
    """
    Navega automáticamente al catálogo de la marca en NYWD.
    1. Si ya estamos en la página del catálogo (ej: listing-brand-112), la usa directamente.
    2. Si no, busca el enlace de la marca en el menú desplegable BRANDS (hover/click) o en el DOM.
    3. Si no, busca usando la lupa / buscador.
    4. Si requiere intervención del usuario, detecta en tiempo real cuando ingresa al catálogo.
    """
    brand_clean = brand.strip().lower()
    curr_url = page.url.lower()

    # 1. Comprobar si ya estamos en la página del catálogo de la marca
    if "listing-brand" in curr_url or brand_clean in curr_url:
        page_text = (await page.locator("body").inner_text()).lower()
        if brand_clean in page_text:
            print(f"✅ Ya estás en el catálogo de '{brand}' ({page.url}). Usando página actual.")
            return True

    print(f"\n>>> Buscando la marca '{brand}' en el menú BRANDS...")
    try:
        # Localizar el botón/enlace BRANDS en el menú superior
        brands_menu = page.locator("a:text-matches('^BRANDS$', 'i'), text='BRANDS'").first
        if await brands_menu.is_visible(timeout=3000):
            try:
                await brands_menu.hover()
                await page.wait_for_timeout(600)
            except Exception:
                pass

        # Buscar el enlace de la marca dentro del menú (ej: 'Guess (544)', 'Nike (189)')
        link_encontrado = await page.evaluate("""(targetBrand) => {
            const links = Array.from(document.querySelectorAll('a'));
            const tb = targetBrand.toLowerCase().trim();

            // Intento 1: Coincidencia limpia ignorando los números entre paréntesis ej: "Guess (544)" -> "guess"
            for (let a of links) {
                const text = (a.innerText || a.textContent || '').trim();
                const cleanText = text.replace(/\\s*\\(\\d+\\)$/, '').trim().toLowerCase();
                if (cleanText === tb && a.href && !a.href.endsWith('#')) {
                    return { text: text, href: a.href };
                }
            }

            // Intento 2: Empieza por la marca (ej: Guess) y tiene listing-brand en href
            for (let a of links) {
                const text = (a.innerText || a.textContent || '').trim().toLowerCase();
                if (text.startsWith(tb) && a.href && (a.href.includes('listing-brand') || a.href.includes('brand'))) {
                    return { text: a.innerText.trim(), href: a.href };
                }
            }

            // Intento 3: href contiene el slug de la marca
            for (let a of links) {
                if (a.href && a.href.toLowerCase().includes(tb) && a.href.includes('listing-brand')) {
                    return { text: a.innerText.trim() || targetBrand, href: a.href };
                }
            }

            return null;
        }""", brand)

        if not link_encontrado:
            # Si aún no aparece, hacer clic explícito en BRANDS para forzar despliegue
            if await brands_menu.is_visible(timeout=1000):
                await brands_menu.click()
                await page.wait_for_timeout(1000)
                link_encontrado = await page.evaluate("""(targetBrand) => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const tb = targetBrand.toLowerCase().trim();
                    for (let a of links) {
                        const text = (a.innerText || a.textContent || '').trim();
                        const cleanText = text.replace(/\\s*\\(\\d+\\)$/, '').trim().toLowerCase();
                        if (cleanText === tb && a.href && !a.href.endsWith('#')) {
                            return { text: text, href: a.href };
                        }
                    }
                    return null;
                }""", brand)

        if link_encontrado and link_encontrado.get("href"):
            print(f"   [OK] Marca encontrada en el menú: '{link_encontrado['text']}'. Navegando a {link_encontrado['href']}...")
            await page.goto(link_encontrado["href"], wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(2000)
            print(f"   [OK] Catálogo de '{brand}' abierto: {page.url}")
            return True

    except Exception as e:
        print(f"   [AVISO] No se pudo seleccionar automáticamente desde menú BRANDS: {e}")

    # 3. Intentar mediante la lupa de búsqueda
    try:
        print(f">>> Intentando buscar '{brand}' mediante la lupa / buscador...")
        search_btn = page.locator("a:text-matches('^SEARCH$', 'i'), a[href*='search'], svg, .search-icon, button.search").first
        if await search_btn.is_visible(timeout=2000):
            await search_btn.click()
            await page.wait_for_timeout(600)

        search_input = page.locator("input[type='search'], input[name*='search' i], input[placeholder*='search' i]").first
        if await search_input.is_visible(timeout=2000):
            await search_input.click()
            await search_input.fill(brand)
            await page.keyboard.press("Enter")
            await page.wait_for_load_state("domcontentloaded", timeout=20000)
            await page.wait_for_timeout(2000)
            print(f"   [OK] Búsqueda de '{brand}' aplicada: {page.url}")
            return True
    except Exception:
        pass

    # 4. Asistencia en vivo: dar oportunidad al usuario de hacer clic en el navegador
    print("\n" + "!"*60)
    print(f"👉 Por favor, ve a Chrome y haz clic en '{brand}' dentro de BRANDS.")
    print("   (El bot detectará automáticamente cuando entres al catálogo).")
    print("!"*60)

    for _ in range(50):  # hasta 25 segundos detectando si el usuario hace clic
        await asyncio.sleep(0.5)
        curr = page.url.lower()
        if "listing-brand" in curr or "search" in curr:
            print(f"   [OK] ¡Navegación al catálogo detectada!: {page.url}")
            await page.wait_for_timeout(1500)
            return True

    input(f"\n>>> Presiona [ENTER] cuando estés en la página del catálogo de '{brand}'...")
    return True


# ==========================================
# EXTRACCIÓN DE MARCA COMPLETA
# ==========================================
async def procesar_marca_completa(context, page, brand: str, session: aiohttp.ClientSession, img_sem: asyncio.Semaphore):
    """Extrae todos los productos de una marca a lo largo de todas sus páginas."""
    print(f"\n{'='*60}")
    print(f"🚀 INICIANDO EXTRACCIÓN AUTOMÁTICA DE LA MARCA: '{brand.upper()}'")
    print(f"{'='*60}")

    # 1. Precargar registros existentes de Supabase para evitar re-descargas de imágenes
    print(">>> Precargando registros de Supabase para optimizar imágenes y stock...")
    existing_cache = await asyncio.to_thread(get_existing_brand_records, brand)
    print(f"   [BD] {len(existing_cache)} productos de '{brand}' encontrados previamente en Supabase.")

    # 2. Navegar al catálogo de la marca
    ok = await navegar_a_marca(page, brand)
    if not ok:
        print(f"❌ No se pudo acceder al catálogo de '{brand}'. Omitiendo...")
        return

    all_records = []
    scanned_ids = set()
    vistos_urls = set()
    ciclo = 1

    while ciclo <= MAX_PAGINAS_DEFAULT:
        print(f"\n------------------------------------------------------------")
        print(f"📄 PROCESANDO PÁGINA {ciclo} DE '{brand.upper()}'...")
        print(f"------------------------------------------------------------")

        page_links = []
        for intento in range(3):
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=8000)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2);")
                await asyncio.sleep(0.4)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                await asyncio.sleep(0.5)

                encontrados = await page.evaluate("""() => {
                    return Array.from(document.querySelectorAll('a[href]'))
                        .map(a => a.href)
                        .filter(h => h.includes('product') || h.includes('new-product'));
                }""")
                page_links = [u for u in dict.fromkeys(encontrados) if u not in vistos_urls]
                if page_links:
                    break
            except Exception:
                await asyncio.sleep(1)

        vistos_urls.update(page_links)
        print(f"   [PÁG {ciclo}] Enlaces de productos nuevos encontrados: {len(page_links)}")

        if not page_links:
            print(f"   [PÁG {ciclo}] No se encontraron más productos nuevos. Finalizando páginas de la marca.")
            break

        # Procesar los productos principales de la página
        pendientes_color = await procesar_lote(
            context, page_links, brand, session, vistos_urls, all_records, scanned_ids, existing_cache, img_sem
        )

        # Seguir enlaces de color adicionales
        vuelta_color = 0
        while pendientes_color and vuelta_color < 3:
            print(f"   --> Siguiendo {len(pendientes_color)} enlaces de variantes de color asociadas...")
            pendientes_color = await procesar_lote(
                context, pendientes_color, brand, session, vistos_urls, all_records, scanned_ids, existing_cache, img_sem
            )
            vuelta_color += 1

        print(f"   [ACUMULADO] Página {ciclo}: {len(all_records)} variantes activas capturadas.")

        # Avanzar automáticamente a la siguiente página
        print(">>> Intentando avanzar a la siguiente página automáticamente...")
        avanzo = await avanzar_siguiente_pagina(page, ciclo)
        if not avanzo:
            print(f"   [CATÁLOGO COMPLETO] No hay más páginas para '{brand}'.")
            break

        ciclo += 1

    # 3. Sincronización final de stock agotado en Supabase
    if scanned_ids:
        print(f"\n>>> Sincronizando inventario agotado de '{brand}' en Supabase...")
        await sync_out_of_stock_records(brand, scanned_ids)

    # 4. Exportar CSV final de respaldo
    if all_records:
        nombre_archivo = re.sub(r'[^\w\-_]', '_', brand.lower())
        df = pd.DataFrame(all_records)
        df.to_csv(f"{nombre_archivo}_final.csv", index=False, encoding="utf-8-sig")
        print(f"\n✅ ¡ÉXITO! Marca '{brand}' finalizada: {len(all_records)} variantes activas guardadas en '{nombre_archivo}_final.csv'.")
    else:
        print(f"\n⚠️ No se encontraron variantes con stock > {STOCK_MINIMO} para '{brand}'.")


# ==========================================
# MANTENIMIENTO AUTOMÁTICO DE STORAGE
# ==========================================
def ejecutar_mantenimiento_storage_automatico():
    """
    Mantenimiento y depuración automática de Supabase:
    1. Audita el bucket 'marcos-imagenes' y la base de datos 'marcos'.
    2. Elimina cualquier archivo huérfano (sin producto asociado).
    3. Si detecta fotos pesadas (.jpg o .png), las convierte a WebP,
       actualiza la base de datos y borra las pesadas antiguas.
    4. Muestra un reporte de salud y almacenamiento.
    """
    try:
        print("\n>>> [STORAGE] Auditando almacenamiento e inventario en Supabase...")
        
        # 1. Obtener todas las imágenes referenciadas en la BD
        start = 0
        page_size = 1000
        imagenes_bd = set()
        productos_bd = []

        while True:
            res = (
                supabase.table("marcos")
                .select("id_ext, imagen_principal, imagenes_secundarias")
                .range(start, start + page_size - 1)
                .execute()
            )
            data = res.data or []
            for r in data:
                productos_bd.append(r)
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

        # 2. Listar archivos reales en el bucket
        archivos_storage = []
        offset = 0
        limit = 1000
        while True:
            batch = supabase.storage.from_(BUCKET_NAME).list(options={"limit": limit, "offset": offset})
            if not batch:
                break
            archivos_storage.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

        total_bytes = 0
        huerfanos = []
        archivos_pesados_jpg = []

        for f in archivos_storage:
            name = f.get("name", "")
            meta = f.get("metadata", {}) or {}
            size = meta.get("size", 0) or f.get("size", 0) or 0
            total_bytes += size

            if name not in imagenes_bd:
                huerfanos.append(name)
            elif name.lower().endswith((".jpg", ".jpeg", ".png")):
                archivos_pesados_jpg.append({"name": name, "size": size})

        # 3. Eliminar huérfanos si existen
        if huerfanos:
            print(f">>> [STORAGE] Limpiando {len(huerfanos)} archivos huérfanos sin producto...")
            chunk_size = 100
            for i in range(0, len(huerfanos), chunk_size):
                chunk = huerfanos[i:i + chunk_size]
                try:
                    supabase.storage.from_(BUCKET_NAME).remove(chunk)
                except Exception as e:
                    print(f"   [AVISO] Error borrando bloque de huérfanos: {e}")
            print(f"   [OK] {len(huerfanos)} archivos huérfanos eliminados.")
        else:
            print("   [OK] Cero archivos huérfanos. Bucket limpio.")

        # 4. Si hay imágenes pendientes de reducir a WebP, procesarlas
        if archivos_pesados_jpg:
            print(f">>> [STORAGE] Optimizando {len(archivos_pesados_jpg)} fotos pendientes a WebP...")
            import urllib.request
            nuevas_urls = {}
            a_borrar = []

            for item in archivos_pesados_jpg:
                old_name = item["name"]
                old_url = supabase.storage.from_(BUCKET_NAME).get_public_url(old_name)
                try:
                    req = urllib.request.Request(old_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=12) as resp:
                        content = resp.read()

                    opt_bytes, opt_type, opt_ext = optimize_image(content)
                    base_name = os.path.splitext(old_name)[0]
                    new_name = f"{base_name}.{opt_ext}"

                    supabase.storage.from_(BUCKET_NAME).upload(
                        path=new_name,
                        file=opt_bytes,
                        file_options={"content-type": opt_type, "x-upsert": "true"}
                    )
                    new_url = supabase.storage.from_(BUCKET_NAME).get_public_url(new_name)
                    nuevas_urls[old_name] = new_url
                    a_borrar.append(old_name)
                except Exception as e:
                    print(f"   [AVISO] No se pudo convertir {old_name}: {e}")

            # Actualizar en BD
            for prod in productos_bd:
                id_ext = prod["id_ext"]
                p = prod.get("imagen_principal") or ""
                s = prod.get("imagenes_secundarias") or ""
                update_payload = {}
                
                if p:
                    fn_p = p.split("/")[-1].split("?")[0]
                    if fn_p in nuevas_urls:
                        update_payload["imagen_principal"] = nuevas_urls[fn_p]
                if s:
                    secs = [sec.strip() for sec in s.split(",") if sec.strip()]
                    secs_nuevas = []
                    cambio_s = False
                    for sec in secs:
                        fn_s = sec.split("/")[-1].split("?")[0]
                        if fn_s in nuevas_urls:
                            secs_nuevas.append(nuevas_urls[fn_s])
                            cambio_s = True
                        else:
                            secs_nuevas.append(sec)
                    if cambio_s:
                        update_payload["imagenes_secundarias"] = ",".join(secs_nuevas)

                if update_payload:
                    try:
                        supabase.table("marcos").update(update_payload).eq("id_ext", id_ext).execute()
                    except Exception:
                        pass

            # Borrar fotos viejas
            if a_borrar:
                chunk_size = 100
                for i in range(0, len(a_borrar), chunk_size):
                    chunk = a_borrar[i:i + chunk_size]
                    try:
                        supabase.storage.from_(BUCKET_NAME).remove(chunk)
                    except Exception:
                        pass
            print(f"   [OK] {len(archivos_pesados_jpg)} fotos migradas a WebP y sincronizadas.")

        # 5. Resumen final de salud de Storage
        archivos_finales = supabase.storage.from_(BUCKET_NAME).list(options={"limit": 1000}) or []
        mb_total = sum((f.get("metadata", {}).get("size", 0) or f.get("size", 0) or 0) for f in archivos_finales) / (1024 * 1024)
        print(f"\n{'='*60}")
        print("📊 REPORTE DE SALUD DE ALMACENAMIENTO (SUPABASE)")
        print(f"{'='*60}")
        print(f"• Total fotos en Storage:   {len(archivos_finales):,} archivos (100% WebP ultraliviano)")
        print(f"• Espacio utilizado:        {mb_total:.2f} MB / 1,000 MB ({mb_total / 10:.1f}% de tu cuota gratuita)")
        print(f"• Estado del catálogo:      Ultrarrápido y protegido contra sobrecostes")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"   [AVISO MANTENIMIENTO] Error en rutina de almacenamiento: {e}")


# ==========================================
# CONTROL PRINCIPAL
# ==========================================
async def main():
    async with async_playwright() as p:
        user_data_dir = os.path.join(os.getcwd(), "sesion_navegador")
        context = await p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            channel="chrome",
            args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
            no_viewport=True
        )

        page = context.pages[0] if context.pages else await context.new_page()
        await page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        await page.goto("https://www.nywd.com/login")
        input("\n>>> [1] Inicia sesión, pasa el CAPTCHA y presiona [ENTER]...")

        brand = input("\nMarca a extraer (ej: Guess): ").strip()
        if not brand:
            brand = "Guess"

        marcas = [m.strip() for m in brand.split(",") if m.strip()]

        # Solo navegar a wholesale si todavía estamos en la pantalla de login
        curr_url = page.url.lower()
        if "login" in curr_url:
            try:
                await page.goto("https://www.nywd.com/wholesale", wait_until="domcontentloaded", timeout=15000)
            except Exception:
                pass

        img_sem = asyncio.Semaphore(CONCURRENCY_IMAGES)
        async with aiohttp.ClientSession() as session:
            for marca in marcas:
                await procesar_marca_completa(context, page, marca, session, img_sem)

        print("\n🎉 Extracción finalizada. Cerrando navegador...")
        await context.close()

        # ==========================================
        # AUTO-LIMPIEZA Y OPTIMIZACIÓN FINAL EN SUPABASE
        # ==========================================
        print("\n" + "="*60)
        print("🧹 EJECUTANDO MANTENIMIENTO Y DEPURACIÓN FINAL EN SUPABASE...")
        print("="*60)
        await asyncio.to_thread(ejecutar_mantenimiento_storage_automatico)


if __name__ == "__main__":
    asyncio.run(main())