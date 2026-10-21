-- supabase_migration_014_webhook_audit_and_idempotency.sql
-- ------------------------------------------------------------
-- 014 – Auditoría de Webhooks e Idempotencia Transaccional para Mercado Pago
-- ------------------------------------------------------------

-- 1. Tabla de auditoría de eventos de webhook procesados
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    action TEXT,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PROCESSED', 'FAILED', 'IGNORED', 'DUPLICATE')),
    error_message TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índice único para evitar procesar dos veces el mismo evento de pago
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_processed_webhooks_payment_event 
ON public.processed_webhooks (payment_id, event_id);

-- 3. Índices de consulta para trazabilidad
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_order_id ON public.processed_webhooks (order_id);
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_payment_id ON public.processed_webhooks (payment_id);
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_status ON public.processed_webhooks (status);
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at ON public.processed_webhooks (processed_at);

-- 4. Seguridad RLS: Solo accesible por backend (service_role)
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on processed_webhooks" ON public.processed_webhooks;
CREATE POLICY "Service role full access on processed_webhooks"
ON public.processed_webhooks
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
