-- =============================================================================
-- supabase_migration_018_activate_pricing.sql
-- Aplica los precios (recalc_prices(false)) y activa el trigger en UNA transacción.
--
-- GUARDA: se niega a correr mientras pricing_config.iva_confirmado_contador sea false.
--         Ponerlo en true SOLO cuando el contador confirme iva_import_recuperable:
--             UPDATE public.pricing_config SET iva_confirmado_contador = true WHERE id = 1;
-- Si CUALQUIER verificación falla (guarda, 2da corrida con >0 filas, precios inválidos)
-- se lanza EXCEPTION: la transacción queda abortada y NO se confirma nada (rollback total;
-- el COMMIT final de una transacción abortada equivale a ROLLBACK).
-- =============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

-- 0. GUARDA (antes de tocar nada)
DO $$
DECLARE v_ok BOOLEAN; v_rec SMALLINT;
BEGIN
    SELECT iva_confirmado_contador, iva_import_recuperable INTO v_ok, v_rec
      FROM public.pricing_config WHERE id = 1;
    IF v_ok IS DISTINCT FROM true THEN
        RAISE EXCEPTION '018 BLOQUEADA: el contador aun no confirma iva_import_recuperable (valor actual = %). '
                        'Cuando confirme, ejecuta: UPDATE public.pricing_config SET iva_confirmado_contador = true WHERE id = 1;', v_rec;
    END IF;
    IF (SELECT trigger_enabled FROM public.pricing_config WHERE id = 1) THEN
        RAISE EXCEPTION '018 ABORTADA: trigger_enabled ya es true (la migracion ya se aplico?)';
    END IF;
END $$;

-- Bloquea escrituras concurrentes (sync) durante el cambio.
LOCK TABLE public.marcos IN SHARE ROW EXCLUSIVE MODE;

-- 1. Aplicar precios + 2. Activar trigger + 3. Verificaciones; todo en el mismo bloque.
DO $$
DECLARE v1 JSONB; v2 JSONB;
BEGIN
    v1 := public.recalc_prices(false);
    IF (v1->>'filas_precio_nulo_cero_neg')::int <> 0 THEN
        RAISE EXCEPTION '018 ABORTADA: % filas con precio nulo/cero/negativo', v1->>'filas_precio_nulo_cero_neg';
    END IF;
    IF (v1->>'filas_omitidas_sin_precio_usd')::int <> 0 THEN
        RAISE EXCEPTION '018 ABORTADA: % filas sin precio_usd valido (quedarian con precio viejo)', v1->>'filas_omitidas_sin_precio_usd';
    END IF;

    UPDATE public.pricing_config SET trigger_enabled = true WHERE id = 1;

    -- Idempotencia: una SEGUNDA corrida real (apply) debe actualizar exactamente 0 filas.
    v2 := public.recalc_prices(false);
    IF (v2->>'filas_actualizadas')::int <> 0 THEN
        RAISE EXCEPTION '018 ABORTADA (rollback total): la 2da corrida actualizo % filas (esperado 0)', v2->>'filas_actualizadas';
    END IF;

    RAISE NOTICE '018 OK: primera corrida actualizo % filas; segunda 0', v1->>'filas_actualizadas';
END $$;

COMMIT;

-- ROLLBACK DE PRECIOS: supabase_migration_017_pricing_v2_rollback.sql
-- Sólo desactivar el trigger (sin revertir precios):
--   UPDATE public.pricing_config SET trigger_enabled = false WHERE id = 1;
