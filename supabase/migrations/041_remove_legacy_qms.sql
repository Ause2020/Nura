-- Nura · Quita SOLO objetos SAFE_TO_DROP (LEGACY_DATABASE_CLEANUP_PLAN.md)
-- No modifica 001–040 ni 041_optimize_rls.sql.
-- No toca REQUIRES_MIGRATION ni DO_NOT_DROP.
--
-- SAFE_TO_DROP:
--   qc_* (5), submit_qc_field_form
--   lab_*, product_specifications, sampling_plans, lot_releases, process_controls
--   prp_* (4)  — NO nonconformities (004 las creó juntas; NC es DO_NOT_DROP)
--   buckets lab-reports / supplier-docs / complaint-photos SOLO si están vacíos
--
-- Antes de cada DROP: FKs, views, functions, policies, triggers.
-- Filas existentes se copian a schema legacy_qms_backup (un snapshot).
-- DROP … IF EXISTS. Idempotente si 029 ya corrió.

-- ─── 0. Allow-list y denylist ──────────────────────────────────────

DO $$
DECLARE
  safe_tables text[] := ARRAY[
    'qc_submission_readings',
    'qc_submissions',
    'qc_field_links',
    'qc_control_parameters',
    'qc_controls',
    'lab_results',
    'lot_releases',
    'sampling_plans',
    'process_controls',
    'lab_analyses',
    'product_specifications',
    'prp_record_items',
    'prp_records',
    'prp_checklist_items',
    'prp_programs'
  ];
  protected text[] := ARRAY[
    -- DO_NOT_DROP
    'organizations', 'profiles', 'invitations',
    'notification_preferences', 'notifications',
    'haccp_plans', 'haccp_teams', 'haccp_plan_products', 'haccp_diagrams',
    'haccp_validations', 'haccp_plan_hazards', 'haccp_ccp_decisions',
    'haccp_step_data', 'haccp_monitoring_records',
    'production_form_templates', 'production_form_sections',
    'production_form_fields', 'production_form_submissions',
    'production_form_submission_values', 'monitoring_qr_links',
    'audits', 'audit_checklist_items', 'audit_findings',
    'audit_templates', 'audit_template_sections', 'audit_template_items',
    'nonconformities', 'capa_actions', 'capa_stage_log',
    'nc_5whys', 'nc_fishbone_causes', 'nc_photos',
    'controlled_documents', 'document_versions',
    'document_state_log', 'document_read_acknowledgments',
    'ai_daily_insights', 'rate_limit_windows', 'security_abuse_events',
    'background_job_locks',
    -- REQUIRES_MIGRATION
    'haccp_products', 'haccp_process_steps', 'haccp_hazards', 'haccp_ccps',
    'haccp_plan_versions', 'haccp_plan_version_log',
    'suppliers', 'supplier_documents', 'supplier_evaluations',
    'supplier_incidents', 'supplier_approval_checklist',
    'supplier_approval_responses', 'supplier_approval_log',
    'supplier_portal_tokens',
    'customer_complaints', 'complaint_photos', 'complaint_status_log',
    'training_courses', 'training_quiz_questions',
    'training_role_requirements', 'training_assignments',
    'training_completions',
    'trace_lots', 'trace_lot_compositions', 'trace_events',
    'mock_recall_simulations', 'mock_recall_simulation_lots'
  ];
  t text;
  incoming record;
  dep_view record;
  dep_fn record;
  dep_trig record;
  n_rows bigint;
  from_name text;
