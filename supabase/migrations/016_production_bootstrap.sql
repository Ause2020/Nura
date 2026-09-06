-- Nura · Bootstrap de producción — Auth, perfiles y onboarding
-- Ejecutar DESPUÉS de las migraciones 001–013 (y 014/015 si ya existían).
-- Idempotente: seguro volver a ejecutar.

-- Columnas de acceso manual (008) por si no se aplicó aún
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_expires_at DATE,
  ADD COLUMN IF NOT EXISTS contract_notes TEXT,
  ADD COLUMN IF NOT EXISTS provisioned_by UUID REFERENCES public.profiles(id);

-- ─── 1. Trigger: crear perfil al registrar usuario en Auth ───

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, job_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin'),
    NEW.raw_user_meta_data->>'job_title'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE, SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- ─── 2. Recuperar perfil si el trigger falló (login / onboarding) ───

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
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1),
    'Usuario'
  )
  INTO v_name
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_user_id, COALESCE(v_name, 'Usuario'), 'admin');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile TO authenticated;

-- ─── 3. Onboarding atómico (única vía para crear organización) ───

CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_name TEXT,
  p_industry TEXT,
  p_country TEXT,
  p_city TEXT DEFAULT NULL,
  p_employees_range TEXT DEFAULT NULL,
  p_certifications TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_existing_org UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'El nombre de la empresa es requerido';
  END IF;

  IF trim(COALESCE(p_industry, '')) = '' OR trim(COALESCE(p_country, '')) = '' THEN
    RAISE EXCEPTION 'Industria y país son requeridos';
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT organization_id INTO v_existing_org
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_existing_org IS NOT NULL THEN
    UPDATE public.profiles
    SET onboarding_completed = TRUE
    WHERE id = v_user_id AND onboarding_completed = FALSE;

    RETURN v_existing_org;
  END IF;

  INSERT INTO public.organizations (
    name,
    industry,
    country,
    city,
    employees_range,
    certifications,
    access_status,
    access_granted_at
  )
  VALUES (
    trim(p_name),
    p_industry,
    p_country,
    NULLIF(trim(p_city), ''),
    p_employees_range,
    COALESCE(p_certifications, '{}'),
    'active',
    NOW()
  )
  RETURNING id INTO v_org_id;

  UPDATE public.profiles
  SET
    organization_id = v_org_id,
    onboarding_completed = TRUE
  WHERE id = v_user_id;

  BEGIN
    INSERT INTO public.notification_preferences (organization_id)
    VALUES (v_org_id)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding TO authenticated;

-- ─── 3b. Reparar onboarding atascado (org sin flag completado) ───

CREATE OR REPLACE FUNCTION public.finalize_user_onboarding()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
  SET onboarding_completed = TRUE
  WHERE id = v_user_id AND onboarding_completed = FALSE;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_user_onboarding TO authenticated;

-- ─── 4. Trigger: preferencias al crear organización (provision / admin) ───

CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_prefs ON public.organizations;

CREATE TRIGGER on_organization_created_prefs
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_notification_preferences();

-- ─── 5. RLS: organizaciones — solo lectura vía membresía; sin INSERT cliente ───

DROP POLICY IF EXISTS "authenticated_insert_organizations" ON public.organizations;

DROP POLICY IF EXISTS "users_read_own_organization" ON public.organizations;
CREATE POLICY "users_read_own_organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND organization_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "users_update_own_organization" ON public.organizations;
DROP POLICY IF EXISTS "admins_update_own_organization" ON public.organizations;

CREATE POLICY "admins_update_own_organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- ─── 6. RLS: perfiles — el cliente no puede cambiar org ni onboarding ───

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id IS NOT DISTINCT FROM (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND onboarding_completed IS NOT DISTINCT FROM (
      SELECT p.onboarding_completed FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- service_role (provision manual, invitaciones, cron)
DROP POLICY IF EXISTS "service_role_insert_profiles" ON public.profiles;
CREATE POLICY "service_role_insert_profiles" ON public.profiles
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_update_profiles" ON public.profiles;
CREATE POLICY "service_role_update_profiles" ON public.profiles
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_select_profiles" ON public.profiles;
CREATE POLICY "service_role_select_profiles" ON public.profiles
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_all_organizations" ON public.organizations;
CREATE POLICY "service_role_all_organizations" ON public.organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
