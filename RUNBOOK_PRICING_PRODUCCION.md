# Runbook de Ejecución en Producción: Pricing v2 (Supabase SQL Editor)

Este documento detalla el procedimiento exacto paso a paso para ejecutar las migraciones de pricing en el **SQL Editor** del dashboard de Supabase de Producción.

---

## Procedimiento General y Reglas de Seguridad
1. **Transaccionalidad**: Cada script está encapsulado en un bloque `BEGIN; ... COMMIT;`. Si ocurre cualquier error, PostgreSQL hace rollback automático y no persiste ningún cambio corrupto.
2. **Modo Seguro**: La migración 017 instala estructuras, funciones, backup y el trigger en modo **inactivo (`trigger_enabled = false`)**. NO modifica precios ni altera el catálogo en producción.
3. **Paso 018 Separado**: La migración 018 aplica los precios y activa el trigger en una sola transacción, y cuenta con una guarda estricta que se niega a correr si `iva_confirmado_contador` no es `true`.

---

## PASO 1: Instalación de Estructuras y Backup (Migración 017)
**Archivo a ejecutar**: `supabase_migration_017_pricing_v2.sql`

### Instrucciones
1. Abre el dashboard de Supabase de Producción -> **SQL Editor** -> **New query**.
2. Pega todo el contenido de `supabase_migration_017_pricing_v2.sql`.
3. Haz clic en **Run**.

### Salida Esperada
- Mensaje: `Success. No rows returned` (o notificación `NOTIFY pgrst, 'reload schema'`).
- Código de salida: `200` o `Success`.

### Verificación Inmediata en el Editor
Ejecuta la siguiente consulta:
```sql
SELECT 
    (SELECT count(*) FROM public.marcos_backup_precios_20261104) AS backup_filas,
    (SELECT trigger_enabled FROM public.pricing_config WHERE id = 1) AS trigger_activo,
    (SELECT iva_confirmado_contador FROM public.pricing_config WHERE id = 1) AS iva_confirmado;
```
- **Resultado esperado**:
  - `backup_filas`: **2079** (exactamente igual al total de filas de `marcos`).
  - `trigger_activo`: **false**.
  - `iva_confirmado`: **false**.

### Qué hacer si algo falla
- Si arroja `PRE-CHECK FALLIDO` o `VERIFICACION FALLIDA`: El script hace rollback automáticamente. Revisa el mensaje de error y contáctame con el detalle. El catálogo sigue intacto.

---

## PASO 2: Pruebas de Aceptación Unitarias (Solo Lectura)
**Archivo a ejecutar**: `supabase_migration_017_pricing_v2_tests.sql`

### Instrucciones
1. Pega el contenido en una nueva pestaña del SQL Editor.
2. Haz clic en **Run**.

### Salida Esperada
- Pestaña **Messages / Notices**:
  ```text
  NOTICE: TODAS LAS PRUEBAS OK (filas=2079, promedio=79060, margen_min=0.1500)
  ```
- No genera errores ni altera datos.

### Qué hacer si algo difiere
- Si falla con un mensaje como `a) desvio vs cotizador > 0.2%` o `b) modelo no coincide`: La función aborta inmediatamente. No procedas al Paso 3 hasta reportarlo.

---

## PASO 3: Validación de Simulación e Idempotencia (Dry-Run)
**Archivo a ejecutar**: `supabase_migration_017_pricing_v2_compare.sql`

### Instrucciones
1. Pega el contenido de `supabase_migration_017_pricing_v2_compare.sql` y ejecútalo.
2. Revisa el resultado del **Bloque 2**:
```sql
WITH a AS (SELECT public.recalc_prices(true) AS r),
     b AS (SELECT public.recalc_prices(true) AS r)
SELECT (a.r = b.r) AS dry_runs_identicos, a.r->>'filas_que_cambian' AS filas_que_cambian
  FROM a, b;
```
### Salida Esperada
- `dry_runs_identicos`: **true**
- `filas_que_cambian`: **2079**
- El **Bloque 3** debe confirmar:
  - `trigger_enabled`: **false**
  - `filas_distintas_al_backup`: **0**

---

## PASO 4: Aplicación Definitiva y Activación del Trigger (Migración 018)
> **IMPORTANTE**: NO EJECUTAR EL PASO 4 hasta contar con la confirmación de tu contador sobre el IVA de importación y haber dado tu aprobación explícita.

**Archivo a ejecutar**: `supabase_migration_018_activate_pricing.sql`

### Subpaso 4.1: Confirmar el valor contable
Si tu contador confirma que el IVA de importación es recuperable (crédito fiscal):
```sql
UPDATE public.pricing_config 
   SET iva_confirmado_contador = true 
 WHERE id = 1;
```
*(Si indica que NO es recuperable, primero se corre: `UPDATE public.pricing_config SET iva_import_recuperable = 0, iva_confirmado_contador = true WHERE id = 1;`)*.

### Subpaso 4.2: Ejecutar la Migración 018
1. Pega el contenido de `supabase_migration_018_activate_pricing.sql` y haz clic en **Run**.
2. Esta migración ejecuta en una transacción atómica:
   - Bloqueo exclusivo de `marcos`.
   - `recalc_prices(false)` (actualiza filas y registra en `pricing_history`).
   - Activa el trigger (`trigger_enabled = true`).
   - Segunda corrida de verificación que exige **0 filas actualizadas**. Si intenta actualizar alguna fila, aborta con `EXCEPTION` y revierte **toda** la transacción.

### Salida Esperada
- Mensaje:
  ```text
  NOTICE: 018 OK: primera corrida actualizo 2079 filas; segunda 0
  ```

---

## Procedimiento de Rollback de Emergencia
Si por alguna razón necesitas revertir inmediatamente los precios al estado previo:
1. Abre `supabase_migration_017_pricing_v2_rollback.sql`.
2. Pégalo en el SQL Editor y haz clic en **Run**.
3. Restaura todas las columnas de `marcos` desde `marcos_backup_precios_20261104` y desactiva el trigger.
