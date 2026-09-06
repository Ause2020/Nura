-- Nura · Plan HACCP 12 pasos (NCh 2861 + Codex)
-- Tablas nuevas. El HACCP por producto (haccp_products / hazards / ccps) queda intacto.

CREATE TABLE IF NOT EXISTS haccp_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name VARCHAR NOT NULL DEFAULT 'Plan HACCP',
  status VARCHAR NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'completed', 'approved')),
  current_step INTEGER NOT NULL DEFAULT 1
    CHECK (current_step BETWEEN 1 AND 12),
  risk_matrix JSONB NOT NULL DEFAULT '{
    "severity": [
      {"value": 1, "label": "Menor"},
      {"value": 2, "label": "Moderada"},
      {"value": 3, "label": "Seria"},
      {"value": 4, "label": "Crítica"}
    ],
    "probability": [
      {"value": 1, "label": "Remota"},
      {"value": 2, "label": "Baja"},
      {"value": 3, "label": "Probable"},
      {"value": 4, "label": "Frecuente"}
    ],
    "significanceThreshold": 9
  }'::jsonb,
  checklist_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_plans_org_updated
  ON haccp_plans(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS haccp_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  qualifications TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_teams_plan ON haccp_teams(plan_id, order_index);

CREATE TABLE IF NOT EXISTS haccp_plan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Producto',
  resolution_number TEXT NOT NULL DEFAULT '',
  has_allergens BOOLEAN NOT NULL DEFAULT FALSE,
  allergens TEXT NOT NULL DEFAULT '',
  specifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  intended_use JSONB NOT NULL DEFAULT '{"usage":"","additionalNotes":""}'::jsonb,
  consumer_groups JSONB NOT NULL DEFAULT '{
    "general": true,
    "infants": false,
    "children": false,
    "pregnant": false,
    "elderly": false,
    "immunocompromised": false
  }'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_plan_products_plan
  ON haccp_plan_products(plan_id, order_index);

CREATE TABLE IF NOT EXISTS haccp_diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Proceso Principal',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  zoom NUMERIC NOT NULL DEFAULT 1,
  pan_x NUMERIC NOT NULL DEFAULT 0,
  pan_y NUMERIC NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_diagrams_plan ON haccp_diagrams(plan_id, order_index);

CREATE TABLE IF NOT EXISTS haccp_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE UNIQUE,
  evidence_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  observations TEXT NOT NULL DEFAULT '',
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS haccp_plan_hazards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL DEFAULT '',
  step_id TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'biological'
    CHECK (type IN ('biological', 'chemical', 'physical', 'allergen')),
  cause TEXT NOT NULL DEFAULT '',
  severity INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  probability INTEGER NOT NULL DEFAULT 1 CHECK (probability BETWEEN 1 AND 5),
  risk_score INTEGER GENERATED ALWAYS AS (severity * probability) STORED,
  is_significant BOOLEAN NOT NULL DEFAULT FALSE,
  justification TEXT NOT NULL DEFAULT '',
  preventive_measure TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_plan_hazards_plan ON haccp_plan_hazards(plan_id);

CREATE TABLE IF NOT EXISTS haccp_ccp_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  hazard_id UUID NOT NULL REFERENCES haccp_plan_hazards(id) ON DELETE CASCADE,
  q1 BOOLEAN,
  q2 BOOLEAN,
  q3 BOOLEAN,
  q4 BOOLEAN,
  result TEXT NOT NULL DEFAULT 'Pendiente',
  pcc_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, hazard_id)
);

CREATE TABLE IF NOT EXISTS haccp_step_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL CHECK (step_id BETWEEN 1 AND 12),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, step_id)
);

CREATE TABLE IF NOT EXISTS haccp_monitoring_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pcc_reference_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shift TEXT,
  parameter TEXT,
  measured_value TEXT,
  responsible TEXT,
  observations TEXT,
  conforms BOOLEAN,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_monitoring_records_org
  ON haccp_monitoring_records(organization_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_haccp_monitoring_records_pcc
  ON haccp_monitoring_records(organization_id, pcc_reference_id);

-- RLS helpers: child tables via plan.organization_id
ALTER TABLE haccp_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_plan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_plan_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_ccp_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_step_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_monitoring_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "haccp_plans_all" ON haccp_plans
  FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_teams_all" ON haccp_teams
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_plan_products_all" ON haccp_plan_products
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_diagrams_all" ON haccp_diagrams
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_validations_all" ON haccp_validations
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_plan_hazards_all" ON haccp_plan_hazards
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_ccp_decisions_all" ON haccp_ccp_decisions
  FOR ALL TO authenticated
  USING (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "haccp_step_data_all" ON haccp_step_data
  FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "haccp_monitoring_records_all" ON haccp_monitoring_records
  FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'haccp-evidence',
  'haccp-evidence',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;
