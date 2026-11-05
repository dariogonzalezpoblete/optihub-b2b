-- =============================================================================
-- supabase_migration_017_pricing_v2.sql
-- -----------------------------------------------------------------------------
-- PRICING V2: precios por peso/logística real, IVA de importación como crédito
-- fiscal, márgenes por tramo FOB. Rollback: supabase_migration_017_pricing_v2_rollback.sql
--
-- IMPORTANTE: esta migración SÓLO instala estructuras y la función. NO modifica
-- precios existentes. Los precios se recalculan después, y únicamente tras
-- aprobar el dry_run, con:
--     SELECT public.recalc_prices(true);    -- simulación (no escribe en marcos)
--     SELECT public.recalc_prices(false);   -- aplica + registra pricing_history
--
-- Seguridad: ninguna tabla/columna/función nueva es accesible por anon ni
-- authenticated (sin GRANT, RLS activado sin políticas). Las columnas nuevas de
-- public.marcos heredan el modelo de ACL por columna de la migración 016
-- (anon/authenticated sólo ven la lista blanca), así que NO quedan expuestas.
-- Todo el cálculo monetario usa numeric (nunca float).
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- 0. PRE-CHECK
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_missing TEXT;
BEGIN
    SELECT string_agg(c, ', ') INTO v_missing
      FROM unnest(ARRAY['id','id_ext','marca','modelo','precio_usd','precio_neto_clp','precio_bruto_clp',
                        'ganancia_clp','costo_flete_usd','costo_cif_clp','ad_valorem_clp',
                        'costo_total_chile_clp','costo_despacho_local_clp']) AS c
     WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = 'public.marcos'::regclass
                          AND a.attname = c AND a.attnum > 0 AND NOT a.attisdropped);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'PRE-CHECK FALLIDO: faltan columnas en public.marcos: [%]', v_missing;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. BACKUP LÓGICO (se crea una sola vez; si ya existe NO se sobreescribe)
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_src BIGINT; v_bak BIGINT;
BEGIN
    IF to_regclass('public.marcos_backup_precios_20261104') IS NULL THEN
        CREATE TABLE public.marcos_backup_precios_20261104 AS
        SELECT id, precio_neto_clp, precio_bruto_clp, ganancia_clp, costo_flete_usd,
               costo_cif_clp, ad_valorem_clp, costo_total_chile_clp, costo_despacho_local_clp
          FROM public.marcos;
        ALTER TABLE public.marcos_backup_precios_20261104 ADD PRIMARY KEY (id);

        SELECT count(*) INTO v_src FROM public.marcos;
        SELECT count(*) INTO v_bak FROM public.marcos_backup_precios_20261104;
        IF v_src <> v_bak OR v_bak = 0 THEN
            RAISE EXCEPTION 'BACKUP INCONSISTENTE: marcos=% backup=%', v_src, v_bak;
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. TABLAS DE PARÁMETROS, TRAMOS E HISTORIAL
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_config (
    id                              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- una sola fila
    fx_ref                          NUMERIC NOT NULL CHECK (fx_ref > 0),             -- CLP por USD
    fx_buffer                       NUMERIC NOT NULL CHECK (fx_buffer >= 0),
    iva                             NUMERIC NOT NULL CHECK (iva >= 0),
    arancel                         NUMERIC NOT NULL CHECK (arancel >= 0),
    bulto_unidades                  NUMERIC NOT NULL CHECK (bulto_unidades > 0),
    bulto_kg                        NUMERIC NOT NULL CHECK (bulto_kg > 0),
    tarifa_flete_int_bulto_clp      NUMERIC NOT NULL CHECK (tarifa_flete_int_bulto_clp >= 0),
    servicio_logistico_bulto_clp    NUMERIC NOT NULL CHECK (servicio_logistico_bulto_clp >= 0),
    transporte_nacional_bulto_clp   NUMERIC NOT NULL CHECK (transporte_nacional_bulto_clp >= 0),
    servicio_con_iva                SMALLINT NOT NULL CHECK (servicio_con_iva IN (0,1)),
    transporte_nacional_con_iva     SMALLINT NOT NULL CHECK (transporte_nacional_con_iva IN (0,1)),
    servicio_en_base_impuestos      SMALLINT NOT NULL CHECK (servicio_en_base_impuestos IN (0,1)),
    iva_import_recuperable          SMALLINT NOT NULL CHECK (iva_import_recuperable IN (0,1)), -- PENDIENTE contador
    qc_embalaje_clp                 NUMERIC NOT NULL CHECK (qc_embalaje_clp >= 0),
    comision_pasarela               NUMERIC NOT NULL CHECK (comision_pasarela >= 0),
    merma                           NUMERIC NOT NULL CHECK (merma >= 0),
    ganancia_min_clp                NUMERIC NOT NULL CHECK (ganancia_min_clp >= 0),
    version                         INTEGER NOT NULL DEFAULT 1,
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A1: el trigger zz_marcos_pricing NO actúa mientras sea false. Se activa en el mismo
    -- paso que recalc_prices(false) (ver supabase_migration_018_activate_pricing.sql).
    trigger_enabled                 BOOLEAN NOT NULL DEFAULT false,
    -- Poner en true SOLO cuando el contador confirme iva_import_recuperable. La migración 018 se niega a correr si es false.
    iva_confirmado_contador         BOOLEAN NOT NULL DEFAULT false
);
-- Por si la tabla ya existía de una instalación previa sin las columnas:
ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS trigger_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS iva_confirmado_contador BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.pricing_config (
    id, fx_ref, fx_buffer, iva, arancel, bulto_unidades, bulto_kg,
    tarifa_flete_int_bulto_clp, servicio_logistico_bulto_clp, transporte_nacional_bulto_clp,
    servicio_con_iva, transporte_nacional_con_iva, servicio_en_base_impuestos,
    iva_import_recuperable, qc_embalaje_clp, comision_pasarela, merma, ganancia_min_clp
) VALUES (
    1, 950, 0.02, 0.19, 0.06, 11, 1.7,
    4255, 23716, 23850,
    1, 1, 1,
    1, 0, 0.03, 0.01, 12000
) ON CONFLICT (id) DO NOTHING;

