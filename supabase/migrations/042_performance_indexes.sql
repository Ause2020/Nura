-- Nura · Índices de consultas (dashboard, kiosco, monitoreo, upserts)
--
-- Número: 042 (040_kiosk_metrics.sql y 041_optimize_rls.sql ya existen).
-- No se ejecutó. Idempotente.
--
-- CONCURRENTLY: no se usa aquí. supabase db push / APPLY_ALL envuelven cada
-- archivo en una transacción; CREATE INDEX CONCURRENTLY no puede correr
-- dentro de BEGIN/COMMIT. Equivalente para producción en caliente (SQL Editor
-- sin transacción): ver INDEX_OPTIMIZATION_REPORT.md § Producción.
--
-- No duplica índices de 006, 007, 021, 023, 030, 033, 034, 039 ni 041.
-- Solo huecos con query real y selectividad que no cubre un índice existente.

-- 1. Numeración de NC: org + prefijo + ORDER nc_number DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_nonconformities_org_nc_number
  ON public.nonconformities (organization_id, nc_number DESC);

-- 2. Listas / cron de NC abiertas (no usa el índice de detected_at de todas)
CREATE INDEX IF NOT EXISTS idx_nonconformities_org_open_detected
  ON public.nonconformities (organization_id, detected_at DESC)
  WHERE status <> 'closed';

-- 3. Submit de monitoreo → vínculo CCP v1 por plantilla
CREATE INDEX IF NOT EXISTS idx_haccp_ccps_org_template
  ON public.haccp_ccps (organization_id, production_template_id)
  WHERE production_template_id IS NOT NULL;
