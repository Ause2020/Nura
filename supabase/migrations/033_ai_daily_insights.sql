-- Nura · Briefing diario de IA (HACCP + Monitoreo + NC)
-- Un diagnóstico por organización y día. No es un chat.

CREATE TABLE IF NOT EXISTS ai_daily_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR NOT NULL DEFAULT 'rules'
    CHECK (source IN ('rules', 'ai')),
  model TEXT,
  overall_risk VARCHAR NOT NULL DEFAULT 'attention'
    CHECK (overall_risk IN ('ok', 'attention', 'critical')),
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_insights_org_generated
  ON ai_daily_insights(organization_id, generated_at DESC);

ALTER TABLE ai_daily_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_daily_insights_all" ON ai_daily_insights;
CREATE POLICY "ai_daily_insights_all" ON ai_daily_insights
  FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
