-- supabase_migration_010_payment_inventory_fix.sql
-- ------------------------------------------------------------
-- 010 – Corrección de Integridad: Validación de Stock en Checkout (AUD-02)
--       y Tratamiento Durable de Fallos de Stock en Pagos Aprobados (AUD-01)
-- ------------------------------------------------------------

-- 1. Ampliar estados permitidos en public.orders para soportar 'requires_attention'
ALTER TABLE public.orders 
    DROP CONSTRAINT IF EXISTS orders_status_check,
    ADD CONSTRAINT orders_status_check 
    CHECK (status IN (
        'pending', 
        'payment_pending', 
        'paid', 
        'preparing', 
        'shipped', 
        'delivered', 
        'cancelled', 
        'refunded', 
        'requires_attention'
    ));

-- 2. Añadir columna opcional para registrar el motivo del fallo de stock sin perder datos
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS stock_error TEXT NULL;

-- 3. AUD-02: Actualizar process_b2b_checkout para validar stock real y bloquear concurrentemente
CREATE OR REPLACE FUNCTION process_b2b_checkout(
    p_user_id UUID,
    p_cart_id UUID,
    p_billing JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cart_status TEXT;
    v_order_id UUID;
    v_monto_neto NUMERIC := 0;
    v_monto_iva NUMERIC := 0;
    v_monto_total NUMERIC := 0;
    v_total_quantity INTEGER := 0;
    v_item RECORD;
    v_db_product RECORD;
BEGIN
    -- A. Bloqueo Pesimista del Carrito (Concurrencia)
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
            RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'message', 'Carrito ya convertido. Retornando orden existente.');
        ELSE
            RAISE EXCEPTION 'Estado inconsistente: Carrito inactivo pero sin orden asociada.';
        END IF;
    END IF;

    -- C. Validación de Catálogo, Precios y Stock Server-Side
    -- Se recorre ordenando por product_id para evitar deadlocks y aplicando FOR SHARE
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

        -- Validación de stock: no permitir NULL, no permitir 0 si quantity > 0, no permitir stock menor al solicitado
        IF v_db_product.stock IS NULL THEN
            RAISE EXCEPTION 'El producto % (%) no posee inventario configurado.', 
                v_item.product_id, v_db_product.marca || ' ' || v_db_product.modelo;
        END IF;

        IF v_db_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para % (%). Solicitado: %, Disponible: %', 
                v_db_product.marca || ' ' || v_db_product.modelo, v_item.product_id, v_item.quantity, v_db_product.stock;
        END IF;

        v_total_quantity := v_total_quantity + v_item.quantity;
        v_monto_neto := v_monto_neto + (v_db_product.precio_neto_clp * v_item.quantity);
    END LOOP;

    -- D. Validación MOQ
    IF v_total_quantity < 10 THEN
        RAISE EXCEPTION 'MOQ no cumplido: El pedido mínimo es de 10 unidades.';
    END IF;

    -- E. Impuestos y Totales
    v_monto_iva := round(v_monto_neto * 0.19);
    v_monto_total := v_monto_neto + v_monto_iva;

    -- F. Crear Orden (Snapshot)
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
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

-- Restricción de permisos para process_b2b_checkout
REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION process_b2b_checkout(UUID, UUID, JSONB) TO postgres;


-- 4. AUD-01: Actualizar process_approved_mp_payment con bloque de excepción aislado (subtransacción)
CREATE OR REPLACE FUNCTION process_approved_mp_payment(
    p_order_id   UUID,
    p_payment_id TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order           RECORD;
    v_already         BOOLEAN := FALSE;
    v_stock_ok        BOOLEAN := FALSE;
    v_stock_error     TEXT := NULL;
    v_constraint_name TEXT;
BEGIN
    --------------------------------------------------------------------
    -- Paso 1 – Bloquear la orden
    --------------------------------------------------------------------
    SELECT *
      INTO v_order
      FROM orders
     WHERE id = p_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'order_not_found',
            'message', 'Order not found');
    END IF;

    --------------------------------------------------------------------
    -- Paso 2 – Idempotencia (stock_decremented, incidencias previas y payment_id)
    --------------------------------------------------------------------
    -- 2.1 Orden ya procesada completamente con stock descontado
    IF v_order.stock_decremented THEN
        IF v_order.payment_id = p_payment_id THEN
            RETURN jsonb_build_object(
                'success',           TRUE,
                'already_processed', TRUE,
                'code',              'idempotent');
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Order already linked to a different payment');
        END IF;
    END IF;

    -- 2.2 Orden ya registrada previamente con este mismo pago bajo incidencia de stock
    IF v_order.payment_status = 'approved' AND v_order.payment_id = p_payment_id AND v_order.status = 'requires_attention' THEN
        RETURN jsonb_build_object(
            'success',           TRUE,
            'already_processed', TRUE,
            'code',              'incident_pending',
            'message',           'Orden previamente registrada con pago aprobado e incidencia de stock pendiente de conciliación manual.',
            'stock_status',      'failed',
            'error',             v_order.stock_error);
    END IF;

    -- 2.3 Conflicto de payment_id ajeno
    IF v_order.payment_id IS NOT NULL THEN
        IF v_order.payment_id <> p_payment_id THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Order already linked to a different payment');
        ELSE
            v_already := TRUE;  -- payment_id coincidente pero stock aún no finalizado
        END IF;
    END IF;

    --------------------------------------------------------------------
    -- Paso 3 – Asociar payment_id (solo si no estaba ya asociado)
    --------------------------------------------------------------------
    IF NOT v_already THEN
        UPDATE orders
           SET payment_id = p_payment_id
         WHERE id = p_order_id;
    END IF;

    --------------------------------------------------------------------
    -- Paso 4 – Intentar decrement_stock_for_order en subtransacción aislada
    --------------------------------------------------------------------
    BEGIN
        PERFORM decrement_stock_for_order(p_order_id);
        v_stock_ok := TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            v_stock_ok := FALSE;
            v_stock_error := SQLERRM;
    END;

    --------------------------------------------------------------------
    -- Paso 5 – Actualizar estados según resultado de stock
    --------------------------------------------------------------------
    IF v_stock_ok THEN
        UPDATE orders
           SET payment_status    = 'approved',
               status            = 'preparing',
               stock_decremented = TRUE,
               stock_error       = NULL,
               updated_at        = NOW()
         WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success',           TRUE,
            'already_processed', FALSE,
            'code',              'processed',
            'stock_status',      'decremented');
    ELSE
        -- Fallo de stock: se preserva el pago y se deja en requires_attention
        UPDATE orders
           SET payment_status    = 'approved',
               status            = 'requires_attention',
               stock_decremented = FALSE,
               stock_error       = v_stock_error,
               notes             = COALESCE(notes || E'\n', '') || '[INCIDENCIA STOCK ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']: ' || v_stock_error,
               updated_at        = NOW()
         WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success',           TRUE,
            'already_processed', FALSE,
            'code',              'stock_failed_requires_attention',
            'message',           'Pago registrado como aprobado, pero ocurrió un fallo al descontar stock. Requiere atención manual.',
            'stock_status',      'failed',
            'error',             v_stock_error);
    END IF;

EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'idx_uniq_orders_payment_id' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_duplicate',
                'message', 'Payment already linked to another order');
        ELSE
            RAISE;
        END IF;
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- Restricción de permisos para process_approved_mp_payment
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION process_approved_mp_payment(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION process_approved_mp_payment(UUID, TEXT) TO postgres;
