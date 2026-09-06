-- Nura · Paso 14 — Control de Calidad & Laboratorio

CREATE TABLE product_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  spec_type TEXT NOT NULL,
  parameter TEXT NOT NULL,
  unit TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  target_value NUMERIC,
  method TEXT,
  is_critical BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sampling_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  sample_point TEXT NOT NULL,
  spec_id UUID REFERENCES product_specifications(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL,
  sample_size TEXT,
  responsible TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lab_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  lot_number TEXT NOT NULL,
  sample_point TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  analyzed_by TEXT,
  lab_type TEXT DEFAULT 'internal',
  lab_name TEXT,
  overall_result TEXT,
  notes TEXT,
  report_url TEXT,
  nc_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES lab_analyses(id) ON DELETE CASCADE,
  spec_id UUID NOT NULL REFERENCES product_specifications(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  value_numeric NUMERIC,
  value_text TEXT,
  unit TEXT,
  result TEXT NOT NULL,
  deviation_pct NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lot_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  lot_number TEXT NOT NULL,
  production_date DATE,
  quantity NUMERIC,
  unit TEXT,
  status TEXT DEFAULT 'pending',
  analysis_id UUID REFERENCES lab_analyses(id) ON DELETE SET NULL,
  released_by UUID REFERENCES profiles(id),
  released_at TIMESTAMPTZ,
  retention_reason TEXT,
  nc_id UUID REFERENCES nonconformities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE process_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  ccp_id UUID REFERENCES haccp_ccps(id) ON DELETE SET NULL,
  lot_number TEXT,
  parameter TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  recorded_by UUID REFERENCES profiles(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  is_within_limits BOOLEAN,
  action_taken TEXT
);

CREATE INDEX idx_product_specs_org ON product_specifications(organization_id);
CREATE INDEX idx_product_specs_product ON product_specifications(product_id);
CREATE INDEX idx_sampling_plans_org ON sampling_plans(organization_id);
CREATE INDEX idx_lab_analyses_org ON lab_analyses(organization_id);
CREATE INDEX idx_lab_analyses_lot ON lab_analyses(organization_id, lot_number);
CREATE INDEX idx_lab_results_analysis ON lab_results(analysis_id);
CREATE INDEX idx_lot_releases_org ON lot_releases(organization_id);
CREATE INDEX idx_lot_releases_lot ON lot_releases(organization_id, lot_number);
CREATE INDEX idx_process_controls_org ON process_controls(organization_id);

ALTER TABLE product_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sampling_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_specs_org" ON product_specifications FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "sampling_plans_org" ON sampling_plans FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "lab_analyses_org" ON lab_analyses FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "lab_results_org" ON lab_results FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "lot_releases_org" ON lot_releases FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "process_controls_org" ON process_controls FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lab-reports',
  'lab-reports',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "lab_reports_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lab-reports'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "lab_reports_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lab-reports'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );
