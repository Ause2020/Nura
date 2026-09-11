-- Nura · RBAC por rol de organización
-- Deduce el comportamiento actual de la app. No introduce roles nuevos.
-- Platform admin sigue siendo app-only (NURA_ADMIN_EMAILS + service_role).
-- Idempotente.

-- ─── 1. Helpers RBAC ───────────────────────────────────────────────

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
$$;

REVOKE ALL ON FUNCTION public.rbac_same_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_same_org(uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.rbac_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rbac_is('admin')
$$;

REVOKE ALL ON FUNCTION public.rbac_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_admin() TO authenticated;

-- ─── 2. Enum de rol + default seguro ───────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'quality_manager', 'operator'));

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'operator';

-- ─── 3. Triggers: no auto-admin, founder = admin, no mass assignment ─

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ignora raw_user_meta_data.role (un usuario no se auto-asigna admin).
  INSERT INTO public.profiles (id, full_name, role, job_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    'operator',
    NEW.raw_user_meta_data->>'job_title'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1),
    'Usuario'
  )
  INTO v_name
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_user_id, COALESCE(v_name, 'Usuario'), 'operator');

  RETURN TRUE;
END;
$$;

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
  v_org_id UUID;
  v_existing_org UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'El nombre de la empresa es requerido';
  END IF;

  IF trim(COALESCE(p_industry, '')) = '' OR trim(COALESCE(p_country, '')) = '' THEN
    RAISE EXCEPTION 'Industria y país son requeridos';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT organization_id INTO v_existing_org
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_existing_org IS NOT NULL THEN
    UPDATE public.profiles
    SET onboarding_completed = TRUE
    WHERE id = v_user_id AND onboarding_completed = FALSE;

    RETURN v_existing_org;
  END IF;

  INSERT INTO public.organizations (
    name, industry, country, city, employees_range, certifications,
    access_status, access_granted_at
  )
  VALUES (
    trim(p_name), p_industry, p_country,
    NULLIF(trim(p_city), ''), p_employees_range,
    COALESCE(p_certifications, '{}'), 'active', NOW()
  )
  RETURNING id INTO v_org_id;

  -- El fundador de la organización es admin. No se acepta rol del cliente.
  UPDATE public.profiles
  SET
    organization_id = v_org_id,
    onboarding_completed = TRUE,
    role = 'admin'
  WHERE id = v_user_id;

  BEGIN
    INSERT INTO public.notification_preferences (organization_id)
    VALUES (v_org_id)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.id := auth.uid();
    NEW.organization_id := NULL;
    NEW.role := 'operator';
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;

  IF OLD.organization_id IS NOT NULL
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id is immutable';
  END IF;

  IF NEW.id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
    -- Única excepción: fundador de org (onboarding) pasa de operator → admin.
    IF NOT (
      OLD.organization_id IS NULL
      AND NEW.organization_id IS NOT NULL
      AND NEW.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'cannot change own role';
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'only admin can change roles';
    END IF;
    IF NEW.role NOT IN ('admin', 'quality_manager', 'operator') THEN
      RAISE EXCEPTION 'invalid role';
    END IF;
  END IF;

  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed
     AND NEW.onboarding_completed IS NOT TRUE THEN
    NEW.onboarding_completed := OLD.onboarding_completed;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_identity ON public.profiles;
CREATE TRIGGER protect_profile_identity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_identity();

-- organization_id inmutable en tablas de negocio (salvo service_role)
CREATE OR REPLACE FUNCTION public.protect_org_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.table_name <> 'profiles'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS protect_org_identity ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER protect_org_identity
         BEFORE UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.protect_org_identity()',
      r.table_name
    );
  END LOOP;
END $$;

