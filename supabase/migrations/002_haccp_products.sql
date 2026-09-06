-- Nura · Paso 3 — HACCP: Productos y pasos de proceso
--
-- ⚠️  Si falla "haccp_products already exists" → ya aplicada. Salta al 003 o al 016.

CREATE TABLE IF NOT EXISTS haccp_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  intended_use TEXT,
  target_consumer TEXT,
  shelf_life_days INTEGER,
  storage_conditions TEXT,
  packaging_type TEXT,
  status TEXT DEFAULT 'draft',
  plan_completion INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS haccp_process_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES haccp_products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  description TEXT,
  temperature_min NUMERIC,
  temperature_max NUMERIC,
  duration_minutes INTEGER,
  position INTEGER NOT NULL,
  is_ccp BOOLEAN DEFAULT FALSE,
  is_oprp BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_haccp_products_org ON haccp_products(organization_id);
CREATE INDEX idx_haccp_process_steps_product ON haccp_process_steps(product_id);
CREATE INDEX idx_haccp_process_steps_position ON haccp_process_steps(product_id, position);

ALTER TABLE haccp_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_process_steps ENABLE ROW LEVEL SECURITY;

-- haccp_products policies
CREATE POLICY "haccp_products_select" ON haccp_products
  FOR SELECT TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_products_insert" ON haccp_products
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_products_update" ON haccp_products
  FOR UPDATE TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_products_delete" ON haccp_products
  FOR DELETE TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- haccp_process_steps policies
CREATE POLICY "haccp_process_steps_select" ON haccp_process_steps
  FOR SELECT TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_process_steps_insert" ON haccp_process_steps
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_process_steps_update" ON haccp_process_steps
  FOR UPDATE TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "haccp_process_steps_delete" ON haccp_process_steps
  FOR DELETE TO authenticated
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Auto-update updated_at on products
CREATE OR REPLACE FUNCTION update_haccp_product_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE haccp_products SET updated_at = NOW() WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  UPDATE haccp_products SET updated_at = NOW() WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER haccp_steps_update_product
  AFTER INSERT OR UPDATE OR DELETE ON haccp_process_steps
  FOR EACH ROW EXECUTE FUNCTION update_haccp_product_timestamp();
