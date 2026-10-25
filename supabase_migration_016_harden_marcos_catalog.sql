-- =============================================================================
-- supabase_migration_016_harden_marcos_catalog.sql
-- -----------------------------------------------------------------------------
-- FASE 29.2: CORRECCIÓN INTEGRAL DE PRIVILEGIOS (DAC), AISLAMIENTO POR COLUMNA
--            DEL CATÁLOGO (public.marcos) Y ENDURECIMIENTO RLS / RPC
--
-- PROPÓSITO:
-- 1. Eliminar los privilegios excesivos (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--    REFERENCES, TRIGGER) heredados por `anon`, `authenticated` y `PUBLIC` sobre:
--    - `public.marcos`
--    - `public.orders` y `public.order_items`
--    - `public.carts` y `public.cart_items`
--    - `public.profiles`
--    - `public.inventory_movements`
--    - `public.processed_webhooks`
--    - `public.order_email_outbox`
--    - `public.user_checkout_leases`
-- 2. Establecer separación estricta a nivel de columna (ACL por columna) y RLS
--    en `public.marcos`:
--    - Catálogo público (`anon`): SOLO lectura (`SELECT`) de columnas descriptivas
--      no sensibles (`id, id_ext, marca, modelo, color, codigo_color, genero, forma,
--      material, tamano, upc, origen, imagen_principal, imagenes_secundarias,
--      created_at, updated_at`) y política RLS `stock IS NOT NULL AND stock > 0`.
--      PROHIBIDO leer `precio_neto_clp`, `precio_bruto_clp`, `stock` y costos/márgenes.
--    - Catálogo B2B (`authenticated`): SOLO lectura (`SELECT`) de las columnas
--      públicas más las columnas comerciales B2B autorizadas (`precio_neto_clp,
--      precio_bruto_clp, stock`) y política RLS `stock IS NOT NULL AND stock >= 0`.
--      PROHIBIDO leer costos y márgenes internos (`costo_cif_clp, costo_flete_usd,
--      costo_total_chile_clp, costo_despacho_local_clp, ad_valorem_clp,
--      ganancia_clp, iva_clp, precio_usd, id_nywd, url_origen`).
--    - Operaciones privilegiadas (`service_role`, `postgres`): `ALL PRIVILEGES`.
-- 3. Crear vistas explícitas con `security_invoker = true`:
--    - `public.v_marcos_catalogo_publico` (`anon`, `authenticated`)
--    - `public.v_marcos_catalogo_b2b` (`authenticated` únicamente)
-- 4. Aislar pedidos, carritos y perfiles por usuario autenticado (`authenticated`)
--    con privilegios mínimos, revocando todo acceso a `anon` y prohibiendo `TRUNCATE`.
-- 5. Aislar tablas operacionales (`inventory_movements`, `processed_webhooks`,
--    `order_email_outbox`, `user_checkout_leases`) exclusivamente a `service_role`.
-- 6. Endurecer `public.sync_cart` (`SET search_path = public`, validación de
--    `auth.uid()` y `status = 'active'`) preservando ejecución para `authenticated`,
--    y fijar `search_path = public` en funciones trigger y RPCs.
-- 7. Verificar automáticamente todas las invariantes de seguridad dentro de la
--    transacción antes de `COMMIT` (fail-closed: si algún privilegio indebido
--    persiste, aborta con `RAISE EXCEPTION` y hace `ROLLBACK`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. CONFIGURACIÓN DEFENSIVA DE SESIÓN LOCAL (Evita bloqueos prolongados)
-- -----------------------------------------------------------------------------
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

-- -----------------------------------------------------------------------------
-- 1. PRE-CHECK DEFENSIVO: Verificar existencia de tablas y columnas críticas
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_tables TEXT;
    v_missing_cols   TEXT;
BEGIN
    SELECT string_agg(req.tbl, ', ')
      INTO v_missing_tables
      FROM (
          VALUES
              ('marcos'),
              ('orders'),
              ('order_items'),
              ('carts'),
              ('cart_items'),
              ('profiles'),
              ('inventory_movements'),
              ('processed_webhooks'),
              ('order_email_outbox'),
              ('user_checkout_leases')
      ) AS req(tbl)
     WHERE to_regclass('public.' || req.tbl) IS NULL;

    IF v_missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'PRE-CHECK FALLIDO: Faltan tablas requeridas en esquema public: [%]', v_missing_tables;
    END IF;

    SELECT string_agg(req.col, ', ')
      INTO v_missing_cols
      FROM (
          VALUES
              ('id_ext'),
              ('marca'),
              ('modelo'),
              ('precio_neto_clp'),
              ('stock')
      ) AS req(col)
     WHERE NOT EXISTS (
         SELECT 1
           FROM pg_attribute a
          WHERE a.attrelid = 'public.marcos'::regclass
            AND a.attname = req.col
            AND a.attnum > 0
            AND NOT a.attisdropped
     );

    IF v_missing_cols IS NOT NULL THEN
        RAISE EXCEPTION 'PRE-CHECK FALLIDO: Faltan columnas críticas en public.marcos: [%]', v_missing_cols;
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. LIMPIEZA PROFUNDA DE PRIVILEGIOS DE TABLA Y COLUMNA (DAC) EN TODAS LAS TABLAS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_tbl TEXT;
    v_col RECORD;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'marcos',
        'orders',
        'order_items',
        'carts',
        'cart_items',
        'profiles',
        'inventory_movements',
        'processed_webhooks',
        'order_email_outbox',
        'user_checkout_leases'
    ]
    LOOP
        -- 2.1 Revocar todos los privilegios a nivel de tabla de PUBLIC, anon y authenticated
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated;',
            v_tbl
        );

        -- 2.2 Revocar cualquier privilegio residual por columna en la tabla
        FOR v_col IN
            SELECT a.attname AS col_name
              FROM pg_attribute a
             WHERE a.attrelid = format('public.%I', v_tbl)::regclass
               AND a.attnum > 0
               AND NOT a.attisdropped
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated;',
                v_col.col_name,
                v_tbl
            );
        END LOOP;

        -- 2.3 Garantizar privilegios completos de administración a service_role y postgres
        EXECUTE format(
            'GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role, postgres;',
            v_tbl
        );
    END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 3. SEPARACIÓN DE COLUMNAS Y RLS EN CATÁLOGO (public.marcos)
