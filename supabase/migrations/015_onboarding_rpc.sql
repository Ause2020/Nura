-- Nura · Fix onboarding: RLS impedía leer la org recién creada
-- (el perfil aún no tenía organization_id al hacer .insert().select())

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (
    name,
    industry,
    country,
    city,
    employees_range,
    certifications
  )
  VALUES (
    trim(p_name),
    p_industry,
    p_country,
    NULLIF(trim(p_city), ''),
    p_employees_range,
    COALESCE(p_certifications, '{}')
  )
  RETURNING id INTO v_org_id;

  UPDATE profiles
  SET
    organization_id = v_org_id,
    onboarding_completed = TRUE
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user';
  END IF;

  BEGIN
    INSERT INTO notification_preferences (organization_id)
    VALUES (v_org_id)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding TO authenticated;

-- Respaldo: permitir INSERT de organizaciones en onboarding
DROP POLICY IF EXISTS "authenticated_insert_organizations" ON organizations;
CREATE POLICY "authenticated_insert_organizations" ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);
