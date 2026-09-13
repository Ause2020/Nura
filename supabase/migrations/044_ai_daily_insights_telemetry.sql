-- Nura · Telemetría de ai_daily_insights + UNIQUE org+fecha (ya existía en 033)
-- No cambia RLS. Un insight por organización y día.

ALTER TABLE public.ai_daily_insights
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS generation_result text;

DO $$
BEGIN
  ALTER TABLE public.ai_daily_insights
    ADD CONSTRAINT ai_daily_insights_organization_id_period_date_key
    UNIQUE (organization_id, period_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN unique_violation THEN NULL;
END $$;
