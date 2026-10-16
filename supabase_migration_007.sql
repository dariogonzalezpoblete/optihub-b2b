-- supabase_migration_007.sql
-- Fase de Idempotencia de Preference para Mercado Pago

-- 1. Añadir columnas para almacenar la preferencia y su link de pago.
-- Ambas son NULL por defecto, ya que la orden se crea de forma atómica
-- ANTES de llamar a Mercado Pago.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS preference_id TEXT NULL,
ADD COLUMN IF NOT EXISTS init_point TEXT NULL;

-- 2. Restricción de Unicidad (Índice Parcial)
-- Asegura que no existan dos órdenes distintas que accidentalmente
-- compartan el mismo ID de preferencia de Mercado Pago.
-- Ignora los NULL, permitiendo órdenes "pending" aún sin Preference.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_preference_id 
ON public.orders(preference_id) 
WHERE preference_id IS NOT NULL;
