-- Nura · Paso 1 — Control de Documentos
-- Idempotente. Ejecutar tras 019 (o 018 si no usas QC multi-parámetro).

CREATE TABLE IF NOT EXISTS controlled_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'procedure',
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id UUID,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  effective_date DATE,
  next_review_date DATE,
  read_target_roles TEXT[] NOT NULL DEFAULT ARRAY['admin', 'quality_manager', 'operator'],
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT,
  file_name TEXT,
  change_summary TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  approval_signature_hash TEXT,
  publish_signature_hash TEXT,
  version_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'controlled_documents_current_version_id_fkey'
  ) THEN
    ALTER TABLE controlled_documents
      ADD CONSTRAINT controlled_documents_current_version_id_fkey
      FOREIGN KEY (current_version_id) REFERENCES document_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_state_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  comment TEXT,
  signature_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_read_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at TIMESTAMPTZ,
  signature_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_controlled_documents_org
  ON controlled_documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_controlled_documents_review
  ON controlled_documents(organization_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_document_versions_document
  ON document_versions(document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_document_state_log_document
  ON document_state_log(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_read_acks_user
  ON document_read_acknowledgments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_document_read_acks_version
  ON document_read_acknowledgments(version_id);

ALTER TABLE controlled_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_state_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_read_acknowledgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "controlled_documents_org" ON controlled_documents;
CREATE POLICY "controlled_documents_org" ON controlled_documents FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "document_versions_org" ON document_versions;
CREATE POLICY "document_versions_org" ON document_versions FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "document_state_log_org" ON document_state_log;
CREATE POLICY "document_state_log_org" ON document_state_log FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "document_read_acknowledgments_org" ON document_read_acknowledgments;
CREATE POLICY "document_read_acknowledgments_org" ON document_read_acknowledgments FOR ALL TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'controlled-documents',
  'controlled-documents',
  true,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "controlled_documents_select" ON storage.objects;
CREATE POLICY "controlled_documents_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'controlled-documents');

DROP POLICY IF EXISTS "controlled_documents_insert" ON storage.objects;
CREATE POLICY "controlled_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'controlled-documents'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "controlled_documents_update" ON storage.objects;
CREATE POLICY "controlled_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'controlled-documents'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "controlled_documents_delete" ON storage.objects;
CREATE POLICY "controlled_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'controlled-documents'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE id = auth.uid()
    )
  );
