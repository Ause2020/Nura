-- Nura · SP-01 — verificación post-053 (SQL Editor). Todo dentro de una
-- transacción con ROLLBACK: no deja datos.
--
-- Esperado:
--   1. complete_user_onboarding sin INSERT INTO organizations; trigger presente;
--      sin policy authenticated_insert_organizations; privilegios OK.
--   2. Probe: usuario autenticado sin org → organization_not_provisioned.
--   3. Probe: INSERT en organizations como authenticated → organization_not_provisioned.

-- ─── 1. Catálogo ───
SELECT
  position('INSERT INTO public.organizations' IN pg_get_functiondef(
    'public.complete_user_onboarding(text,text,text,text,text,text[])'::regprocedure)) = 0
    AS rpc_does_not_insert_orgs,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.organizations'::regclass
      AND tgname = 'protect_org_insert' AND NOT tgisinternal
  ) AS insert_trigger_present,
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'authenticated_insert_organizations'
  ) AS insert_policy_dropped,
  NOT has_table_privilege('authenticated', 'public.organizations', 'INSERT') AS auth_no_insert,
  NOT has_table_privilege('anon', 'public.organizations', 'INSERT') AS anon_no_insert,
  NOT has_function_privilege('anon',
    'public.complete_user_onboarding(text,text,text,text,text,text[])', 'EXECUTE') AS anon_no_exec,
  has_function_privilege('authenticated',
    'public.complete_user_onboarding(text,text,text,text,text,text[])', 'EXECUTE') AS auth_exec;

-- ─── 2/3. Probes de comportamiento (ROLLBACK) ───
BEGIN;

DO $$
DECLARE
  v_uid UUID;
  v_orgs_before BIGINT;
  v_profile RECORD;
BEGIN
  -- Perfil sintético sin organización (requiere FK a auth.users → se usa un
  -- usuario existente sin org si lo hay; si no, se omite el probe 2).
  SELECT p.id INTO v_uid
  FROM public.profiles p
  WHERE p.organization_id IS NULL
  LIMIT 1;

  SELECT count(*) INTO v_orgs_before FROM public.organizations;

  IF v_uid IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM public.complete_user_onboarding('Probe SA', 'food', 'CL');
      RAISE EXCEPTION 'FAIL: complete_user_onboarding aceptó usuario sin org';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'organization_not_provisioned' THEN
        RAISE EXCEPTION 'FAIL: error inesperado %', SQLERRM;
      END IF;
    END;

    SELECT organization_id, role, onboarding_completed INTO v_profile
    FROM public.profiles WHERE id = v_uid;
    IF v_profile.organization_id IS NOT NULL OR v_profile.onboarding_completed THEN
      RAISE EXCEPTION 'FAIL: perfil modificado %', v_profile;
    END IF;
    RAISE NOTICE 'PASS probe 2: orgless onboarding denied (role=%)', v_profile.role;
  ELSE
    RAISE NOTICE 'SKIP probe 2: no hay perfiles sin organización';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    INSERT INTO public.organizations (name) VALUES ('probe-should-fail');
    RAISE EXCEPTION 'FAIL: INSERT authenticated aceptado';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS probe 3: authenticated INSERT blocked (%)', SQLERRM;
  END;

  IF (SELECT count(*) FROM public.organizations) <> v_orgs_before THEN
    RAISE EXCEPTION 'FAIL: se crearon organizaciones';
  END IF;
END $$;

ROLLBACK;
