-- supabase_migration_009_rpc.sql
-- ------------------------------------------------------------
-- 009 – RPC que procesa el pago aprobado (Mercado Pago) de forma atómica
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_approved_mp_payment(
    p_order_id   UUID,
    p_payment_id TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   RECORD;
    v_already BOOLEAN := FALSE;
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
    -- Paso 2 – Idempotencia (stock_decremented y payment_id)
    --------------------------------------------------------------------
    IF v_order.stock_decremented THEN
        IF v_order.payment_id = p_payment_id THEN
            RETURN jsonb_build_object(
                'success',          TRUE,
                'already_processed',TRUE,
                'code',             'idempotent');
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Order already linked to a different payment');
        END IF;
    END IF;

    IF v_order.payment_id IS NOT NULL THEN
        IF v_order.payment_id <> p_payment_id THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'code',    'payment_conflict',
                'message', 'Order already linked to a different payment');
        ELSE
            v_already := TRUE;  -- payment_id coincidente pero stock aún no descontado
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
    -- Paso 4 – Ejecutar decrement_stock_for_order (atómico)
    --------------------------------------------------------------------
    PERFORM decrement_stock_for_order(p_order_id);

    --------------------------------------------------------------------
    -- Paso 5 – Actualizar estados y marca de stock
    --------------------------------------------------------------------
    UPDATE orders
       SET payment_status = 'approved',
           status         = 'preparing',
           stock_decremented = TRUE,
           updated_at     = NOW()
     WHERE id = p_order_id;

    --------------------------------------------------------------------
    -- Paso 6 – Resultado exitoso
    --------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', TRUE,
        'already_processed', FALSE,
        'code', 'processed');

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
        -- Propagar cualquier error técnico (stock insuficiente, constraints, …)
        RAISE;
END;
$$;

-- ------------------------------------------------------------
-- 009b – Control de permisos (solo service_role puede ejecutar)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID,TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION process_approved_mp_payment(UUID,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION process_approved_mp_payment(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION process_approved_mp_payment(UUID,TEXT) TO postgres;  -- opcional para admin
