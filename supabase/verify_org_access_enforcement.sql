-- Verificación live SEC-P1-01 (SQL Editor / postgres).
-- El owner bypasea RLS: aquí se prueba el helper y que las policies existen.
-- Para ejercitar RLS de verdad: SET ROLE authenticated + JWT de un usuario de prueba.

DO $$
BEGIN
  IF to_regprocedure('public.current_organization_access_allowed()') IS NULL THEN
    RAISE EXCEPTION 'current_organization_access_allowed() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.haccp_plans'::regclass
      AND polname = 'org_access_gate'
      AND polpermissive = false
  ) THEN
    RAISE EXCEPTION 'RESTRICTIVE org_access_gate missing on haccp_plans';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.organizations'::regclass
      AND polname = 'org_access_gate_organizations_update'
      AND polpermissive = false
      AND polcmd = 'w'
  ) THEN
    RAISE EXCEPTION 'RESTRICTIVE UPDATE gate missing on organizations';
  END IF;
END $$;

-- Sin JWT / sin perfil: fail closed.
DO $$
DECLARE
  allowed boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  SELECT public.current_organization_access_allowed() INTO allowed;
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'no jwt must fail closed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text,
    true
  );
  SELECT public.current_organization_access_allowed() INTO allowed;
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unknown uid without profile must fail closed';
  END IF;
END $$;
