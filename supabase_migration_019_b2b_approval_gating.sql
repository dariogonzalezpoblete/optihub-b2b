-- =============================================================================
-- supabase_migration_019_b2b_approval_gating.sql
-- FASE B2: Protección estricta de Precios B2B y Stock Numérico contra usuarios no aprobados.
--
-- OBJETIVO:
-- 1. Agregar columna `is_approved` a `public.profiles` (la tabla real de perfiles).
-- 2. Proteger `profiles.is_approved` mediante trigger BEFORE INSERT OR UPDATE para que
--    usuarios autenticados (`authenticated`) NO puedan auto-aprobarse ni modificar este campo.
-- 3. Crear función `public.is_b2b_approved()` SECURITY DEFINER STABLE con search_path fijo.
-- 4. Revocar SELECT sobre columnas comerciales (`precio_neto_clp`, `precio_bruto_clp`, `stock`)
--    en `public.marcos` para roles `anon` y `authenticated`.
-- 5. Redefinir `public.v_marcos_catalogo_publico` proyectando únicamente `disponible` (boolean)
--    sin precios ni stock numérico, accesible para `anon` y `authenticated`.
-- 6. Redefinir `public.v_marcos_catalogo_b2b` con `security_barrier = true` y filtro
--    `WHERE (SELECT public.is_b2b_approved()) = true`, accesible para `authenticated`.
--
-- IDEMPOTENCIA Y SEGURIDAD:
-- - Transaccional: Todo en un solo bloque BEGIN...COMMIT.
-- - No altera datos existentes de catálogo.
-- - No afecta permisos de `service_role` ni `postgres`.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. COLUMNA DE APROBACIÓN EN PUBLIC.PROFILES Y TRIGGER DE PROTECCIÓN
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Trigger para impedir auto-aprobación desde el cliente (vía auth.role() = 'authenticated')
CREATE OR REPLACE FUNCTION public.protect_profiles_is_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Si la operación proviene de un usuario autenticado regular
    IF auth.role() = 'authenticated' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.is_approved := false;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
                RAISE EXCEPTION 'Operacion denegada: no tiene privilegios para modificar el estado de aprobacion B2B (is_approved).';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_is_approved ON public.profiles;
CREATE TRIGGER trg_protect_profiles_is_approved
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profiles_is_approved();


-- -----------------------------------------------------------------------------
-- 2. FUNCIÓN DE CONSULTA DE APROBACIÓN (SECURITY DEFINER / STABLE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_b2b_approved()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_approved boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT is_approved INTO v_approved
      FROM public.profiles
     WHERE id = auth.uid();

    RETURN coalesce(v_approved, false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_b2b_approved() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_b2b_approved() TO authenticated, service_role, postgres;


-- -----------------------------------------------------------------------------
-- 3. REVOCACIÓN DE COLUMNAS DE PRECIO Y STOCK EN PUBLIC.MARCOS
-- -----------------------------------------------------------------------------
-- Revocar privilegios amplios sobre columnas sensibles a anon y authenticated
REVOKE SELECT (precio_neto_clp, precio_bruto_clp, stock) ON public.marcos FROM anon, authenticated;

-- Garantizar que anon y authenticated solo puedan leer columnas públicas no sensibles
GRANT SELECT (
    id, id_ext, marca, modelo, color, codigo_color, genero, forma,
    material, tamano, upc, origen, imagen_principal, imagenes_secundarias
) ON public.marcos TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. VISTA PÚBLICA DE CATÁLOGO (v_marcos_catalogo_publico)
-- Proyecta disponibilidad como boolean; sin precios ni números de stock.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_marcos_catalogo_publico CASCADE;

CREATE OR REPLACE VIEW public.v_marcos_catalogo_publico
AS
SELECT
    id,
    id_ext,
    marca,
    modelo,
    color,
    codigo_color,
    genero,
    forma,
    material,
    tamano,
    upc,
    origen,
    imagen_principal,
    imagenes_secundarias,
    CASE WHEN stock > 0 THEN true ELSE false END AS disponible
FROM public.marcos
WHERE stock IS NOT NULL;

REVOKE ALL PRIVILEGES ON TABLE public.v_marcos_catalogo_publico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_marcos_catalogo_publico TO anon, authenticated, service_role, postgres;


-- -----------------------------------------------------------------------------
-- 5. VISTA B2B DE CATÁLOGO (v_marcos_catalogo_b2b)
-- Con security_barrier = true y filtro de función public.is_b2b_approved()
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_marcos_catalogo_b2b CASCADE;

CREATE OR REPLACE VIEW public.v_marcos_catalogo_b2b
WITH (security_barrier = true)
AS
SELECT
    id,
    id_ext,
    marca,
    modelo,
    color,
    codigo_color,
    genero,
    forma,
    material,
    tamano,
    upc,
    origen,
    imagen_principal,
    imagenes_secundarias,
    precio_neto_clp,
    precio_bruto_clp,
    stock
FROM public.marcos
WHERE (SELECT public.is_b2b_approved()) = true;

REVOKE ALL PRIVILEGES ON TABLE public.v_marcos_catalogo_b2b FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_marcos_catalogo_b2b TO authenticated, service_role, postgres;


-- -----------------------------------------------------------------------------
-- 6. VERIFICACIÓN POST-MIGRACIÓN
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_approved'
    ) THEN
        RAISE EXCEPTION 'VERIFICACION FALLIDA: profiles.is_approved no fue creada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'is_b2b_approved'
    ) THEN
        RAISE EXCEPTION 'VERIFICACION FALLIDA: funcion is_b2b_approved no fue creada';
    END IF;
    
    RAISE NOTICE 'Migracion 019 completada exitosamente: Precios B2B y stock protegidos tras aprobacion.';
END $$;

COMMIT;
