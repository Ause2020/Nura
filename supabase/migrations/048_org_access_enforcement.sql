-- Nura · SEC-P1-01 — access_status es autorización, no solo UI
-- Incremental. Idempotente. No edita 001–047. No toca tablas server-only.
--
-- Function: public.current_organization_access_allowed()
--   SECURITY DEFINER, STABLE, search_path = public
--   Org desde auth.uid() → profiles.organization_id. Sin input de cliente.
--   true  = active y (access_expires_at IS NULL OR >= CURRENT_DATE)
--           o perfil sin organización (onboarding)
--   false = pending / suspended / expired / fecha vencida / sin perfil / sin org
--
-- Function: public.apply_org_access_gate(text)
--   Crea policy RESTRICTIVE org_access_gate (AND con el ACL existente).
--
-- Trigger/policies 047 intactos. service_role sigue con BYPASSRLS.
--
-- Semántica alineada con lib/access/constants.ts isAccessAllowed +
-- resolveAccessStatus. access_granted_at no participa (tampoco en la app).

CREATE OR REPLACE FUNCTION public.current_organization_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p.organization_id IS NULL THEN true
        WHEN o.id IS NULL THEN false
        WHEN o.access_status IS DISTINCT FROM 'active' THEN false
        WHEN o.access_expires_at IS NOT NULL
             AND o.access_expires_at < CURRENT_DATE THEN false
        ELSE true
      END
      FROM public.profiles p
      LEFT JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_organization_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_access_allowed() TO authenticated;

COMMENT ON FUNCTION public.current_organization_access_allowed() IS
  'SEC-P1-01: org access from auth.uid() only. Fail closed. service_role bypasses RLS.';

-- ─── Generador RESTRICTIVE (no ensancha permisos) ─────────────────

CREATE OR REPLACE FUNCTION public.apply_org_access_gate(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'DROP POLICY IF EXISTS org_access_gate ON public.%I',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY org_access_gate ON public.%I
       AS RESTRICTIVE
       FOR ALL
       TO authenticated
       USING ((SELECT public.current_organization_access_allowed()))
       WITH CHECK ((SELECT public.current_organization_access_allowed()))',
    p_table
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_org_access_gate(text) FROM PUBLIC;

-- ─── rbac_same_org: defensa si alguna policy residual lo usa ──────

CREATE OR REPLACE FUNCTION public.rbac_same_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_org IS NOT NULL
    AND p_org = public.current_organization_id()
    AND public.current_organization_access_allowed()
$$;

-- ─── Storage privado: el SELECT/DML ya exige storage_is_org_object ─

CREATE OR REPLACE FUNCTION public.storage_is_org_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.current_organization_id() IS NOT NULL
    AND public.current_organization_access_allowed()
    AND (storage.foldername(object_name))[1] = public.current_organization_id()::text
$$;

-- ─── Si se regeneran policies 041, reponer el gate ────────────────

CREATE OR REPLACE FUNCTION public._rbac_quality_crud(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  PERFORM public._rbac_drop_all_policies(p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (
         organization_id = (SELECT public.current_organization_id())
         AND (SELECT public.rbac_quality())
       )',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (
         organization_id = (SELECT public.current_organization_id())
         AND (SELECT public.rbac_quality())
       )',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (
         organization_id = (SELECT public.current_organization_id())
         AND (SELECT public.rbac_quality())
       )
       WITH CHECK (
         organization_id = (SELECT public.current_organization_id())
         AND (SELECT public.rbac_quality())
       )',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (
         organization_id = (SELECT public.current_organization_id())
         AND (SELECT public.rbac_quality())
       )',
    p_table || '_delete_rbac', p_table
  );
  PERFORM public.apply_org_access_gate(p_table);
END;
$$;

CREATE OR REPLACE FUNCTION public._rbac_quality_via_plan(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  PERFORM public._rbac_drop_all_policies(p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.haccp_plans p
           WHERE p.id = plan_id
             AND p.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.haccp_plans p
           WHERE p.id = plan_id
             AND p.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.haccp_plans p
           WHERE p.id = plan_id
             AND p.organization_id = (SELECT public.current_organization_id())
         )
       )
       WITH CHECK (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.haccp_plans p
           WHERE p.id = plan_id
             AND p.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.haccp_plans p
           WHERE p.id = plan_id
             AND p.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_delete_rbac', p_table
  );
  PERFORM public.apply_org_access_gate(p_table);
END;
$$;

CREATE OR REPLACE FUNCTION public._rbac_quality_via_audit(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;
  PERFORM public._rbac_drop_all_policies(p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.audits a
           WHERE a.id = audit_id
             AND a.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.audits a
           WHERE a.id = audit_id
             AND a.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.audits a
           WHERE a.id = audit_id
             AND a.organization_id = (SELECT public.current_organization_id())
         )
       )
       WITH CHECK (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.audits a
           WHERE a.id = audit_id
             AND a.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (
         (SELECT public.rbac_quality())
         AND EXISTS (
           SELECT 1 FROM public.audits a
           WHERE a.id = audit_id
             AND a.organization_id = (SELECT public.current_organization_id())
         )
       )',
    p_table || '_delete_rbac', p_table
  );
  PERFORM public.apply_org_access_gate(p_table);
END;
$$;

-- ─── Aplicar a tablas de negocio con RLS ──────────────────────────
-- Excluye: organizations (SELECT para /acceso-pendiente),
--          profiles (sesión / self),
--          rate_limit_windows, security_abuse_events, background_job_locks

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname NOT IN (
        'organizations',
        'profiles',
        'rate_limit_windows',
        'security_abuse_events',
        'background_job_locks'
      )
    ORDER BY 1
  LOOP
    PERFORM public.apply_org_access_gate(t);
  END LOOP;
END $$;

-- organizations: UPDATE sí (settings). SELECT no (estado de acceso).
DROP POLICY IF EXISTS org_access_gate_organizations_update ON public.organizations;
CREATE POLICY org_access_gate_organizations_update ON public.organizations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_organization_access_allowed()))
  WITH CHECK ((SELECT public.current_organization_access_allowed()));

-- profiles: self siempre; compañeros / team write solo con acceso.
DROP POLICY IF EXISTS org_access_gate_profiles_select ON public.profiles;
CREATE POLICY org_access_gate_profiles_select ON public.profiles
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (SELECT public.current_organization_access_allowed())
  );

DROP POLICY IF EXISTS org_access_gate_profiles_update ON public.profiles;
CREATE POLICY org_access_gate_profiles_update ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR (SELECT public.current_organization_access_allowed())
  )
  WITH CHECK (
    id = auth.uid()
    OR (SELECT public.current_organization_access_allowed())
  );