-- -----------------------------------------------------------------------------
-- 3.1 Conceder SELECT estrictamente por lista blanca de columnas:
--     - `anon`: solo campos descriptivos públicos (sin precio_neto_clp, sin stock, sin costos/márgenes).
--     - `authenticated`: campos descriptivos públicos + precio_neto_clp, precio_bruto_clp, stock
--       (sin costos ni márgenes internos: costo_cif_clp, costo_flete_usd, costo_total_chile_clp,
--        costo_despacho_local_clp, ad_valorem_clp, ganancia_clp, iva_clp, precio_usd, id_nywd, url_origen).
DO $$
DECLARE
    v_public_cols TEXT;
    v_b2b_cols    TEXT;
BEGIN
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      INTO v_public_cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.marcos'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attname = ANY (ARRAY[
           'id',
           'id_ext',
           'marca',
           'modelo',
           'color',
           'codigo_color',
           'genero',
           'forma',
           'material',
           'tamano',
           'upc',
           'origen',
           'imagen_principal',
           'imagenes_secundarias',
           'created_at',
           'updated_at'
       ]);

    IF v_public_cols IS NULL OR v_public_cols = '' THEN
        RAISE EXCEPTION 'ERROR: No se pudieron resolver las columnas públicas de public.marcos.';
    END IF;

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      INTO v_b2b_cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.marcos'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attname = ANY (ARRAY[
           'id',
           'id_ext',
           'marca',
           'modelo',
           'color',
           'codigo_color',
           'genero',
           'forma',
           'material',
           'tamano',
           'upc',
           'origen',
           'imagen_principal',
           'imagenes_secundarias',
           'created_at',
           'updated_at',
           'precio_neto_clp',
           'precio_bruto_clp',
           'stock'
       ]);

    IF v_b2b_cols IS NULL OR v_b2b_cols = '' THEN
        RAISE EXCEPTION 'ERROR: No se pudieron resolver las columnas B2B de public.marcos.';
    END IF;

    EXECUTE format('GRANT SELECT (%s) ON TABLE public.marcos TO anon;', v_public_cols);
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.marcos TO authenticated;', v_b2b_cols);
END $$;

