-- supabase_migration_011_cancelled_order_webhook_guard.sql
-- ------------------------------------------------------------
-- 011 – Salvaguarda de Órdenes Canceladas/Reemplazadas en Webhook (Etapa 2A)
--       Evita descuento de stock y estado 'preparing' si llega un pago
--       tardío aprobado sobre una orden que fue cancelada o reemplazada.
--
-- NOTA IMPORTANTE:
-- Este script es de preparación local (Etapa 2A).
-- NO ejecutar automáticamente en Supabase sin autorización expresa del usuario.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_approved_mp_payment(
    p_order_id UUID,
    p_payment_id TEXT
)
RETURNS jsonb
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
    v_clean_payment   TEXT;
BEGIN
    --------------------------------------------------------------------
    -- Paso 0 – Validación defensiva de parámetros de entrada
    --------------------------------------------------------------------
    IF p_order_id IS NULL OR p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'code',    'invalid_parameters',
            'message', 'p_order_id and a non-empty p_payment_id are required');
    END IF;

    v_clean_payment := btrim(p_payment_id);

    --------------------------------------------------------------------
    -- Paso 1 – Bloquear la orden de forma pesimista
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
    -- Paso 2 – Idempotencia (stock_decremented, payment_id, incidencias y estados posteriores al pago)
    --------------------------------------------------------------------
    -- 2.1 Orden ya procesada completamente con stock descontado
    IF v_order.stock_decremented THEN
        IF v_order.payment_id = v_clean_payment THEN
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

    -- 2.2 Conflicto de payment_id ajeno (protege cualquier estado de la orden cuando stock_decremented = FALSE)
    IF v_order.payment_id IS NOT NULL THEN
        IF v_order.payment_id <> v_clean_payment THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Order already linked to a different payment');
        ELSE
            v_already := TRUE;  -- payment_id coincidente
        END IF;
    END IF;

    -- 2.3 Orden en requires_attention (incidencia de stock o pago tardío en orden cancelada):
    --     Distinción estructural sin depender de textos frágiles:
    --     - Si stock_error IS NOT NULL: ocurrió un fallo real en decrement_stock_for_order ('failed').
    --     - Si stock_error IS NULL: el descuento de inventario fue omitido deliberadamente ('skipped').
    IF v_order.status = 'requires_attention' THEN
        IF v_order.payment_status = 'refunded' THEN
            RETURN jsonb_build_object(
                'success',           TRUE,
                'already_processed', TRUE,
                'code',              'idempotent',
                'message',           'Order payment was already refunded');
        END IF;

        IF v_order.payment_status = 'approved' AND v_order.payment_id = v_clean_payment THEN
            RETURN jsonb_build_object(
                'success',           TRUE,
                'already_processed', TRUE,
                'code',              'incident_pending',
                'message',           'Orden previamente registrada con pago aprobado e incidencia pendiente de conciliación manual.',
                'stock_status',      CASE WHEN v_order.stock_error IS NOT NULL THEN 'failed' ELSE 'skipped' END,
                'error',             v_order.stock_error);
        END IF;

        -- Si la orden fue puesta en requires_attention antes de registrar el pago aprobado,
        -- asentar el pago sin descontar stock automáticamente ni sobrescribir el estado a 'preparing'.
        UPDATE orders
           SET payment_id        = v_clean_payment,
               payment_status    = 'approved',
               stock_decremented = FALSE,
               notes             = COALESCE(notes || E'\n', '') || '[INCIDENCIA ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']: Pago aprobado ' || v_clean_payment || ' recibido sobre orden en requires_attention. Stock NO descontado automáticamente.',
               updated_at        = NOW()
         WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success',           TRUE,
            'already_processed', FALSE,
            'code',              'incident_pending',
            'message',           'Pago registrado sobre orden en revisión manual. Stock no descontado automáticamente.',
            'stock_status',      CASE WHEN v_order.stock_error IS NOT NULL THEN 'failed' ELSE 'skipped' END,
            'error',             v_order.stock_error);
    END IF;

    -- 2.4 Salvaguarda: Orden cancelada/reemplazada (Etapa 2A - Protección contra pagos tardíos)
    --     Si el cliente pagó tardíamente una preferencia de una orden cancelada,
    --     NO se debe descontar stock ni pasar a 'preparing'.
    --     Se registra el pago para auditoría/contabilidad, se mantiene stock_error = NULL
    --     (pues el stock fue omitido deliberadamente, no falló) y se traslada a 'requires_attention'.
    IF v_order.status = 'cancelled' THEN
        UPDATE orders
           SET payment_id        = v_clean_payment,
               payment_status    = 'approved',
               status            = 'requires_attention',
               stock_decremented = FALSE,
               stock_error       = NULL,
               notes             = COALESCE(notes || E'\n', '') || '[INCIDENCIA ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']: Pago aprobado ' || v_clean_payment || ' recibido sobre orden cancelada/reemplazada. Stock NO descontado. Requiere conciliación manual o reembolso.',
               updated_at        = NOW()
         WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success',           TRUE,
            'already_processed', FALSE,
            'code',              'cancelled_order_paid_requires_attention',
            'message',           'Pago registrado sobre orden cancelada. Stock no descontado. Requiere conciliación manual o reembolso.',
            'stock_status',      'skipped');
    END IF;

    -- 2.5 Salvaguarda: Estados posteriores al pago o terminales ('refunded', 'paid', 'preparing', 'shipped', 'delivered')
    --     Evita que un webhook repetido (ej. tras reembolso o tras conciliación/despacho manual con stock_decremented = FALSE)
    --     descuente inventario por segunda vez o revierta el estado de la orden a 'preparing'.
    IF v_order.payment_status = 'refunded' OR v_order.status IN ('refunded', 'paid', 'preparing', 'shipped', 'delivered') THEN
        IF v_order.payment_id IS NOT NULL AND v_order.payment_id = v_clean_payment THEN
            RETURN jsonb_build_object(
                'success',           TRUE,
                'already_processed', TRUE,
                'code',              'idempotent',
                'message',           'Order already in post-payment or terminal state: ' || v_order.status);
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Cannot process payment on order in state ' || v_order.status || ' without matching payment_id');
        END IF;
    END IF;

    --------------------------------------------------------------------
    -- Paso 3 – Asociar payment_id (solo si no estaba ya asociado)
    --------------------------------------------------------------------
    IF NOT v_already THEN
        UPDATE orders
           SET payment_id = v_clean_payment
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
            v_stock_error := COALESCE(NULLIF(btrim(SQLERRM), ''), 'Error al descontar inventario');
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
        -- Fallo real de stock: se preserva el pago, se registra stock_error NOT NULL y se deja en requires_attention
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
