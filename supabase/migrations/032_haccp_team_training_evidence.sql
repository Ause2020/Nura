-- Evidencia de la última capacitación por miembro del equipo HACCP (Paso 1).

ALTER TABLE haccp_teams
  ADD COLUMN IF NOT EXISTS training_date DATE,
  ADD COLUMN IF NOT EXISTS training_evidence JSONB;
