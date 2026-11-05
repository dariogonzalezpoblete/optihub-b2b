# Estado de Implementación — Marcos de Marca B2B (OptiHub)
**Fecha de Auditoría:** 5 de Noviembre de 2026  
**Auditoría Técnica:** Arquitectura de Datos, Backend y Seguridad  
**Objetivo:** Diagnóstico integral de componentes de la plataforma previo al lanzamiento comercial y migración de pricing v2.

---

## 1. Matriz de Estado por Módulo

| Módulo / Funcionalidad | Estado | Evidencia en Código | Brecha / Qué Falta |
| :--- | :---: | :--- | :--- |
| **Registro de Ópticas y Validación RUT** | **COMPLETO** | - `frontend/lib/utils/rut.ts` (módulo 11 oficial SII).<br>- `frontend/app/registro/page.tsx` (captura RUT, Razón Social, Giro, Comuna, Teléfono). | Integrar validación automática directa contra API SII (actualmente requiere revisión manual del admin). |
| **Flujo de Aprobación B2B** | **PARCIAL** | - `frontend/app/api/admin/users/route.ts`<br>- `frontend/app/api/admin/users/[id]/route.ts` (acciones approve/reject/reset con notificación por correo `sendOpticaApprovedEmail`). | **Hallazgo B2:** Aprobación residía en `user_metadata` y permisos SELECT directos de `authenticated` en `marcos`. Se preparó Migración 019 para aislar en `profiles.is_approved` con trigger anti auto-aprobación. |
| **Visibilidad de Precios y Stock** | **PARCIAL** | - UI: Gating visual implementado en `frontend/lib/catalog/types.ts` y `/api/catalog/pricing`.<br>- Vistas DB: `v_marcos_catalogo_publico` y `v_marcos_catalogo_b2b`. | Aplicar Migración 019 en staging para revocar SELECT directo en columnas de precio de `marcos` y blindar la vista B2B con `is_b2b_approved()`. |
| **Carrito y Persistencia** | **COMPLETO** | - `frontend/lib/cartService.ts`<br>- `frontend/store/useCartStore.ts`<br>- RPC `sync_cart` en Postgres con control de concurrencia OCC y mitigación de sobreescritura. | Ajustar queries de lectura en `cartService.ts` a `v_marcos_catalogo_b2b` una vez aprobada la migración 019. |
| **Mínimo de Compra (MOQ 10 uds)** | **COMPLETO** | - Frontend: `frontend/store/useCartStore.ts` y botón checkout bloqueado si < 10.<br>- **Servidor:** `frontend/app/api/mercadopago/create-preference/route.ts:142-145` (rechaza con 400 si `totalQuantity < 10`). | Cumplido en frontend y servidor. Ningún atacante puede generar preferencia de pago con < 10 unidades. |
| **Mercado Pago: Cálculo en Servidor** | **COMPLETO** | - `frontend/app/api/mercadopago/create-preference/route.ts:160-184`<br>- Recalcula `subtotalNet` desde DB con service role.<br>- `taxAmount = Math.round(subtotalNet * 0.19)`. | No usa precios del cliente ni `precio_bruto_clp` para liquidar montos. |
| **Mercado Pago: Webhook e Idempotencia** | **COMPLETO** | - `frontend/lib/payments/mercadopagoWebhookHandler.ts`<br>- Valida firma HMAC `x-signature` y `x-request-id`.<br>- Consulta pago a la API de MP (`https://api.mercadopago.com/v1/payments/${paymentId}`).<br>- Valida que `transaction_amount === order.total_amount`.<br>- Idempotencia atómica en DB vía tabla `processed_webhooks`. | Migración 014 instalada y probada en producción. |
| **Mercado Pago: Manejo de Estados** | **COMPLETO** | - Soporta `approved`, `pending`, `rejected`, `refunded`, `charged_back`.<br>- Transición a `requires_attention` si el descuento de stock falla tras pago aprobado. | Parametrizar tiempo de expiración de preferencias (actualmente default MP). |
| **Pedidos y "Mis Pedidos"** | **COMPLETO** | - `frontend/app/perfil/page.tsx`<br>- Tablas `orders` y `order_items` con RLS estricto (`auth.uid() = user_id`). | Mejorar visualización del desglose de IVA y tracking de courier en la interfaz del cliente. |
| **Notificaciones por Email** | **COMPLETO** | - `frontend/lib/email.ts` con Resend API.<br>- Plantillas para: Bienvenida, Aprobación B2B, Confirmación de Pedido con desglose de factura, Notificación Admin. | Confirmar dominio verificado en cuenta productiva de Resend. |
| **Panel Admin** | **COMPLETO** | - `frontend/app/admin/page.tsx` (gestión de ópticas, aprobación con un clic, métricas).<br>- `frontend/app/admin/sync/page.tsx` (monitoreo de sincronización de catálogo). | Gating por rol admin en DB vía `isUserAdmin` (lista de correos autorizados). |
| **Sincronización con Proveedor (NYWD)** | **COMPLETO** | - `backend/scraper/src/fastSync.ts` (modo headless y turbo).<br>- Interceptores de red Playwright para API interna de NYWD.<br>- Cap de stock en 50 y sanitización de SKUs. | Actualizar escritores a Pricing v2 (A5) tras activación de migración 018. |
| **Facturación Electrónica SII** | **NO EXISTE** | - Se emite resumen con IVA y RUT/Razón Social para emisión manual. | No hay integración directa vía API (ej. LibreDTE, OpenFactura, Bsale) para generación automática de factura electrónica exenta/afecta. |
| **Despachos y Direcciones** | **PARCIAL** | - Se captura dirección, comuna y región en `profiles` y `orders`.<br>- `shipping_amount = 0` (DDP nacionalizado incluido en precio de armazón). | No hay integración directa vía API con couriers chilenos (Starken, Blue Express, Chilexpress) para generación automática de OT (orden de transporte). |
| **Descuentos por Volumen / Cliente** | **NO EXISTE** | - Precios fijos por tabla de tramos FOB (`pricing_tiers`). | No existe lógica de cupones, descuentos escalonados por volumen (>50 uds) ni lista de precios diferenciada por cliente. |
| **Carga por CSV / Repetir Pedido** | **NO EXISTE** | - El cliente debe agregar productos individualmente desde el catálogo. | Falta botón "Repetir Pedido" en historial y cargador masivo de SKUs por CSV para compras recurrentes de ópticas. |
| **Buscador por Código de Modelo** | **COMPLETO** | - `frontend/components/catalog/PredictiveSearch.tsx`<br>- `frontend/app/api/catalog/search/route.ts`<br>- Coincidencia por `modelo`, `marca`, `id_ext` y `color`. | Funciona con respuesta instantánea. |
| **Páginas Legales y Aceptación** | **COMPLETO** | - `frontend/app/terminos-y-condiciones/page.tsx`<br>- `frontend/app/politica-de-privacidad/page.tsx`<br>- `frontend/app/politicas-importacion-y-garantia/page.tsx`<br>- Checkbox obligatorio en registro y checkout. | Registrar timestamp y versión de términos aceptados en la fila del pedido (`orders.terms_accepted_at`). |
| **Observabilidad y Backups** | **COMPLETO** | - Snapshots locales versionados (`marcos_snapshot.json`, `marcos_full_snapshot.json`).<br>- Backup en base de datos: `marcos_backup_precios_20261104`.<br>- Tablas de auditoría: `pricing_history`, `processed_webhooks`, `inventory_movements`, `order_email_outbox`. | Configurar exportación periódica automatizada (cron) a bucket S3 / Supabase Storage. |

