-- Nura · Dedup de notifications vía ON CONFLICT (PostgREST)
-- El UNIQUE parcial de 007 no sirve como target de ON CONFLICT sin WHERE.
-- Un UNIQUE constraint permite múltiples NULL (mismo comportamiento)
-- y PostgREST puede hacer INSERT ... ON CONFLICT DO NOTHING.
-- Formaliza notifications en supabase_realtime (el consumidor ya existe).

DROP INDEX IF EXISTS public.idx_notifications_dedup;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_dedup_key;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_dedup_key
  UNIQUE (organization_id, user_id, dedup_key);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