BEGIN
  -- Intersección allow-list ∩ denylist = error de autoría
  IF EXISTS (
    SELECT 1
    FROM unnest(safe_tables) s
    JOIN unnest(protected) p ON p = s
  ) THEN
    RAISE EXCEPTION '041_remove_legacy_qms: allow-list solapa denylist';
  END IF;

  CREATE SCHEMA IF NOT EXISTS legacy_qms_backup;

  CREATE TABLE IF NOT EXISTS legacy_qms_backup._manifest (
    table_name text PRIMARY KEY,
    row_count bigint NOT NULL,
    backed_up_at timestamptz NOT NULL DEFAULT now()
  );

  -- ─── 1. RPC exclusiva de QC ─────────────────────────────────────
  -- Solo submit_qc_field_form. No tocar RBAC / storage / auth / HACCP.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'submit_qc_field_form'
  ) THEN
    -- Comprobar que no hay views/tablas protegidas que dependan de ella
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_depend d ON d.refobjid = p.oid
      JOIN pg_class c ON c.oid = d.objid
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'submit_qc_field_form'
        AND c.relkind IN ('r', 'v')
        AND c.relname = ANY (protected)
    ) THEN
      RAISE EXCEPTION
        '041_remove_legacy_qms: submit_qc_field_form tiene dependientes protegidos';
    END IF;

    DROP FUNCTION IF EXISTS public.submit_qc_field_form CASCADE;
    RAISE NOTICE '041_remove_legacy_qms: dropped function submit_qc_field_form';
  END IF;

  -- ─── 2. Cada tabla SAFE_TO_DROP ─────────────────────────────────
  FOREACH t IN ARRAY safe_tables LOOP
    IF t = ANY (protected) THEN
      RAISE EXCEPTION '041_remove_legacy_qms: % está en denylist', t;
    END IF;

    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '041_remove_legacy_qms: % ausente (ok, 029 u otro)', t;
      CONTINUE;
    END IF;

    -- Views que dependen de la tabla
    FOR dep_view IN
      SELECT DISTINCT v.relname AS view_name, vn.nspname AS view_schema
      FROM pg_depend d
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind = 'v'
      JOIN pg_namespace vn ON vn.oid = v.relnamespace
      JOIN pg_class base ON base.oid = d.refobjid
      JOIN pg_namespace bn ON bn.oid = base.relnamespace
      WHERE bn.nspname = 'public'
        AND base.relname = t
    LOOP
      IF dep_view.view_schema = 'public' AND dep_view.view_name = ANY (protected) THEN
        RAISE EXCEPTION
          '041_remove_legacy_qms: view protegida %.% depende de %',
          dep_view.view_schema, dep_view.view_name, t;
      END IF;
      -- View huérfana exclusiva del módulo → dropear
      EXECUTE format(
        'DROP VIEW IF EXISTS %I.%I CASCADE',
        dep_view.view_schema,
        dep_view.view_name
      );
      RAISE NOTICE '041_remove_legacy_qms: dropped view %.%',
        dep_view.view_schema, dep_view.view_name;
    END LOOP;

    -- Functions que referencian la tabla (además de submit_qc, ya drop)
    FOR dep_fn IN
      SELECT DISTINCT pn.nspname AS fn_schema, p.proname AS fn_name, p.oid AS fn_oid
      FROM pg_depend d
      JOIN pg_proc p ON p.oid = d.objid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      JOIN pg_class base ON base.oid = d.refobjid
      JOIN pg_namespace bn ON bn.oid = base.relnamespace
      WHERE bn.nspname = 'public'
        AND base.relname = t
        AND p.proname <> 'submit_qc_field_form'
    LOOP
      -- Si la función también depende de una tabla protegida, no tocarla
      IF EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_class c ON c.oid = d.refobjid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE d.objid = dep_fn.fn_oid
          AND n.nspname = 'public'
          AND c.relname = ANY (protected)
      ) THEN
        RAISE EXCEPTION
          '041_remove_legacy_qms: función %.% depende de % y de tablas protegidas',
          dep_fn.fn_schema, dep_fn.fn_name, t;
      END IF;

      EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', dep_fn.fn_oid::regprocedure);
      RAISE NOTICE '041_remove_legacy_qms: dropped function %',
        dep_fn.fn_oid::regprocedure;
    END LOOP;

    -- Triggers EN otras tablas que apunten a esta (no los de la propia tabla)
    FOR dep_trig IN
      SELECT DISTINCT ev.relname AS on_table, tr.tgname
      FROM pg_trigger tr
      JOIN pg_class ev ON ev.oid = tr.tgrelid
      JOIN pg_namespace en ON en.oid = ev.relnamespace
      LEFT JOIN pg_proc p ON p.oid = tr.tgfoid
      WHERE en.nspname = 'public'
        AND ev.relname <> t
        AND NOT tr.tgisinternal
        AND (
          pg_get_triggerdef(tr.oid) ILIKE '%' || t || '%'
        )
    LOOP
      IF dep_trig.on_table = ANY (protected) THEN
        RAISE EXCEPTION
          '041_remove_legacy_qms: trigger % en tabla protegida % menciona %',
          dep_trig.tgname, dep_trig.on_table, t;
      END IF;
      IF dep_trig.on_table = ANY (safe_tables) THEN
        -- cae al dropear esa tabla
        CONTINUE;
      END IF;
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I',
        dep_trig.tgname,
        dep_trig.on_table
      );
      RAISE NOTICE '041_remove_legacy_qms: dropped trigger % on %',
        dep_trig.tgname, dep_trig.on_table;
    END LOOP;

    -- FK entrantes
    FOR incoming IN
      SELECT
        n.nspname AS from_schema,
        c.relname AS from_table,
        con.conname,
        con.confdeltype
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
      WHERE con.contype = 'f'
        AND tn.nspname = 'public'
        AND tgt.relname = t
    LOOP
      from_name := incoming.from_table;

      IF incoming.from_schema = 'public' AND from_name = ANY (protected) THEN
        -- Quitar solo el constraint. La tabla protegida y su columna quedan.
        -- Caso documentado: customer_complaints.lot_analysis_id → lab_analyses
        EXECUTE format(
          'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
          incoming.from_schema,
          incoming.from_table,
          incoming.conname
        );
        RAISE NOTICE
          '041_remove_legacy_qms: dropped FK %.%.% → % (tabla origen intacta)',
          incoming.from_schema, incoming.from_table, incoming.conname, t;
      ELSIF incoming.from_schema = 'public' AND from_name = ANY (safe_tables) THEN
        NULL; -- se dropea con la hija o CASCADE
      ELSIF incoming.from_schema = 'legacy_qms_backup' THEN
        NULL;
      ELSE
        RAISE EXCEPTION
          '041_remove_legacy_qms: FK desconocida %.%.% → %',
          incoming.from_schema, incoming.from_table, incoming.conname, t;
      END IF;
    END LOOP;

    -- Realtime (qc_submissions / qc_submission_readings)
    IF EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = t
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
        t
      );
      RAISE NOTICE '041_remove_legacy_qms: removed % from supabase_realtime', t;
    END IF;

    -- Respaldo (solo si hay filas y aún no hay snapshot)
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n_rows;
    IF n_rows > 0 THEN
      IF to_regclass('legacy_qms_backup.' || t) IS NULL THEN
        EXECUTE format(
          'CREATE TABLE legacy_qms_backup.%I AS TABLE public.%I',
          t, t
        );
        INSERT INTO legacy_qms_backup._manifest (table_name, row_count)
        VALUES (t, n_rows)
        ON CONFLICT (table_name) DO NOTHING;
        RAISE NOTICE '041_remove_legacy_qms: backed up % (% rows)', t, n_rows;
      ELSE
        RAISE NOTICE
          '041_remove_legacy_qms: backup de % ya existía; no se pisa', t;
      END IF;
    END IF;

    -- Policies / indexes / triggers de la propia tabla caen con DROP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
    RAISE NOTICE '041_remove_legacy_qms: dropped table %', t;
  END LOOP;
