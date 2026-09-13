-- Nura · Optimización RLS (InitPlan) — mismos permisos, menos CPU
-- No desactiva RLS. No cambia roles. No abre acceso cross-tenant.
-- No convierte funciones INVOKER a DEFINER.
-- Idempotente. Requiere 035 + 036.

-- ─── 1. Índices para columnas que el pred RLS filtra / joinea ─────

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('profiles', 'idx_profiles_organization_id',
        'CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles (organization_id) WHERE organization_id IS NOT NULL'),
      ('haccp_process_steps', 'idx_haccp_process_steps_org',
        'CREATE INDEX IF NOT EXISTS idx_haccp_process_steps_org ON public.haccp_process_steps (organization_id)'),
      ('haccp_hazards', 'idx_haccp_hazards_org',
        'CREATE INDEX IF NOT EXISTS idx_haccp_hazards_org ON public.haccp_hazards (organization_id)'),
      ('haccp_ccps', 'idx_haccp_ccps_org',
        'CREATE INDEX IF NOT EXISTS idx_haccp_ccps_org ON public.haccp_ccps (organization_id)'),
      ('haccp_plan_versions', 'idx_haccp_plan_versions_org',
        'CREATE INDEX IF NOT EXISTS idx_haccp_plan_versions_org ON public.haccp_plan_versions (organization_id)'),
      ('haccp_plan_version_log', 'idx_haccp_plan_version_log_org',
        'CREATE INDEX IF NOT EXISTS idx_haccp_plan_version_log_org ON public.haccp_plan_version_log (organization_id)'),
      ('haccp_ccp_decisions', 'idx_haccp_ccp_decisions_hazard',
        'CREATE INDEX IF NOT EXISTS idx_haccp_ccp_decisions_hazard ON public.haccp_ccp_decisions (hazard_id)'),
      ('audit_checklist_items', 'idx_audit_checklist_items_org',
        'CREATE INDEX IF NOT EXISTS idx_audit_checklist_items_org ON public.audit_checklist_items (organization_id)'),
      ('audit_findings', 'idx_audit_findings_org',
        'CREATE INDEX IF NOT EXISTS idx_audit_findings_org ON public.audit_findings (organization_id)'),
      ('audit_findings', 'idx_audit_findings_checklist_item',
        'CREATE INDEX IF NOT EXISTS idx_audit_findings_checklist_item ON public.audit_findings (checklist_item_id)'),
      ('audit_template_sections', 'idx_audit_template_sections_org',
        'CREATE INDEX IF NOT EXISTS idx_audit_template_sections_org ON public.audit_template_sections (organization_id)'),
      ('audit_template_items', 'idx_audit_template_items_org',
        'CREATE INDEX IF NOT EXISTS idx_audit_template_items_org ON public.audit_template_items (organization_id)'),
      ('production_form_sections', 'idx_production_form_sections_org',
        'CREATE INDEX IF NOT EXISTS idx_production_form_sections_org ON public.production_form_sections (organization_id)'),
      ('production_form_fields', 'idx_production_form_fields_org',
        'CREATE INDEX IF NOT EXISTS idx_production_form_fields_org ON public.production_form_fields (organization_id)'),
      ('production_form_submission_values', 'idx_production_form_submission_values_org',
        'CREATE INDEX IF NOT EXISTS idx_production_form_submission_values_org ON public.production_form_submission_values (organization_id)'),
      ('monitoring_qr_links', 'idx_monitoring_qr_links_template',
        'CREATE INDEX IF NOT EXISTS idx_monitoring_qr_links_template ON public.monitoring_qr_links (template_id)'),
      ('document_versions', 'idx_document_versions_org',
        'CREATE INDEX IF NOT EXISTS idx_document_versions_org ON public.document_versions (organization_id)'),
      ('document_state_log', 'idx_document_state_log_org',
        'CREATE INDEX IF NOT EXISTS idx_document_state_log_org ON public.document_state_log (organization_id)'),
      ('document_read_acknowledgments', 'idx_document_read_acks_org',
        'CREATE INDEX IF NOT EXISTS idx_document_read_acks_org ON public.document_read_acknowledgments (organization_id)'),
      ('document_read_acknowledgments', 'idx_document_read_acks_document',
        'CREATE INDEX IF NOT EXISTS idx_document_read_acks_document ON public.document_read_acknowledgments (document_id)'),
      ('capa_stage_log', 'idx_capa_stage_log_org',
        'CREATE INDEX IF NOT EXISTS idx_capa_stage_log_org ON public.capa_stage_log (organization_id)'),
      ('nc_5whys', 'idx_nc_5whys_org',
        'CREATE INDEX IF NOT EXISTS idx_nc_5whys_org ON public.nc_5whys (organization_id)'),
      ('nc_fishbone_causes', 'idx_nc_fishbone_org',
        'CREATE INDEX IF NOT EXISTS idx_nc_fishbone_org ON public.nc_fishbone_causes (organization_id)'),
      ('supplier_documents', 'idx_supplier_documents_org',
        'CREATE INDEX IF NOT EXISTS idx_supplier_documents_org ON public.supplier_documents (organization_id)'),
      ('supplier_evaluations', 'idx_supplier_evaluations_org',
        'CREATE INDEX IF NOT EXISTS idx_supplier_evaluations_org ON public.supplier_evaluations (organization_id)'),
      ('supplier_incidents', 'idx_supplier_incidents_org',
        'CREATE INDEX IF NOT EXISTS idx_supplier_incidents_org ON public.supplier_incidents (organization_id)'),
      ('complaint_photos', 'idx_complaint_photos_org',
        'CREATE INDEX IF NOT EXISTS idx_complaint_photos_org ON public.complaint_photos (organization_id)'),
      ('complaint_status_log', 'idx_complaint_status_log_org',
        'CREATE INDEX IF NOT EXISTS idx_complaint_status_log_org ON public.complaint_status_log (organization_id)'),
      ('training_quiz_questions', 'idx_training_quiz_questions_org',
        'CREATE INDEX IF NOT EXISTS idx_training_quiz_questions_org ON public.training_quiz_questions (organization_id)'),
      ('trace_lot_compositions', 'idx_trace_lot_compositions_org',
        'CREATE INDEX IF NOT EXISTS idx_trace_lot_compositions_org ON public.trace_lot_compositions (organization_id)'),
      ('trace_events', 'idx_trace_events_org',
        'CREATE INDEX IF NOT EXISTS idx_trace_events_org ON public.trace_events (organization_id)'),
      ('mock_recall_simulation_lots', 'idx_mock_recall_simulation_lots_org',
        'CREATE INDEX IF NOT EXISTS idx_mock_recall_simulation_lots_org ON public.mock_recall_simulation_lots (organization_id)'),
      ('mock_recall_simulation_lots', 'idx_mock_recall_simulation_lots_lot',
        'CREATE INDEX IF NOT EXISTS idx_mock_recall_simulation_lots_lot ON public.mock_recall_simulation_lots (lot_id)')
    ) AS t(tbl, idx, ddl)
  LOOP
    IF to_regclass('public.' || rec.tbl) IS NOT NULL THEN
      EXECUTE rec.ddl;
    END IF;
  END LOOP;
