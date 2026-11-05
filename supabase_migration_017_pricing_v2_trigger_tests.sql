-- =============================================================================
-- supabase_migration_017_pricing_v2_trigger_tests.sql
-- SOLO STAGING. Pruebas del trigger zz_marcos_pricing. Todo se deshace al final
-- (sub-transacción con excepción controlada), pero NO ejecutar en producción.
-- Verifica:
--   1) trigger desactivado => no toca nada
--   2) trigger activo: cambio de precio_usd => 1 sola fila de historial y precio = motor
--   3) escritor legacy que manda precio viejo => se sobrescribe con el motor (sin precio_usd)
--   4) recalc_prices(false) con trigger activo => SIN historial duplicado y sin recursión
--      (2da corrida = 0 filas, 0 historial)
--   5) precio_usd NULL o <= 0 => precios intactos + evento registrado en pricing_history
-- =============================================================================
DO $$
DECLARE
    v_id BIGINT; v_cfg public.pricing_config; r public.pricing_result;
    v_neto0 BIGINT; v_h0 BIGINT; v_h1 BIGINT; v_res JSONB; v_neto BIGINT; v_usd NUMERIC;
BEGIN
  BEGIN  -- sub-transacción: se revierte siempre
    SELECT id, precio_usd::numeric INTO v_id, v_usd FROM public.marcos WHERE precio_usd > 0 ORDER BY id LIMIT 1;
    SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;

    -- 1) Desactivado
    UPDATE public.pricing_config SET trigger_enabled = false WHERE id = 1;
    SELECT precio_neto_clp INTO v_neto0 FROM public.marcos WHERE id = v_id;
    UPDATE public.marcos SET precio_neto_clp = 1 WHERE id = v_id;
    SELECT precio_neto_clp INTO v_neto FROM public.marcos WHERE id = v_id;
    IF v_neto <> 1 THEN RAISE EXCEPTION 'T1 FALLO: trigger desactivado modifico precio (%)', v_neto; END IF;
    UPDATE public.marcos SET precio_neto_clp = v_neto0 WHERE id = v_id;

    -- 2) Activo + cambio de precio_usd
    UPDATE public.pricing_config SET trigger_enabled = true WHERE id = 1;
    SELECT count(*) INTO v_h0 FROM public.pricing_history WHERE marcos_id = v_id;
    UPDATE public.marcos SET precio_usd = v_usd + 10 WHERE id = v_id;
    SELECT count(*) INTO v_h1 FROM public.pricing_history WHERE marcos_id = v_id;
    IF v_h1 - v_h0 <> 1 THEN RAISE EXCEPTION 'T2 FALLO: historial +% (esperado 1)', v_h1 - v_h0; END IF;
    r := public.pricing_calc(v_usd + 10, v_cfg);
    SELECT precio_neto_clp INTO v_neto FROM public.marcos WHERE id = v_id;
    IF v_neto <> r.precio_neto::bigint THEN RAISE EXCEPTION 'T2 FALLO: precio % <> motor %', v_neto, r.precio_neto; END IF;

    -- 3) Escritor legacy sin precio_usd
    UPDATE public.marcos SET precio_neto_clp = 12345, precio_bruto_clp = 14691 WHERE id = v_id;
    SELECT precio_neto_clp INTO v_neto FROM public.marcos WHERE id = v_id;
    IF v_neto <> r.precio_neto::bigint THEN RAISE EXCEPTION 'T3 FALLO: escritor legacy logro fijar precio (%)', v_neto; END IF;

    -- 4) recalc_prices(false) con trigger activo: sin duplicados ni recursión
    SELECT count(*) INTO v_h0 FROM public.pricing_history WHERE marcos_id = v_id;
    UPDATE public.marcos SET precio_usd = v_usd WHERE id = v_id;                      -- 1 evento por el trigger
    SELECT count(*) INTO v_h1 FROM public.pricing_history WHERE marcos_id = v_id;
    IF v_h1 - v_h0 <> 1 THEN RAISE EXCEPTION 'T4a FALLO: historial +% (esperado 1)', v_h1 - v_h0; END IF;
    UPDATE public.marcos SET precio_neto_clp = precio_neto_clp + 700, precio_usd = precio_usd WHERE id = v_id; -- desvia a mano
    -- (el trigger ya lo corrige; forzamos desvio con bypass para probar recalc)
    PERFORM set_config('pricing.bypass', 'on', true);
    UPDATE public.marcos SET precio_neto_clp = 99900 WHERE id = v_id;
    PERFORM set_config('pricing.bypass', 'off', true);
    SELECT count(*) INTO v_h0 FROM public.pricing_history WHERE marcos_id = v_id;
    v_res := public.recalc_prices(false, ARRAY[v_id]);
    SELECT count(*) INTO v_h1 FROM public.pricing_history WHERE marcos_id = v_id;
    IF (v_res->>'filas_actualizadas')::int <> 1 OR v_h1 - v_h0 <> 1 THEN
        RAISE EXCEPTION 'T4b FALLO: recalc actualizo % filas y historial +% (esperado 1 y 1: sin duplicado)', v_res->>'filas_actualizadas', v_h1 - v_h0;
    END IF;
    v_res := public.recalc_prices(false, ARRAY[v_id]);
    SELECT count(*) INTO v_h0 FROM public.pricing_history WHERE marcos_id = v_id;
    IF (v_res->>'filas_actualizadas')::int <> 0 OR v_h0 <> v_h1 THEN
        RAISE EXCEPTION 'T4c FALLO: 2da corrida no idempotente (filas=%)', v_res->>'filas_actualizadas';
    END IF;
    IF current_setting('pricing.bypass', true) = 'on' THEN RAISE EXCEPTION 'T4d FALLO: bypass quedo activo'; END IF;

    -- 5) precio_usd inválido: precios intactos + evento
    SELECT precio_neto_clp INTO v_neto0 FROM public.marcos WHERE id = v_id;
    SELECT count(*) INTO v_h0 FROM public.pricing_history WHERE marcos_id = v_id;
    UPDATE public.marcos SET precio_usd = 0, precio_neto_clp = 777, precio_bruto_clp = 888 WHERE id = v_id;
    SELECT precio_neto_clp INTO v_neto FROM public.marcos WHERE id = v_id;
    SELECT count(*) INTO v_h1 FROM public.pricing_history WHERE marcos_id = v_id AND motivo LIKE '%invalido%';
    IF v_neto <> v_neto0 THEN RAISE EXCEPTION 'T5a FALLO: precio cambio con usd=0 (% -> %)', v_neto0, v_neto; END IF;
    IF v_h1 < 1 THEN RAISE EXCEPTION 'T5b FALLO: no se registro el evento de precio_usd invalido'; END IF;
    UPDATE public.marcos SET precio_usd = NULL, precio_neto_clp = 777 WHERE id = v_id;
    SELECT precio_neto_clp INTO v_neto FROM public.marcos WHERE id = v_id;
    IF v_neto <> v_neto0 THEN RAISE EXCEPTION 'T5c FALLO: precio cambio con usd NULL'; END IF;

    RAISE EXCEPTION 'TRIGGER_TESTS_OK';   -- fuerza el rollback de todo lo anterior
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TRIGGER_TESTS_OK' THEN
        RAISE NOTICE 'TODAS LAS PRUEBAS DE TRIGGER OK (cambios revertidos)';
    ELSE
        RAISE;
    END IF;
  END;
END $$;
