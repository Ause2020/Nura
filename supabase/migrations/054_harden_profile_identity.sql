-- Nura · SP-03 — identidad de profiles a nivel PostgreSQL/RLS
--
-- Estado hosted verificado live (staging): sin 036. Sin protect_profile_identity,
-- sin profiles_role_check, default role 'admin', handle_new_user toma role de
-- raw_user_meta_data, ensure_user_profile crea 'admin', users_insert_own_profile
-- solo exige id = auth.uid() (→ un usuario sin profile se inserta admin de
-- cualquier org), y las policies UPDATE consultan profiles (recursión 42P17).
--
-- Esta migración es autosuficiente: corrige tanto el hosted (sin 036/041) como
-- la cadena completa del repo (036/041 presentes). No re-ejecuta 036.
--
-- Modelo de identidad resultante:
--   * role, organization_id, onboarding_completed los decide el backend
--     confiable (service_role / sin JWT). Un JWT de usuario nunca los elige.
--   * INSERT de usuario: solo su propia fila, operator, sin org, onboarding false.
--   * UPDATE de usuario: solo su fila; role y organization_id inmutables;
--     onboarding_completed solo puede pasar a true (lo usan los RPC
--     complete_user_onboarding / finalize_user_onboarding).
--   * Cambios de rol de miembros: flujo administrativo con service_role
--     (lib/team/members.ts), no UPDATE directo desde el cliente.
--
-- Idempotente.

-- ─── 1. Default seguro + rol acotado ───

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'operator';
ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET DEFAULT FALSE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role IS NULL OR role NOT IN ('admin', 'quality_manager', 'operator')
  ) THEN
    RAISE EXCEPTION 'SP-03: profiles contiene roles fuera de admin/quality_manager/operator; revisar antes de aplicar 054';
  END IF;

  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'quality_manager', 'operator'));
END $$;

-- ─── 2. Trigger de identidad (sin F-1) ───
--
-- Contextos:
--   auth.role() = 'service_role'  → backend confiable (provisioning, invitaciones,
--                                    lib/team/members.ts). Sin cambios.
--   auth.role() IS NULL           → sin JWT: GoTrue (supabase_auth_admin) al crear
--                                    auth.users → handle_new_user, postgres, SQL
--                                    editor, migraciones. Sin cambios: NUNCA se
--                                    reescribe NEW.id con auth.uid() aquí (F-1).
--   cualquier otro rol JWT        → usuario final (authenticated / anon): se
--                                    aplica el modelo de identidad.

CREATE OR REPLACE FUNCTION public.protect_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT := auth.role();
  v_uid UUID := auth.uid();
BEGIN
  IF v_jwt_role IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    NEW.id := v_uid;
    NEW.organization_id := NULL;
    NEW.role := 'operator';
    NEW.onboarding_completed := FALSE;
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role cannot be changed by end users' USING ERRCODE = '42501';
  END IF;

  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed
     AND NEW.onboarding_completed IS NOT TRUE THEN
    NEW.onboarding_completed := OLD.onboarding_completed;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_identity() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_profile_identity ON public.profiles;
CREATE TRIGGER protect_profile_identity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_identity();

-- ─── 3. handle_new_user: sin rol desde metadata ───

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- raw_user_meta_data es controlable por el usuario (signUp options.data):
  -- solo se toman campos de presentación. role/organization/onboarding los
  -- asigna después el backend con service_role.
  INSERT INTO public.profiles (id, full_name, role, job_title, organization_id, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), 'Usuario'),
    'operator',
    NEW.raw_user_meta_data->>'job_title',
    NULL,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated';
  END IF;
END $$;

-- ─── 4. ensure_user_profile: fallback siempre operator ───

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(raw_user_meta_data->>'full_name'), ''),
    split_part(email, '@', 1),
    'Usuario'
  )
  INTO v_name
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.profiles (id, full_name, role, organization_id, onboarding_completed)
  VALUES (v_user_id, COALESCE(v_name, 'Usuario'), 'operator', NULL, FALSE)
  ON CONFLICT (id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_user_onboarding() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.finalize_user_onboarding() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.finalize_user_onboarding() TO authenticated';
  END IF;
END $$;

-- ─── 5. RLS INSERT: solo fila propia en estado seguro ───

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND organization_id IS NULL
    AND role = 'operator'
    AND onboarding_completed IS NOT TRUE
  );

-- ─── 6. RLS UPDATE sin recursión ───
--
-- Ninguna policy de profiles consulta profiles. La inmutabilidad de role /
-- organization_id la garantiza el trigger (acceso directo a OLD/NEW, sin RLS).
-- profiles_admin_update_team se elimina: los cambios de rol de miembros pasan
-- por service_role tras la verificación de permisos de la app.

DROP POLICY IF EXISTS "profiles_admin_update_team" ON public.profiles;

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── 7. Privilegios de tabla mínimos ───

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated';
  END IF;
END $$;
