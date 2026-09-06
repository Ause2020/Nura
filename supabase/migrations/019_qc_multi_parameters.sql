-- Nura · Control de calidad — múltiples parámetros por formulario
-- Idempotente. Ejecutar tras 018.

CREATE TABLE IF NOT EXISTS qc_control_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES qc_controls(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL,
  unit TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_control_parameters_control
  ON qc_control_parameters(control_id, sort_order);

ALTER TABLE qc_control_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qc_control_parameters_org" ON qc_control_parameters;
CREATE POLICY "qc_control_parameters_org" ON qc_control_parameters FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Migrar parámetro único legacy → tabla de parámetros
INSERT INTO qc_control_parameters (
  organization_id, control_id, parameter, unit, min_value, max_value, sort_order
)
SELECT
  c.organization_id,
  c.id,
  c.parameter,
  c.unit,
  c.min_value,
  c.max_value,
  0
FROM qc_controls c
WHERE c.parameter IS NOT NULL
  AND trim(c.parameter) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM qc_control_parameters p WHERE p.control_id = c.id
  );

CREATE TABLE IF NOT EXISTS qc_submission_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES qc_submissions(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES qc_control_parameters(id) ON DELETE CASCADE,
  recorded_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_qc_submission_readings_param
  ON qc_submission_readings(parameter_id, created_at DESC);

ALTER TABLE qc_submission_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qc_submission_readings_org" ON qc_submission_readings;
CREATE POLICY "qc_submission_readings_org" ON qc_submission_readings FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Migrar lecturas legacy desde recorded_value
INSERT INTO qc_submission_readings (
  organization_id, submission_id, parameter_id, recorded_value
)
SELECT
  s.organization_id,
  s.id,
  p.id,
  s.recorded_value
FROM qc_submissions s
JOIN qc_control_parameters p ON p.control_id = s.control_id AND p.sort_order = 0
WHERE s.recorded_value IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM qc_submission_readings r WHERE r.submission_id = s.id
  );

ALTER TABLE qc_submissions ALTER COLUMN recorded_value DROP NOT NULL;
ALTER TABLE qc_controls ALTER COLUMN parameter DROP NOT NULL;

-- Envío público con varios parámetros
CREATE OR REPLACE FUNCTION public.submit_qc_field_form(
  p_token TEXT,
  p_parameter_values JSONB,
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
  v_param RECORD;
  v_raw TEXT;
  v_num NUMERIC;
  v_first NUMERIC;
BEGIN
  IF trim(COALESCE(p_token, '')) = '' THEN
    RAISE EXCEPTION 'Enlace inválido';
  END IF;

  IF p_parameter_values IS NULL OR jsonb_typeof(p_parameter_values) <> 'object' THEN
    RAISE EXCEPTION 'Debes registrar al menos un parámetro';
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

  FOR v_param IN
    SELECT id, parameter
    FROM qc_control_parameters
    WHERE control_id = v_control.id
    ORDER BY sort_order, created_at
  LOOP
    v_raw := p_parameter_values ->> v_param.id::text;
    IF v_raw IS NULL OR trim(v_raw) = '' THEN
      RAISE EXCEPTION 'Falta el valor para: %', v_param.parameter;
    END IF;
    BEGIN
      v_num := v_raw::NUMERIC;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'Valor inválido para: %', v_param.parameter;
    END;
    IF v_first IS NULL THEN
      v_first := v_num;
    END IF;
  END LOOP;

  IF v_first IS NULL THEN
    RAISE EXCEPTION 'El formulario no tiene parámetros configurados';
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
    v_first,
    COALESCE(p_responses, '{}'),
    NULLIF(trim(p_recorder_name), ''),
    NULLIF(trim(p_notes), ''),
    p_latitude,
    p_longitude
  )
  RETURNING id INTO v_submission_id;

  FOR v_param IN
    SELECT id
    FROM qc_control_parameters
    WHERE control_id = v_control.id
    ORDER BY sort_order, created_at
  LOOP
    v_num := (p_parameter_values ->> v_param.id::text)::NUMERIC;
    INSERT INTO qc_submission_readings (
      organization_id,
      submission_id,
      parameter_id,
      recorded_value
    )
    VALUES (
      v_link.organization_id,
      v_submission_id,
      v_param.id,
      v_num
    );
  END LOOP;

  RETURN v_submission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qc_field_form TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE qc_submission_readings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
