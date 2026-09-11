-- Nura · Diagnóstico completo — qué migraciones ya tienes
-- Ejecuta TODO este script en Supabase SQL Editor.
-- Cada fila ✓ = NO ejecutes esa migración otra vez.

SELECT '001 auth' AS migracion,
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'organizations')
    AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'profiles')
  THEN '✓ YA APLICADA — no ejecutar 001'
  ELSE '✗ Falta — ejecutar 001_auth_onboarding.sql'
  END AS estado

UNION ALL SELECT '002 haccp',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'haccp_products')
  THEN '✓ YA APLICADA — no ejecutar 002'
  ELSE '✗ Falta — ejecutar 002_haccp_products.sql'
  END

UNION ALL SELECT '003 hazards',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'haccp_hazards')
  THEN '✓ YA APLICADA — no ejecutar 003'
  ELSE '✗ Falta — ejecutar 003_haccp_hazards_ccps.sql'
  END

UNION ALL SELECT '004 prps',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'prp_programs')
  THEN '✓ YA APLICADA — no ejecutar 004'
  ELSE '✗ Falta — ejecutar 004_prp_programs.sql'
  END

UNION ALL SELECT '005 auditorias',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audits')
  THEN '✓ YA APLICADA — no ejecutar 005'
  ELSE '✗ Falta — ejecutar 005_audits.sql'
  END

UNION ALL SELECT '006 capa',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'capa_actions')
  THEN '✓ YA APLICADA — no ejecutar 006'
  ELSE '✗ Falta — ejecutar 006_capa.sql'
  END

UNION ALL SELECT '007 notificaciones',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications')
  THEN '✓ YA APLICADA — no ejecutar 007'
  ELSE '✗ Falta — ejecutar 007_notifications.sql'
  END

UNION ALL SELECT '008 acceso manual',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'access_status'
  )
  THEN '✓ YA APLICADA — no ejecutar 008'
  ELSE '✗ Falta — ejecutar 008_manual_access.sql'
  END

UNION ALL SELECT '009 invitaciones',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'invitations')
  THEN '✓ YA APLICADA — no ejecutar 009'
  ELSE '✗ Falta — ejecutar 009_invitations.sql'
  END

UNION ALL SELECT '010 configuracion',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notification_preferences')
  THEN '✓ YA APLICADA — no ejecutar 010'
  ELSE '✗ Falta — ejecutar 010_company_settings.sql'
  END

UNION ALL SELECT '011 laboratorio',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'lab_analyses')
  THEN '✓ YA APLICADA — no ejecutar 011'
  ELSE '✗ Falta — ejecutar 011_quality_lab.sql'
  END

UNION ALL SELECT '012 proveedores',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'suppliers')
  THEN '✓ YA APLICADA — no ejecutar 012'
  ELSE '✗ Falta — ejecutar 012_suppliers.sql'
  END

UNION ALL SELECT '013 reclamos',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'customer_complaints')
  THEN '✓ YA APLICADA — no ejecutar 013'
  ELSE '✗ Falta — ejecutar 013_customer_complaints.sql'
  END

UNION ALL SELECT '018 control calidad',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'qc_controls')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 018_quality_control.sql'
  END

UNION ALL SELECT '029 módulos legacy',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'prp_programs')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 029_remove_legacy_modules.sql (tras 028)'
  END

UNION ALL SELECT '028 SLA reclamos',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'complaint_status_log')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 028_complaint_sla.sql (tras 027)'
  END

UNION ALL SELECT '027 capacitación LMS',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'training_courses')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 027_training_lms.sql (tras 026)'
  END

UNION ALL SELECT '026 homologación proveedores',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'supplier_approval_log')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 026_supplier_approval.sql (tras 025)'
  END

UNION ALL SELECT '025 trazabilidad',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'trace_lots')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 025_traceability.sql (tras 024)'
  END

UNION ALL SELECT '024 HACCP versionado',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'haccp_plan_versions')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 024_haccp_plan_versioning.sql (tras 023)'
  END

UNION ALL SELECT '023 plantillas auditoría',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_templates')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 023_audit_templates.sql (tras 022)'
  END

UNION ALL SELECT '022 CAPA workflow',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'capa_stage_log')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 022_capa_workflow.sql (tras 021)'
  END

UNION ALL SELECT '035 storage privado',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'storage_is_org_object')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 035_private_storage_tenant_isolation.sql'
  END

UNION ALL SELECT '021 registros producción',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'production_form_templates')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 021_production_records.sql (tras 020)'
  END

UNION ALL SELECT '020 control documentos',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'controlled_documents')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 020_document_control.sql (tras 019)'
  END

UNION ALL SELECT '019 QC multi-parámetro',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'qc_control_parameters')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 019_qc_multi_parameters.sql (tras 018)'
  END

UNION ALL SELECT '017 perfil RLS (si falla onboarding)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_profile')
  THEN '✓ YA APLICADA'
  ELSE '✗ EJECUTA: 017_fix_profile_rls.sql'
  END

UNION ALL SELECT '016 bootstrap (OBLIGATORIO)',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_user_onboarding')
    THEN '✗ EJECUTA: 016_production_bootstrap.sql'
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'finalize_user_onboarding')
    THEN '⚠ 016 parcial — vuelve a ejecutar 016 (falta finalize_user_onboarding)'
    ELSE '✓ 016 completa — onboarding OK'
  END;
