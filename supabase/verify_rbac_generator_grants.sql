-- Live grant check after 051. Requires DATABASE_URL / psql.
DO $$
DECLARE
  admin_fns text[] := ARRAY[
    'public.apply_org_access_gate(text)',
    'public._rbac_drop_all_policies(text)',
    'public._rbac_quality_crud(text)',
    'public._rbac_quality_via_plan(text)',
    'public._rbac_quality_via_audit(text)'
  ];
  runtime_fns text[] := ARRAY[
    'public.current_user_role()',
    'public.rbac_is(text[])',
    'public.rbac_quality()',
    'public.current_organization_access_allowed()'
  ];
  fn text;
  extra text;
BEGIN
  IF to_regprocedure('public._rbac_quality_crud(text)') IS NULL THEN
    RAISE EXCEPTION '051 target _rbac_quality_crud(text) missing';
  END IF;

  FOREACH fn IN ARRAY admin_fns LOOP
    IF to_regprocedure(fn) IS NULL THEN
      CONTINUE;
    END IF;
    IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated still has EXECUTE on %', fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon still has EXECUTE on %', fn;
    END IF;
  END LOOP;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL
     AND has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated still has EXECUTE on rls_auto_enable()';
  END IF;

  FOREACH fn IN ARRAY runtime_fns LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE EXCEPTION 'runtime helper missing: %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated lost EXECUTE on runtime helper %', fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not EXECUTE runtime helper %', fn;
    END IF;
  END LOOP;

  SELECT n.nspname || '.' || p.proname INTO extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND (
      p.prosrc ~* '(CREATE|DROP|ALTER)\s+POLICY'
      OR p.prosrc ~* '(ENABLE|FORCE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY'
    )
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LIMIT 1;

  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated can still execute policy-mutating function %', extra;
  END IF;

  RAISE NOTICE '051 RBAC generator grants verify OK';
END $$;