-- 3.2 Blindar secuencia identity/serial asociada a public.marcos.id y cualquier secuencia en public
DO $$
DECLARE
    v_seq_name TEXT;
    v_seq_rec  RECORD;
BEGIN
    v_seq_name := pg_get_serial_sequence('public.marcos', 'id');

    IF v_seq_name IS NULL THEN
        SELECT format('%I.%I', s_ns.nspname, s_cl.relname)
          INTO v_seq_name
          FROM pg_class s_cl
          JOIN pg_namespace s_ns ON s_ns.oid = s_cl.relnamespace
          JOIN pg_depend dep ON dep.objid = s_cl.oid
          JOIN pg_class t_cl ON t_cl.oid = dep.refobjid
          JOIN pg_attribute att ON att.attrelid = t_cl.oid AND att.attnum = dep.refobjsubid
         WHERE s_cl.relkind = 'S'
           AND t_cl.oid = 'public.marcos'::regclass
           AND att.attname = 'id'
         LIMIT 1;
    END IF;

    IF v_seq_name IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated;', v_seq_name);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role, postgres;', v_seq_name);
    END IF;

    FOR v_seq_rec IN
        SELECT format('%I.%I', n.nspname, c.relname) AS full_seq_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'S'
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated;', v_seq_rec.full_seq_name);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role, postgres;', v_seq_rec.full_seq_name);
    END LOOP;
END $$;

-- 3.3 Activar RLS y definir políticas diferenciadas para anon y authenticated en public.marcos
ALTER TABLE public.marcos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_read_marcos" ON public.marcos;
DROP POLICY IF EXISTS "allow_service_role_all_marcos" ON public.marcos;
DROP POLICY IF EXISTS "marcos_select_anon_public" ON public.marcos;
DROP POLICY IF EXISTS "marcos_select_authenticated_b2b" ON public.marcos;

-- Catálogo público (anon): solo filas con inventario activo (stock > 0)
CREATE POLICY "marcos_select_anon_public"
ON public.marcos
FOR SELECT
TO anon
USING (stock IS NOT NULL AND stock > 0);

-- Catálogo B2B (authenticated): acceso a filas válidas (stock >= 0 permite reconciliar ítems agotados en carrito/variantes)
CREATE POLICY "marcos_select_authenticated_b2b"
ON public.marcos
FOR SELECT
TO authenticated
USING (stock IS NOT NULL AND stock >= 0);

-- 3.4 Vistas explícitas de proyección con security_invoker = true (PostgreSQL 15+)
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


-- -----------------------------------------------------------------------------
-- 4. PEDIDOS, CARRITOS Y PERFILES DE USUARIO (PRIVILEGIOS MÍNIMOS Y RLS)
-- -----------------------------------------------------------------------------

-- 4.1 Pedidos (orders y order_items):
--     - anon: 0 permisos.
--     - authenticated: únicamente SELECT sobre sus propios pedidos. Prohibido INSERT/UPDATE/DELETE/TRUNCATE.
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
CREATE POLICY "Users can view their own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.orders
         WHERE orders.id = order_items.order_id
           AND orders.user_id = auth.uid()
    )
);

