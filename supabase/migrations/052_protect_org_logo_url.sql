-- Nura · SEC-P2-07 — logo_url solo path del bucket logos
-- Incremental. Idempotente. No edita 047–051. No toca policies HACCP/RLS.
--
-- Writes nuevos: `{organization_id}/{filename}` (sin scheme).
-- Filas legacy con URL absoluta no se reescriben (UPDATE de otras columnas
-- no dispara validación). El PDF/app ignoran valores no parseables.

CREATE OR REPLACE FUNCTION public.protect_org_logo_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.logo_url IS NOT DISTINCT FROM OLD.logo_url THEN
    RETURN NEW;
  END IF;

  IF NEW.logo_url IS NULL OR btrim(NEW.logo_url) = '' THEN
    NEW.logo_url := NULL;
    RETURN NEW;
  END IF;

  NEW.logo_url := btrim(NEW.logo_url);

  IF NEW.logo_url ~* '(://|^data:|^file:|^blob:|^javascript:|^//)' THEN
    RAISE EXCEPTION 'organization logo_url must be a logos object path'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.logo_url !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$' THEN
    RAISE EXCEPTION 'organization logo_url must be a logos object path'
      USING ERRCODE = '22023';
  END IF;

  IF split_part(NEW.logo_url, '/', 1) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'organization logo_url must belong to this organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_org_logo_url ON public.organizations;
CREATE TRIGGER protect_org_logo_url
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_logo_url();

REVOKE ALL ON FUNCTION public.protect_org_logo_url() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.protect_org_logo_url() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.protect_org_logo_url() FROM authenticated;
  END IF;
END $$;
