-- Políticas del bucket de evidencias del Paso 5 (validación in situ).
-- El INSERT del bucket está en 030; esto solo cubre objects.

DROP POLICY IF EXISTS "haccp_evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "haccp_evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "haccp_evidence_delete" ON storage.objects;

CREATE POLICY "haccp_evidence_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'haccp-evidence');

CREATE POLICY "haccp_evidence_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'haccp-evidence'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "haccp_evidence_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'haccp-evidence'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM profiles WHERE id = auth.uid()
  )
);
