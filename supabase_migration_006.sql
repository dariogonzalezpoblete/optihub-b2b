-- supabase_migration_006.sql
-- Fase 7.5: Atomicidad Real e Idempotencia Férrea del Checkout

-- 1. Trazabilidad absoluta: cada orden nace de exactamente un carrito.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES public.carts(id) ON DELETE SET NULL;

-- 2. Índice Único Incondicional: 1 Carrito = Máximo 1 Orden.
-- Un carrito es desechable. Una vez que crea una orden (sea que esta termine pagada o cancelada),
-- el carrito queda "converted" para siempre y no puede generar más órdenes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_order_per_cart 
ON public.orders(cart_id);

-- 3. Procedimiento Almacenado (RPC) de Atomicidad Real.
-- Garantiza que Validar, Calcular Precios, Insertar Orden, Insertar Items y Convertir Carrito
-- ocurran dentro de una ÚNICA transacción PostgreSQL (ACID).
CREATE OR REPLACE FUNCTION process_b2b_checkout(
    p_user_id UUID,
    p_cart_id UUID,
    p_billing JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- A. Bloqueo Pesimista (Concurrencia)
    -- Si dos requests idénticos llegan al mismo milisegundo, el primero bloquea la fila.
    -- El segundo esperará aquí hasta que el primero termine (Commit o Rollback).
    SELECT status INTO v_cart_status
    FROM public.carts
    WHERE id = p_cart_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El carrito no existe o no pertenece al usuario autenticado.';
    END IF;

    -- B. Idempotencia: Si el carrito ya fue convertido por el Request 1, el Request 2 entra aquí.
    IF v_cart_status != 'active' THEN
        SELECT id INTO v_order_id FROM public.orders WHERE cart_id = p_cart_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'message', 'Carrito ya convertido. Retornando orden existente.');
        ELSE
            RAISE EXCEPTION 'Estado inconsistente: Carrito inactivo pero sin orden asociada.';
        END IF;
    END IF;

    -- C. Validación de Catálogo y Cálculo de Precios Server-Side
    -- Leemos directamente desde cart_items, cruzando con la tabla real de marcos.
    FOR v_item IN SELECT product_id, quantity FROM public.cart_items WHERE cart_id = p_cart_id LOOP
        SELECT precio_neto_clp, marca, modelo, codigo_color 
        INTO v_db_product 
        FROM public.marcos 
        WHERE id_ext = v_item.product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Integridad fallida: Producto % no encontrado en catálogo.', v_item.product_id;
        END IF;

        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para el producto: %', v_item.product_id;
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