-- 4.2 Carritos (carts y cart_items):
--     - anon: 0 permisos (el carrito de invitado vive exclusivamente en localStorage).
--     - authenticated:
--       * carts: SELECT, INSERT, UPDATE (sin DELETE ni TRUNCATE) restringido por RLS a su propio carrito activo.
--       * cart_items: SELECT, INSERT, UPDATE, DELETE (sin TRUNCATE) restringido por RLS a ítems de su carrito activo.
GRANT SELECT, INSERT, UPDATE ON TABLE public.carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cart_items TO authenticated;

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can insert their own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can update their own cart" ON public.carts;

CREATE POLICY "Users can view their own cart"
ON public.carts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cart"
ON public.carts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'active');

CREATE POLICY "Users can update their own cart"
ON public.carts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'active')
WITH CHECK (auth.uid() = user_id AND status = 'active');

DROP POLICY IF EXISTS "Users can view their own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can insert their own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can update their own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can delete their own cart items" ON public.cart_items;

CREATE POLICY "Users can view their own cart items"
ON public.cart_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.carts
         WHERE carts.id = cart_items.cart_id
           AND carts.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert their own cart items"
ON public.cart_items
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
          FROM public.carts
         WHERE carts.id = cart_items.cart_id
           AND carts.user_id = auth.uid()
           AND carts.status = 'active'
    )
);

CREATE POLICY "Users can update their own cart items"
ON public.cart_items
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.carts
         WHERE carts.id = cart_items.cart_id
           AND carts.user_id = auth.uid()
           AND carts.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
          FROM public.carts
         WHERE carts.id = cart_items.cart_id
           AND carts.user_id = auth.uid()
           AND carts.status = 'active'
    )
);

CREATE POLICY "Users can delete their own cart items"
ON public.cart_items
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.carts
         WHERE carts.id = cart_items.cart_id
           AND carts.user_id = auth.uid()
           AND carts.status = 'active'
    )
);

-- 4.3 Perfiles B2B (profiles):
--     - anon: 0 permisos.
--     - authenticated: SELECT, INSERT, UPDATE sobre su propio perfil (sin DELETE ni TRUNCATE).
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);


-- -----------------------------------------------------------------------------
-- 5. TABLAS OPERACIONALES PRIVILEGIADAS (INVENTARIO, WEBHOOKS, OUTBOX, LEASES)
-- -----------------------------------------------------------------------------
-- Ningún rol público (`anon`, `authenticated`) tiene privilegios DAC sobre estas tablas.
-- Solo `service_role` y `postgres` operan sobre ellas.
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checkout_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on processed_webhooks" ON public.processed_webhooks;
CREATE POLICY "Service role full access on processed_webhooks"
ON public.processed_webhooks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on order_email_outbox" ON public.order_email_outbox;
CREATE POLICY "Service role full access on order_email_outbox"
ON public.order_email_outbox
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 6. ENDURECIMIENTO DE FUNCIONES Y RPCs (sync_cart, triggers, checkout, stock)
-- -----------------------------------------------------------------------------

