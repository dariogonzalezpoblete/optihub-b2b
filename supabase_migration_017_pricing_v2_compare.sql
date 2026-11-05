-- =============================================================================
-- supabase_migration_017_pricing_v2_compare.sql   (SOLO LECTURA)
-- Paso SQL para la validación SQL-vs-Python (A3).
-- 1) Ejecutar el bloque 1 y copiar el JSON resultante a pricing_sql_output.json
-- 2) python tools/pricing_compare.py <marcos_snapshot.json> pricing_sql_output.json
-- 3) Bloque 2: idempotencia (dos corridas dry-run iguales, 0 filas que cambian
--    una vez aplicado; antes de aplicar, ambas corridas deben ser idénticas).
-- =============================================================================

-- BLOQUE 1: salida fila por fila del motor SQL
SELECT jsonb_agg(jsonb_build_object('id', id, 'precio_neto', new_neto, 'precio_bruto', new_bruto) ORDER BY id)
  FROM public.pricing_preview();

-- BLOQUE 2: idempotencia / determinismo
WITH a AS (SELECT public.recalc_prices(true) AS r),
     b AS (SELECT public.recalc_prices(true) AS r)
SELECT (a.r = b.r) AS dry_runs_identicos, a.r->>'filas_que_cambian' AS filas_que_cambian
  FROM a, b;

-- BLOQUE 3: la instalación no debe haber tocado nada
SELECT trigger_enabled FROM public.pricing_config;   -- debe ser false
SELECT count(*) AS filas_distintas_al_backup
  FROM public.marcos m JOIN public.marcos_backup_precios_20261104 b USING (id)
 WHERE (m.precio_neto_clp, m.precio_bruto_clp) IS DISTINCT FROM (b.precio_neto_clp, b.precio_bruto_clp);  -- 0 salvo syncs previos
