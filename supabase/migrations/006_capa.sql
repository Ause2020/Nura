-- Nura · Paso 7 — CAPA (tablas complementarias; nonconformities ya en 004)

CREATE TABLE IF NOT EXISTS capa_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  responsible TEXT NOT NULL,
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  evidence_description TEXT,
  evidence_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nc_5whys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  why_1 TEXT,
  why_2 TEXT,
  why_3 TEXT,
  why_4 TEXT,
  why_5 TEXT,
  root_cause TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (nc_id)
);

CREATE TABLE nc_fishbone_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  category TEXT NOT NULL,
  cause_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_capa_actions_nc ON capa_actions(nc_id);
CREATE INDEX idx_capa_actions_org ON capa_actions(organization_id);
CREATE INDEX idx_capa_actions_status ON capa_actions(organization_id, status);
CREATE INDEX idx_nc_5whys_nc ON nc_5whys(nc_id);
CREATE INDEX idx_nc_fishbone_nc ON nc_fishbone_causes(nc_id);
CREATE INDEX idx_nonconformities_status ON nonconformities(organization_id, status);
CREATE INDEX idx_nonconformities_due ON nonconformities(organization_id, due_date);

ALTER TABLE capa_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_5whys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_fishbone_causes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capa_actions_select" ON capa_actions FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "capa_actions_insert" ON capa_actions FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "capa_actions_update" ON capa_actions FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "capa_actions_delete" ON capa_actions FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "nc_5whys_select" ON nc_5whys FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_5whys_insert" ON nc_5whys FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_5whys_update" ON nc_5whys FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_5whys_delete" ON nc_5whys FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "nc_fishbone_causes_select" ON nc_fishbone_causes FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_fishbone_causes_insert" ON nc_fishbone_causes FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_fishbone_causes_update" ON nc_fishbone_causes FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nc_fishbone_causes_delete" ON nc_fishbone_causes FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
