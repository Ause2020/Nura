-- Nura · Fix: lectura/creación de perfil propio (onboarding)
-- Ejecutar si ves pantalla en blanco o "no pudimos cargar tu perfil".
-- Idempotente. Tras ejecutar: Settings → API → Reload schema cache (o espera 1 min).

-- ─── 1. RLS: sin subconsultas recursivas en profiles ───

DROP POLICY IF EXISTS "users_read_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_read_teammates" ON public.profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.my_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.my_organization_id TO authenticated;

CREATE POLICY "users_read_teammates" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.my_organization_id()
    AND id <> auth.uid()
  );

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ─── 2. RPC: leer mi perfil (bypass RLS) ───

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  onboarding_completed BOOLEAN,
  full_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.organization_id,
    p.onboarding_completed,
    p.full_name,
    p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile TO authenticated;

-- Notificar a PostgREST que recargue el esquema
NOTIFY pgrst, 'reload schema';
