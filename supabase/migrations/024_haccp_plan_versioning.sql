-- Nura · Paso 5 — HACCP: versionado, vínculo registros, NC por CCP
-- Idempotente. Ejecutar tras 023.

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'draft';

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS next_review_date DATE;

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE haccp_products
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS production_template_id UUID REFERENCES production_form_templates(id) ON DELETE SET NULL;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS production_field_id UUID REFERENCES production_form_fields(id) ON DELETE SET NULL;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS critical_limit_min NUMERIC;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS critical_limit_max NUMERIC;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS critical_limit_unit TEXT;

ALTER TABLE haccp_ccps
  ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMPTZ;

ALTER TABLE nonconformities
  ADD COLUMN IF NOT EXISTS haccp_ccp_id UUID REFERENCES haccp_ccps(id) ON DELETE SET NULL;

ALTER TABLE production_form_submissions
  ADD COLUMN IF NOT EXISTS haccp_ccp_id UUID REFERENCES haccp_ccps(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS haccp_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES haccp_products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date DATE,
  next_review_date DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  signature_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, version_number)
);

CREATE TABLE IF NOT EXISTS haccp_plan_version_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES haccp_products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  version_id UUID REFERENCES haccp_plan_versions(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comment TEXT,
  signature_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_plan_versions_product ON haccp_plan_versions(product_id);
CREATE INDEX IF NOT EXISTS idx_haccp_plan_version_log_product ON haccp_plan_version_log(product_id);
CREATE INDEX IF NOT EXISTS idx_haccp_ccps_template ON haccp_ccps(production_template_id);
CREATE INDEX IF NOT EXISTS idx_nonconformities_ccp ON nonconformities(haccp_ccp_id);

ALTER TABLE haccp_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_plan_version_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "haccp_plan_versions_select" ON haccp_plan_versions;
CREATE POLICY "haccp_plan_versions_select" ON haccp_plan_versions FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "haccp_plan_versions_insert" ON haccp_plan_versions;
CREATE POLICY "haccp_plan_versions_insert" ON haccp_plan_versions FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "haccp_plan_versions_update" ON haccp_plan_versions;
CREATE POLICY "haccp_plan_versions_update" ON haccp_plan_versions FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "haccp_plan_version_log_select" ON haccp_plan_version_log;
CREATE POLICY "haccp_plan_version_log_select" ON haccp_plan_version_log FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "haccp_plan_version_log_insert" ON haccp_plan_version_log;
CREATE POLICY "haccp_plan_version_log_insert" ON haccp_plan_version_log FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
