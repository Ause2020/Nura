-- Verificación live SEC-P1-03 (SQL Editor / postgres).
-- Prueba helper de links y que no exista policy INSERT authenticated.

DO $$
BEGIN
  IF to_regprocedure('public.is_safe_notification_link(text)') IS NULL THEN
    RAISE EXCEPTION 'is_safe_notification_link missing';
  END IF;
  IF to_regprocedure('public.create_org_notifications(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'create_org_notifications missing';
  END IF;

  IF public.is_safe_notification_link('/capa') IS DISTINCT FROM true
     OR public.is_safe_notification_link('/haccp/x') IS DISTINCT FROM true
     OR public.is_safe_notification_link('/auditorias/1/informe') IS DISTINCT FROM true
     OR public.is_safe_notification_link(NULL) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'internal links must be accepted';
  END IF;

  IF public.is_safe_notification_link('https://evil.example')
     OR public.is_safe_notification_link('http://evil.example')
     OR public.is_safe_notification_link('//evil.example')
     OR public.is_safe_notification_link('javascript:alert(1)')
     OR public.is_safe_notification_link('data:text/html,x')
  THEN
    RAISE EXCEPTION 'external links must be rejected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
      AND polname IN ('notifications_insert', 'notifications_insert')
      AND polcmd = 'a'
  ) THEN
    RAISE EXCEPTION 'authenticated INSERT policy must be dropped';
  END IF;
END $$;
