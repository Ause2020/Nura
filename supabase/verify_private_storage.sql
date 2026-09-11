-- Verificación de buckets privados y policies multi-tenant.
-- Esperado: 0 filas en cada consulta de fallo.

-- 1) Buckets confidenciales deben ser privados
SELECT id AS leak_public_bucket
FROM storage.buckets
WHERE id IN (
  'supplier-docs',
  'controlled-documents',
  'complaint-photos',
  'production-record-photos',
  'haccp-evidence',
  'lab-reports',
  'audit-photos',
  'nc-photos'
)
AND public = true;

-- 2) Ninguna policy de esos buckets puede ser TO public / anon
SELECT policyname AS leaky_policy, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    qual ILIKE '%supplier-docs%'
    OR qual ILIKE '%controlled-documents%'
    OR qual ILIKE '%complaint-photos%'
    OR qual ILIKE '%production-record-photos%'
    OR qual ILIKE '%haccp-evidence%'
    OR qual ILIKE '%lab-reports%'
    OR qual ILIKE '%audit-photos%'
    OR qual ILIKE '%nc-photos%'
    OR with_check ILIKE '%supplier-docs%'
    OR with_check ILIKE '%controlled-documents%'
    OR with_check ILIKE '%complaint-photos%'
    OR with_check ILIKE '%production-record-photos%'
    OR with_check ILIKE '%haccp-evidence%'
    OR with_check ILIKE '%lab-reports%'
    OR with_check ILIKE '%audit-photos%'
    OR with_check ILIKE '%nc-photos%'
  )
  AND (
    roles && ARRAY['public']::name[]
    OR roles && ARRAY['anon']::name[]
  );

-- 3) Policies de SELECT deben exigir storage_is_org_object
SELECT policyname AS select_without_org_isolation
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND cmd = 'SELECT'
  AND (
    qual ILIKE '%supplier-docs%'
    OR qual ILIKE '%controlled-documents%'
    OR qual ILIKE '%complaint-photos%'
    OR qual ILIKE '%production-record-photos%'
    OR qual ILIKE '%haccp-evidence%'
    OR qual ILIKE '%lab-reports%'
    OR qual ILIKE '%audit-photos%'
    OR qual ILIKE '%nc-photos%'
  )
  AND qual NOT ILIKE '%storage_is_org_object%';

-- 4) Inventario esperado (8 buckets × 4 operaciones)
SELECT count(*) AS org_scoped_policies
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%_org'
  AND (
    policyname LIKE 'supplier_docs%'
    OR policyname LIKE 'controlled_documents%'
    OR policyname LIKE 'complaint_photos%'
    OR policyname LIKE 'production_record_photos%'
    OR policyname LIKE 'haccp_evidence%'
    OR policyname LIKE 'lab_reports%'
    OR policyname LIKE 'audit_photos%'
    OR policyname LIKE 'nc_photos%'
  );
-- Esperado: 32