---

## 2. Variables de Entorno Requeridas (Nombres sin valores)

### Frontend (Next.js / Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `ADMIN_EMAIL`
- `ADMIN_EMAILS`

### Backend / Scraper (Playwright / TS)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (para staging / migraciones directas)
- `NYWD_USERNAME`
- `NYWD_PASSWORD`
- `SCRAPER_HEADLESS`

---

## 3. Riesgos Críticos Antes de Producción

1. **Gating de Precios Mayoristas (Hallazgo B2):**  
   Si se lanza sin la Migración 019, cualquier usuario registrado puede leer precios netos y stock real mediante llamadas directas a la API de Supabase, anulando la exclusividad B2B para ópticas validadas.
2. **IVA de Importación (Pricing v2):**  
   La migración 018 requiere la confirmación contable del factor de recuperación de IVA de importación (`iva_import_recuperable = 1`). Si el contador no valida este crédito fiscal, el margen neto proyectado podría verse afectado.
3. **Facturación Manual:**  
   Al no haber conexión con un facturador electrónico (DTE), cada compra pagada en Mercado Pago requerirá que el equipo administrativo emita manualmente la factura en el portal del SII utilizando los datos de `orders`.
4. **Reconciliación de Stock con Proveedor:**  
   NYWD no provee webhook de stock en vivo. El scraper sincroniza periódicamente. Existe una ventana de riesgo de quiebre de stock en origen entre la compra del cliente y la consolidación en Miami.

---

## 4. Lo que NO se debe Reconstruir

- **Motor de Pagos y Webhook de Mercado Pago:** Está impecablemente blindado con verificación HMAC, consulta cruzada a la API de MP, idempotencia estricta por `payment_id` y aislamiento ante pagos sobre órdenes reemplazadas/canceladas.
- **Motor de Normalización y Filtros del Catálogo:** La lógica de normalización de marcas, calibres y filtros de `frontend/lib/catalog/normalize.ts` es sólida, tolerante a fallas y está integrada con SSR y facetas.
- **RPCs Transaccionales de Carrito e Inventario:** `sync_cart`, `process_b2b_checkout` y `decrement_stock_for_order` garantizan consistencia ACID sin condiciones de carrera.

---

## 5. Dudas Estratégicas que Solo el Negocio Puede Responder

1. **¿Confirmó el contador el IVA de importación recuperable al 100% (crédito fiscal)?** Esto destraba la ejecución de la Migración 018.
2. **¿Se integrará un sistema DTE automático (ej. LibreDTE / OpenFactura / Bsale) o la facturación será 100% manual en el portal del SII durante la primera etapa?**
3. **¿Cuál es la política formal de quiebre de stock en origen si NYWD agota un SKU entre la compra en Chile y el empaque en Miami? (¿Reembolso inmediato vía Mercado Pago o reemplazo por modelo equivalente a elección de la óptica?)**
4. **¿Cuál es el margen de negociación para compras superiores a 50 unidades (descuento por volumen personalizado o fuera de plataforma)?**
