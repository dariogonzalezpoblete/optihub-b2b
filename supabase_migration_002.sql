-- Fase 3.5: RPC para Sincronización Transaccional y Control de Concurrencia (OCC)

-- Esta función garantiza atomicidad real (DELETE + INSERT en una sola transacción)
-- y protege contra sobrescrituras entre múltiples dispositivos usando el timestamp actualizado.

CREATE OR REPLACE FUNCTION public.sync_cart(p_cart_id UUID, p_items JSONB, p_last_updated_at TIMESTAMPTZ)
RETURNS JSONB AS $$
DECLARE
    v_current_updated_at TIMESTAMPTZ;
BEGIN
    -- Bloquear la fila del carrito para evitar race conditions simultáneas
    SELECT updated_at INTO v_current_updated_at 
    FROM public.carts 
    WHERE id = p_cart_id AND user_id = auth.uid() 
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Not authorized or cart not found';
    END IF;

    -- Optimistic Concurrency Control (OCC)
    -- Tolerancia de 1 segundo para evitar falsos positivos por truncamiento de milisegundos
    IF p_last_updated_at IS NOT NULL AND v_current_updated_at > (p_last_updated_at + interval '1 second') THEN
        -- El carrito remoto es más nuevo. Rechazamos el push.
        RETURN jsonb_build_object('success', false, 'reason', 'stale', 'current_updated_at', v_current_updated_at);
    END IF;

    -- Ejecución Transaccional y Atómica
    DELETE FROM public.cart_items WHERE cart_id = p_cart_id;

    IF jsonb_array_length(p_items) > 0 THEN
        INSERT INTO public.cart_items (cart_id, product_id, quantity)
        SELECT p_cart_id, (item->>'product_id')::TEXT, (item->>'quantity')::INTEGER
        FROM jsonb_array_elements(p_items) AS item;
    END IF;

    -- Forzar actualización del timestamp y devolverlo
    UPDATE public.carts 
    SET updated_at = NOW() 
    WHERE id = p_cart_id 
    RETURNING updated_at INTO v_current_updated_at;

    RETURN jsonb_build_object('success', true, 'updated_at', v_current_updated_at);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
