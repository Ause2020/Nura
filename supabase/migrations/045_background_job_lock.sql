-- Nura · Lock anti-solape del cron + índices para prefiltro multi-org
-- No desactiva jobs. No cambia RLS de negocio.

CREATE TABLE IF NOT EXISTS public.background_job_locks (
  job_key text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.background_job_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_job_lock(
  p_job text,
  p_ttl_seconds integer DEFAULT 480
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  INSERT INTO public.background_job_locks (job_key, locked_until, started_at)
  VALUES (p_job, now() + make_interval(secs => GREATEST(p_ttl_seconds, 30)), now())
  ON CONFLICT (job_key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        started_at = now()
    WHERE public.background_job_locks.locked_until < now()
  RETURNING job_key INTO v_key;

  RETURN v_key IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_job_lock(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_job_lock(text, integer) TO service_role;

-- Prefiltro del cron: NC abiertas con vencimiento (todas las orgs)
CREATE INDEX IF NOT EXISTS idx_nonconformities_open_due_global
  ON public.nonconformities (due_date)
  WHERE status <> 'closed' AND due_date IS NOT NULL;

-- Prefiltro del cron: auditorías abiertas por fecha
CREATE INDEX IF NOT EXISTS idx_audits_open_scheduled_global
  ON public.audits (scheduled_date)
  WHERE status IN ('scheduled', 'in_progress');
