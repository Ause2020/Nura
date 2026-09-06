-- Nura · Monitoreo: QR de terreno + origen de registros (formulario / QR / OCR)

CREATE TABLE IF NOT EXISTS monitoring_qr_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES production_form_templates(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_qr_links_org
  ON monitoring_qr_links(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_qr_links_token
  ON monitoring_qr_links(token);

ALTER TABLE monitoring_qr_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitoring_qr_links_all" ON monitoring_qr_links;
CREATE POLICY "monitoring_qr_links_all" ON monitoring_qr_links
  FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE production_form_submissions
  ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'form'
    CHECK (source IN ('form', 'qr', 'ocr')),
  ADD COLUMN IF NOT EXISTS qr_link_id UUID REFERENCES monitoring_qr_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monitor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_production_submissions_source
  ON production_form_submissions(organization_id, source, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_submissions_qr
  ON production_form_submissions(qr_link_id)
  WHERE qr_link_id IS NOT NULL;
