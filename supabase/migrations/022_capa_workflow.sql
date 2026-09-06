-- Nura · Paso 3 — CAPA workflow secuencial
-- Idempotente. Ejecutar tras 021.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS nc_quarantine_severity_threshold TEXT DEFAULT 'major';

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS capa_stage TEXT DEFAULT 'identification';

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS containment_description TEXT;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS containment_completed_at TIMESTAMPTZ;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS capa_target_close_date DATE;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS effectiveness_due_date DATE;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS effectiveness_result TEXT DEFAULT 'pending';

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS effectiveness_notes TEXT;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS effectiveness_verified_at TIMESTAMPTZ;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS lot_quarantined BOOLEAN DEFAULT FALSE;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS evidence_url TEXT;

CREATE TABLE IF NOT EXISTS capa_stage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nc_id UUID NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comment TEXT,
  signature_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capa_stage_log_nc
  ON capa_stage_log(nc_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nonconformities_capa_stage
  ON nonconformities(organization_id, capa_stage);

CREATE INDEX IF NOT EXISTS idx_nonconformities_assigned
  ON nonconformities(organization_id, assigned_to);

ALTER TABLE capa_stage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capa_stage_log_org" ON capa_stage_log;
CREATE POLICY "capa_stage_log_org" ON capa_stage_log FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

UPDATE nonconformities
SET capa_stage = CASE
  WHEN status = 'closed' THEN 'closed'
  WHEN root_cause_summary IS NOT NULL AND status IN ('in_progress', 'pending_verification') THEN 'implementation'
  WHEN root_cause_summary IS NOT NULL THEN 'action_plan'
  ELSE COALESCE(capa_stage, 'identification')
END
WHERE capa_stage IS NULL OR capa_stage = 'identification';

UPDATE nonconformities
SET capa_target_close_date = due_date
WHERE capa_target_close_date IS NULL AND due_date IS NOT NULL;

UPDATE nonconformities
SET lot_quarantined = TRUE
WHERE lot_quarantined = FALSE
  AND lot_number IS NOT NULL
  AND trim(lot_number) <> ''
  AND severity IN ('critical', 'major');
