-- Nura · Rate limiting distribuido (Postgres)
-- Contadores atómicos + log de abuso. Solo service_role.
-- Idempotente.
--
-- Correr SOLO este archivo en el SQL Editor (no APPLY_ALL).
-- Si el editor corta la conexión, pegá cada STEP por separado.

-- STEP 1 — tablas + RLS
-- UNLOGGED: sin WAL. Barato en Disk IO; se pierde en crash (aceptable para cupos).
CREATE UNLOGGED TABLE IF NOT EXISTS public.rate_limit_windows (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rate_limit_windows'
      AND c.relpersistence = 'p'
  ) THEN
    ALTER TABLE public.rate_limit_windows SET UNLOGGED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.security_abuse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  policy text NOT NULL,
  path text NOT NULL,
  method text NOT NULL,
  subject_type text NOT NULL,
  subject_hash text NOT NULL,
  retry_after_sec integer
);

CREATE INDEX IF NOT EXISTS security_abuse_events_created_at_idx
  ON public.security_abuse_events (created_at DESC);

ALTER TABLE public.rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_abuse_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_windows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_abuse_events FROM PUBLIC, anon, authenticated;

-- STEP 2 — funciones
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_allowed boolean;
  v_retry integer;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', GREATEST(1, COALESCE(p_window_seconds, 60))
    );
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_windows AS w
    (bucket_key, window_start, hit_count, updated_at)
  VALUES (p_key, v_window_start, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET
      hit_count = CASE
        WHEN w.window_start = EXCLUDED.window_start THEN w.hit_count + 1
        ELSE 1
      END,
      window_start = EXCLUDED.window_start,
      updated_at = EXCLUDED.updated_at
  RETURNING hit_count INTO v_count;

  v_allowed := v_count <= p_limit;
  v_retry := GREATEST(
    1,
    p_window_seconds - (extract(epoch FROM v_now) - extract(epoch FROM v_window_start))::integer
  );

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining', GREATEST(0, p_limit - v_count),
    'retry_after', CASE WHEN v_allowed THEN 0 ELSE v_retry END,
    'count', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_rate_limits(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_result jsonb;
  v_allowed boolean := true;
  v_retry integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after', 0, 'unavailable', true);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_result := public.consume_rate_limit(
      v_item->>'key',
      GREATEST(1, COALESCE((v_item->>'limit')::integer, 1)),
      GREATEST(1, COALESCE((v_item->>'window_seconds')::integer, 60))
    );
    IF COALESCE((v_result->>'allowed')::boolean, false) = false THEN
      v_allowed := false;
      v_retry := GREATEST(v_retry, COALESCE((v_result->>'retry_after')::integer, 1));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'retry_after', CASE WHEN v_allowed THEN 0 ELSE v_retry END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rate_limit_abuse(
  p_policy text,
  p_path text,
  p_method text,
  p_subject_type text,
  p_subject_hash text,
  p_retry_after integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_abuse_events (
    policy,
    path,
    method,
    subject_type,
    subject_hash,
    retry_after_sec
  ) VALUES (
    left(COALESCE(p_policy, 'unknown'), 32),
    left(COALESCE(p_path, '/'), 200),
    left(COALESCE(p_method, 'GET'), 12),
    left(COALESCE(p_subject_type, 'ip'), 16),
    left(COALESCE(p_subject_hash, 'unknown'), 64),
    p_retry_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_windows(
  p_older_than interval DEFAULT interval '2 days'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.rate_limit_windows
  WHERE updated_at < now() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- STEP 3 — permisos (solo service_role)
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limits(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_rate_limit_abuse(text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_windows(interval) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limits(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_rate_limit_abuse(text, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_windows(interval) TO service_role;
