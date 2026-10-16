-- supabase_migration_004.sql

-- Fase 5.5: Hardening e Integridad de Inventario

-- 1. Asegurar la tabla del Ledger (inventory_movements)
-- Nadie desde el frontend (anon, authenticated) puede leer, insertar, actualizar ni borrar.
-- Solo el backend (service_role) o administradores directos de BD pueden alterarla.
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
-- Al habilitar RLS y no proveer ninguna política, se bloquea TODO acceso público por defecto.

-- 2. Restringir la ejecución de la RPC a nivel de permisos de PostgreSQL
-- Defensa en profundidad: Además de la verificación interna `current_setting`, quitamos los permisos de ejecución.
REVOKE EXECUTE ON FUNCTION decrement_stock_for_order(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrement_stock_for_order(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION decrement_stock_for_order(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION decrement_stock_for_order(UUID) TO service_role;
-- (Opcional) GRANT a superusuario de Supabase
GRANT EXECUTE ON FUNCTION decrement_stock_for_order(UUID) TO postgres;

-- 3. Inmutabilidad de Órdenes Procesadas
-- Evitar modificaciones silenciosas que desfasen `order_items` vs `inventory_movements`
CREATE OR REPLACE FUNCTION prevent_processed_order_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock_decremented BOOLEAN;
BEGIN
    -- Validar tabla orders
    IF TG_TABLE_NAME = 'orders' THEN
        IF OLD.stock_decremented = true THEN
            -- Bloqueamos cambios a campos financieros clave si la orden ya descontó stock.
            IF OLD.total_amount != NEW.total_amount 
               OR OLD.subtotal_net != NEW.subtotal_net 
               OR OLD.tax_amount != NEW.tax_amount THEN
                RAISE EXCEPTION 'Hardening: No se pueden modificar los montos de una orden que ya fue descontada del inventario. Usa un proceso de ajuste/reembolso.';
            END IF;
        END IF;
        RETURN NEW;
        
    -- Validar tabla order_items
    ELSIF TG_TABLE_NAME = 'order_items' THEN
        SELECT stock_decremented INTO v_stock_decremented FROM orders WHERE id = OLD.order_id;
        IF v_stock_decremented = true THEN
            -- Prohibimos cambiar qué producto es o la cantidad si ya se movió stock.
            -- Esto obligaría a un administrador a usar un flujo de devoluciones formal.
            IF OLD.quantity != NEW.quantity 
               OR OLD.product_id != NEW.product_id 
               OR OLD.unit_price_net != NEW.unit_price_net THEN
                RAISE EXCEPTION 'Hardening: No se pueden alterar los items de una orden que ya fue procesada en inventario.';
            END IF;
        END IF;
        
        -- Evitar borrado de items procesados
        IF TG_OP = 'DELETE' AND v_stock_decremented = true THEN
             RAISE EXCEPTION 'Hardening: No se pueden eliminar items de una orden procesada.';
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_order_mod ON orders;
CREATE TRIGGER tr_prevent_order_mod
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE PROCEDURE prevent_processed_order_modification();

DROP TRIGGER IF EXISTS tr_prevent_order_items_mod ON order_items;
CREATE TRIGGER tr_prevent_order_items_mod
BEFORE UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE PROCEDURE prevent_processed_order_modification();

-- 4. Constraint de Stock >= 0
-- Verifica primero si existen stocks negativos en la base de datos viva.
-- Si hay, imprime una advertencia, pero si está todo en orden, aplica la restricción a nivel BD.
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM marcos WHERE stock < 0) THEN
    RAISE NOTICE 'Hardening Omitido: Existen filas en "marcos" con stock < 0. No se pudo aplicar CHECK (stock >= 0). Favor corregir los datos manualmente antes de aplicar constraint.';
  ELSE
    ALTER TABLE marcos ADD CONSTRAINT chk_marcos_stock_nonnegative CHECK (stock >= 0);
  END IF;
END $$;
