-- =============================================================================
-- supabase_migration_017_pricing_v2_tests.sql
-- Pruebas de aceptación. NO escriben datos (sólo lectura / cálculo). Ejecutar
-- DESPUÉS de instalar la migración 017 y ANTES de recalc_prices(false).
-- Cualquier fallo lanza EXCEPTION.
-- =============================================================================
DO $$
DECLARE
    c  public.pricing_config;
    r  public.pricing_result;
    v_avg NUMERIC; v_bad BIGINT; v_min NUMERIC; v_n BIGINT;
    rec RECORD;
BEGIN
    -- a) Calibración 2eBox: FOB 169, 1.7 kg (bulto de 1 unidad), fx 950 sin buffer
    SELECT * INTO c FROM public.pricing_config WHERE id = 1;
    c.fx_buffer := 0; c.bulto_unidades := 1;          -- bulto_kg queda 1.7
    r := public.pricing_calc(169, c);
    IF abs(r.base_imp - 184734) > 5 THEN RAISE EXCEPTION 'a) base_imp=% (esperado ~184734)', r.base_imp; END IF;
    IF abs((r.arancel_clp + r.iva_import) - 48290) > 10 THEN RAISE EXCEPTION 'a) arancel+iva=%', r.arancel_clp + r.iva_import; END IF;
    IF abs((r.arancel_clp + r.iva_import) - 48222) / 48222 > 0.002 THEN RAISE EXCEPTION 'a) desvio vs cotizador > 0.2%%'; END IF;

    -- b) Productos de referencia
    FOR rec IN
        SELECT * FROM (VALUES
            ('GU 9092', 23400, 27800), ('GU2538', 43500, 51800),
            ('FT5829-B', 128800, 153300), ('GG1772S', 375600, 447000)) v(modelo, neto, bruto)
    LOOP
        PERFORM 1 FROM public.pricing_preview() p
          WHERE p.modelo = rec.modelo AND p.new_neto = rec.neto AND p.new_bruto = rec.bruto;
        IF NOT FOUND THEN RAISE EXCEPTION 'b) % no coincide con %/%', rec.modelo, rec.neto, rec.bruto; END IF;
    END LOOP;

    SELECT avg(new_neto) INTO v_avg FROM public.pricing_preview();
    IF abs(v_avg - 79060) > 5 THEN RAISE EXCEPTION 'b) promedio neto=% (esperado ~79060)', v_avg; END IF;

    -- c) Sin nulos/ceros/negativos; margen real >= 14%; todas las filas cubiertas
    SELECT count(*), count(*) FILTER (WHERE new_neto IS NULL OR new_neto <= 0), min(margen_real)
      INTO v_n, v_bad, v_min FROM public.pricing_preview();
    IF v_bad > 0 THEN RAISE EXCEPTION 'c) % filas con precio nulo/<=0', v_bad; END IF;
    IF v_min < 0.14 THEN RAISE EXCEPTION 'c) margen real minimo=%', v_min; END IF;
    IF v_n <> (SELECT count(*) FROM public.marcos) THEN
        RAISE EXCEPTION 'c) % filas calculadas vs % en marcos (hay precio_usd nulo/0)', v_n, (SELECT count(*) FROM public.marcos);
    END IF;

    RAISE NOTICE 'TODAS LAS PRUEBAS OK (filas=%, promedio=%, margen_min=%)', v_n, round(v_avg), round(v_min, 4);
END $$;
