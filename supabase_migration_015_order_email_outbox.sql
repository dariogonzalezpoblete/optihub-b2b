-- supabase_migration_015_order_email_outbox.sql
-- ------------------------------------------------------------
-- 015 – Bandeja de Salida Transaccional (Transactional Outbox)
--       para Notificaciones de Pedidos Confirmados y Despacho Resiliente
-- ------------------------------------------------------------

-- 1. Tabla persistente de bandeja de salida de correos
CREATE TABLE IF NOT EXISTS public.order_email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    idempotency_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    claim_token UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uniq_order_email_outbox_order_id UNIQUE (order_id)
);

-- Asegurar columna claim_token en caso de actualización sobre tabla preexistente
ALTER TABLE public.order_email_outbox ADD COLUMN IF NOT EXISTS claim_token UUID;

-- 2. Índices de rendimiento para el despachador y recuperación
CREATE INDEX IF NOT EXISTS idx_order_email_outbox_dispatch 
ON public.order_email_outbox (status, next_retry_at) 
WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_order_email_outbox_order_id 
ON public.order_email_outbox (order_id);

CREATE INDEX IF NOT EXISTS idx_order_email_outbox_payment_id 
ON public.order_email_outbox (payment_id);

CREATE INDEX IF NOT EXISTS idx_order_email_outbox_idempotency 
ON public.order_email_outbox (idempotency_key);

-- 3. Seguridad RLS: Solo accesible por backend (service_role)
ALTER TABLE public.order_email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on order_email_outbox" ON public.order_email_outbox;
CREATE POLICY "Service role full access on order_email_outbox"
ON public.order_email_outbox
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
