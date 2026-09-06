-- Nura · Paso 4 — HACCP: Peligros y CCPs

CREATE TABLE haccp_hazards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_step_id UUID NOT NULL REFERENCES haccp_process_steps(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  hazard_type TEXT NOT NULL,
  hazard_description TEXT NOT NULL,
  source TEXT,
  severity TEXT NOT NULL,
  probability TEXT NOT NULL,
  risk_level TEXT,
  is_significant BOOLEAN DEFAULT FALSE,
  control_measures TEXT,
  ccp_determination TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE haccp_ccps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id UUID NOT NULL REFERENCES haccp_hazards(id) ON DELETE CASCADE,
  process_step_id UUID NOT NULL REFERENCES haccp_process_steps(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  ccp_number TEXT NOT NULL,
  critical_limit TEXT NOT NULL,
  monitoring_what TEXT NOT NULL,
  monitoring_how TEXT NOT NULL,
  monitoring_frequency TEXT NOT NULL,
  monitoring_responsible TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  verification_activity TEXT,
  verification_frequency TEXT,
  records_required TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_haccp_hazards_step ON haccp_hazards(process_step_id);
CREATE INDEX idx_haccp_ccps_hazard ON haccp_ccps(hazard_id);
CREATE INDEX idx_haccp_ccps_step ON haccp_ccps(process_step_id);

ALTER TABLE haccp_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_ccps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "haccp_hazards_select" ON haccp_hazards
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_hazards_insert" ON haccp_hazards
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_hazards_update" ON haccp_hazards
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_hazards_delete" ON haccp_hazards
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_ccps_select" ON haccp_ccps
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_ccps_insert" ON haccp_ccps
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_ccps_update" ON haccp_ccps
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_ccps_delete" ON haccp_ccps
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
