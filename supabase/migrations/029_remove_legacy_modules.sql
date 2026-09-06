-- Nura · Eliminación segura de módulos fuera del core (PRPs, Laboratorio, Control calidad)
-- ⚠️ RESPALDO OBLIGATORIO antes de ejecutar.
-- Ejecutar tras 028. El código de la app ya no depende de estas tablas.

-- 1) Control de calidad (018/019)
DROP FUNCTION IF EXISTS public.submit_qc_field_form CASCADE;

DROP TABLE IF EXISTS qc_submission_readings CASCADE;
DROP TABLE IF EXISTS qc_submissions CASCADE;
DROP TABLE IF EXISTS qc_field_links CASCADE;
DROP TABLE IF EXISTS qc_control_parameters CASCADE;
DROP TABLE IF EXISTS qc_controls CASCADE;

-- 2) Laboratorio (011) — trazabilidad de reclamos usa trace_lots (025)
DROP TABLE IF EXISTS lab_results CASCADE;
DROP TABLE IF EXISTS lab_analyses CASCADE;
DROP TABLE IF EXISTS sampling_plans CASCADE;
DROP TABLE IF EXISTS product_specifications CASCADE;
DROP TABLE IF EXISTS lot_releases CASCADE;
DROP TABLE IF EXISTS process_controls CASCADE;

-- 3) PRPs (004) — reemplazados por registros de producción (021)
DROP TABLE IF EXISTS prp_record_items CASCADE;
DROP TABLE IF EXISTS prp_records CASCADE;
DROP TABLE IF EXISTS prp_checklist_items CASCADE;
DROP TABLE IF EXISTS prp_programs CASCADE;

-- Nota: nonconformities con origin 'prp' o 'lab' se conservan como histórico.
-- Bucket storage 'prp-photos' eliminar manualmente en Supabase → Storage si ya no se usa.
