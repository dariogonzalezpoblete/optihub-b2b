-- =============================================================================
-- supabase_migration_019_b2b_approval_gating_rollback.sql
-- ROLLBACK DE MIGRACIÓN 019: Restaura estado de migración 016.
-- =============================================================================

BEGIN;

-- 1. Eliminar vistas redefinidas
DROP VIEW IF EXISTS public.v_marcos_catalogo_b2b CASCADE;
DROP VIEW IF EXISTS public.v_marcos_catalogo_publico CASCADE;

-- 2. Restaurar vistas 016 con security_invoker
CREATE OR REPLACE VIEW public.v_marcos_catalogo_publico
WITH (security_invoker = true)
AS
SELECT
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
    imagenes_secundarias
FROM public.marcos;

REVOKE ALL PRIVILEGES ON TABLE public.v_marcos_catalogo_publico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_marcos_catalogo_publico TO anon, authenticated, service_role, postgres;

CREATE OR REPLACE VIEW public.v_marcos_catalogo_b2b
WITH (security_invoker = true)
AS
SELECT
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
FROM public.marcos;

REVOKE ALL PRIVILEGES ON TABLE public.v_marcos_catalogo_b2b FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_marcos_catalogo_b2b TO authenticated, service_role, postgres;

-- 3. Restaurar permisos en marcos de migración 016
GRANT SELECT (
    id, id_ext, marca, modelo, color, codigo_color, genero, forma,
    material, tamano, upc, origen, imagen_principal, imagenes_secundarias,
    precio_neto_clp, precio_bruto_clp, stock
) ON public.marcos TO authenticated;

-- 4. Eliminar función is_b2b_approved
DROP FUNCTION IF EXISTS public.is_b2b_approved() CASCADE;

-- 5. Eliminar trigger y columna de profiles
DROP TRIGGER IF EXISTS trg_protect_profiles_is_approved ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profiles_is_approved() CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_approved;

COMMIT;
