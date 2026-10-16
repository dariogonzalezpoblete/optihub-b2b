-- supabase_migration_012_checkout_user_concurrency_lease.sql
-- -----------------------------------------------------------------------------
-- 012 – Serialización de Checkout y Protección de Concurrencia por Usuario (Etapa 2A.3)
--
-- PROPÓSITO Y HARDENING:
-- 1. Pre-flight check seguro: Verifica si existen duplicados históricos de órdenes en
--    estado 'pending' por usuario y aborta con diagnóstico sin alterar ni borrar datos.
-- 2. Elimina la firma previa obsoleta process_b2b_checkout(UUID, UUID, JSONB) para evitar
--    sobrecargas ambiguas o vías que omitan la validación de concurrencia.
-- 3. Requiere OBLIGATORIAMENTE p_lease_id UUID (sin valor por defecto ni NULL) en la nueva firma.
-- 4. Serializa la creación de órdenes bloqueando la fila de la reserva con SELECT ... FOR UPDATE
--    y validando la expiración mediante clock_timestamp() (hora real de reloj tras adquirir el bloqueo).
-- 5. Mantiene transacciones ultracortas en PostgreSQL (< 10ms) y evita transacciones abiertas
--    durante llamadas lentas a Mercado Pago.
-- 6. Aplica el índice único parcial definitivo: public.orders(user_id) WHERE status = 'pending'.
--
-- NOTA OBLIGATORIA:
-- Este script es de preparación local (Etapa 2A.3).
-- NO ejecutar automáticamente en Supabase sin autorización expresa del usuario.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- SECCIÓN 1: Comprobación Previa de Duplicados (Pre-flight Check Defensivo)
-- =============================================================================
DO $$
DECLARE
    v_duplicate_count INT;
    v_dup_records     TEXT;
BEGIN
    SELECT COUNT(*) INTO v_duplicate_count
    FROM (
        SELECT user_id
          FROM public.orders
         WHERE status = 'pending'
         GROUP BY user_id
        HAVING COUNT(*) > 1
    ) dups;

    IF v_duplicate_count > 0 THEN
        SELECT string_agg('Usuario: ' || user_id::text || ' (' || c::text || ' órdenes pending)', '; ')
          INTO v_dup_records
          FROM (
              SELECT user_id, COUNT(*) AS c
                FROM public.orders
               WHERE status = 'pending'
               GROUP BY user_id
              HAVING COUNT(*) > 1
          ) sub;

        RAISE EXCEPTION 'PRE-CHECK FALLIDO: Existen % usuarios con múltiples órdenes en estado pending: [%]. La migración NO puede continuar automáticamente para no corromper datos. Ejecuta la consulta de diagnóstico indicada en el informe para conciliar o resolver las órdenes antes de aplicar este índice.', v_duplicate_count, v_dup_records;
    END IF;
END $$;