END $$;

-- ─── 2. Alias de sesión (sigue DEFINER; no toca INVOKER) ───────────

CREATE OR REPLACE FUNCTION public.my_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_organization_id()
$$;

-- ─── 3. Generadores: mismo ACL, pred InitPlan ──────────────────────

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
END;
$$;

-- ─── 4. Recrear policies de tablas con organization_id ─────────────

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
-- hijas con organization_id: pred directo (ya no IN al padre)
SELECT public._rbac_quality_crud('audit_checklist_items');
SELECT public._rbac_quality_crud('audit_findings');
SELECT public._rbac_quality_crud('audit_template_sections');
SELECT public._rbac_quality_crud('audit_template_items');

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
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1 FROM public.audit_templates t
          WHERE t.id = template_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_sections_insert_rbac ON public.audit_template_sections
      FOR INSERT TO authenticated
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1 FROM public.audit_templates t
          WHERE t.id = template_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_sections_update_rbac ON public.audit_template_sections
      FOR UPDATE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1 FROM public.audit_templates t
          WHERE t.id = template_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      )
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1 FROM public.audit_templates t
          WHERE t.id = template_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_sections_delete_rbac ON public.audit_template_sections
      FOR DELETE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1 FROM public.audit_templates t
          WHERE t.id = template_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
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
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1
          FROM public.audit_template_sections s
          JOIN public.audit_templates t ON t.id = s.template_id
          WHERE s.id = section_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_items_insert_rbac ON public.audit_template_items
      FOR INSERT TO authenticated
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1
          FROM public.audit_template_sections s
          JOIN public.audit_templates t ON t.id = s.template_id
          WHERE s.id = section_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_items_update_rbac ON public.audit_template_items
      FOR UPDATE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1
          FROM public.audit_template_sections s
          JOIN public.audit_templates t ON t.id = s.template_id
          WHERE s.id = section_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      )
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1
          FROM public.audit_template_sections s
          JOIN public.audit_templates t ON t.id = s.template_id
          WHERE s.id = section_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
    CREATE POLICY audit_template_items_delete_rbac ON public.audit_template_items
      FOR DELETE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND EXISTS (
          SELECT 1
          FROM public.audit_template_sections s
          JOIN public.audit_templates t ON t.id = s.template_id
          WHERE s.id = section_id
            AND t.organization_id = (SELECT public.current_organization_id())
        )
      );
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
SELECT public._rbac_quality_crud('trace_lots');
SELECT public._rbac_quality_crud('trace_lot_compositions');
SELECT public._rbac_quality_crud('trace_events');
SELECT public._rbac_quality_crud('mock_recall_simulations');
SELECT public._rbac_quality_crud('mock_recall_simulation_lots');
SELECT public._rbac_quality_crud('ai_daily_insights');
SELECT public._rbac_quality_crud('capa_actions');
SELECT public._rbac_quality_crud('nc_5whys');
SELECT public._rbac_quality_crud('nc_fishbone_causes');
SELECT public._rbac_quality_crud('document_state_log');
SELECT public._rbac_quality_crud('training_role_requirements');

