-- Nura · Storage privado con aislamiento multi-tenant
-- Idempotente. No toca el bucket `logos` (branding público intencional).
-- No desactiva RLS. No crea policies TO public/anon sobre buckets confidenciales.

-- ─── Helper: organización del usuario autenticado ─────────────────
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.storage_is_org_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.current_organization_id() IS NOT NULL
    AND (storage.foldername(object_name))[1] = public.current_organization_id()::text
$$;

REVOKE ALL ON FUNCTION public.storage_is_org_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_is_org_object(text) TO authenticated;

-- ─── Buckets confidenciales → privados ────────────────────────────
-- audit-photos y nc-photos se usan en código pero no tenían migración.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'audit-photos',
    'audit-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'nc-photos',
    'nc-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE storage.buckets
SET public = false
WHERE id IN (
  'supplier-docs',
  'controlled-documents',
  'complaint-photos',
  'production-record-photos',
  'haccp-evidence',
  'lab-reports',
  'audit-photos',
  'nc-photos'
);

-- Snapshots HACCP se guardan como JSON en controlled-documents
UPDATE storage.buckets
SET allowed_mime_types = array_append(
  COALESCE(allowed_mime_types, ARRAY[]::text[]),
  'application/json'
)
WHERE id = 'controlled-documents'
  AND (
    allowed_mime_types IS NULL
    OR NOT ('application/json' = ANY (allowed_mime_types))
  );

-- ─── Reemplazar policies (evita duplicados / SELECT público) ──────
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
  suffixes text[] := ARRAY[
    '_select', '_insert', '_update', '_delete',
    '_select_org', '_insert_org', '_update_org', '_delete_org'
  ];
  suf text;
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    safe := replace(b, '-', '_');

    FOREACH suf IN ARRAY suffixes LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', safe || suf);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR SELECT TO authenticated
         USING (bucket_id = %L AND public.storage_is_org_object(name))',
      safe || '_select_org', b
    );

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (bucket_id = %L AND public.storage_is_org_object(name))',
      safe || '_insert_org', b
    );

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR UPDATE TO authenticated
         USING (bucket_id = %L AND public.storage_is_org_object(name))
         WITH CHECK (bucket_id = %L AND public.storage_is_org_object(name))',
      safe || '_update_org', b, b
    );

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         FOR DELETE TO authenticated
         USING (bucket_id = %L AND public.storage_is_org_object(name))',
      safe || '_delete_org', b
    );
  END LOOP;
END $$;