-- 6.1 Endurecer `public.sync_cart` manteniendo compatibilidad 100% con frontend
--     (`cartService.ts` y `create-preference/route.ts` vía `authenticated`)
CREATE OR REPLACE FUNCTION public.sync_cart(
    p_cart_id         UUID,
    p_items           JSONB,
    p_last_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_current_updated_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized: authentication required';
    END IF;

    -- Bloquear la fila del carrito activo del usuario autenticado para evitar race conditions
    SELECT updated_at
      INTO v_current_updated_at
      FROM public.carts
     WHERE id = p_cart_id
       AND user_id = auth.uid()
       AND status = 'active'
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Not authorized or active cart not found';
    END IF;

    -- Optimistic Concurrency Control (OCC) con tolerancia de 1 segundo
    IF p_last_updated_at IS NOT NULL AND v_current_updated_at > (p_last_updated_at + interval '1 second') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'stale',
            'current_updated_at', v_current_updated_at
        );
    END IF;

    -- Reemplazo atómico de los ítems del carrito activo
    DELETE FROM public.cart_items WHERE cart_id = p_cart_id;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        INSERT INTO public.cart_items (cart_id, product_id, quantity)
        SELECT
            p_cart_id,
            btrim(item->>'product_id')::TEXT,
            (item->>'quantity')::INTEGER
          FROM jsonb_array_elements(p_items) AS item
         WHERE NULLIF(btrim(COALESCE(item->>'product_id', '')), '') IS NOT NULL
           AND (item->>'quantity')::INTEGER > 0
           AND (item->>'quantity')::INTEGER <= 10000;
    END IF;

    UPDATE public.carts
       SET updated_at = NOW()
     WHERE id = p_cart_id
       AND user_id = auth.uid()
       AND status = 'active'
    RETURNING updated_at INTO v_current_updated_at;

    RETURN jsonb_build_object(
        'success', true,
        'updated_at', v_current_updated_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_cart(UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_cart(UUID, JSONB, TIMESTAMPTZ) TO authenticated, service_role, postgres;

-- 6.2 Fijar search_path = public en funciones de trigger y restringir ejecución de RPCs internas
DO $$
DECLARE
    v_fn_sig TEXT;
BEGIN
    IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
        ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
    END IF;

    IF to_regprocedure('public.prevent_processed_order_modification()') IS NOT NULL THEN
        ALTER FUNCTION public.prevent_processed_order_modification() SET search_path = public;
    END IF;

    FOREACH v_fn_sig IN ARRAY ARRAY[
        'public.decrement_stock_for_order(uuid)',
        'public.process_approved_mp_payment(uuid,text)',
        'public.acquire_checkout_lease(uuid,uuid,uuid,integer)',
        'public.release_checkout_lease(uuid,uuid)',
        'public.process_b2b_checkout(uuid,uuid,jsonb,uuid,uuid)',
        'public.persist_order_preference_with_lease(uuid,uuid,uuid,text,text,text)'
    ]
    LOOP
        IF to_regprocedure(v_fn_sig) IS NOT NULL THEN
            EXECUTE format('ALTER FUNCTION %s SET search_path = public;', v_fn_sig);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', v_fn_sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, postgres;', v_fn_sig);
        END IF;
    END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 7. AUTO-VERIFICACIÓN TRANSACCIONAL (FAIL-CLOSED ANTES DE COMMIT)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_col TEXT;
    v_tbl TEXT;
BEGIN
    -- 7.1 Verificar que anon y authenticated NO tienen SELECT de tabla completa sobre public.marcos
    IF has_table_privilege('anon', 'public.marcos', 'SELECT') THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon conserva SELECT a nivel de toda la tabla public.marcos';
    END IF;
    IF has_table_privilege('authenticated', 'public.marcos', 'SELECT') THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated conserva SELECT a nivel de toda la tabla public.marcos';
    END IF;

    -- 7.2 Verificar que anon y authenticated NO pueden modificar public.marcos (ni tabla ni columnas)
    IF has_table_privilege('anon', 'public.marcos', 'INSERT')
       OR has_table_privilege('anon', 'public.marcos', 'UPDATE')
       OR has_table_privilege('anon', 'public.marcos', 'DELETE')
       OR has_table_privilege('anon', 'public.marcos', 'TRUNCATE')
       OR has_any_column_privilege('anon', 'public.marcos', 'INSERT')
       OR has_any_column_privilege('anon', 'public.marcos', 'UPDATE')
    THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon conserva privilegios de escritura sobre public.marcos';
    END IF;

    IF has_table_privilege('authenticated', 'public.marcos', 'INSERT')
       OR has_table_privilege('authenticated', 'public.marcos', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.marcos', 'DELETE')
       OR has_table_privilege('authenticated', 'public.marcos', 'TRUNCATE')
       OR has_any_column_privilege('authenticated', 'public.marcos', 'INSERT')
       OR has_any_column_privilege('authenticated', 'public.marcos', 'UPDATE')
    THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated conserva privilegios de escritura sobre public.marcos';
    END IF;

    -- 7.3 Verificar separación de columnas en public.marcos (público vs B2B vs costos internos)
    IF NOT has_column_privilege('anon', 'public.marcos', 'id_ext', 'SELECT')
       OR NOT has_column_privilege('anon', 'public.marcos', 'marca', 'SELECT')
       OR NOT has_column_privilege('anon', 'public.marcos', 'modelo', 'SELECT')
    THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon perdió lectura sobre columnas públicas básicas de public.marcos';
    END IF;

    IF has_column_privilege('anon', 'public.marcos', 'precio_neto_clp', 'SELECT')
       OR has_column_privilege('anon', 'public.marcos', 'stock', 'SELECT')
    THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon aún puede leer precio_neto_clp o stock en public.marcos';
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.marcos', 'precio_neto_clp', 'SELECT')
       OR NOT has_column_privilege('authenticated', 'public.marcos', 'stock', 'SELECT')
    THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated no puede leer precio_neto_clp o stock en public.marcos';
    END IF;

    -- 7.4 Verificar que NINGUNA columna de costos/márgenes internos sea legible por anon o authenticated
    FOR v_col IN
        SELECT a.attname
          FROM pg_attribute a
         WHERE a.attrelid = 'public.marcos'::regclass
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND a.attname = ANY (ARRAY[
               'costo_cif_clp',
               'costo_flete_usd',
               'costo_total_chile_clp',
               'costo_despacho_local_clp',
               'ad_valorem_clp',
               'ganancia_clp',
               'iva_clp',
               'precio_usd',
               'id_nywd',
               'url_origen'
           ])
    LOOP
        IF has_column_privilege('anon', 'public.marcos', v_col, 'SELECT')
           OR has_column_privilege('authenticated', 'public.marcos', v_col, 'SELECT')
        THEN
            RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: La columna sensible interna % sigue expuesta a roles públicos', v_col;
        END IF;
    END LOOP;

    -- 7.5 Verificar que tablas internas y orders están blindadas contra escritura/truncado público
    FOREACH v_tbl IN ARRAY ARRAY[
        'orders',
        'order_items',
        'inventory_movements',
        'processed_webhooks',
        'order_email_outbox',
        'user_checkout_leases'
    ]
    LOOP
        IF has_table_privilege('anon', 'public.' || v_tbl, 'SELECT')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'UPDATE')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'TRUNCATE')
        THEN
            RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon conserva privilegios sobre public.%', v_tbl;
        END IF;

        IF has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
           OR has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
           OR has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE')
           OR has_table_privilege('authenticated', 'public.' || v_tbl, 'TRUNCATE')
        THEN
            RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated conserva privilegios de escritura/truncado sobre public.%', v_tbl;
        END IF;
    END LOOP;

    -- 7.6 Verificar que anon tiene 0 permisos en carts, cart_items y profiles, y que TRUNCATE está revocado para authenticated
    FOREACH v_tbl IN ARRAY ARRAY['carts', 'cart_items', 'profiles']
    LOOP
        IF has_table_privilege('anon', 'public.' || v_tbl, 'SELECT')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'UPDATE')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE')
           OR has_table_privilege('anon', 'public.' || v_tbl, 'TRUNCATE')
        THEN
            RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon conserva privilegios sobre public.%', v_tbl;
        END IF;

        IF has_table_privilege('authenticated', 'public.' || v_tbl, 'TRUNCATE') THEN
            RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated conserva TRUNCATE sobre public.%', v_tbl;
        END IF;
    END LOOP;

    -- 7.7 Verificar permisos de sync_cart
    IF has_function_privilege('anon', 'public.sync_cart(uuid,jsonb,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: anon aún puede ejecutar public.sync_cart';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.sync_cart(uuid,jsonb,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'VERIFICACIÓN FALLIDA: authenticated perdió permiso EXECUTE sobre public.sync_cart';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. RECARGA DE CACHÉ DE ESQUEMA EN POSTGREST
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
