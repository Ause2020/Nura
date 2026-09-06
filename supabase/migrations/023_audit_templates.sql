-- Nura · Paso 4 — Plantillas de auditoría configurables
-- Idempotente. Ejecutar tras 022.

CREATE TABLE IF NOT EXISTS audit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  source_standard TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES audit_templates(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES audit_template_sections(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requirement TEXT NOT NULL,
  reference TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES audit_templates(id) ON DELETE SET NULL;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS site_area TEXT;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS site_responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS compliance_by_section JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_templates_org ON audit_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_template_sections_template ON audit_template_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_audit_template_items_section ON audit_template_items(section_id);
CREATE INDEX IF NOT EXISTS idx_audits_template ON audits(template_id);
CREATE INDEX IF NOT EXISTS idx_audits_scheduled ON audits(organization_id, scheduled_date);

ALTER TABLE audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_templates_select" ON audit_templates;
CREATE POLICY "audit_templates_select" ON audit_templates FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_templates_insert" ON audit_templates;
CREATE POLICY "audit_templates_insert" ON audit_templates FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_templates_update" ON audit_templates;
CREATE POLICY "audit_templates_update" ON audit_templates FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_templates_delete" ON audit_templates;
CREATE POLICY "audit_templates_delete" ON audit_templates FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_sections_select" ON audit_template_sections;
CREATE POLICY "audit_template_sections_select" ON audit_template_sections FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_sections_insert" ON audit_template_sections;
CREATE POLICY "audit_template_sections_insert" ON audit_template_sections FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_sections_update" ON audit_template_sections;
CREATE POLICY "audit_template_sections_update" ON audit_template_sections FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_sections_delete" ON audit_template_sections;
CREATE POLICY "audit_template_sections_delete" ON audit_template_sections FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_items_select" ON audit_template_items;
CREATE POLICY "audit_template_items_select" ON audit_template_items FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_items_insert" ON audit_template_items;
CREATE POLICY "audit_template_items_insert" ON audit_template_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_items_update" ON audit_template_items;
CREATE POLICY "audit_template_items_update" ON audit_template_items FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "audit_template_items_delete" ON audit_template_items;
CREATE POLICY "audit_template_items_delete" ON audit_template_items FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
