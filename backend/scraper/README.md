# OptiHub Provider Catalog Scraper (v2.1 Enterprise)

Scraper de alta velocidad, resiliente y de fidelidad empresarial para el catálogo de monturas ópticas de **nywd.com** (Miami wholesale), desarrollado con **Node.js**, **TypeScript**, **Playwright**, **Sharp** y **Supabase**.

---

## ⚡ Características Principales

### 1. Autenticación Asistida con Persistencia de Sesión (Manejo de reCAPTCHA)
- Comprueba la existencia y validez de `auth_state.json`.
- Si el archivo no existe o la sesión ha expirado (o el portal redirige a `/login`), el navegador se abre obligatoriamente en modo visible (`headless: false`).
- Muestra una instrucción destacada en la terminal solicitando al usuario que resuelva el reCAPTCHA y haga clic en *"SIGN IN"*.
- El script pausa la ejecución y espera la confirmación del usuario mediante la tecla `[ENTER]` o detecta automáticamente el acceso en tiempo real cuando la URL cambia al catálogo mayorista.
- Tras el login exitoso, almacena las cookies y el estado en `auth_state.json` para que todas las ejecuciones subsiguientes sean **100% automáticas y desatendidas**.

### 2. Extracción de Catálogo y Multimedia (Imágenes y Datos)
- Extrae con precisión los datos esenciales de cada tarjeta de producto y ficha de variante:
  - **Modelo** y **Marca**
  - **Código de Color** y Nombre de Color
  - **Dimensiones / Tamaño** (ej: `54-17-140`)
  - **UPC** (Código de barras)
  - **Stock Numérico Real**
  - **Precio Mayorista USD**
  - **Imagen Principal** y Galería Secundaria
- Estrategia dual: captura directa desde tarjetas DOM y escucha asíncrona de endpoints JSON (XHR/Fetch) mediante `page.on('response', ...)`.

### 3. Optimización y Compresión de Imágenes con Sharp (WebP @ Lanczos)
- Pipeline integrado con **Sharp**:
  - Redimensionamiento proporcional con filtro de interpolación de alta calidad `Lanczos-3` a un máximo de 1000px.
  - Conversión a formato moderno **WebP** (calidad 82), reduciendo entre **80% y 95%** el peso en KB sin pérdida perceptible de nitidez visual.
  - Sube los assets optimizados al bucket `marcos-imagenes` de Supabase Storage.
  - Reutilización inteligente de caché: si el producto ya cuenta con una imagen WebP previamente subida en Supabase, reutiliza la URL pública evitando descargas y subidas redundantes.

### 4. Gated Pricing B2B y Sincronización Transaccional en Supabase
- Calcula el costo puesto en Chile (CIF + Arancel Ad Valorem 6% + Despacho local $2.500 CLP).
- Aplica los tramos comerciales escalonados de OptiHub B2B para calcular el **Precio Neto CLP** (redondeado a múltiplos de 1.000 CLP) y el **IVA (19%)** para obtener el **Precio Bruto CLP**.
- Sincroniza mediante `upsert` masivo e idempotente en lotes en la tabla `marcos` (`onConflict: 'id_ext'`).
- Concilia el inventario descontinuado (`syncOutOfStock`), asignando `stock = 0` a productos que ya no figuran en el catálogo del proveedor.

---

## 🚀 Uso y Comandos

### Instalación y Compilación

```bash
cd backend/scraper

# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar suite de pruebas unitarias (Precios, Interceptor y Sharp WebP)
npm test
```

### Ejecución del Scraper

```bash
# Iniciar scraper con parámetros por defecto (Marca Guess, modo visible si requiere login)
npm start

# Iniciar para marcas específicas con límite de páginas y stock mínimo
npx tsx src/index.ts --brand "Guess,Nike,Lacoste" --pages 25 --min-stock 5

# Modo Simulación / Dry-Run (sin escribir en la base de datos)
npx tsx src/index.ts --brand "Guess" --dry-run
```

### Opciones de Línea de Comandos (CLI Flags)

| Flag | Alias | Descripción | Por defecto |
|---|---|---|---|
| `--brand` | `-b` | Nombres de marca separados por coma | `Guess` |
| `--headless` | | Ejecución en segundo plano (si la sesión está activa) | `false` |
| `--pages` | `-p` | Máximo de páginas a procesar por marca | `60` |
| `--min-stock`| `-s` | Stock mínimo para ingesta (<= se omite) | `5` |
| `--dry-run` | | Ejecuta sin escribir en la base de datos | `false` |
| `--state` | | Ruta al archivo de almacenamiento de sesión | `auth_state.json` |

---

## 📁 Arquitectura del Código

```
backend/scraper/
├── src/
│   ├── config/             # Configuración y variables de entorno (.env)
│   ├── services/
│   │   ├── auth.ts         # Manejo de reCAPTCHA, modo visible y auth_state.json
│   │   ├── catalog.ts      # Extracción DOM de tarjetas y paginación
│   │   ├── imageOptimizer.ts # Compresión de imágenes WebP con Sharp & Lanczos-3
│   │   ├── interceptor.ts  # Interceptor de respuestas de red JSON (XHR/Fetch)
│   │   ├── pricing.ts      # Motor de precios B2B Chile, CIF, Arancel e IVA
│   │   └── supabase.ts     # Batch upsert transaccional y Storage bucket upload
│   ├── types/              # Tipos TypeScript para productos y esquemas
│   ├── utils/              # Logger estructurado y backoff exponencial (withRetry)
│   └── index.ts            # Punto de entrada orquestador CLI
├── test/
│   ├── pricing.test.ts     # Pruebas de Gated Pricing e IVA
│   ├── interceptor.test.ts # Pruebas de intercepción y normalización JSON
│   └── imageOptimizer.test.ts # Pruebas de compresión WebP con Sharp
├── package.json
└── tsconfig.json
```
