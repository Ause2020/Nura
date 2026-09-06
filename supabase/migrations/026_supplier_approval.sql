-- Nura · Paso 7 — Homologación de proveedores, scorecard configurable, portal
-- Idempotente. Ejecutar tras 025.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS approval_stage TEXT DEFAULT 'request';

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS re_evaluation_months INTEGER;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS approval_signature_hash TEXT;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nonconformities_supplier
  ON nonconformities(supplier_id);

ALTER TABLE supplier_documents
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';

ALTER TABLE supplier_documents
  ADD COLUMN IF NOT EXISTS portal_upload BOOLEAN DEFAULT FALSE;

ALTER TABLE supplier_documents
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE supplier_documents
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS supplier_scorecard_weights JSONB
  DEFAULT '{"quality":0.4,"compliance":0.3,"delivery":0.2,"service":0.1}'::jsonb;

CREATE TABLE IF NOT EXISTS supplier_approval_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  criticality TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  doc_type TEXT,
  required BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  UNIQUE (organization_id, criticality, item_key)
);

CREATE TABLE IF NOT EXISTS supplier_approval_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  checked BOOLEAN DEFAULT FALSE,
  checked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (supplier_id, item_key)
);

CREATE TABLE IF NOT EXISTS supplier_approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comment TEXT,
  signature_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_approval_log_supplier
  ON supplier_approval_log(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_portal_tokens_token
  ON supplier_portal_tokens(token);

CREATE INDEX IF NOT EXISTS idx_supplier_approval_checklist_org
  ON supplier_approval_checklist(organization_id, criticality);

ALTER TABLE supplier_approval_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_approval_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_approval_checklist_org" ON supplier_approval_checklist;
CREATE POLICY "supplier_approval_checklist_org" ON supplier_approval_checklist FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "supplier_approval_responses_org" ON supplier_approval_responses;
CREATE POLICY "supplier_approval_responses_org" ON supplier_approval_responses FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "supplier_approval_log_org" ON supplier_approval_log;
CREATE POLICY "supplier_approval_log_org" ON supplier_approval_log FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "supplier_portal_tokens_org" ON supplier_portal_tokens;
CREATE POLICY "supplier_portal_tokens_org" ON supplier_portal_tokens FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

UPDATE suppliers
SET approval_stage = CASE
  WHEN status = 'approved' THEN 'active'
  WHEN status = 'conditional' THEN 'review'
  WHEN status = 'suspended' THEN 'suspended'
  ELSE COALESCE(approval_stage, 'request')
END
WHERE approval_stage IS NULL OR approval_stage = 'request';

UPDATE suppliers
SET re_evaluation_months = CASE criticality
  WHEN 'critical' THEN 6
  WHEN 'major' THEN 12
  ELSE 24
END
WHERE re_evaluation_months IS NULL;

UPDATE supplier_documents
SET review_status = 'approved'
WHERE review_status IS NULL;
