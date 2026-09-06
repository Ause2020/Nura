-- Nura · Paso 6 — Trazabilidad y simulacro de retiro
-- Idempotente. Ejecutar tras 024.

CREATE TABLE IF NOT EXISTS trace_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lot_code TEXT NOT NULL,
  lot_type TEXT NOT NULL,
  product_name TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  received_at DATE,
  produced_at DATE,
  line_area TEXT,
  quantity NUMERIC,
  quantity_unit TEXT DEFAULT 'kg',
  destination TEXT,
  production_submission_id UUID REFERENCES production_form_submissions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, lot_code)
);

CREATE TABLE IF NOT EXISTS trace_lot_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  parent_lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE CASCADE,
  child_lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE CASCADE,
  quantity_used NUMERIC,
  quantity_unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (parent_lot_id, child_lot_id)
);

CREATE TABLE IF NOT EXISTS trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE CASCADE,
  related_lot_id UUID REFERENCES trace_lots(id) ON DELETE SET NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location TEXT,
  quantity NUMERIC,
  quantity_unit TEXT,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_recall_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  simulation_number TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'in_progress',
  goal_hours NUMERIC DEFAULT 4,
  elapsed_seconds INTEGER,
  passed_goal BOOLEAN,
  report JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, simulation_number)
);

CREATE TABLE IF NOT EXISTS mock_recall_simulation_lots (
  simulation_id UUID NOT NULL REFERENCES mock_recall_simulations(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  PRIMARY KEY (simulation_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_lots_org ON trace_lots(organization_id);
CREATE INDEX IF NOT EXISTS idx_trace_lots_code ON trace_lots(organization_id, lot_code);
CREATE INDEX IF NOT EXISTS idx_trace_lot_compositions_parent ON trace_lot_compositions(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_trace_lot_compositions_child ON trace_lot_compositions(child_lot_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_lot ON trace_events(lot_id);
CREATE INDEX IF NOT EXISTS idx_mock_recall_org ON mock_recall_simulations(organization_id);

ALTER TABLE trace_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_lot_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_recall_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_recall_simulation_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trace_lots_select" ON trace_lots;
CREATE POLICY "trace_lots_select" ON trace_lots FOR SELECT TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "trace_lots_insert" ON trace_lots;
CREATE POLICY "trace_lots_insert" ON trace_lots FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "trace_lots_update" ON trace_lots;
CREATE POLICY "trace_lots_update" ON trace_lots FOR UPDATE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "trace_lots_delete" ON trace_lots;
CREATE POLICY "trace_lots_delete" ON trace_lots FOR DELETE TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "trace_lot_compositions_all" ON trace_lot_compositions;
CREATE POLICY "trace_lot_compositions_all" ON trace_lot_compositions FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "trace_events_all" ON trace_events;
CREATE POLICY "trace_events_all" ON trace_events FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "mock_recall_simulations_all" ON mock_recall_simulations;
CREATE POLICY "mock_recall_simulations_all" ON mock_recall_simulations FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "mock_recall_simulation_lots_all" ON mock_recall_simulation_lots;
CREATE POLICY "mock_recall_simulation_lots_all" ON mock_recall_simulation_lots FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
