-- supabase_migration_003.sql

-- Fase 5: Inventario Transaccional e Idempotencia

-- 1. Agregar columna para idempotencia a nivel de orden
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT false;

-- 2. Crear tabla de trazabilidad de movimientos (Ledger de Inventario)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL REFERENCES marcos(id_ext) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SALE', 'RETURN', 'ADJUSTMENT')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de búsqueda para trazabilidad
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id);

-- Restricción única para garantizar idempotencia férrea en Base de Datos:
-- Una misma orden NO puede descontar stock dos veces para el mismo producto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_order_product_sale 
ON inventory_movements(order_id, product_id, type) 
WHERE type = 'SALE';


-- 3. Crear función RPC transaccional para descontar inventario
-- SECURITY DEFINER ejecuta la función con los privilegios del creador (Owner)
-- Esto permite que la función pueda alterar `marcos` y `orders` aunque RLS esté bloqueado,
-- pero agregaremos validaciones para que SOLO el backend de OptiHub pueda usarla.
CREATE OR REPLACE FUNCTION decrement_stock_for_order(p_order_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_item_count INTEGER;
    v_processed_count INTEGER;
BEGIN
    -- A. Seguridad: Impedir que el frontend público llame a esta función.
    -- current_setting('role') devuelve 'anon' o 'authenticated' si se llama vía Data API cliente.
    -- Queremos que solo 'service_role' (nuestro Backend Next.js) pueda ejecutarla.
    IF current_setting('role', true) IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Unauthorized: Solo el servidor backend puede ejecutar transacciones de stock';
    END IF;

    -- B. Bloqueo de la Orden (OCC / Pesimista para webhook simultáneo)
    -- Esto previene que si el webhook de Mercado Pago llega 3 veces en el mismo milisegundo,
    -- las tres ejecuciones intenten leer al mismo tiempo. Solo una pasa.
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
    END IF;

    -- C. Idempotencia: Si la orden ya descontó stock, salimos pacíficamente.
    IF v_order.stock_decremented THEN
        RETURN jsonb_build_object('success', true, 'message', 'Stock ya fue descontado previamente', 'already_processed', true);
    END IF;

    -- D. Contar cuántos items existen en la orden
    SELECT COUNT(*) INTO v_item_count FROM order_items WHERE order_id = p_order_id;
    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'La orden no tiene productos';
    END IF;

    -- E. Procesar descuento bloqueando las filas del catálogo (Evita Overselling)
    -- El ORDER BY product_id es crucial para evitar Deadlocks si dos usuarios 
    -- compran los mismos productos en distinto orden al mismo tiempo.
    v_processed_count := 0;

    FOR v_item IN
        SELECT oi.product_id, oi.quantity, oi.product_name, m.stock
        FROM order_items oi
        JOIN marcos m ON oi.product_id = m.id_ext
        WHERE oi.order_id = p_order_id
        ORDER BY oi.product_id
        FOR UPDATE OF m -- Bloquea la fila del producto en `marcos`
    LOOP
        -- Validación estricta
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida % para el producto %', v_item.quantity, v_item.product_id;
        END IF;

        IF v_item.stock IS NULL THEN
            RAISE EXCEPTION 'El producto % tiene stock NULL, no se puede descontar', v_item.product_id;
        END IF;

        -- Validar si hay suficiente stock disponible
        IF v_item.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto %. Solicitado: %, Disponible: %', v_item.product_id, v_item.quantity, v_item.stock;
        END IF;

        -- F. Aplicar el descuento
        UPDATE marcos
        SET stock = stock - v_item.quantity
        WHERE id_ext = v_item.product_id;

        -- G. Registrar en el Ledger (Trazabilidad)
        INSERT INTO inventory_movements (product_id, order_id, quantity, type, notes)
        VALUES (v_item.product_id, p_order_id, -(v_item.quantity), 'SALE', 'Descuento transaccional por orden confirmada');

        v_processed_count := v_processed_count + 1;
    END LOOP;

    -- H. Integridad Relacional: Verificar que todos los productos de la orden aún existan en catálogo
    IF v_item_count != v_processed_count THEN
        RAISE EXCEPTION 'Fallo de integridad: Uno o más productos de la orden ya no existen en el catálogo maestro';
    END IF;

    -- I. Marcar la orden como procesada
    UPDATE orders
    SET stock_decremented = true
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Inventario descontado exitosamente');
END;
$$;
