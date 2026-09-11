-- Verificación live de RBAC (ejecutar en SQL editor como postgres, luego
-- como usuarios de prueba). Los UPDATE deben fallar.
--
-- Sustituye :operator_id, :qm_id, :admin_id, :org_a, :org_b.

-- 1) Operator no puede elevarse
-- SET request.jwt.claim.sub = ':operator_id';
-- UPDATE profiles SET role = 'admin' WHERE id = ':operator_id';
-- Esperado: cannot change own role

-- 2) Quality manager no puede cambiar roles
-- UPDATE profiles SET role = 'admin' WHERE id = ':qm_id';
-- Esperado: only admin can change roles  OR policy violation

-- 3) Org A no lee org B
-- SELECT count(*) FROM controlled_documents WHERE organization_id = ':org_b';
-- Esperado: 0

-- 4) Operator no DELETE documentos
-- DELETE FROM controlled_documents WHERE organization_id = ':org_a';
-- Esperado: 0 filas / policy

-- 5) organization_id inmutable
-- UPDATE profiles SET organization_id = ':org_b' WHERE id = ':operator_id';
-- Esperado: organization_id is immutable
