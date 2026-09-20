-- Nura · SEC-P1-03 — notifications no son un canal cross-tenant
-- Incremental. Idempotente. No edita 007/036/041/048.
--
-- Decisión: authenticated NO tiene INSERT en notifications.
-- Writers de la app → public.create_org_notifications(jsonb):
--   * JWT: org = current_organization_id(); recipient en esa org; gate 048
--   * service_role: recipient.organization_id = notification.organization_id
--   * link interno (is_safe_notification_link + CHECK)
-- SELECT/UPDATE del dueño se conservan.

CREATE OR REPLACE FUNCTION public.is_safe_notification_link(p_link text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_link IS NULL
    OR (
      length(trim(p_link)) > 1
      AND trim(p_link) LIKE '/%'
      AND trim(p_link) NOT LIKE '//%'
      AND position('\' in trim(p_link)) = 0
      AND position(E'\n' in p_link) = 0
      AND position(E'\r' in p_link) = 0
      AND trim(p_link) !~* '^[a-z][a-z0-9+.-]*:'
    );
$$;

REVOKE ALL ON FUNCTION public.is_safe_notification_link(text) FROM PUBLIC;

UPDATE public.notifications
SET link = NULL
WHERE link IS NOT NULL
  AND NOT public.is_safe_notification_link(link);

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_link_internal;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_link_internal
  CHECK (public.is_safe_notification_link(link));

CREATE OR REPLACE FUNCTION public.create_org_notifications(p_rows jsonb)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
  v_org uuid;
  v_expected int;
  v_ok int;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  v_expected := jsonb_array_length(p_rows);

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF NOT public.current_organization_access_allowed() THEN
      RAISE EXCEPTION 'organization access denied' USING ERRCODE = '42501';
    END IF;
    v_org := public.current_organization_id();
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'organization access denied' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_rows) e
      WHERE NULLIF(e->>'organization_id', '') IS NOT NULL
        AND (NULLIF(e->>'organization_id', ''))::uuid IS DISTINCT FROM v_org
    ) THEN
      RAISE EXCEPTION 'notification organization_id does not match session'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) e
    WHERE NULLIF(e->>'user_id', '') IS NULL
       OR NULLIF(e->>'type', '') IS NULL
       OR NULLIF(e->>'title', '') IS NULL
       OR NULLIF(e->>'message', '') IS NULL
       OR (
         v_role = 'service_role'
         AND NULLIF(e->>'organization_id', '') IS NULL
       )
  ) THEN
    RAISE EXCEPTION 'notification recipient and organization are required'
      USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) e
    WHERE NOT public.is_safe_notification_link(
      NULLIF(trim(COALESCE(e->>'link', '')), '')
    )
  ) THEN
    RAISE EXCEPTION 'notification link must be an internal path'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_ok
  FROM jsonb_array_elements(p_rows) e
  WHERE EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (e->>'user_id')::uuid
      AND p.organization_id = CASE
        WHEN v_role = 'service_role' THEN (e->>'organization_id')::uuid
        ELSE v_org
      END
  );

  IF v_ok IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'notification recipient is not in the organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  INSERT INTO public.notifications (
    organization_id, user_id, type, title, message, link, dedup_key, read
  )
  SELECT
    CASE
      WHEN v_role = 'service_role' THEN (e->>'organization_id')::uuid
      ELSE v_org
    END,
    (e->>'user_id')::uuid,
    e->>'type',
    e->>'title',
    e->>'message',
    NULLIF(trim(COALESCE(e->>'link', '')), ''),
    NULLIF(e->>'dedup_key', ''),
    false
  FROM jsonb_array_elements(p_rows) e
  ON CONFLICT ON CONSTRAINT notifications_dedup_key DO NOTHING
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_notifications(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_notifications(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_notifications(jsonb) TO service_role;

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

REVOKE INSERT ON TABLE public.notifications FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT ON TABLE public.notifications FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT ON TABLE public.notifications FROM authenticated;
  END IF;
END $$;
