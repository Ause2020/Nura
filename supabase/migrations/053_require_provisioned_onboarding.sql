-- Nura · SP-01 — onboarding no auto-provisiona organizaciones
--
-- Antes (015/016/036): cualquier usuario autenticado sin organization_id que
-- llamara complete_user_onboarding creaba una organización 'active' y quedaba
-- como admin. Con signup público habilitado esto era auto-provisión de tenants.
--
-- Después:
--   * complete_user_onboarding solo marca onboarding_completed para un perfil
--     que ya tiene organización provisionada (provisión admin o invitación) con
--     acceso activo. Nunca crea organizaciones, nunca toca role,
--     organization_id ni access_status. Los p_* se aceptan solo por
--     compatibilidad de firma y se ignoran.
--   * Usuario sin organización → ERROR 'organization_not_provisioned' (42501).
--   * INSERT en public.organizations desde un JWT que no sea service_role se
--     rechaza por trigger, aunque reaparezca una policy permisiva o un
--     SECURITY DEFINER futuro lo intente con la sesión del usuario.
--
-- Caminos legítimos que siguen funcionando (todos service_role):
--   lib/admin/provision.ts (provisionClient), invitaciones, SQL editor/postgres.
--
-- No modifica 016 ni 036. Idempotente.

-- ─── 1. complete_user_onboarding: sin auto-provisión ───

CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_name TEXT,
  p_industry TEXT,
  p_country TEXT,
  p_city TEXT DEFAULT NULL,
  p_employees_range TEXT DEFAULT NULL,
  p_certifications TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_found BOOLEAN := FALSE;
  v_org_id UUID;
  v_access_status TEXT;
  v_access_expires_at DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT TRUE, p.organization_id
  INTO v_profile_found, v_org_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF NOT COALESCE(v_profile_found, FALSE) THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_not_provisioned' USING ERRCODE = '42501';
  END IF;

  SELECT o.access_status, o.access_expires_at
  INTO v_access_status, v_access_expires_at
  FROM public.organizations o
  WHERE o.id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_provisioned' USING ERRCODE = '42501';
  END IF;

  IF v_access_status IS DISTINCT FROM 'active'
     OR (v_access_expires_at IS NOT NULL AND v_access_expires_at < CURRENT_DATE)
  THEN
    RAISE EXCEPTION 'organization_access_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET onboarding_completed = TRUE
  WHERE id = v_user_id
    AND organization_id = v_org_id
    AND onboarding_completed IS DISTINCT FROM TRUE;

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_user_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.complete_user_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.complete_user_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated';
  END IF;
END $$;

COMMENT ON FUNCTION public.complete_user_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) IS
  'SP-01: marca onboarding_completed solo si el perfil ya tiene organización provisionada y activa. '
  'Nunca crea organizaciones ni modifica role/organization_id/access_status. '
  'Sin organización: organization_not_provisioned.';

-- ─── 2. INSERT en organizations solo para service_role / backend ───

CREATE OR REPLACE FUNCTION public.protect_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role TEXT := auth.role();
BEGIN
  -- Sin JWT (postgres / SQL editor / migraciones) → permitido.
  -- Con JWT: solo service_role. Cualquier otro rol falla cerrado.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'organization_not_provisioned'
      USING ERRCODE = '42501',
            HINT = 'Organizations are provisioned only by platform admins (service_role).';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_org_insert() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.protect_org_insert() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.protect_org_insert() FROM authenticated';
  END IF;
END $$;

DROP TRIGGER IF EXISTS protect_org_insert ON public.organizations;
CREATE TRIGGER protect_org_insert
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_insert();

-- ─── 3. Sin policy ni privilegio de INSERT para clientes ───

DROP POLICY IF EXISTS "authenticated_insert_organizations" ON public.organizations;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE INSERT ON public.organizations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE INSERT ON public.organizations FROM authenticated';
  END IF;
END $$;
