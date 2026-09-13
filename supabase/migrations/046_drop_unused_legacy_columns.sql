-- Nura · Columnas residuales en tablas vivas (sin consumidores de app)
-- NO dropea tablas. Ver LEGACY_DATABASE_CLEANUP_PLAN.md.
--
-- Quita FKs que bloquean un DROP futuro de haccp_ccps / suppliers,
-- y settings de reclamos/scorecard que la API ya no escribe.
--
-- Antes de aplicar, en el SQL Editor:
--   SELECT count(*) FROM nonconformities WHERE haccp_ccp_id IS NOT NULL;
--   SELECT count(*) FROM nonconformities WHERE supplier_id IS NOT NULL;
--   SELECT count(*) FROM production_form_submissions WHERE haccp_ccp_id IS NOT NULL;
-- Filas > 0 = se pierde el puntero histórico (la NC / el registro se conservan).

-- ─── nonconformities ───────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_nonconformities_ccp;
DROP INDEX IF EXISTS public.idx_nonconformities_supplier;

ALTER TABLE public.nonconformities
  DROP COLUMN IF EXISTS haccp_ccp_id;

ALTER TABLE public.nonconformities
  DROP COLUMN IF EXISTS supplier_id;

-- ─── production_form_submissions ───────────────────────────────────

ALTER TABLE public.production_form_submissions
  DROP COLUMN IF EXISTS haccp_ccp_id;

-- No existe en 021–045; por si un entorno la añadió a mano.
ALTER TABLE public.production_form_fields
  DROP COLUMN IF EXISTS haccp_ccp_id;

-- ─── organizations (settings de módulos retirados) ─────────────────

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS complaint_response_sla_hours;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS complaint_auto_nc_severity;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS supplier_scorecard_weights;
