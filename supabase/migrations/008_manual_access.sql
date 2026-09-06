-- Nura · Paso 10 — Acceso manual (sin pago digital)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_expires_at DATE,
  ADD COLUMN IF NOT EXISTS contract_notes TEXT,
  ADD COLUMN IF NOT EXISTS provisioned_by UUID REFERENCES profiles(id);

-- Organizaciones existentes: acceso activo retroactivo
UPDATE organizations
SET
  access_status = 'active',
  access_granted_at = COALESCE(access_granted_at, created_at, NOW())
WHERE access_status IS NULL OR access_granted_at IS NULL;

CREATE INDEX idx_organizations_access ON organizations(access_status);
