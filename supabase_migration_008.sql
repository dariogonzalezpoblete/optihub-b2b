-- supabase_migration_008.sql
-- ------------------------------------------------------------
-- 008 – Garantiza unicidad del payment_id (idempotencia)
-- ------------------------------------------------------------

-- 1. Constraint opcional para evitar strings vacíos
ALTER TABLE public.orders
    ADD CONSTRAINT chk_payment_id_format CHECK (
        payment_id IS NULL OR length(payment_id) > 0
    );

-- 2. Índice único parcial sobre payment_id (NULL permitido)
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_orders_payment_id
    ON public.orders (payment_id)
    WHERE payment_id IS NOT NULL;

-- Nota: No se crea columna payment_mp_id porque payment_id ya cumple con el rol
-- de almacenar el identificador del pago del proveedor.
