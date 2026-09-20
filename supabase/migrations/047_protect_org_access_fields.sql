-- Nura · SEC-P1-02 — campos de acceso comercial inmutables para JWT
-- Idempotente. No altera filas. No toca INSERT/onboarding.
--
-- Function: public.protect_org_access_fields()
-- Trigger:  protect_org_access_fields  BEFORE UPDATE ON public.organizations
--
-- Columnas protegidas (solo service_role puede cambiarlas):
--   access_status
--   access_expires_at
--   access_granted_at
--   contract_notes
--   provisioned_by
--
-- Un UPDATE de un org admin (authenticated) sobre name/industry/country/city/
-- employees_range/certifications/logo_url/nc_quarantine_severity_threshold
-- sigue permitido por RLS + este trigger.
-- Un intento sobre campos privilegiados falla con EXCEPTION explícita
-- (no se restauran valores en silencio).

CREATE OR REPLACE FUNCTION public.protect_org_access_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mismo criterio que protect_profile_identity / protect_org_identity.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.access_status IS DISTINCT FROM OLD.access_status
     OR NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at
     OR NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at
     OR NEW.contract_notes IS DISTINCT FROM OLD.contract_notes
     OR NEW.provisioned_by IS DISTINCT FROM OLD.provisioned_by
  THEN
    RAISE EXCEPTION 'privileged organization access fields are restricted'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_org_access_fields ON public.organizations;
CREATE TRIGGER protect_org_access_fields
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_access_fields();

REVOKE ALL ON FUNCTION public.protect_org_access_fields() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.protect_org_access_fields() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.protect_org_access_fields() FROM authenticated;
  END IF;
END $$;