-- La versión de parámetros sube sola cada vez que se edita la configuración.
CREATE OR REPLACE FUNCTION public.pricing_config_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Cambiar sólo flags operativos (trigger_enabled / iva_confirmado_contador) NO es un cambio de parámetros de precio.
    IF (to_jsonb(NEW) - 'version' - 'updated_at' - 'trigger_enabled' - 'iva_confirmado_contador')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'version' - 'updated_at' - 'trigger_enabled' - 'iva_confirmado_contador') THEN
        NEW.version    := OLD.version + 1;
        NEW.updated_at := now();
    ELSE
        NEW.version    := OLD.version;
        NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_config_bump_version ON public.pricing_config;
CREATE TRIGGER trg_pricing_config_bump_version
    BEFORE UPDATE ON public.pricing_config
    FOR EACH ROW EXECUTE FUNCTION public.pricing_config_bump_version();

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
    desde_usd   NUMERIC PRIMARY KEY CHECK (desde_usd >= 0),
    margen      NUMERIC NOT NULL CHECK (margen > 0 AND margen < 1)
);

INSERT INTO public.pricing_tiers (desde_usd, margen) VALUES
    (0, 0.35), (25, 0.30), (60, 0.22), (120, 0.15)
ON CONFLICT (desde_usd) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pricing_history (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    marcos_id               BIGINT NOT NULL,
    id_ext                  TEXT,
    precio_neto_antes       BIGINT,
    precio_neto_despues     BIGINT,
    precio_bruto_antes      BIGINT,
    precio_bruto_despues    BIGINT,
    costo_total_antes       BIGINT,
    costo_total_despues     BIGINT,
    pricing_version         INTEGER,
    motivo                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pricing_history_marcos_fecha ON public.pricing_history (marcos_id, fecha DESC);

-- -----------------------------------------------------------------------------
-- 3. COLUMNAS NUEVAS EN marcos (no se elimina ni renombra nada)
-- -----------------------------------------------------------------------------
ALTER TABLE public.marcos
    ADD COLUMN IF NOT EXISTS costo_neto_clp      NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS iva_import_clp      NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS margen_objetivo     NUMERIC(6,4),
    ADD COLUMN IF NOT EXISTS precio_calculado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pricing_version     INTEGER;

-- -----------------------------------------------------------------------------
-- 4. MOTOR DE CÁLCULO (puro, numeric). Única fuente de la fórmula.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    CREATE TYPE public.pricing_result AS (
        fob_clp       NUMERIC,
        flete_int     NUMERIC,
        serv_neto     NUMERIC,
        base_imp      NUMERIC,
        arancel_clp   NUMERIC,
        iva_import    NUMERIC,
        transp_nac    NUMERIC,
        costo_neto    NUMERIC,
        margen        NUMERIC,
        f             NUMERIC,
        precio_neto   NUMERIC,
        precio_bruto  NUMERIC,
        ganancia      NUMERIC
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.pricing_calc(p_usd NUMERIC, p_cfg public.pricing_config)
RETURNS public.pricing_result
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    r           public.pricing_result;
    v_fx        NUMERIC;
    v_peso_kg   NUMERIC;
BEGIN
    IF p_usd IS NULL OR p_usd <= 0 THEN
        RAISE EXCEPTION 'pricing_calc: precio_usd invalido (%)', p_usd;
    END IF;

    v_fx      := p_cfg.fx_ref * (1 + p_cfg.fx_buffer);
    v_peso_kg := p_cfg.bulto_kg / p_cfg.bulto_unidades;

    r.fob_clp     := p_usd * v_fx;
    r.flete_int   := v_peso_kg * (p_cfg.tarifa_flete_int_bulto_clp / p_cfg.bulto_kg);
    r.serv_neto   := v_peso_kg * (p_cfg.servicio_logistico_bulto_clp / p_cfg.bulto_kg)
                     / (1 + p_cfg.iva * p_cfg.servicio_con_iva);
    r.base_imp    := r.fob_clp + r.flete_int + r.serv_neto * p_cfg.servicio_en_base_impuestos;
    r.arancel_clp := r.base_imp * p_cfg.arancel;
    r.iva_import  := (r.base_imp + r.arancel_clp) * p_cfg.iva;   -- crédito fiscal si recuperable
    r.transp_nac  := (p_cfg.transporte_nacional_bulto_clp / p_cfg.bulto_unidades)
                     / (1 + p_cfg.iva * p_cfg.transporte_nacional_con_iva);
    r.costo_neto  := r.fob_clp + r.flete_int + r.serv_neto + r.arancel_clp + r.transp_nac
                     + p_cfg.qc_embalaje_clp
                     + r.iva_import * (1 - p_cfg.iva_import_recuperable);
    r.f           := p_cfg.comision_pasarela * (1 + p_cfg.iva) + p_cfg.merma;

    SELECT t.margen INTO r.margen
      FROM public.pricing_tiers t
     WHERE t.desde_usd <= p_usd
     ORDER BY t.desde_usd DESC
     LIMIT 1;
    IF r.margen IS NULL THEN
        RAISE EXCEPTION 'pricing_calc: no hay tramo en pricing_tiers para USD % (falta desde_usd = 0)', p_usd;
    END IF;
    IF (1 - r.margen - r.f) <= 0 OR (1 - r.f) <= 0 THEN
        RAISE EXCEPTION 'pricing_calc: margen (%) + factor f (%) >= 1; parametros inconsistentes', r.margen, r.f;
    END IF;

    r.precio_neto  := ceil(
                        greatest(r.costo_neto / (1 - r.margen - r.f),
                                 (r.costo_neto + p_cfg.ganancia_min_clp) / (1 - r.f))
                        / 100) * 100;
    r.precio_bruto := round(r.precio_neto * (1 + p_cfg.iva), -2);
    r.ganancia     := r.precio_neto * (1 - r.f) - r.costo_neto;
    RETURN r;
END;
$$;

-- Vista previa por fila (no escribe). Usada por recalc_prices y por las pruebas.
CREATE OR REPLACE FUNCTION public.pricing_preview(p_only_ids BIGINT[] DEFAULT NULL)
RETURNS TABLE (
    id                  BIGINT,
    id_ext              TEXT,
    marca               TEXT,
    modelo              TEXT,
    precio_usd          NUMERIC,
    old_neto            BIGINT,
    old_bruto           BIGINT,
    old_costo_total     BIGINT,
    new_neto            BIGINT,
    new_bruto           BIGINT,
    new_ganancia        BIGINT,
    new_cif             BIGINT,
    new_ad_valorem      BIGINT,
    new_costo_total     BIGINT,
    costo_neto          NUMERIC,
    iva_import          NUMERIC,
    margen_objetivo     NUMERIC,
    margen_real         NUMERIC,
    var_pct             NUMERIC,
    cfg_version         INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT
        m.id,
        m.id_ext,
        m.marca,
        m.modelo,
        m.precio_usd::numeric,
        m.precio_neto_clp,
        m.precio_bruto_clp,
        m.costo_total_chile_clp,
        r.precio_neto::bigint,
        r.precio_bruto::bigint,
        round(r.ganancia)::bigint,
        round(r.fob_clp + r.flete_int)::bigint,
        round(r.arancel_clp)::bigint,
        round(r.costo_neto)::bigint,
        round(r.costo_neto, 2),
        round(r.iva_import, 2),
        r.margen,
        CASE WHEN r.precio_neto > 0 THEN r.ganancia / r.precio_neto END,
        CASE WHEN m.precio_neto_clp > 0
             THEN (r.precio_neto - m.precio_neto_clp) * 100.0 / m.precio_neto_clp END,
        c.version
    FROM public.marcos m
    CROSS JOIN public.pricing_config c
    CROSS JOIN LATERAL public.pricing_calc(m.precio_usd::numeric, c) r
    WHERE c.id = 1
      AND m.precio_usd IS NOT NULL AND m.precio_usd > 0
      AND (p_only_ids IS NULL OR m.id = ANY (p_only_ids));
$$;

-- -----------------------------------------------------------------------------
-- 5. recalc_prices(dry_run, only_ids)  -> jsonb con el resumen
--    Mapeo legacy: costo_cif_clp = fob+flete_int | ad_valorem_clp = arancel |
--    costo_total_chile_clp = costo_neto | ganancia_clp = ganancia.
--    costo_flete_usd y costo_despacho_local_clp NO se tocan.
--    Idempotente: sólo escribe filas cuyo resultado difiere; 2da corrida = 0 filas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_prices(
    dry_run  BOOLEAN  DEFAULT TRUE,
    only_ids BIGINT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cfg      public.pricing_config;
    v_summary  JSONB;
    v_changed  BIGINT := 0;
BEGIN
    SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'recalc_prices: pricing_config vacia';
    END IF;

    -- Resumen "antes -> despues" calculado ANTES de escribir (dry-run y apply comparten esto).
    WITH p AS MATERIALIZED (SELECT * FROM public.pricing_preview(only_ids))
    SELECT jsonb_build_object(
        'dry_run',                    dry_run,
        'pricing_version',            v_cfg.version,
        'iva_import_recuperable',     v_cfg.iva_import_recuperable,
        'filas_en_marcos',            (SELECT count(*) FROM public.marcos m
                                        WHERE only_ids IS NULL OR m.id = ANY (only_ids)),
        'filas_calculadas',           (SELECT count(*) FROM p),
        'filas_omitidas_sin_precio_usd',
                                      (SELECT count(*) FROM public.marcos m
                                        WHERE (only_ids IS NULL OR m.id = ANY (only_ids))
                                          AND (m.precio_usd IS NULL OR m.precio_usd <= 0)),
        'filas_que_cambian',          (SELECT count(*) FROM p WHERE p.old_neto IS DISTINCT FROM p.new_neto),
        'neto_promedio_antes',        (SELECT round(avg(old_neto), 0) FROM p),
        'neto_promedio_despues',      (SELECT round(avg(new_neto), 0) FROM p),
        'variacion_promedio_pct',     (SELECT round(avg(var_pct), 2) FROM p),
        'neto_min_antes',             (SELECT min(old_neto) FROM p),
        'neto_max_antes',             (SELECT max(old_neto) FROM p),
        'neto_min_despues',           (SELECT min(new_neto) FROM p),
        'neto_max_despues',           (SELECT max(new_neto) FROM p),
        'filas_bajan_mas_40pct',      (SELECT count(*) FROM p WHERE var_pct < -40),
        'filas_suben_mas_40pct',      (SELECT count(*) FROM p WHERE var_pct > 40),
        'filas_precio_nulo_cero_neg', (SELECT count(*) FROM p WHERE new_neto IS NULL OR new_neto <= 0),
        'margen_real_min_pct',        (SELECT round(min(margen_real) * 100, 2) FROM p),
        'por_marca',                  (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                            'marca', x.marca, 'filas', x.n,
                                            'neto_prom_antes', x.a, 'neto_prom_despues', x.d,
                                            'variacion_prom_pct', x.v) ORDER BY x.marca), '[]'::jsonb)
                                         FROM (SELECT marca, count(*) n,
                                                      round(avg(old_neto), 0) a,
                                                      round(avg(new_neto), 0) d,
                                                      round(avg(var_pct), 2) v
                                                 FROM p GROUP BY marca) x),
        'detalle_bajan_mas_40pct',    (SELECT coalesce(jsonb_agg(to_jsonb(y)), '[]'::jsonb)
                                         FROM (SELECT id, marca, modelo, precio_usd, old_neto, new_neto,
                                                      round(var_pct, 1) AS var_pct
                                                 FROM p WHERE var_pct < -40
                                                ORDER BY var_pct LIMIT 50) y),
        'detalle_suben_mas_40pct',    (SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
                                         FROM (SELECT id, marca, modelo, precio_usd, old_neto, new_neto,
                                                      round(var_pct, 1) AS var_pct
                                                 FROM p WHERE var_pct > 40
                                                ORDER BY var_pct DESC LIMIT 50) z)
    )
    INTO v_summary;

    IF dry_run THEN
        RETURN v_summary;
    END IF;

    -- APPLY: actualiza sólo filas que cambian + registra historial (misma sentencia).
    -- El trigger zz_marcos_pricing se salta esta escritura (GUC local a la transacción).
    PERFORM set_config('pricing.bypass', 'on', true);
    WITH p AS (SELECT * FROM public.pricing_preview(only_ids)),
    upd AS (
        UPDATE public.marcos m
           SET precio_neto_clp       = p.new_neto,
               precio_bruto_clp      = p.new_bruto,
               ganancia_clp          = p.new_ganancia,
               costo_cif_clp         = p.new_cif,
               ad_valorem_clp        = p.new_ad_valorem,
               costo_total_chile_clp = p.new_costo_total,
               costo_neto_clp        = p.costo_neto,
               iva_import_clp        = p.iva_import,
               margen_objetivo       = p.margen_objetivo,
               pricing_version       = p.cfg_version,
               precio_calculado_at   = now()
          FROM p
         WHERE m.id = p.id
           AND (   m.precio_neto_clp       IS DISTINCT FROM p.new_neto
                OR m.precio_bruto_clp      IS DISTINCT FROM p.new_bruto
                OR m.ganancia_clp          IS DISTINCT FROM p.new_ganancia
                OR m.costo_cif_clp         IS DISTINCT FROM p.new_cif
                OR m.ad_valorem_clp        IS DISTINCT FROM p.new_ad_valorem
                OR m.costo_total_chile_clp IS DISTINCT FROM p.new_costo_total
                OR m.costo_neto_clp        IS DISTINCT FROM p.costo_neto
                OR m.iva_import_clp        IS DISTINCT FROM p.iva_import
                OR m.margen_objetivo       IS DISTINCT FROM p.margen_objetivo
                OR m.pricing_version       IS DISTINCT FROM p.cfg_version)
        RETURNING m.id, p.id_ext, p.old_neto, p.new_neto, p.old_bruto, p.new_bruto,
                  p.old_costo_total, p.new_costo_total, p.cfg_version
    )
    INSERT INTO public.pricing_history (
        marcos_id, id_ext, precio_neto_antes, precio_neto_despues,
        precio_bruto_antes, precio_bruto_despues, costo_total_antes, costo_total_despues,
        pricing_version, motivo)
    SELECT id, id_ext, old_neto, new_neto, old_bruto, new_bruto,
           old_costo_total, new_costo_total, cfg_version, 'recalc_prices'
      FROM upd;

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    PERFORM set_config('pricing.bypass', 'off', true);

    RETURN v_summary || jsonb_build_object('aplicado', TRUE, 'filas_actualizadas', v_changed);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. TRIGGER: recalcular cuando cambia precio_usd (sync con proveedor)
--    - INACTIVO al instalar (pricing_config.trigger_enabled = false): retorna NEW sin
--      cambios. Se activa junto con recalc_prices(false) (migración 018).
--    - Se llama zz_* para ejecutarse ÚLTIMO (orden alfabético) y prevalecer sobre
--      cualquier otro trigger BEFORE.
--    - Dispara con cambios en precio_usd Y en las columnas de precio/costo derivadas:
--      el motor SIEMPRE manda. Así un escritor que no envíe precio_usd (p.ej. la ruta
--      frontend /api/admin/sync) tampoco puede reintroducir la fórmula vieja.
--    - recalc_prices(false) fija el GUC local pricing.bypass para no duplicar historial.
--    - costo_flete_usd y costo_despacho_local_clp no se tocan.
--    - Historial: sólo en UPDATE y sólo si cambió precio/costo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcos_apply_pricing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cfg public.pricing_config;
    r     public.pricing_result;
BEGIN
    IF current_setting('pricing.bypass', true) = 'on' THEN
        RETURN NEW;   -- escritura hecha por recalc_prices (ya calculada y con historial)
    END IF;

    SELECT * INTO v_cfg FROM public.pricing_config WHERE id = 1;
    IF NOT FOUND OR NOT v_cfg.trigger_enabled THEN
        RETURN NEW;   -- A1: trigger desactivado -> no hace nada
    END IF;

    IF NEW.precio_usd IS NULL OR NEW.precio_usd <= 0 THEN
        -- Sin FOB válido NO se calcula ni se tocan los precios existentes.
        IF TG_OP = 'UPDATE' THEN
            -- Descarta cualquier precio/costo que haya enviado el escritor y conserva lo vigente.
            NEW.precio_neto_clp       := OLD.precio_neto_clp;
            NEW.precio_bruto_clp      := OLD.precio_bruto_clp;
            NEW.ganancia_clp          := OLD.ganancia_clp;
            NEW.costo_cif_clp         := OLD.costo_cif_clp;
            NEW.ad_valorem_clp        := OLD.ad_valorem_clp;
            NEW.costo_total_chile_clp := OLD.costo_total_chile_clp;
            -- precio_usd NO se modifica (es dato del proveedor); queda registrado abajo para revisión.
        END IF;
        INSERT INTO public.pricing_history (
            marcos_id, id_ext, precio_neto_antes, precio_neto_despues,
            precio_bruto_antes, precio_bruto_despues, costo_total_antes, costo_total_despues,
            pricing_version, motivo)
        VALUES (NEW.id, NEW.id_ext,
                CASE WHEN TG_OP = 'UPDATE' THEN OLD.precio_neto_clp END, NEW.precio_neto_clp,
                CASE WHEN TG_OP = 'UPDATE' THEN OLD.precio_bruto_clp END, NEW.precio_bruto_clp,
                CASE WHEN TG_OP = 'UPDATE' THEN OLD.costo_total_chile_clp END, NEW.costo_total_chile_clp,
                v_cfg.version,
                'trigger: precio_usd invalido (' || coalesce(NEW.precio_usd::text, 'NULL')
                    || '); precios conservados, REVISAR');
        RETURN NEW;
    END IF;

    r := public.pricing_calc(NEW.precio_usd::numeric, v_cfg);

    NEW.precio_neto_clp       := r.precio_neto::bigint;
    NEW.precio_bruto_clp      := r.precio_bruto::bigint;
    NEW.ganancia_clp          := round(r.ganancia)::bigint;
    NEW.costo_cif_clp         := round(r.fob_clp + r.flete_int)::bigint;
    NEW.ad_valorem_clp        := round(r.arancel_clp)::bigint;
    NEW.costo_total_chile_clp := round(r.costo_neto)::bigint;
    NEW.costo_neto_clp        := round(r.costo_neto, 2);
    NEW.iva_import_clp        := round(r.iva_import, 2);
    NEW.margen_objetivo       := r.margen;
    NEW.pricing_version       := v_cfg.version;
    NEW.precio_calculado_at   := now();

    IF TG_OP = 'UPDATE'
       AND (OLD.precio_neto_clp  IS DISTINCT FROM NEW.precio_neto_clp
         OR OLD.precio_bruto_clp IS DISTINCT FROM NEW.precio_bruto_clp
         OR OLD.costo_total_chile_clp IS DISTINCT FROM NEW.costo_total_chile_clp)
    THEN
        INSERT INTO public.pricing_history (
            marcos_id, id_ext, precio_neto_antes, precio_neto_despues,
            precio_bruto_antes, precio_bruto_despues, costo_total_antes, costo_total_despues,
            pricing_version, motivo)
        VALUES (NEW.id, NEW.id_ext, OLD.precio_neto_clp, NEW.precio_neto_clp,
                OLD.precio_bruto_clp, NEW.precio_bruto_clp,
                OLD.costo_total_chile_clp, NEW.costo_total_chile_clp,
                v_cfg.version,
                CASE WHEN OLD.precio_usd IS DISTINCT FROM NEW.precio_usd
                     THEN 'trigger: cambio precio_usd' ELSE 'trigger: recalculo' END);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Sin cambios reales: no mover precio_calculado_at (idempotencia / sin ruido).
        NEW.precio_calculado_at := OLD.precio_calculado_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_marcos_pricing ON public.marcos;
CREATE TRIGGER zz_marcos_pricing
    BEFORE INSERT OR UPDATE OF precio_usd, precio_neto_clp, precio_bruto_clp, ganancia_clp,
                               costo_cif_clp, ad_valorem_clp, costo_total_chile_clp
    ON public.marcos
    FOR EACH ROW EXECUTE FUNCTION public.marcos_apply_pricing();

-- -----------------------------------------------------------------------------
-- 7. SEGURIDAD: nada nuevo accesible por anon / authenticated
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['pricing_config','pricing_tiers','pricing_history','marcos_backup_precios_20261104']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);   -- sin políticas = denegado
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_tbl);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role, postgres', v_tbl);
    END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.pricing_history_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pricing_history_id_seq TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.pricing_config_bump_version()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pricing_calc(NUMERIC, public.pricing_config) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pricing_preview(BIGINT[])                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_prices(BOOLEAN, BIGINT[])          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marcos_apply_pricing()                    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pricing_calc(NUMERIC, public.pricing_config) TO service_role, postgres;
