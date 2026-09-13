-- Nura · Pruebas de aislamiento RLS (post 041)
-- Pegar en SQL Editor de STAGING. Sustituir los UUIDs de la sección SETUP.
-- Cada bloque "AS user" se valida con auth.uid() = ese perfil.
--
-- No corre en CI: necesita dos tenants reales.

-- ═══ SETUP (rellenar) ═══════════════════════════════════════════════
-- org_a, org_b
-- admin_a, qm_a, op_a  (organization_id = org_a)
-- admin_b              (organization_id = org_b)
-- Filas semilla en ambas orgs: haccp_plans + 1 hija, nonconformities,
-- audits + audit_findings, controlled_documents (draft + published),
-- production_form_submissions + values, notifications por usuario.

-- Helper: en el SQL editor de Supabase el JWT define auth.uid().
-- Alternativa local (solo si impersonás con SET ROLE y request.jwt):
--   SELECT set_config('request.jwt.claim.sub', '<user-uuid>', true);

-- ═══ T1–T6  org A ve solo A ═════════════════════════════════════════
-- Conectar como admin_a:
-- SELECT count(*) FILTER (WHERE organization_id <> org_a) AS leaked
-- FROM haccp_plans;
-- Esperado: leaked = 0. Repetir en nonconformities, audits,
-- production_form_submissions, controlled_documents.

-- SELECT d.id
-- FROM haccp_diagrams d
-- JOIN haccp_plans p ON p.id = d.plan_id
-- WHERE p.organization_id <> org_a;
-- Esperado: 0 filas.

-- ═══ T7  org B no ve A ══════════════════════════════════════════════
-- Conectar como admin_b:
-- SELECT count(*) FROM haccp_plans WHERE organization_id = org_a;
-- Esperado: 0. Igual para NC, audits, submissions, documents.

-- ═══ T8  no escribir cross-tenant ═══════════════════════════════════
-- Como admin_a:
-- INSERT INTO haccp_plans (organization_id, name, status, current_step)
-- VALUES (org_b, 'x', 'draft', 1);
-- Esperado: error RLS (WITH CHECK).

-- UPDATE nonconformities SET title = title
-- WHERE organization_id = org_b;
-- Esperado: 0 rows.

-- ═══ T9  hija HACCP no acepta plan ajeno ════════════════════════════
-- Como admin_a, plan_id de un plan de org_b:
-- INSERT INTO haccp_diagrams (plan_id, name) VALUES (plan_b, 'x');
-- Esperado: error RLS.

-- ═══ R2  operator no lee HACCP / audits / NC ════════════════════════
-- Como op_a:
-- SELECT count(*) FROM haccp_plans;
-- SELECT count(*) FROM audits;
-- SELECT count(*) FROM nonconformities;
-- Esperado: 0.

-- ═══ R3 / R4  operator crea NC, no la edita ═════════════════════════
-- INSERT INTO nonconformities (organization_id, ...) VALUES (org_a, ...);
-- Esperado: ok.
-- UPDATE nonconformities SET status = 'closed' WHERE organization_id = org_a;
-- Esperado: 0 rows.

-- ═══ R5 / R6  documentos por status ═════════════════════════════════
-- Como op_a:
-- SELECT status FROM controlled_documents;
-- Esperado: solo published/obsolete. Ningún draft.

-- ═══ R8 / R9 / R10  producción ══════════════════════════════════════
-- Como op_a: SELECT templates/sections/fields/submissions de A → >0.
-- DELETE FROM production_form_submissions WHERE organization_id = org_a;
-- Esperado: 0 rows.
-- INSERT submission + values en org_a → ok.

-- ═══ N1–N4  notifications ═══════════════════════════════════════════
-- Como op_a: SELECT * FROM notifications → solo user_id = op_a.
-- Como admin_a: INSERT organization_id = org_a → ok.
-- INSERT organization_id = org_b → error RLS.

-- ═══ I1–I4  identidad ═══════════════════════════════════════════════
-- Como op_a: UPDATE profiles SET role = 'admin' WHERE id = op_a → fail.
-- Como admin_a: UPDATE profiles SET role = 'quality_manager' WHERE id = op_a → ok.
-- UPDATE profiles SET role = 'admin' WHERE organization_id = org_b → 0 rows.
