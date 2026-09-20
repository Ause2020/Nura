-- Nura · Reconciliar RBAC HACCP (drift 030 vs 036/041 en hosted)
-- Incremental. No edita 030/036/041/047/048/049.
--
-- Hosted: 030 dejó PERMISSIVE *_all (cualquier authenticated de la org).
-- 036/041 no aterrizaron (faltan current_user_role / rbac_quality).
-- 048 sí: org_access_gate + generadores _rbac_quality_*.
--
-- Diseño del plan (admin / quality_manager):
--   haccp_plans + 6 hijas plan_id → _rbac_quality_* de 048
--
-- haccp_step_data:
--   writes quality-only; SELECT extra para operator (contrato PCC en /registros).
--
-- haccp_monitoring_records:
--   NO quality-only. Operadores crean PCC en /registros/historico
--   (monitoring.execute). SELECT+INSERT same-org; UPDATE/DELETE quality.

-- ─── 0. Prerrequisitos 048 ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.apply_org_access_gate(text)') IS NULL
     OR to_regprocedure('public._rbac_quality_crud(text)') IS NULL
     OR to_regprocedure('public._rbac_quality_via_plan(text)') IS NULL
     OR to_regprocedure('public.current_organization_access_allowed()') IS NULL
     OR to_regprocedure('public.current_organization_id()') IS NULL
  THEN
    RAISE EXCEPTION '050 requires 048 generators (apply_org_access_gate, _rbac_quality_crud, _rbac_quality_via_plan)';
  END IF;
END $$;

-- ─── 1. Helpers que 036 no dejó en hosted ──────────────────────────
-- Firmas finales usadas por 048. Identidad = auth.uid() solamente.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.rbac_is(VARIADIC allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = ANY (allowed)
$$;

REVOKE ALL ON FUNCTION public.rbac_is(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_is(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.rbac_quality()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rbac_is('admin', 'quality_manager')
$$;

REVOKE ALL ON FUNCTION public.rbac_quality() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_quality() TO authenticated;

CREATE OR REPLACE FUNCTION public._rbac_drop_all_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
      AND policyname NOT LIKE 'service_role%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, p_table);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._rbac_drop_all_policies(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public._rbac_drop_all_policies(text) FROM anon;
    REVOKE ALL ON FUNCTION public._rbac_quality_crud(text) FROM anon;
    REVOKE ALL ON FUNCTION public._rbac_quality_via_plan(text) FROM anon;
    REVOKE ALL ON FUNCTION public.apply_org_access_gate(text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public._rbac_drop_all_policies(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public._rbac_quality_crud(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public._rbac_quality_via_plan(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.apply_org_access_gate(text) FROM authenticated;
  END IF;
END $$;

-- ─── 2. Quitar leftovers 030 (por nombre) ──────────────────────────
DROP POLICY IF EXISTS "haccp_plans_all" ON public.haccp_plans;
DROP POLICY IF EXISTS "haccp_teams_all" ON public.haccp_teams;
DROP POLICY IF EXISTS "haccp_plan_products_all" ON public.haccp_plan_products;
DROP POLICY IF EXISTS "haccp_diagrams_all" ON public.haccp_diagrams;
DROP POLICY IF EXISTS "haccp_validations_all" ON public.haccp_validations;
DROP POLICY IF EXISTS "haccp_plan_hazards_all" ON public.haccp_plan_hazards;
DROP POLICY IF EXISTS "haccp_ccp_decisions_all" ON public.haccp_ccp_decisions;
DROP POLICY IF EXISTS "haccp_step_data_all" ON public.haccp_step_data;
DROP POLICY IF EXISTS "haccp_monitoring_records_all" ON public.haccp_monitoring_records;

-- ─── 3. Regenerar diseño del plan (048) ────────────────────────────
-- Cada llamada deja *_rbac PERMISSIVE + org_access_gate RESTRICTIVE.

SELECT public._rbac_quality_crud('haccp_plans');
SELECT public._rbac_quality_crud('haccp_step_data');

SELECT public._rbac_quality_via_plan('haccp_teams');
SELECT public._rbac_quality_via_plan('haccp_plan_products');
SELECT public._rbac_quality_via_plan('haccp_diagrams');
SELECT public._rbac_quality_via_plan('haccp_validations');
SELECT public._rbac_quality_via_plan('haccp_plan_hazards');
SELECT public._rbac_quality_via_plan('haccp_ccp_decisions');

-- Operator lee el contrato PCC (pasos 7–9) en /registros/historico.
-- No escribe el wizard. No es un write nuevo.
DROP POLICY IF EXISTS haccp_step_data_select_operator ON public.haccp_step_data;
CREATE POLICY haccp_step_data_select_operator ON public.haccp_step_data
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_is('operator'))
  );

-- ─── 4. Monitoreo PCC operativo (no quality-only) ──────────────────
-- /registros/historico + createMonitoringRecord: operator INSERT/SELECT.
-- UPDATE/DELETE siguen quality (la UI no los ofrece al operator).

DROP POLICY IF EXISTS haccp_monitoring_records_select_rbac ON public.haccp_monitoring_records;
DROP POLICY IF EXISTS haccp_monitoring_records_insert_rbac ON public.haccp_monitoring_records;
DROP POLICY IF EXISTS haccp_monitoring_records_update_rbac ON public.haccp_monitoring_records;
DROP POLICY IF EXISTS haccp_monitoring_records_delete_rbac ON public.haccp_monitoring_records;
DROP POLICY IF EXISTS haccp_monitoring_records_select_org ON public.haccp_monitoring_records;
DROP POLICY IF EXISTS haccp_monitoring_records_insert_org ON public.haccp_monitoring_records;

CREATE POLICY haccp_monitoring_records_select_org ON public.haccp_monitoring_records
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_organization_id()));

CREATE POLICY haccp_monitoring_records_insert_org ON public.haccp_monitoring_records
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_organization_id()));

CREATE POLICY haccp_monitoring_records_update_rbac ON public.haccp_monitoring_records
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_quality())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_quality())
  );

CREATE POLICY haccp_monitoring_records_delete_rbac ON public.haccp_monitoring_records
  FOR DELETE TO authenticated
  USING (
    organization_id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_quality())
  );

SELECT public.apply_org_access_gate('haccp_monitoring_records');
