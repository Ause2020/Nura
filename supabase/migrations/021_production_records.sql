-- Nura · Paso 2 — Registros digitales de producción
-- Idempotente. Ejecutar tras 020.

CREATE TABLE IF NOT EXISTS production_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  area TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES production_form_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES production_form_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES production_form_templates(id) ON DELETE RESTRICT,
  template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  area TEXT,
  lot_number TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  sync_status TEXT NOT NULL DEFAULT 'synced',
  has_deviation BOOLEAN NOT NULL DEFAULT FALSE,
  deviation_notes TEXT,
  operator_signature_hash TEXT,
  operator_signed_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nc_id UUID REFERENCES nonconformities(id) ON DELETE SET NULL,
  client_submission_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_submissions_client
  ON production_form_submissions(organization_id, client_submission_id)
  WHERE client_submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS production_form_submission_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES production_form_submissions(id) ON DELETE CASCADE,
  field_id UUID NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_json JSONB,
  is_out_of_range BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_templates_org
  ON production_form_templates(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_production_sections_template
  ON production_form_sections(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_production_fields_section
  ON production_form_fields(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_production_submissions_org
  ON production_form_submissions(organization_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_submissions_template
  ON production_form_submissions(template_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_submission_values_sub
  ON production_form_submission_values(submission_id);

ALTER TABLE production_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_form_submission_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_form_templates_org" ON production_form_templates;
CREATE POLICY "production_form_templates_org" ON production_form_templates FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "production_form_sections_org" ON production_form_sections;
CREATE POLICY "production_form_sections_org" ON production_form_sections FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "production_form_fields_org" ON production_form_fields;
CREATE POLICY "production_form_fields_org" ON production_form_fields FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "production_form_submissions_org" ON production_form_submissions;
CREATE POLICY "production_form_submissions_org" ON production_form_submissions FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "production_form_submission_values_org" ON production_form_submission_values;
CREATE POLICY "production_form_submission_values_org" ON production_form_submission_values FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'production-record-photos',
  'production-record-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "production_record_photos_select" ON storage.objects;
CREATE POLICY "production_record_photos_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'production-record-photos');

DROP POLICY IF EXISTS "production_record_photos_insert" ON storage.objects;
CREATE POLICY "production_record_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'production-record-photos'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE production_form_submissions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