END $$;

-- ─── 3. Policies de storage exclusivas de lab-reports ──────────────
-- Nombres 011: lab_reports_select / _insert
-- Nombres 035/036: lab_reports_select_org / _insert_org / _update_org / _delete_org
-- No se tocan supplier_docs_* ni complaint_photos_* (módulos REQUIRES_MIGRATION).
-- No se toca storage_can_write_bucket.

DROP POLICY IF EXISTS "lab_reports_select" ON storage.objects;
DROP POLICY IF EXISTS "lab_reports_insert" ON storage.objects;
DROP POLICY IF EXISTS lab_reports_select ON storage.objects;
DROP POLICY IF EXISTS lab_reports_insert ON storage.objects;
DROP POLICY IF EXISTS lab_reports_select_org ON storage.objects;
DROP POLICY IF EXISTS lab_reports_insert_org ON storage.objects;
DROP POLICY IF EXISTS lab_reports_update_org ON storage.objects;
DROP POLICY IF EXISTS lab_reports_delete_org ON storage.objects;

-- ─── 4. Buckets SAFE_TO_DROP solo si están vacíos (mismo criterio 038)

DELETE FROM storage.buckets
WHERE id IN ('lab-reports', 'supplier-docs', 'complaint-photos')
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = storage.buckets.id
  );
