-- Verificación live SEC-P1-02 (SQL Editor / postgres).
-- El trigger corre aunque RLS no aplique al owner.
-- Crea dos orgs temporales y las borra al final.
-- No usar en un transaction de migración de producción.

DO $$
DECLARE
  org_a uuid;
  org_b uuid;
  v_name text;
  v_status text;
  v_notes text;
  privileged_failed boolean;
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'organizations missing';
  END IF;

  INSERT INTO public.organizations (name, industry, country, access_status)
  VALUES ('nura_p102_a', 'otro', 'CL', 'suspended')
  RETURNING id INTO org_a;

  INSERT INTO public.organizations (name, industry, country, access_status)
  VALUES ('nura_p102_b', 'otro', 'CL', 'active')
  RETURNING id INTO org_b;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);

  UPDATE public.organizations
  SET name = 'nura_p102_a_ok'
  WHERE id = org_a;

  SELECT name INTO v_name FROM public.organizations WHERE id = org_a;
  IF v_name IS DISTINCT FROM 'nura_p102_a_ok' THEN
    RAISE EXCEPTION 'authenticated should update a normal field';
  END IF;

  privileged_failed := false;
  BEGIN
    UPDATE public.organizations SET access_status = 'active' WHERE id = org_a;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%privileged organization access fields are restricted%' THEN
        privileged_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT privileged_failed THEN
    RAISE EXCEPTION 'authenticated must not update access_status';
  END IF;

  privileged_failed := false;
  BEGIN
    UPDATE public.organizations SET access_expires_at = CURRENT_DATE WHERE id = org_a;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%privileged organization access fields are restricted%' THEN
        privileged_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT privileged_failed THEN
    RAISE EXCEPTION 'authenticated must not update access_expires_at';
  END IF;

  privileged_failed := false;
  BEGIN
    UPDATE public.organizations SET access_granted_at = now() WHERE id = org_a;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%privileged organization access fields are restricted%' THEN
        privileged_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT privileged_failed THEN
    RAISE EXCEPTION 'authenticated must not update access_granted_at';
  END IF;

  privileged_failed := false;
  BEGIN
    UPDATE public.organizations SET contract_notes = 'self-reactivate' WHERE id = org_a;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%privileged organization access fields are restricted%' THEN
        privileged_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT privileged_failed THEN
    RAISE EXCEPTION 'authenticated must not update contract_notes';
  END IF;

  privileged_failed := false;
  BEGIN
    UPDATE public.organizations SET provisioned_by = NULL WHERE id = org_a AND provisioned_by IS NOT NULL;
    -- NULL→NULL is not a change; force a distinct value via a fake uuid only if needed.
    UPDATE public.organizations
    SET provisioned_by = '00000000-0000-4000-8000-000000000001'
    WHERE id = org_a;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%privileged organization access fields are restricted%' THEN
        privileged_failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT privileged_failed THEN
    RAISE EXCEPTION 'authenticated must not update provisioned_by';
  END IF;

  SELECT access_status, contract_notes INTO v_status, v_notes
  FROM public.organizations WHERE id = org_a;
  IF v_status IS DISTINCT FROM 'suspended' OR v_notes IS NOT NULL THEN
    RAISE EXCEPTION 'privileged columns must remain unchanged after denied updates';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.organizations
  SET
    access_status = 'active',
    access_expires_at = NULL,
    contract_notes = 'platform'
  WHERE id = org_a;

  SELECT access_status, contract_notes INTO v_status, v_notes
  FROM public.organizations WHERE id = org_a;
  IF v_status IS DISTINCT FROM 'active' OR v_notes IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'service_role should update privileged fields';
  END IF;

  DELETE FROM public.organizations WHERE id IN (org_a, org_b);
END $$;