-- ─── 5. Policies custom (mismos roles que 036) ─────────────────────

DO $$
BEGIN
  IF to_regclass('public.customer_complaints') IS NOT NULL THEN
    DROP POLICY IF EXISTS complaints_insert_operator ON public.customer_complaints;
    CREATE POLICY complaints_insert_operator ON public.customer_complaints
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_is('operator'))
      );
  END IF;
  IF to_regclass('public.complaint_photos') IS NOT NULL THEN
    DROP POLICY IF EXISTS complaint_photos_insert_operator ON public.complaint_photos;
    CREATE POLICY complaint_photos_insert_operator ON public.complaint_photos
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_is('operator'))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.nonconformities') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('nonconformities');
    CREATE POLICY nonconformities_select_rbac ON public.nonconformities
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY nonconformities_insert_rbac ON public.nonconformities
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_is('admin', 'quality_manager', 'operator'))
      );
    CREATE POLICY nonconformities_update_rbac ON public.nonconformities
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.capa_stage_log') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('capa_stage_log');
    CREATE POLICY capa_stage_log_select_rbac ON public.capa_stage_log
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY capa_stage_log_insert_rbac ON public.capa_stage_log
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_is('admin', 'quality_manager', 'operator'))
      );
    CREATE POLICY capa_stage_log_update_rbac ON public.capa_stage_log
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY capa_stage_log_delete_rbac ON public.capa_stage_log
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;

  IF to_regclass('public.nc_photos') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('nc_photos');
    CREATE POLICY nc_photos_select_rbac ON public.nc_photos
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY nc_photos_insert_rbac ON public.nc_photos
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_is('admin', 'quality_manager', 'operator'))
      );
    CREATE POLICY nc_photos_delete_rbac ON public.nc_photos
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.controlled_documents') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('controlled_documents');
    CREATE POLICY controlled_documents_select_rbac ON public.controlled_documents
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (
          (SELECT public.rbac_quality())
          OR (
            (SELECT public.rbac_is('operator'))
            AND status IN ('published', 'obsolete')
          )
        )
      );
    CREATE POLICY controlled_documents_insert_rbac ON public.controlled_documents
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY controlled_documents_update_rbac ON public.controlled_documents
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY controlled_documents_delete_rbac ON public.controlled_documents
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;

  IF to_regclass('public.document_versions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('document_versions');
    CREATE POLICY document_versions_select_rbac ON public.document_versions
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (
          (SELECT public.rbac_quality())
          OR (SELECT public.rbac_is('operator'))
        )
      );
    CREATE POLICY document_versions_write_rbac ON public.document_versions
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY document_versions_update_rbac ON public.document_versions
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY document_versions_delete_rbac ON public.document_versions
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;

  IF to_regclass('public.document_read_acknowledgments') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('document_read_acknowledgments');
    CREATE POLICY document_acks_select_rbac ON public.document_read_acknowledgments
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY document_acks_insert_rbac ON public.document_read_acknowledgments
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND user_id = auth.uid()
      );
    CREATE POLICY document_acks_delete_rbac ON public.document_read_acknowledgments
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.production_form_templates') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_templates');
    CREATE POLICY production_form_templates_select_rbac ON public.production_form_templates
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_templates_insert_rbac ON public.production_form_templates
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY production_form_templates_update_rbac ON public.production_form_templates
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY production_form_templates_delete_rbac ON public.production_form_templates
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.production_form_sections') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_sections');
    CREATE POLICY production_form_sections_select_rbac ON public.production_form_sections
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_sections_write_rbac ON public.production_form_sections
      FOR INSERT TO authenticated
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
    CREATE POLICY production_form_sections_update_rbac ON public.production_form_sections
      FOR UPDATE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      )
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
    CREATE POLICY production_form_sections_delete_rbac ON public.production_form_sections
      FOR DELETE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
  END IF;

  IF to_regclass('public.production_form_fields') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_fields');
    CREATE POLICY production_form_fields_select_rbac ON public.production_form_fields
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_fields_insert_rbac ON public.production_form_fields
      FOR INSERT TO authenticated
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
    CREATE POLICY production_form_fields_update_rbac ON public.production_form_fields
      FOR UPDATE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      )
      WITH CHECK (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
    CREATE POLICY production_form_fields_delete_rbac ON public.production_form_fields
      FOR DELETE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
  END IF;

  IF to_regclass('public.production_form_submissions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_submissions');
    CREATE POLICY production_form_submissions_select_rbac ON public.production_form_submissions
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submissions_insert_rbac ON public.production_form_submissions
      FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submissions_update_rbac ON public.production_form_submissions
      FOR UPDATE TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()))
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submissions_delete_rbac ON public.production_form_submissions
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.production_form_submission_values') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('production_form_submission_values');
    CREATE POLICY production_form_submission_values_select_rbac ON public.production_form_submission_values
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submission_values_insert_rbac ON public.production_form_submission_values
      FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submission_values_update_rbac ON public.production_form_submission_values
      FOR UPDATE TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()))
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY production_form_submission_values_delete_rbac ON public.production_form_submission_values
      FOR DELETE TO authenticated
      USING (
        (SELECT public.rbac_quality())
        AND organization_id = (SELECT public.current_organization_id())
      );
  END IF;

  IF to_regclass('public.monitoring_qr_links') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('monitoring_qr_links');
    CREATE POLICY monitoring_qr_links_select_rbac ON public.monitoring_qr_links
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY monitoring_qr_links_insert_rbac ON public.monitoring_qr_links
      FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY monitoring_qr_links_update_rbac ON public.monitoring_qr_links
      FOR UPDATE TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()))
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY monitoring_qr_links_delete_rbac ON public.monitoring_qr_links
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
    DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
    DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
    CREATE POLICY notifications_select ON public.notifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    CREATE POLICY notifications_insert ON public.notifications
      FOR INSERT TO authenticated
      WITH CHECK (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY notifications_update ON public.notifications
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.training_courses') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_courses');
    CREATE POLICY training_courses_select_rbac ON public.training_courses
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY training_courses_insert_rbac ON public.training_courses
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY training_courses_update_rbac ON public.training_courses
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY training_courses_delete_rbac ON public.training_courses
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.training_quiz_questions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_quiz_questions');
    CREATE POLICY training_quiz_select_rbac ON public.training_quiz_questions
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY training_quiz_insert_rbac ON public.training_quiz_questions
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY training_quiz_update_rbac ON public.training_quiz_questions
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY training_quiz_delete_rbac ON public.training_quiz_questions
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.training_assignments') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_assignments');
    CREATE POLICY training_assignments_select_rbac ON public.training_assignments
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND ((SELECT public.rbac_quality()) OR user_id = auth.uid())
      );
    CREATE POLICY training_assignments_insert_rbac ON public.training_assignments
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY training_assignments_update_rbac ON public.training_assignments
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND ((SELECT public.rbac_quality()) OR user_id = auth.uid())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND ((SELECT public.rbac_quality()) OR user_id = auth.uid())
      );
    CREATE POLICY training_assignments_delete_rbac ON public.training_assignments
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;

  IF to_regclass('public.training_completions') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('training_completions');
    CREATE POLICY training_completions_select_rbac ON public.training_completions
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND ((SELECT public.rbac_quality()) OR user_id = auth.uid())
      );
    CREATE POLICY training_completions_insert_rbac ON public.training_completions
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND user_id = auth.uid()
      );
    CREATE POLICY training_completions_delete_rbac ON public.training_completions
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invitations') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('invitations');
    CREATE POLICY invitations_select_rbac ON public.invitations
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
    CREATE POLICY invitations_insert_rbac ON public.invitations
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
    CREATE POLICY invitations_update_rbac ON public.invitations
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
    CREATE POLICY invitations_delete_rbac ON public.invitations
      FOR DELETE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;

  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('notification_preferences');
    CREATE POLICY notification_prefs_select_rbac ON public.notification_preferences
      FOR SELECT TO authenticated
      USING (organization_id = (SELECT public.current_organization_id()));
    CREATE POLICY notification_prefs_write_rbac ON public.notification_preferences
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
    CREATE POLICY notification_prefs_update_rbac ON public.notification_preferences
      FOR UPDATE TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      )
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_admin())
      );
  END IF;

  IF to_regclass('public.haccp_plan_version_log') IS NOT NULL THEN
    PERFORM public._rbac_drop_all_policies('haccp_plan_version_log');
    CREATE POLICY haccp_plan_version_log_select_rbac ON public.haccp_plan_version_log
      FOR SELECT TO authenticated
      USING (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
    CREATE POLICY haccp_plan_version_log_insert_rbac ON public.haccp_plan_version_log
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = (SELECT public.current_organization_id())
        AND (SELECT public.rbac_quality())
      );
  END IF;
