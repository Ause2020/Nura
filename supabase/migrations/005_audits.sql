-- Nura · Paso 6 — Auditorías

CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  standard TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  auditor_name TEXT,
  scope TEXT,
  status TEXT DEFAULT 'scheduled',
  compliance_score NUMERIC,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  section TEXT NOT NULL,
  requirement TEXT NOT NULL,
  reference TEXT,
  result TEXT,
  finding TEXT,
  photo_url TEXT,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES audit_checklist_items(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  finding_type TEXT NOT NULL,
  description TEXT NOT NULL,
  capa_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audits_org ON audits(organization_id);
CREATE INDEX idx_audits_status ON audits(organization_id, status);
CREATE INDEX idx_audit_checklist_audit ON audit_checklist_items(audit_id);
CREATE INDEX idx_audit_findings_audit ON audit_findings(audit_id);

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audits_select" ON audits FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audits_insert" ON audits FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audits_update" ON audits FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audits_delete" ON audits FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "audit_checklist_items_select" ON audit_checklist_items FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audit_checklist_items_insert" ON audit_checklist_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audit_checklist_items_update" ON audit_checklist_items FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audit_checklist_items_delete" ON audit_checklist_items FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "audit_findings_select" ON audit_findings FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audit_findings_insert" ON audit_findings FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "audit_findings_update" ON audit_findings FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
