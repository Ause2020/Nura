import { missingProfileInsert } from "@/lib/auth/missing-profile";
import { createClient } from "@/lib/supabase/client";

export interface UserProfileState {
  id: string;
  organization_id: string | null;
  onboarding_completed: boolean;
  full_name: string;
  role: string;
}

/**
 * Garantiza que exista fila en `profiles` (por si el trigger de Auth falló).
 * Devuelve el perfil actualizado.
 */
export async function ensureUserProfile(): Promise<UserProfileState | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: rpcRows, error: getError } = await supabase.rpc("get_my_profile");
  if (!getError && rpcRows) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row) return row as UserProfileState;
  }

  const { error: rpcError } = await supabase.rpc("ensure_user_profile");
  if (rpcError && !rpcError.message.includes("does not exist")) {
    console.error("ensure_user_profile:", rpcError.message);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, organization_id, onboarding_completed, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (data) return data as UserProfileState;

  if (error) {
    console.error("profiles select:", error.message);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert(missingProfileInsert(user))
    .select("id, organization_id, onboarding_completed, full_name, role")
    .single();

  if (insertError || !inserted) {
    if (insertError) console.error("profiles insert:", insertError.message);
    return null;
  }

  return inserted as UserProfileState;
}

export async function completeOnboarding(input: {
  name: string;
  industry: string;
  country: string;
  city?: string | null;
  employees_range?: string | null;
  certifications?: string[];
}): Promise<{ organizationId: string | null; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("complete_user_onboarding", {
    p_name: input.name,
    p_industry: input.industry,
    p_country: input.country,
    p_city: input.city ?? null,
    p_employees_range: input.employees_range ?? null,
    p_certifications: input.certifications ?? [],
  });

  if (error) {
    if (error.message.includes("organization_not_provisioned")) {
      return {
        organizationId: null,
        error:
          "Tu cuenta aún no tiene una organización asignada. Contacta al equipo de Nura para activar el acceso.",
      };
    }
    if (error.message.includes("organization_access_denied")) {
      return {
        organizationId: null,
        error: "El acceso de tu organización no está activo.",
      };
    }
    return { organizationId: null, error: error.message };
  }

  const orgId = typeof data === "string" ? data : null;
  return { organizationId: orgId, error: null };
}

/** Repara onboarding a medias (org creada pero onboarding_completed = false). */
export async function repairStuckOnboarding(): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("finalize_user_onboarding");

  if (error) {
    console.error("finalize_user_onboarding:", error.message);
    return false;
  }

  return typeof data === "string" && data.length > 0;
}
