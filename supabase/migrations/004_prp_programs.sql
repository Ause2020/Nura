-- Nura · Paso 5 — PRPs + NC mínima para generación automática

CREATE TABLE prp_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  prp_type TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  responsible TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, prp_type)
);

CREATE TABLE prp_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES prp_programs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  item_text TEXT NOT NULL,
  is_critical BOOLEAN DEFAULT FALSE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prp_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES prp_programs(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  executed_by UUID REFERENCES profiles(id),
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  overall_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prp_record_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES prp_records(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES prp_checklist_items(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  result TEXT NOT NULL,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla NC (requerida para hallazgos críticos de PRPs; ampliada en Paso 7)
CREATE TABLE IF NOT EXISTS nonconformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  nc_number TEXT NOT NULL,
  origin TEXT NOT NULL,
  origin_ref_id UUID,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  product_affected TEXT,
  lot_number TEXT,
  area TEXT,
  detected_by UUID REFERENCES profiles(id),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'open',
  root_cause_method TEXT,
  root_cause_summary TEXT,
  due_date DATE,
  closed_at TIMESTAMPTZ,
  recurrence BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prp_programs_org ON prp_programs(organization_id);
CREATE INDEX idx_prp_checklist_program ON prp_checklist_items(program_id);
CREATE INDEX idx_prp_records_program ON prp_records(program_id);
CREATE INDEX idx_nonconformities_org ON nonconformities(organization_id);

ALTER TABLE prp_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prp_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE prp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE prp_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonconformities ENABLE ROW LEVEL SECURITY;

-- prp_programs
CREATE POLICY "prp_programs_select" ON prp_programs FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_programs_insert" ON prp_programs FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_programs_update" ON prp_programs FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_programs_delete" ON prp_programs FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- prp_checklist_items
CREATE POLICY "prp_checklist_items_select" ON prp_checklist_items FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_checklist_items_insert" ON prp_checklist_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_checklist_items_update" ON prp_checklist_items FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_checklist_items_delete" ON prp_checklist_items FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- prp_records
CREATE POLICY "prp_records_select" ON prp_records FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_records_insert" ON prp_records FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_records_update" ON prp_records FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- prp_record_items
CREATE POLICY "prp_record_items_select" ON prp_record_items FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "prp_record_items_insert" ON prp_record_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- nonconformities
CREATE POLICY "nonconformities_select" ON nonconformities FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nonconformities_insert" ON nonconformities FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "nonconformities_update" ON nonconformities FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