-- ─── 4. Policies de perfil ─────────────────────────────────────────

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND organization_id IS NOT DISTINCT FROM (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND onboarding_completed IS NOT DISTINCT FROM (
      SELECT p.onboarding_completed FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND organization_id IS NULL
    AND role = 'operator'
  );

DROP POLICY IF EXISTS "profiles_admin_update_team" ON public.profiles;
CREATE POLICY "profiles_admin_update_team" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.rbac_admin()
    AND organization_id = public.current_organization_id()
    AND id <> auth.uid()
  )
  WITH CHECK (
    public.rbac_admin()
    AND organization_id = public.current_organization_id()
    AND organization_id IS NOT DISTINCT FROM (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = profiles.id
    )
  );

-- ─── 5. Recrear policies de negocio ────────────────────────────────

CREATE OR REPLACE FUNCTION public._rbac_drop_all_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
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

-- quality: SELECT/INSERT/UPDATE/DELETE admin+QM, org scoped
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
       USING (public.rbac_same_org(organization_id) AND public.rbac_quality())',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality())',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
       WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality())',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.rbac_same_org(organization_id) AND public.rbac_quality())',
    p_table || '_delete_rbac', p_table
  );
END;
$$;

-- quality via parent plan_id
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
       USING (public.rbac_quality() AND plan_id IN (
         SELECT id FROM public.haccp_plans WHERE public.rbac_same_org(organization_id)))',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.rbac_quality() AND plan_id IN (
         SELECT id FROM public.haccp_plans WHERE public.rbac_same_org(organization_id)))',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.rbac_quality() AND plan_id IN (
         SELECT id FROM public.haccp_plans WHERE public.rbac_same_org(organization_id)))
       WITH CHECK (public.rbac_quality() AND plan_id IN (
         SELECT id FROM public.haccp_plans WHERE public.rbac_same_org(organization_id)))',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.rbac_quality() AND plan_id IN (
         SELECT id FROM public.haccp_plans WHERE public.rbac_same_org(organization_id)))',
    p_table || '_delete_rbac', p_table
  );
END;
$$;

-- quality via audit_id
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
       USING (public.rbac_quality() AND audit_id IN (
         SELECT id FROM public.audits WHERE public.rbac_same_org(organization_id)))',
    p_table || '_select_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.rbac_quality() AND audit_id IN (
         SELECT id FROM public.audits WHERE public.rbac_same_org(organization_id)))',
    p_table || '_insert_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.rbac_quality() AND audit_id IN (
         SELECT id FROM public.audits WHERE public.rbac_same_org(organization_id)))
       WITH CHECK (public.rbac_quality() AND audit_id IN (
         SELECT id FROM public.audits WHERE public.rbac_same_org(organization_id)))',
    p_table || '_update_rbac', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.rbac_quality() AND audit_id IN (
         SELECT id FROM public.audits WHERE public.rbac_same_org(organization_id)))',
    p_table || '_delete_rbac', p_table
  );
END;
$$;

SELECT public._rbac_quality_crud('haccp_products');
SELECT public._rbac_quality_crud('haccp_process_steps');
SELECT public._rbac_quality_crud('haccp_hazards');
SELECT public._rbac_quality_crud('haccp_ccps');
SELECT public._rbac_quality_crud('haccp_plans');
SELECT public._rbac_quality_crud('haccp_step_data');
SELECT public._rbac_quality_crud('haccp_monitoring_records');
SELECT public._rbac_quality_crud('haccp_plan_versions');
SELECT public._rbac_quality_via_plan('haccp_teams');
SELECT public._rbac_quality_via_plan('haccp_plan_products');
SELECT public._rbac_quality_via_plan('haccp_diagrams');
SELECT public._rbac_quality_via_plan('haccp_validations');
SELECT public._rbac_quality_via_plan('haccp_plan_hazards');
SELECT public._rbac_quality_via_plan('haccp_ccp_decisions');

SELECT public._rbac_quality_crud('audits');
SELECT public._rbac_quality_crud('audit_templates');
SELECT public._rbac_quality_via_audit('audit_checklist_items');
SELECT public._rbac_quality_via_audit('audit_findings');

-- findings historically had no DELETE — keep write for quality, delete only quality (same as manage UI)
SELECT public._rbac_quality_crud('audit_template_sections');
SELECT public._rbac_quality_crud('audit_template_items');

