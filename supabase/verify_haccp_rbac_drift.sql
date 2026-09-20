-- Live check after 050. Requires DATABASE_URL / psql. No-op if 050 not applied.
DO $$
DECLARE
  leftover text;
  missing_helper text;
BEGIN
  IF to_regprocedure('public.rbac_quality()') IS NULL THEN
    RAISE EXCEPTION 'rbac_quality() missing — 050 not applied';
  END IF;
  IF to_regprocedure('public.current_user_role()') IS NULL THEN
    RAISE EXCEPTION 'current_user_role() missing';
  END IF;
  IF to_regprocedure('public._rbac_drop_all_policies(text)') IS NULL THEN
    RAISE EXCEPTION '_rbac_drop_all_policies missing';
  END IF;

  SELECT policyname INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'haccp_plans', 'haccp_teams', 'haccp_plan_products', 'haccp_diagrams',
      'haccp_validations', 'haccp_plan_hazards', 'haccp_ccp_decisions',
      'haccp_step_data', 'haccp_monitoring_records'
    )
    AND policyname LIKE '%\_all' ESCAPE '\'
  LIMIT 1;

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '030 leftover still present: %', leftover;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'haccp_plans'
      AND policyname = 'haccp_plans_insert_rbac'
  ) THEN
    RAISE EXCEPTION 'haccp_plans_insert_rbac missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'haccp_plans'
      AND policyname = 'org_access_gate'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'org_access_gate missing or not RESTRICTIVE on haccp_plans';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'haccp_step_data'
      AND policyname = 'haccp_step_data_select_operator'
  ) THEN
    RAISE EXCEPTION 'haccp_step_data_select_operator missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'haccp_monitoring_records'
      AND policyname = 'haccp_monitoring_records_insert_org'
  ) THEN
    RAISE EXCEPTION 'haccp_monitoring_records_insert_org missing';
  END IF;

  RAISE NOTICE '050 HACCP RBAC drift verify OK';
END $$;
