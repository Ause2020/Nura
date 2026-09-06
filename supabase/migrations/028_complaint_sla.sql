-- Nura · Paso 9 — SLA de reclamos y trazabilidad de estado
-- Idempotente. Ejecutar tras 027.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS complaint_response_sla_hours INTEGER DEFAULT 72;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS complaint_auto_nc_severity TEXT DEFAULT 'safety_critical';

ALTER TABLE customer_complaints
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ;

ALTER TABLE customer_complaints
  ADD COLUMN IF NOT EXISTS response_responsible UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE customer_complaints
  ADD COLUMN IF NOT EXISTS auto_nc_created BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS complaint_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES customer_complaints(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_response_due
  ON customer_complaints(organization_id, response_due_at);

CREATE INDEX IF NOT EXISTS idx_complaint_status_log_complaint
  ON complaint_status_log(complaint_id, created_at DESC);

ALTER TABLE complaint_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "complaint_status_log_org" ON complaint_status_log;
CREATE POLICY "complaint_status_log_org" ON complaint_status_log FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

UPDATE customer_complaints
SET response_due_at = (received_date::timestamptz + INTERVAL '72 hours')
WHERE response_due_at IS NULL;
