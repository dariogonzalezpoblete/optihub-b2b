# OptiHub Provider Catalog Scraper (v2.0)

Scraper de alta velocidad y resiliente para el catálogo del proveedor en Miami (NYWD), desarrollado en **Node.js**, **TypeScript** y **Playwright**.

---

## ⚡ Características Principales

1. **Persistencia de Sesión (`auth_state.json`)**:
   - Reutiliza cookies y estado de autenticación (localStorage y tokens) mediante `BrowserContext.storageState`.
   - Evita realizar el proceso de login completo en cada ejecución.
   - Si la sesión expira o es invalidada por el proveedor, ejecuta el flujo de re-autenticación automáticamente una sola vez y actualiza el archivo `auth_state.json`.

2. **Intercepción de Red (API Interception / Zero-DOM Parsing)**:
   - Utiliza listeners de red asíncronos de Playwright (`page.on('response', ...)`) para escuchar e interceptar las respuestas JSON de las peticiones XHR/Fetch internas emitidas por la plataforma del proveedor.
   - Extrae directamente los modelos, marcas, colores, stock, UPC e imágenes desde los datos estructurados en formato JSON, logrando una velocidad superior al scraping visual del DOM.

3. **Motor de Precios Gated B2B (Chile + IVA 19%)**:
   - Aplica la estructura comercial de OptiHub durante la ingesta:
     - Costo CIF Chile: `(price_usd + flete_usd) * dolar`
     - Arancel Ad Valorem (6%)
     - Flete despacho local
     - Tramos comerciales de margen escalonado B2B
     - Cálculo de Precio Neto B2B (redondeado a múltiplos de 1.000 CLP)
     - Cálculo de IVA (19%) y Precio Bruto final.

4. **Resiliencia, Logging y Sync con Supabase**:
   - Reintentos automáticos con retroceso exponencial (`withRetry`).
   - Logging estructurado con timestamps y métricas detalladas en consola.
   - Upsert por lotes (batch upsert idempotente en la tabla `marcos` con clave de conflicto `id_ext`).
   - Reconciliación de inventario (`syncOutOfStock`): marca con `stock = 0` variantes descontinuadas en el proveedor.

---

## 🚀 Uso y Ejecución

### Prerrequisitos
Asegúrate de tener configurado tu archivo `.env` en la raíz o en `backend/scraper/.env` con:
```env
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DOLAR_CLP=950.0
# Opcional para auto-login:
PROVIDER_USERNAME=tu_usuario
PROVIDER_PASSWORD=tu_password
```

### Comandos de Ejecución

```bash
# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar tests unitarios (Precios e Interceptor)
npm test

# Ejecutar el scraper con valores por defecto (marca Guess)
npm start

# Ejecutar para marcas específicas con opciones personalizadas
npx tsx src/index.ts --brand "Guess,Nike,Lacoste" --pages 20 --min-stock 5

# Modo simulación (Dry Run sin modificar Supabase)
npx tsx src/index.ts --brand "Guess" --dry-run
```

### Argumentos de Línea de Comandos (CLI Flags)

| Flag | Alias | Descripción | Por defecto |
|---|---|---|---|
| `--brand` | `-b` | Lista de marcas separadas por coma | `Guess` |
| `--headless` | | Ejecutar el navegador en segundo plano | `false` |
| `--pages` | `-p` | Límite máximo de páginas a procesar | `60` |
| `--min-stock`| `-s` | Stock mínimo requerido para ingesta | `5` |
| `--dry-run` | | Ejecuta sin escribir en la base de datos | `false` |
| `--state` | | Ruta al archivo de sesión | `auth_state.json` |

---

## 📁 Estructura del Proyecto

```
backend/scraper/
├── src/
│   ├── config/             # Configuración centralizada y lectura de .env
│   ├── services/
│   │   ├── auth.ts         # Manejo de Storage State y re-autenticación
│   │   ├── catalog.ts      # Coordinador de navegación y paginación
│   │   ├── interceptor.ts  # Intercepción de respuestas XHR/Fetch y parsing JSON
│   │   ├── pricing.ts      # Motor de cálculo comercial Gated B2B e IVA
│   │   └── supabase.ts     # Ingesta por lotes y conciliación de inventario
│   ├── types/              # Definiciones TypeScript de datos y productos
│   ├── utils/              # Logger estructurado y retry handler
│   └── index.ts            # Entrypoint y orquestador CLI
├── test/
│   ├── pricing.test.ts     # Tests unitarios del motor de precios
│   └── interceptor.test.ts # Tests unitarios de parsing de API payloads
├── package.json
└── tsconfig.json
```