-- audit_template_sections may not have organization_id — recreate via template
DO $$
BEGIN
  IF to_regclass('public.audit_template_sections') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_template_sections'
         AND column_name = 'organization_id'
     ) THEN
    PERFORM public._rbac_drop_all_policies('audit_template_sections');
    CREATE POLICY audit_template_sections_select_rbac ON public.audit_template_sections
      FOR SELECT TO authenticated
      USING (public.rbac_quality() AND template_id IN (
        SELECT id FROM public.audit_templates WHERE public.rbac_same_org(organization_id)));
    CREATE POLICY audit_template_sections_insert_rbac ON public.audit_template_sections
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_quality() AND template_id IN (
        SELECT id FROM public.audit_templates WHERE public.rbac_same_org(organization_id)));
    CREATE POLICY audit_template_sections_update_rbac ON public.audit_template_sections
      FOR UPDATE TO authenticated
      USING (public.rbac_quality() AND template_id IN (
        SELECT id FROM public.audit_templates WHERE public.rbac_same_org(organization_id)))
      WITH CHECK (public.rbac_quality() AND template_id IN (
        SELECT id FROM public.audit_templates WHERE public.rbac_same_org(organization_id)));
    CREATE POLICY audit_template_sections_delete_rbac ON public.audit_template_sections
      FOR DELETE TO authenticated
      USING (public.rbac_quality() AND template_id IN (
        SELECT id FROM public.audit_templates WHERE public.rbac_same_org(organization_id)));
  END IF;

  IF to_regclass('public.audit_template_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_template_items'
         AND column_name = 'organization_id'
     ) THEN
    PERFORM public._rbac_drop_all_policies('audit_template_items');
    CREATE POLICY audit_template_items_select_rbac ON public.audit_template_items
      FOR SELECT TO authenticated
      USING (public.rbac_quality() AND section_id IN (
        SELECT s.id FROM public.audit_template_sections s
        JOIN public.audit_templates t ON t.id = s.template_id
        WHERE public.rbac_same_org(t.organization_id)));
    CREATE POLICY audit_template_items_insert_rbac ON public.audit_template_items
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_quality() AND section_id IN (
        SELECT s.id FROM public.audit_template_sections s
        JOIN public.audit_templates t ON t.id = s.template_id
        WHERE public.rbac_same_org(t.organization_id)));
    CREATE POLICY audit_template_items_update_rbac ON public.audit_template_items
      FOR UPDATE TO authenticated
      USING (public.rbac_quality() AND section_id IN (
        SELECT s.id FROM public.audit_template_sections s
        JOIN public.audit_templates t ON t.id = s.template_id
        WHERE public.rbac_same_org(t.organization_id)))
      WITH CHECK (public.rbac_quality() AND section_id IN (
        SELECT s.id FROM public.audit_template_sections s
        JOIN public.audit_templates t ON t.id = s.template_id
        WHERE public.rbac_same_org(t.organization_id)));
    CREATE POLICY audit_template_items_delete_rbac ON public.audit_template_items
      FOR DELETE TO authenticated
      USING (public.rbac_quality() AND section_id IN (
        SELECT s.id FROM public.audit_template_sections s
        JOIN public.audit_templates t ON t.id = s.template_id
        WHERE public.rbac_same_org(t.organization_id)));
  END IF;
END $$;

SELECT public._rbac_quality_crud('suppliers');
SELECT public._rbac_quality_crud('supplier_documents');
SELECT public._rbac_quality_crud('supplier_evaluations');
SELECT public._rbac_quality_crud('supplier_incidents');
SELECT public._rbac_quality_crud('supplier_approval_checklist');
SELECT public._rbac_quality_crud('supplier_approval_responses');
SELECT public._rbac_quality_crud('supplier_approval_log');
SELECT public._rbac_quality_crud('supplier_portal_tokens');

