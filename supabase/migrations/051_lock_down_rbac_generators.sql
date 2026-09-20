-- Nura · Lock down EXECUTE on administrative RLS generators
-- Incremental. Idempotent. No edita 030/036/041/047/048/049/050.
-- No CREATE/DROP/ALTER POLICY. No cambia cuerpos ni RBAC de negocio.
--
-- Hallazgo post-050: CREATE OR REPLACE de 048 re-concedió PUBLIC EXECUTE
-- a _rbac_quality_crud / _rbac_quality_via_plan. 050 revocó authenticated
-- explícitamente, pero PUBLIC EXECUTE sigue aplicando a JWT normales.
--
-- Inventario (repo + hosted):
--   B admin generators: apply_org_access_gate, _rbac_drop_all_policies,
--     _rbac_quality_crud, _rbac_quality_via_plan, _rbac_quality_via_audit,
--     rls_auto_enable (solo hosted, si existe)
--   A runtime helpers: current_user_role, rbac_is, rbac_quality, rbac_admin,
--     rbac_same_org, current_organization_id, current_organization_access_allowed,
--     storage_is_org_object, storage_can_write_bucket, my_organization_id
--
-- Owner (postgres) conserva EXECUTE. service_role recibe GRANT explícito
-- para SQL Editor / migraciones / jobs. authenticated y anon no.

-- ─── 1. Generators: REVOKE PUBLIC / anon / authenticated ───────────
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT IN (
        'current_user_role',
        'rbac_is',
        'rbac_quality',
        'rbac_admin',
        'rbac_same_org',
        'current_organization_id',
        'current_organization_access_allowed',
        'storage_is_org_object',
        'storage_can_write_bucket',
        'my_organization_id'
      )
      AND (
        p.proname IN (
          'apply_org_access_gate',
          '_rbac_drop_all_policies',
          '_rbac_quality_crud',
          '_rbac_quality_via_plan',
          '_rbac_quality_via_audit',
          'rls_auto_enable'
        )
        OR p.prosrc ~* '(CREATE|DROP|ALTER)\s+POLICY'
        OR p.prosrc ~* '(ENABLE|FORCE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', rec.sig);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', rec.sig);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', rec.sig);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', rec.sig);
    END IF;
  END LOOP;
END $$;

-- ─── 2. Runtime helpers: PUBLIC/anon off; authenticated on ─────────
DO $$
DECLARE
  helpers text[] := ARRAY[
    'public.current_user_role()',
    'public.rbac_is(text[])',
    'public.rbac_quality()',
    'public.rbac_admin()',
    'public.rbac_same_org(uuid)',
    'public.current_organization_id()',
    'public.current_organization_access_allowed()',
    'public.storage_is_org_object(text)',
    'public.storage_can_write_bucket(text)',
    'public.my_organization_id()'
  ];
  h text;
BEGIN
  FOREACH h IN ARRAY helpers LOOP
    IF to_regprocedure(h) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', h);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', h);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', h);
    END IF;
  END LOOP;
END $$;
