-- Nura · Control de calidad — controles, enlaces de campo y registros

CREATE TABLE qc_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  parameter TEXT NOT NULL,
  unit TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  extra_fields JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qc_field_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES qc_controls(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES qc_controls(id) ON DELETE CASCADE,
  link_id UUID REFERENCES qc_field_links(id) ON DELETE SET NULL,
  recorded_value NUMERIC NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}',
  recorder_name TEXT,
  notes TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qc_controls_org ON qc_controls(organization_id);
CREATE INDEX idx_qc_field_links_org ON qc_field_links(organization_id);
CREATE INDEX idx_qc_field_links_control ON qc_field_links(control_id);
CREATE INDEX idx_qc_field_links_token ON qc_field_links(token);
CREATE INDEX idx_qc_submissions_org ON qc_submissions(organization_id);
CREATE INDEX idx_qc_submissions_control ON qc_submissions(control_id, submitted_at DESC);

ALTER TABLE qc_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_field_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qc_controls_org" ON qc_controls FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "qc_field_links_org" ON qc_field_links FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "qc_submissions_org" ON qc_submissions FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Envío público vía token (sin login)
CREATE OR REPLACE FUNCTION public.submit_qc_field_form(
  p_token TEXT,
  p_recorded_value NUMERIC,
  p_responses JSONB DEFAULT '{}',
  p_recorder_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link qc_field_links%ROWTYPE;
  v_control qc_controls%ROWTYPE;
  v_submission_id UUID;
BEGIN
  IF trim(COALESCE(p_token, '')) = '' THEN
    RAISE EXCEPTION 'Enlace inválido';
  END IF;

  IF p_recorded_value IS NULL THEN
    RAISE EXCEPTION 'El valor medido es requerido';
  END IF;

  SELECT * INTO v_link
  FROM qc_field_links
  WHERE token = trim(p_token) AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enlace no encontrado o inactivo';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
    RAISE EXCEPTION 'Este enlace ha expirado';
  END IF;

  SELECT * INTO v_control
  FROM qc_controls
  WHERE id = v_link.control_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Control no disponible';
  END IF;

  INSERT INTO qc_submissions (
    organization_id,
    control_id,
    link_id,
    recorded_value,
    responses,
    recorder_name,
    notes,
    latitude,
    longitude
  )
  VALUES (
    v_link.organization_id,
    v_link.control_id,
    v_link.id,
    p_recorded_value,
    COALESCE(p_responses, '{}'),
    NULLIF(trim(p_recorder_name), ''),
    NULLIF(trim(p_notes), ''),
    p_latitude,
    p_longitude
  )
  RETURNING id INTO v_submission_id;

  RETURN v_submission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qc_field_form TO anon, authenticated;

-- Realtime para actualizar dashboard al recibir registros de campo
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE qc_submissions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
