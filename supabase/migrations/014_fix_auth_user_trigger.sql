-- Nura · Fix: "Database error creating new user"
-- El trigger on_auth_user_created debe ejecutarse como SECURITY DEFINER
-- con search_path fijo y permisos para supabase_auth_admin.

-- Recrear función con privilegios correctos
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

-- Asegurar que el trigger apunta a la función correcta
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Permisos para el rol interno de Auth
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE, SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- Respaldo: service_role (API admin de Nura)
DROP POLICY IF EXISTS "service_role_insert_profiles" ON public.profiles;
CREATE POLICY "service_role_insert_profiles" ON public.profiles
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_update_profiles" ON public.profiles;
CREATE POLICY "service_role_update_profiles" ON public.profiles
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_select_profiles" ON public.profiles;
CREATE POLICY "service_role_select_profiles" ON public.profiles
  FOR SELECT TO service_role
  USING (true);