SELECT public._rbac_quality_crud('customer_complaints');
SELECT public._rbac_quality_crud('complaint_photos');
SELECT public._rbac_quality_crud('complaint_status_log');

-- complaints.create para operator (quick-capture) — INSERT extra
DO $$
BEGIN
  IF to_regclass('public.customer_complaints') IS NOT NULL THEN
    CREATE POLICY complaints_insert_operator ON public.customer_complaints
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND public.rbac_is('operator')
      );
  END IF;
  IF to_regclass('public.complaint_photos') IS NOT NULL THEN
    CREATE POLICY complaint_photos_insert_operator ON public.complaint_photos
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND public.rbac_is('operator')
      );
  END IF;
END $$;

-- Capacitación: quality gestiona cursos; cualquier miembro de la org cursa.
DO $$
BEGIN
  IF to_regclass('public.training_courses') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_courses');
    CREATE POLICY training_courses_select_rbac ON public.training_courses
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY training_courses_insert_rbac ON public.training_courses
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY training_courses_update_rbac ON public.training_courses
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY training_courses_delete_rbac ON public.training_courses
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;

  IF to_regclass('public.training_quiz_questions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_quiz_questions');
    CREATE POLICY training_quiz_select_rbac ON public.training_quiz_questions
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY training_quiz_insert_rbac ON public.training_quiz_questions
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY training_quiz_update_rbac ON public.training_quiz_questions
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY training_quiz_delete_rbac ON public.training_quiz_questions
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;

  IF to_regclass('public.training_role_requirements') IS NOT NULL THEN
    PERFORM public._rbac_quality_crud('training_role_requirements');
  END IF;

  IF to_regclass('public.training_assignments') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_assignments');
    CREATE POLICY training_assignments_select_rbac ON public.training_assignments
      FOR SELECT TO authenticated
      USING (
        public.rbac_same_org(organization_id)
        AND (public.rbac_quality() OR user_id = auth.uid())
      );
    CREATE POLICY training_assignments_insert_rbac ON public.training_assignments
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY training_assignments_update_rbac ON public.training_assignments
      FOR UPDATE TO authenticated
      USING (
        public.rbac_same_org(organization_id)
        AND (public.rbac_quality() OR user_id = auth.uid())
      )
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND (public.rbac_quality() OR user_id = auth.uid())
      );
    CREATE POLICY training_assignments_delete_rbac ON public.training_assignments
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;

  IF to_regclass('public.training_completions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_completions');
    CREATE POLICY training_completions_select_rbac ON public.training_completions
      FOR SELECT TO authenticated
      USING (
        public.rbac_same_org(organization_id)
        AND (public.rbac_quality() OR user_id = auth.uid())
      );
    CREATE POLICY training_completions_insert_rbac ON public.training_completions
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND user_id = auth.uid()
      );
    CREATE POLICY training_completions_delete_rbac ON public.training_completions
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;
END $$;
SELECT public._rbac_quality_crud('trace_lots');
SELECT public._rbac_quality_crud('trace_lot_compositions');
SELECT public._rbac_quality_crud('trace_events');
SELECT public._rbac_quality_crud('mock_recall_simulations');
SELECT public._rbac_quality_crud('mock_recall_simulation_lots');
SELECT public._rbac_quality_crud('ai_daily_insights');

