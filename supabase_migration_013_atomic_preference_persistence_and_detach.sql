-- supabase_migration_013_atomic_preference_persistence_and_detach.sql
-- -----------------------------------------------------------------------------
-- 013 – Persistencia Atómica de Preferencia con Lease y Guarda de Desacople en Reemplazo (MEDIO-02)
--
-- PROPÓSITO Y HARDENING:
-- 1. Crea la RPC atómica `public.persist_order_preference_with_lease`:
--    - Bloquea primero `public.user_checkout_leases` con `SELECT ... FOR UPDATE` y verifica
--      titularidad (`lease_id = p_lease_id`) y vigencia (`expires_at > clock_timestamp()`).
--    - Bloquea después `public.orders` con `SELECT ... FOR UPDATE` respetando el mismo orden
--      de adquisición de bloqueos que `process_b2b_checkout` (`user_checkout_leases -> orders`)
--      para impedir interbloqueos (deadlocks).
--    - Verifica que la orden pertenezca a `p_user_id` y permanezca en `status = 'pending'`.
--    - Persiste `p_preference_id` y `p_init_point` en una única sentencia atómica compare-and-swap
--      únicamente cuando `preference_id IS NULL` o coincide exactamente con `p_expected_stale_preference_id`.
--    - Si ya existe otra preferencia activa en la orden, no la sobrescribe ni la borra: devuelve
--      `persisted: false` junto con la preferencia ganadora para su verificación segura en el backend.
-- 2. Endurece `public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID DEFAULT NULL)`:
--    - Conserva íntegramente su firma, validaciones de catálogo/stock/MOQ, manejo de carrito
--      y garantías transaccionales de la migración 012.
--    - Exige en Fase 1 (A.2) y Fase 2 (F.1) que `p_cancel_order_id` esté en `status = 'pending'`
--      Y tenga `preference_id IS NULL`, impidiendo cancelar una orden que aún conserve una
--      preferencia vinculada o que haya recibido una preferencia concurrente.
-- 3. Seguridad de permisos:
--    - Ambas funciones se definen con `SECURITY DEFINER` y `SET search_path = public`.
--    - Se revoca explícitamente `EXECUTE` a `PUBLIC`, `anon` y `authenticated`, otorgándolo
--      exclusivamente a `service_role` y `postgres`.
--
-- NOTA OBLIGATORIA:
-- Este script es de preparación local. NO ejecutar automáticamente en Supabase remoto
-- sin autorización expresa del usuario.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- SECCIÓN 1: RPC Atómica `persist_order_preference_with_lease`
-- =============================================================================
CREATE OR REPLACE FUNCTION public.persist_order_preference_with_lease(
    p_user_id                      UUID,
    p_order_id                     UUID,
    p_lease_id                     UUID,
    p_preference_id                TEXT,
    p_init_point                   TEXT,
    p_expected_stale_preference_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lease            RECORD;
    v_order            RECORD;
    v_clean_pref       TEXT := NULLIF(BTRIM(COALESCE(p_preference_id, '')), '');
    v_clean_init_point TEXT := NULLIF(BTRIM(COALESCE(p_init_point, '')), '');
    v_clean_stale_pref TEXT := NULLIF(BTRIM(COALESCE(p_expected_stale_preference_id, '')), '');
    v_existing_init    TEXT;
    v_updated          INTEGER := 0;
BEGIN
    -- 1. Validación estricta de argumentos obligatorios
    IF p_user_id IS NULL OR p_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'INVALID_PARAMETERS',
            'message',   'Se requieren p_user_id y p_order_id válidos.'
        );
    END IF;

    IF p_lease_id IS NULL THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'LEASE_REQUIRED',
            'message',   'Se requiere una reserva de checkout válida (p_lease_id). Operación no autorizada.'
        );
    END IF;

    IF v_clean_pref IS NULL OR v_clean_init_point IS NULL THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'INVALID_PARAMETERS',
            'message',   'Se requieren p_preference_id y p_init_point no vacíos.'
        );
    END IF;

    -- 2. Bloqueo pesimista del lease del usuario (Orden de bloqueo 1: user_checkout_leases -> orders)
    SELECT * INTO v_lease
      FROM public.user_checkout_leases
     WHERE user_id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'LEASE_NOT_FOUND',
            'message',   'No existe una reserva de checkout activa para este usuario.'
        );
    END IF;

    IF v_lease.lease_id <> p_lease_id THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'LEASE_LOST_TO_CONCURRENT_REQUEST',
            'message',   'La reserva de checkout fue adquirida por otra solicitud concurrente.'
        );
    END IF;

    IF v_lease.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'LEASE_EXPIRED',
            'message',   'La reserva de checkout ha expirado. Operación cancelada.'
        );
    END IF;

    -- 3. Bloqueo pesimista de la orden objetivo (Orden de bloqueo 2: orders)
    SELECT id, user_id, status, preference_id, init_point
      INTO v_order
      FROM public.orders
     WHERE id = p_order_id
     FOR UPDATE;

    IF NOT FOUND OR v_order.user_id <> p_user_id OR v_order.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success',   FALSE,
            'persisted', FALSE,
            'code',      'CONCURRENT_ORDER_STATE_CHANGED',
            'order_id',  p_order_id,
            'status',    CASE WHEN FOUND AND v_order.user_id = p_user_id THEN v_order.status ELSE NULL END,
            'message',   'No se pudo persistir la preferencia porque la orden no existe, no pertenece al usuario o dejó de estar en estado pending.'
        );
    END IF;

    -- 4. Escritura compare-and-swap en una sola operación atómica:
    --    Solo escribe si preference_id IS NULL o si coincide exactamente con p_expected_stale_preference_id.
    IF v_order.preference_id IS NULL
       OR (v_clean_stale_pref IS NOT NULL AND v_order.preference_id = v_clean_stale_pref)
    THEN
        -- Verify lease still valid after acquiring order lock
        IF v_lease.expires_at <= clock_timestamp() THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'persisted', FALSE,
                'code', 'LEASE_EXPIRED',
                'message', 'La reserva de checkout ha expirado antes de persistir la preferencia.'
            );
        END IF;
        UPDATE public.orders

           SET preference_id = v_clean_pref,
               init_point    = v_clean_init_point
         WHERE id = p_order_id
           AND user_id = p_user_id
           AND status = 'pending'
           AND (
               preference_id IS NULL
               OR (v_clean_stale_pref IS NOT NULL AND preference_id = v_clean_stale_pref)
           );

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 1 THEN
            RETURN jsonb_build_object(
                'success',   FALSE,
                'persisted', FALSE,
                'code',      'CONCURRENT_ORDER_STATE_CHANGED',
                'order_id',  p_order_id,
                'message',   'No se pudo actualizar la preferencia porque el estado de la orden cambió concurrentemente.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success',       TRUE,
            'persisted',     TRUE,
            'code',          'PREFERENCE_PERSISTED',
            'order_id',      p_order_id,
            'preference_id', v_clean_pref,
            'init_point',    v_clean_init_point
        );
    END IF;

    -- 5. Ya existe otra preferencia en la orden (no coincidente con p_expected_stale_preference_id):
    --    No sobrescribirla. Devolver persisted = FALSE con los datos de la preferencia ganadora.
    v_existing_init := NULLIF(BTRIM(COALESCE(v_order.init_point, '')), '');
    IF v_existing_init IS NULL THEN
        RETURN jsonb_build_object(
            'success',       FALSE,
            'persisted',     FALSE,
            'code',          'INCONSISTENT_EXISTING_PREFERENCE',
            'order_id',      p_order_id,
            'preference_id', v_order.preference_id,
            'message',       'La orden ya registra un preference_id pero carece de init_point válido.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',       TRUE,
        'persisted',     FALSE,
        'code',          'EXISTING_PREFERENCE_PRESENT',
        'order_id',      p_order_id,
        'preference_id', v_order.preference_id,
        'init_point',    v_existing_init
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_order_preference_with_lease(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.persist_order_preference_with_lease(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.persist_order_preference_with_lease(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.persist_order_preference_with_lease(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_order_preference_with_lease(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO postgres;

-- =============================================================================
-- SECCIÓN 2: Endurecimiento de `process_b2b_checkout` (Exigir preference_id IS NULL al cancelar)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_b2b_checkout(
    p_user_id         UUID,
    p_cart_id         UUID,
    p_billing         JSONB,
    p_lease_id        UUID,
    p_cancel_order_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lease           RECORD;
    v_prev_order      RECORD;
    v_cart_status     TEXT;
    v_order_id        UUID;
    v_monto_neto      NUMERIC := 0;
    v_monto_iva       NUMERIC := 0;
    v_monto_total     NUMERIC := 0;
    v_total_quantity  INTEGER := 0;
    v_item            RECORD;
    v_db_product      RECORD;
    v_constraint_name TEXT;
    v_cancelled       INTEGER;
BEGIN
    -- =========================================================================
    -- FASE 1: VALIDACIONES Y BLOQUEOS PESIMISTAS SIN MODIFICACIÓN DE ESTADO
    -- (Cualquier retorno aquí es seguro pues ninguna tabla ha sido mutada)
    -- =========================================================================

    -- A.1 Validación y Bloqueo Pesimista del Fencing Token (Lease)
    IF p_lease_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'LEASE_REQUIRED',
            'message', 'Se requiere una reserva de checkout válida (p_lease_id). Operación no autorizada.');
    END IF;

    -- Bloquear la fila del lease con FOR UPDATE para serializar frente a solicitudes concurrentes
    SELECT * INTO v_lease
      FROM public.user_checkout_leases
     WHERE user_id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'LEASE_NOT_FOUND',
            'message', 'No existe una reserva de checkout activa para este usuario.');
    END IF;

    IF v_lease.lease_id <> p_lease_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'LEASE_LOST_TO_CONCURRENT_REQUEST',
            'message', 'La reserva de checkout fue adquirida por otra solicitud concurrente.');
    END IF;

    -- Evaluar expiración contra hora real de reloj tras adquirir el bloqueo
    IF v_lease.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'LEASE_EXPIRED',
            'message', 'La reserva de checkout ha expirado. Operación cancelada.');
    END IF;

    -- A.2 Validación y Bloqueo Pesimista de la Orden Previa a Cancelar (Etapa 2A.5 + MEDIO-02)
    --     Exige que la orden esté en status = 'pending' Y que su preference_id haya sido previamente
    --     desvinculado (preference_id IS NULL). Si aún conserva un preference_id, aborta sin cancelar.
    IF p_cancel_order_id IS NOT NULL THEN
        SELECT id, user_id, status, preference_id INTO v_prev_order
          FROM public.orders
         WHERE id = p_cancel_order_id
         FOR UPDATE;
      -- Verify lease still valid after acquiring order lock and before further processing
      IF v_lease.expires_at <= clock_timestamp() THEN
          RETURN jsonb_build_object(
              'success', FALSE,
              'code', 'LEASE_EXPIRED',
              'message', 'La reserva de checkout ha expirado antes de continuar con el checkout.'
          );
      END IF;

        IF NOT FOUND
           OR v_prev_order.user_id <> p_user_id
           OR v_prev_order.status <> 'pending'
           OR v_prev_order.preference_id IS NOT NULL
        THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'CONCURRENT_ORDER_STATE_CHANGED',
                'message', 'No se pudo cancelar la orden previa porque no existe, no pertenece al usuario, su estado cambió concurrentemente o aún conserva una preferencia vinculada.');
        END IF;
    END IF;

    -- A.3 Bloqueo Pesimista del Carrito (Concurrencia)
    SELECT status INTO v_cart_status
      FROM public.carts
     WHERE id = p_cart_id AND user_id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El carrito no existe o no pertenece al usuario autenticado.';
    END IF;

    -- B. Idempotencia: Si el carrito ya fue convertido por un request previo, se retorna la orden existente
    IF v_cart_status != 'active' THEN
        SELECT id INTO v_order_id FROM public.orders WHERE cart_id = p_cart_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', TRUE, 'order_id', v_order_id, 'message', 'Carrito ya convertido. Retornando orden existente.');
        ELSE
            RAISE EXCEPTION 'Estado inconsistente: Carrito inactivo pero sin orden asociada.';
        END IF;
    END IF;
-- Verify lease still valid after cart lock and before any state‑mutating writes
IF v_lease.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'code', 'LEASE_EXPIRED',
        'message', 'La reserva de checkout expiró antes de crear la orden.'
    );
END IF;

    -- C. Validación de Catálogo, Precios y Stock Server-Side
    FOR v_item IN 
        SELECT ci.product_id, ci.quantity 
          FROM public.cart_items ci 
         WHERE ci.cart_id = p_cart_id 
         ORDER BY ci.product_id 
    LOOP
        SELECT m.precio_neto_clp, m.marca, m.modelo, m.codigo_color, m.stock
          INTO v_db_product 
          FROM public.marcos m 
         WHERE m.id_ext = v_item.product_id
           FOR SHARE OF m;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Integridad fallida: Producto % no encontrado en catálogo.', v_item.product_id;
        END IF;

        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para el producto: %', v_item.product_id;
        END IF;

        IF v_db_product.stock IS NULL THEN
            RAISE EXCEPTION 'El producto % (%) no posee inventario configurado.', 
                v_item.product_id, v_db_product.marca || ' ' || v_db_product.modelo;
        END IF;

        IF v_db_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para % (%). Solicitado: %, Disponible: %', 
                v_db_product.marca || ' ' || v_db_product.modelo, v_item.product_id, v_item.quantity, v_db_product.stock;
        END IF;

        v_monto_neto := v_monto_neto + (v_db_product.precio_neto_clp * v_item.quantity);
        v_total_quantity := v_total_quantity + v_item.quantity;
    END LOOP;

    -- D. Validación Comercial MOQ (Mínimo 10 unidades totales)
    IF v_total_quantity < 10 THEN
        RAISE EXCEPTION 'Compra mínima mayorista no alcanzada. Requiere al menos 10 unidades en total. Actual: %', v_total_quantity;
    END IF;

    -- E. Cálculo Oficial de IVA (19%) y Total
    v_monto_iva := ROUND(v_monto_neto * 0.19);
    v_monto_total := v_monto_neto + v_monto_iva;

    -- =========================================================================
    -- FASE 2: MUTACIÓN ATÓMICA DE DATOS Y GARANTÍA DE ROLLBACK (Etapa 2A.5)
    -- (Cualquier fallo posterior genera excepción que revierte toda la transacción)
    -- =========================================================================

    -- F.1 Si se solicitó reemplazo, cancelar la orden previa atómicamente dentro de la misma transacción
    --     exigiendo status = 'pending' Y preference_id IS NULL
    IF p_cancel_order_id IS NOT NULL THEN
        UPDATE public.orders
           SET status = 'cancelled',
               notes = COALESCE(notes || E'\n', '') || '[Cancelada atómicamente por reemplazo de carrito]'
         WHERE id = p_cancel_order_id
           AND user_id = p_user_id
           AND status = 'pending'
           AND preference_id IS NULL;

        GET DIAGNOSTICS v_cancelled = ROW_COUNT;
        IF v_cancelled <> 1 THEN
            RAISE EXCEPTION 'CONCURRENT_ORDER_STATE_CHANGED: No se pudo cancelar la orden previa porque su estado o preferencia cambió concurrentemente.';
        END IF;
    END IF;

    -- F.2 Creación Atómica de la Nueva Orden
    INSERT INTO public.orders (
        user_id, cart_id, status, payment_status,
        subtotal_net, tax_amount, total_amount, currency,
        customer_name, customer_email, customer_phone,
        business_name, business_rut, billing_address,
        shipping_region, shipping_commune
    ) VALUES (
        p_user_id, p_cart_id, 'pending', 'pending',
        v_monto_neto, v_monto_iva, v_monto_total, 'CLP',
        p_billing->>'customer_name', p_billing->>'customer_email', p_billing->>'customer_phone',
        p_billing->>'business_name', p_billing->>'business_rut', p_billing->>'billing_address',
        p_billing->>'shipping_region', p_billing->>'shipping_commune'
    ) RETURNING id INTO v_order_id;

    -- G. Insertar Order Items (Snapshot inmutable)
    INSERT INTO public.order_items (
        order_id, product_id, sku, product_name, brand_name, unit_price_net, quantity, subtotal_net
    )
    SELECT 
        v_order_id, ci.product_id, ci.product_id,
        m.marca || ' ' || m.modelo || ' ' || m.codigo_color,
        m.marca, m.precio_neto_clp, ci.quantity,
        (m.precio_neto_clp * ci.quantity)
      FROM public.cart_items ci
      JOIN public.marcos m ON ci.product_id = m.id_ext
     WHERE ci.cart_id = p_cart_id;

    -- H. Conversión Atómica del Carrito
    UPDATE public.carts 
       SET status = 'converted', converted_at = NOW() 
     WHERE id = p_cart_id;

    -- I. Finalizar Transacción
    IF v_lease.expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'LEASE_EXPIRED: lease expired before completing checkout'
            USING ERRCODE = 'P0001';
    END IF;
    -- Duplicate lease check removed (already performed above)
    RETURN jsonb_build_object('success', TRUE, 'order_id', v_order_id);

EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'idx_uniq_user_pending_order' THEN
            -- Re-lanzar como excepción para garantizar ROLLBACK de la cancelación previa si ocurrió
            RAISE EXCEPTION 'CONCURRENT_PENDING_ORDER_EXISTS: Ya existe una orden pendiente activa para este usuario.'
                USING ERRCODE = '23505';
        ELSE
            RAISE;
        END IF;
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) TO postgres;