-- =============================================================================
-- SECCIÓN 2: Tabla de Reservas de Checkout (Distributed Lease Pattern)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_checkout_leases (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    lease_id    UUID NOT NULL,       -- Fencing Token único por cada solicitud
    cart_id     UUID NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_checkout_leases_expires_at
    ON public.user_checkout_leases (expires_at);

ALTER TABLE public.user_checkout_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_checkout_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_checkout_leases TO service_role, postgres;

-- =============================================================================
-- SECCIÓN 3: Índice Único Parcial Definitivo en PostgreSQL
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_user_pending_order
    ON public.orders (user_id)
    WHERE status = 'pending';

-- =============================================================================
-- SECCIÓN 4: RPCs Atómicas de Adquisición y Liberación de Lease
-- =============================================================================

-- 4.1 Adquisición de Lease Atómica
CREATE OR REPLACE FUNCTION acquire_checkout_lease(
    p_user_id     UUID,
    p_cart_id     UUID,
    p_lease_id    UUID,
    p_ttl_seconds INT DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing   RECORD;
    v_now        TIMESTAMPTZ := clock_timestamp();
    v_expires_at TIMESTAMPTZ := v_now + (GREATEST(p_ttl_seconds, 10) || ' seconds')::INTERVAL;
BEGIN
    SELECT * INTO v_existing
      FROM public.user_checkout_leases
     WHERE user_id = p_user_id
     FOR UPDATE;

    IF FOUND THEN
        IF v_existing.expires_at > v_now THEN
            IF v_existing.lease_id = p_lease_id THEN
                -- Reintento del mismo request: renovar vigencia
                UPDATE public.user_checkout_leases
                   SET expires_at = v_expires_at
                 WHERE user_id = p_user_id;
                RETURN jsonb_build_object(
                    'success', TRUE,
                    'lease_id', p_lease_id,
                    'status', 'renewed'
                );
            ELSE
                -- Otra solicitud tiene la reserva activa
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'code', 'CHECKOUT_IN_PROGRESS',
                    'message', 'Ya hay una operación de pago en curso para tu cuenta. Por favor espera unos momentos antes de reintentar.',
                    'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_existing.expires_at - v_now))))
                );
            END IF;
        ELSE
            -- Lease anterior expirado: sobrescribir de forma segura
            UPDATE public.user_checkout_leases
               SET lease_id   = p_lease_id,
                   cart_id    = p_cart_id,
                   expires_at = v_expires_at,
                   created_at = v_now
             WHERE user_id = p_user_id;
            RETURN jsonb_build_object(
                'success', TRUE,
                'lease_id', p_lease_id,
                'status', 'overwritten_expired'
            );
        END IF;
    ELSE
        -- No existía lease: insertar
        INSERT INTO public.user_checkout_leases (user_id, lease_id, cart_id, expires_at, created_at)
        VALUES (p_user_id, p_lease_id, p_cart_id, v_expires_at, v_now);
        RETURN jsonb_build_object(
            'success', TRUE,
            'lease_id', p_lease_id,
            'status', 'created'
        );
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code', 'CONCURRENT_ACQUISITION_CONFLICT',
            'message', 'Conflicto concurrente al reservar el checkout. Intenta nuevamente en unos instantes.',
            'retry_after_seconds', 3
        );
END;
$$;

-- 4.2 Liberación de Lease con Fencing Token
CREATE OR REPLACE FUNCTION release_checkout_lease(
    p_user_id  UUID,
    p_lease_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.user_checkout_leases
     WHERE user_id = p_user_id
       AND lease_id = p_lease_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted > 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'released', TRUE);
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'released', FALSE, 'reason', 'lease_not_found_or_expired');
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION acquire_checkout_lease(UUID, UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acquire_checkout_lease(UUID, UUID, UUID, INT) TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION release_checkout_lease(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_checkout_lease(UUID, UUID) TO service_role, postgres;

-- =============================================================================
-- =============================================================================
-- SECCIÓN 5: Eliminación de Sobrecargas Antiguas y Nueva Firma Atómica
-- =============================================================================

-- 5.1 Eliminar explícitamente las firmas anteriores para evitar llamadas no protegidas o ambiguas
DROP FUNCTION IF EXISTS public.process_b2b_checkout(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.process_b2b_checkout(UUID, UUID, JSONB, UUID);

-- 5.2 Nueva función obligatoria de 4/5 parámetros con Fencing Token pesimista y Cancelación Atómica (Etapa 2A.5)
CREATE OR REPLACE FUNCTION process_b2b_checkout(
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

    -- A.2 Validación y Bloqueo Pesimista de la Orden Previa a Cancelar (Etapa 2A.5)
    IF p_cancel_order_id IS NOT NULL THEN
        SELECT id, user_id, status INTO v_prev_order
          FROM public.orders
         WHERE id = p_cancel_order_id
         FOR UPDATE;

        IF NOT FOUND OR v_prev_order.user_id <> p_user_id OR v_prev_order.status <> 'pending' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'CONCURRENT_ORDER_STATE_CHANGED',
                'message', 'No se pudo cancelar la orden previa porque no existe, no pertenece al usuario o su estado cambió concurrentemente.');
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
    IF p_cancel_order_id IS NOT NULL THEN
        UPDATE public.orders
           SET status = 'cancelled',
               notes = COALESCE(notes || E'\n', '') || '[Cancelada atómicamente por reemplazo de carrito]'
         WHERE id = p_cancel_order_id
           AND user_id = p_user_id
           AND status = 'pending';

        GET DIAGNOSTICS v_cancelled = ROW_COUNT;
        IF v_cancelled <> 1 THEN
            RAISE EXCEPTION 'CONCURRENT_ORDER_STATE_CHANGED: No se pudo cancelar la orden previa porque su estado cambió concurrentemente.';
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

REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB, UUID, UUID) TO postgres;