END $$;

-- Identidad: InitPlan en teammates / admin team / org
DROP POLICY IF EXISTS "users_read_teammates" ON public.profiles;
CREATE POLICY "users_read_teammates" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_organization_id())
    AND id <> auth.uid()
  );

DROP POLICY IF EXISTS "profiles_admin_update_team" ON public.profiles;
CREATE POLICY "profiles_admin_update_team" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.rbac_admin())
    AND organization_id = (SELECT public.current_organization_id())
    AND id <> auth.uid()
  )
  WITH CHECK (
    (SELECT public.rbac_admin())
    AND organization_id = (SELECT public.current_organization_id())
    AND organization_id IS NOT DISTINCT FROM (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = profiles.id
    )
  );

DROP POLICY IF EXISTS "users_read_own_organization" ON public.organizations;
CREATE POLICY "users_read_own_organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_organization_id()));

DROP POLICY IF EXISTS "admins_update_own_organization" ON public.organizations;
CREATE POLICY "admins_update_own_organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_admin())
  )
  WITH CHECK (
    id = (SELECT public.current_organization_id())
    AND (SELECT public.rbac_admin())
  );

REVOKE ALL ON FUNCTION public._rbac_drop_all_policies(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_crud(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_via_plan(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rbac_quality_via_audit(text) FROM PUBLIC;