GRANT  EXECUTE ON FUNCTION public.pricing_preview(BIGINT[])                 TO service_role, postgres;
GRANT  EXECUTE ON FUNCTION public.recalc_prices(BOOLEAN, BIGINT[])          TO service_role, postgres;

-- -----------------------------------------------------------------------------
-- 8. AUTO-VERIFICACIÓN (fail-closed antes de COMMIT)
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_col TEXT; v_tbl TEXT;
BEGIN
    FOREACH v_col IN ARRAY ARRAY['costo_neto_clp','iva_import_clp','margen_objetivo','precio_calculado_at','pricing_version']
    LOOP
        IF has_column_privilege('anon', 'public.marcos', v_col, 'SELECT')
           OR has_column_privilege('authenticated', 'public.marcos', v_col, 'SELECT') THEN
            RAISE EXCEPTION 'VERIFICACION FALLIDA: columna nueva % legible por anon/authenticated', v_col;
        END IF;
    END LOOP;

    FOREACH v_tbl IN ARRAY ARRAY['pricing_config','pricing_tiers','pricing_history','marcos_backup_precios_20261104']
    LOOP
        IF has_table_privilege('anon', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_any_column_privilege('anon', 'public.' || v_tbl, 'SELECT')
           OR has_any_column_privilege('authenticated', 'public.' || v_tbl, 'SELECT') THEN
            RAISE EXCEPTION 'VERIFICACION FALLIDA: anon/authenticated tienen acceso a public.%', v_tbl;
        END IF;
    END LOOP;

    IF has_function_privilege('anon', 'public.recalc_prices(boolean,bigint[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.recalc_prices(boolean,bigint[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'VERIFICACION FALLIDA: recalc_prices ejecutable por anon/authenticated';
    END IF;

    IF (SELECT count(*) FROM public.pricing_config) <> 1 THEN
        RAISE EXCEPTION 'VERIFICACION FALLIDA: pricing_config debe tener exactamente 1 fila';
    END IF;

    IF (SELECT trigger_enabled FROM public.pricing_config WHERE id = 1) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'VERIFICACION FALLIDA: trigger_enabled debe ser false tras la instalacion';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