-- ─── CAPA ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.nonconformities') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('nonconformities');
    CREATE POLICY nonconformities_select_rbac ON public.nonconformities
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY nonconformities_insert_rbac ON public.nonconformities
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND public.rbac_is('admin', 'quality_manager', 'operator')
      );
    CREATE POLICY nonconformities_update_rbac ON public.nonconformities
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    -- sin DELETE: igual que el modelo actual
  END IF;

  IF to_regclass('public.capa_actions') IS NOT NULL THEN
    PERFORM public._rbac_quality_crud('capa_actions');
  END IF;
  IF to_regclass('public.nc_5whys') IS NOT NULL THEN
    PERFORM public._rbac_quality_crud('nc_5whys');
  END IF;
  IF to_regclass('public.nc_fishbone_causes') IS NOT NULL THEN
    PERFORM public._rbac_quality_crud('nc_fishbone_causes');
  END IF;
  IF to_regclass('public.capa_stage_log') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('capa_stage_log');
    CREATE POLICY capa_stage_log_select_rbac ON public.capa_stage_log
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY capa_stage_log_insert_rbac ON public.capa_stage_log
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND public.rbac_is('admin', 'quality_manager', 'operator')
      );
    CREATE POLICY capa_stage_log_update_rbac ON public.capa_stage_log
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY capa_stage_log_delete_rbac ON public.capa_stage_log
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;
  IF to_regclass('public.nc_photos') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('nc_photos');
    CREATE POLICY nc_photos_select_rbac ON public.nc_photos
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY nc_photos_insert_rbac ON public.nc_photos
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND public.rbac_is('admin', 'quality_manager', 'operator')
      );
    CREATE POLICY nc_photos_delete_rbac ON public.nc_photos
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;
END $$;

-- ─── Documentos ────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.controlled_documents') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('controlled_documents');
    CREATE POLICY controlled_documents_select_rbac ON public.controlled_documents
      FOR SELECT TO authenticated
      USING (
        public.rbac_same_org(organization_id)
        AND (
          public.rbac_quality()
          OR (
            public.rbac_is('operator')
            AND status IN ('published', 'obsolete')
          )
        )
      );
    CREATE POLICY controlled_documents_insert_rbac ON public.controlled_documents
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY controlled_documents_update_rbac ON public.controlled_documents
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY controlled_documents_delete_rbac ON public.controlled_documents
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;

  IF to_regclass('public.document_versions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('document_versions');
    CREATE POLICY document_versions_select_rbac ON public.document_versions
      FOR SELECT TO authenticated
      USING (
        public.rbac_same_org(organization_id)
        AND (
          public.rbac_quality()
          OR public.rbac_is('operator')
        )
      );
    CREATE POLICY document_versions_write_rbac ON public.document_versions
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY document_versions_update_rbac ON public.document_versions
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY document_versions_delete_rbac ON public.document_versions
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;

  IF to_regclass('public.document_state_log') IS NOT NULL THEN
    PERFORM public._rbac_quality_crud('document_state_log');
  END IF;

  IF to_regclass('public.document_read_acknowledgments') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('document_read_acknowledgments');
    CREATE POLICY document_acks_select_rbac ON public.document_read_acknowledgments
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY document_acks_insert_rbac ON public.document_read_acknowledgments
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_same_org(organization_id)
        AND user_id = auth.uid()
      );
    CREATE POLICY document_acks_delete_rbac ON public.document_read_acknowledgments
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;
END $$;

-- ─── Producción / monitoreo ────────────────────────────────────────

DO $$
BEGIN
  -- Plantillas: todos leen (operador ejecuta); solo quality escribe
  IF to_regclass('public.production_form_templates') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_templates');
    CREATE POLICY production_form_templates_select_rbac ON public.production_form_templates
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY production_form_templates_insert_rbac ON public.production_form_templates
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY production_form_templates_update_rbac ON public.production_form_templates
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY production_form_templates_delete_rbac ON public.production_form_templates
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;

  IF to_regclass('public.production_form_sections') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_sections');
    CREATE POLICY production_form_sections_select_rbac ON public.production_form_sections
      FOR SELECT TO authenticated
      USING (
        template_id IN (
          SELECT id FROM public.production_form_templates
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_sections_write_rbac ON public.production_form_sections
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_quality()
        AND template_id IN (
          SELECT id FROM public.production_form_templates
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_sections_update_rbac ON public.production_form_sections
      FOR UPDATE TO authenticated
      USING (
        public.rbac_quality()
        AND template_id IN (
          SELECT id FROM public.production_form_templates
          WHERE public.rbac_same_org(organization_id)
        )
      )
      WITH CHECK (
        public.rbac_quality()
        AND template_id IN (
          SELECT id FROM public.production_form_templates
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_sections_delete_rbac ON public.production_form_sections
      FOR DELETE TO authenticated
      USING (
        public.rbac_quality()
        AND template_id IN (
          SELECT id FROM public.production_form_templates
          WHERE public.rbac_same_org(organization_id)
        )
      );
  END IF;

  IF to_regclass('public.production_form_fields') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_fields');
    CREATE POLICY production_form_fields_select_rbac ON public.production_form_fields
      FOR SELECT TO authenticated
      USING (
        section_id IN (
          SELECT s.id FROM public.production_form_sections s
          JOIN public.production_form_templates t ON t.id = s.template_id
          WHERE public.rbac_same_org(t.organization_id)
        )
      );
    CREATE POLICY production_form_fields_insert_rbac ON public.production_form_fields
      FOR INSERT TO authenticated
      WITH CHECK (
        public.rbac_quality()
        AND section_id IN (
          SELECT s.id FROM public.production_form_sections s
          JOIN public.production_form_templates t ON t.id = s.template_id
          WHERE public.rbac_same_org(t.organization_id)
        )
      );
    CREATE POLICY production_form_fields_update_rbac ON public.production_form_fields
      FOR UPDATE TO authenticated
      USING (
        public.rbac_quality()
        AND section_id IN (
          SELECT s.id FROM public.production_form_sections s
          JOIN public.production_form_templates t ON t.id = s.template_id
          WHERE public.rbac_same_org(t.organization_id)
        )
      )
      WITH CHECK (
        public.rbac_quality()
        AND section_id IN (
          SELECT s.id FROM public.production_form_sections s
          JOIN public.production_form_templates t ON t.id = s.template_id
          WHERE public.rbac_same_org(t.organization_id)
        )
      );
    CREATE POLICY production_form_fields_delete_rbac ON public.production_form_fields
      FOR DELETE TO authenticated
      USING (
        public.rbac_quality()
        AND section_id IN (
          SELECT s.id FROM public.production_form_sections s
          JOIN public.production_form_templates t ON t.id = s.template_id
          WHERE public.rbac_same_org(t.organization_id)
        )
      );
  END IF;

  IF to_regclass('public.production_form_submissions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_submissions');
    CREATE POLICY production_form_submissions_select_rbac ON public.production_form_submissions
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY production_form_submissions_insert_rbac ON public.production_form_submissions
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id));
    CREATE POLICY production_form_submissions_update_rbac ON public.production_form_submissions
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id))
      WITH CHECK (public.rbac_same_org(organization_id));
    CREATE POLICY production_form_submissions_delete_rbac ON public.production_form_submissions
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;

  IF to_regclass('public.production_form_submission_values') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_submission_values');
    CREATE POLICY production_form_submission_values_select_rbac ON public.production_form_submission_values
      FOR SELECT TO authenticated
      USING (
        submission_id IN (
          SELECT id FROM public.production_form_submissions
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_submission_values_insert_rbac ON public.production_form_submission_values
      FOR INSERT TO authenticated
      WITH CHECK (
        submission_id IN (
          SELECT id FROM public.production_form_submissions
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_submission_values_update_rbac ON public.production_form_submission_values
      FOR UPDATE TO authenticated
      USING (
        submission_id IN (
          SELECT id FROM public.production_form_submissions
          WHERE public.rbac_same_org(organization_id)
        )
      )
      WITH CHECK (
        submission_id IN (
          SELECT id FROM public.production_form_submissions
          WHERE public.rbac_same_org(organization_id)
        )
      );
    CREATE POLICY production_form_submission_values_delete_rbac ON public.production_form_submission_values
      FOR DELETE TO authenticated
      USING (
        public.rbac_quality()
        AND submission_id IN (
          SELECT id FROM public.production_form_submissions
          WHERE public.rbac_same_org(organization_id)
        )
      );
  END IF;

  IF to_regclass('public.monitoring_qr_links') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('monitoring_qr_links');
    CREATE POLICY monitoring_qr_links_select_rbac ON public.monitoring_qr_links
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY monitoring_qr_links_insert_rbac ON public.monitoring_qr_links
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id));
    CREATE POLICY monitoring_qr_links_update_rbac ON public.monitoring_qr_links
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id))
      WITH CHECK (public.rbac_same_org(organization_id));
    CREATE POLICY monitoring_qr_links_delete_rbac ON public.monitoring_qr_links
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;
END $$;

-- ─── Invitations / prefs / haccp version log ───────────────────────

DO $$
BEGIN
  IF to_regclass('public.invitations') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('invitations');
    CREATE POLICY invitations_select_rbac ON public.invitations
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
    CREATE POLICY invitations_insert_rbac ON public.invitations
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_admin());
    CREATE POLICY invitations_update_rbac ON public.invitations
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_admin());
    CREATE POLICY invitations_delete_rbac ON public.invitations
      FOR DELETE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;

  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('notification_preferences');
    CREATE POLICY notification_prefs_select_rbac ON public.notification_preferences
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id));
    CREATE POLICY notification_prefs_write_rbac ON public.notification_preferences
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_admin());
    CREATE POLICY notification_prefs_update_rbac ON public.notification_preferences
      FOR UPDATE TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_admin())
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_admin());
  END IF;

  IF to_regclass('public.haccp_plan_version_log') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('haccp_plan_version_log');
    CREATE POLICY haccp_plan_version_log_select_rbac ON public.haccp_plan_version_log
      FOR SELECT TO authenticated
      USING (public.rbac_same_org(organization_id) AND public.rbac_quality());
    CREATE POLICY haccp_plan_version_log_insert_rbac ON public.haccp_plan_version_log
      FOR INSERT TO authenticated
      WITH CHECK (public.rbac_same_org(organization_id) AND public.rbac_quality());
  END IF;
END $$;

-- ─── Storage: buckets de gestión vs ejecución ──────────────────────

CREATE OR REPLACE FUNCTION public.storage_can_write_bucket(p_bucket text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bucket IN (
      'complaint-photos',
      'production-record-photos',
      'nc-photos'
    ) THEN public.rbac_is('admin', 'quality_manager', 'operator')
    WHEN p_bucket IN (
      'supplier-docs',
      'controlled-documents',
      'haccp-evidence',
      'lab-reports',
      'audit-photos'
    ) THEN public.rbac_quality()
    ELSE public.rbac_admin()
  END
$$;

REVOKE ALL ON FUNCTION public.storage_can_write_bucket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_can_write_bucket(text) TO authenticated;

DO $$
DECLARE
  b text;
  safe text;
  buckets text[] := ARRAY[
    'supplier-docs',
    'controlled-documents',
    'complaint-photos',
    'production-record-photos',
    'haccp-evidence',
    'lab-reports',
    'audit-photos',
    'nc-photos'
  ];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    safe := replace(b, '-', '_');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', safe || '_insert_org');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', safe || '_update_org');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', safe || '_delete_org');

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (
           bucket_id = %L
           AND public.storage_is_org_object(name)
           AND public.storage_can_write_bucket(%L)
         )',
      safe || '_insert_org', b, b
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR UPDATE TO authenticated
         USING (
           bucket_id = %L
           AND public.storage_is_org_object(name)
           AND public.storage_can_write_bucket(%L)
         )
         WITH CHECK (
           bucket_id = %L
           AND public.storage_is_org_object(name)
           AND public.storage_can_write_bucket(%L)
         )',
      safe || '_update_org', b, b, b, b
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR DELETE TO authenticated
         USING (
           bucket_id = %L
           AND public.storage_is_org_object(name)
           AND public.rbac_quality()
         )',
      safe || '_delete_org', b
    );
  END LOOP;
END $$;

-- Helpers internos no se exponen
REVOKE ALL ON FUNCTION public._rbac_drop_all_policies(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_crud(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_via_plan(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_via_audit(text) FROM PUBLIC;
