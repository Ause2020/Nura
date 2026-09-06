-- Nura · Paso 16 — Reclamos de clientes

CREATE TABLE customer_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  complaint_number TEXT NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_contact TEXT,
  product_id UUID REFERENCES haccp_products(id) ON DELETE SET NULL,
  lot_number TEXT,
  complaint_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity_affected NUMERIC,
  product_returned BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'open',
  investigation_summary TEXT,
  root_cause TEXT,
  root_cause_category TEXT,
  nc_id UUID REFERENCES nonconformities(id) ON DELETE SET NULL,
  lot_analysis_id UUID REFERENCES lab_analyses(id) ON DELETE SET NULL,
  response_date DATE,
  response_summary TEXT,
  communication_log TEXT,
  recurrence BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE complaint_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES customer_complaints(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_complaints_org ON customer_complaints(organization_id);
CREATE INDEX idx_complaints_status ON customer_complaints(status);
CREATE INDEX idx_complaints_product ON customer_complaints(product_id);
CREATE INDEX idx_complaint_photos_complaint ON complaint_photos(complaint_id);

ALTER TABLE customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "complaints_org" ON customer_complaints FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "complaint_photos_org" ON complaint_photos FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-photos',
  'complaint-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "complaint_photos_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'complaint-photos');

CREATE POLICY "complaint_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-photos'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );
