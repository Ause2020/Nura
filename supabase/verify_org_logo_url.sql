-- Live check after 052. Requires DATABASE_URL / psql.
DO $$
BEGIN
  IF to_regprocedure('public.protect_org_logo_url()') IS NULL THEN
    RAISE EXCEPTION 'protect_org_logo_url() missing — 052 not applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'protect_org_logo_url'
      AND tgrelid = 'public.organizations'::regclass
  ) THEN
    RAISE EXCEPTION 'trigger protect_org_logo_url missing';
  END IF;

  RAISE NOTICE '052 org logo_url path guard OK';
END $$;

DO $probe$
DECLARE
  oid uuid;
BEGIN
  SELECT id INTO oid FROM public.organizations LIMIT 1;
  IF oid IS NULL THEN
    RAISE NOTICE '052 write probe skipped: no organization';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.organizations
       SET logo_url = 'http://127.0.0.1/x.png'
     WHERE id = oid;
    RAISE EXCEPTION 'ssrf url accepted';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%logos object path%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE '052 write probe: arbitrary URL rejected';
END
$probe$;
