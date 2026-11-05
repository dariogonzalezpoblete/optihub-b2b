-- =============================================================================
-- supabase_migration_017_pricing_v2_rollback.sql
-- Revierte supabase_migration_017_pricing_v2.sql
--  1. Quita el trigger (para que nada recalcule durante el rollback).
--  2. Restaura las columnas legacy de precio/costo desde
--     public.marcos_backup_precios_20261104.
--  3. Limpia las columnas nuevas de marcos (quedan en NULL).
--  4. Elimina funciones y tipo.
-- Por seguridad NO elimina tablas ni columnas nuevas (pricing_config, pricing_tiers,
-- pricing_history, backup, columnas nuevas): ver bloque opcional al final.
-- Filas creadas después del backup (ids que no están en el backup) conservan su precio actual.
-- =============================================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF to_regclass('public.marcos_backup_precios_20261104') IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK ABORTADO: no existe marcos_backup_precios_20261104';
    END IF;
END $$;

DROP TRIGGER IF EXISTS zz_marcos_pricing ON public.marcos;

UPDATE public.marcos m
   SET precio_neto_clp          = b.precio_neto_clp,
       precio_bruto_clp         = b.precio_bruto_clp,
       ganancia_clp             = b.ganancia_clp,
       costo_flete_usd          = b.costo_flete_usd,
       costo_cif_clp            = b.costo_cif_clp,
       ad_valorem_clp           = b.ad_valorem_clp,
       costo_total_chile_clp    = b.costo_total_chile_clp,
       costo_despacho_local_clp = b.costo_despacho_local_clp
  FROM public.marcos_backup_precios_20261104 b
 WHERE m.id = b.id;

UPDATE public.marcos
   SET costo_neto_clp = NULL, iva_import_clp = NULL, margen_objetivo = NULL,
       precio_calculado_at = NULL, pricing_version = NULL;

DROP FUNCTION IF EXISTS public.recalc_prices(BOOLEAN, BIGINT[]);
DROP FUNCTION IF EXISTS public.pricing_preview(BIGINT[]);
DROP FUNCTION IF EXISTS public.marcos_apply_pricing();
DROP FUNCTION IF EXISTS public.pricing_calc(NUMERIC, public.pricing_config);
DROP TRIGGER  IF EXISTS trg_pricing_config_bump_version ON public.pricing_config;
DROP FUNCTION IF EXISTS public.pricing_config_bump_version();
DROP TYPE     IF EXISTS public.pricing_result;

-- Verificación: precios restaurados idénticos al backup
DO $$
DECLARE v_diff BIGINT;
BEGIN
    SELECT count(*) INTO v_diff
      FROM public.marcos m JOIN public.marcos_backup_precios_20261104 b USING (id)
     WHERE (m.precio_neto_clp, m.precio_bruto_clp, m.ganancia_clp, m.costo_flete_usd, m.costo_cif_clp,
            m.ad_valorem_clp, m.costo_total_chile_clp, m.costo_despacho_local_clp)
           IS DISTINCT FROM
           (b.precio_neto_clp, b.precio_bruto_clp, b.ganancia_clp, b.costo_flete_usd, b.costo_cif_clp,
            b.ad_valorem_clp, b.costo_total_chile_clp, b.costo_despacho_local_clp);
    IF v_diff <> 0 THEN
        RAISE EXCEPTION 'ROLLBACK FALLIDO: % filas difieren del backup', v_diff;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- -----------------------------------------------------------------------------
-- OPCIONAL (destructivo, ejecutar sólo manualmente tras confirmar el rollback):
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.marcos DROP COLUMN costo_neto_clp, DROP COLUMN iva_import_clp,
--     DROP COLUMN margen_objetivo, DROP COLUMN precio_calculado_at, DROP COLUMN pricing_version;
-- DROP TABLE public.pricing_history, public.pricing_tiers, public.pricing_config;
-- (conservar marcos_backup_precios_20261104 hasta estar 100% seguro)
