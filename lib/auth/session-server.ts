import type { SupabaseClient } from "@supabase/supabase-js";
import {
  missingProfileInsert,
  type MissingProfileUser,
} from "@/lib/auth/missing-profile";
import type { UserProfileState } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const PROFILE_SELECT =
  "id, organization_id, onboarding_completed, full_name, role";

export type EnsureProfileResult =
  | { ok: true; profile: UserProfileState }
  | { ok: false; code: "missing_service_role" | "db_error"; message: string };

function profileFromRow(data: unknown): UserProfileState | null {
  if (!data || typeof data !== "object") return null;
  return data as UserProfileState;
}

function rowFromRpcPayload(data: unknown): UserProfileState | null {
  if (Array.isArray(data)) {
    return profileFromRow(data[0]);
  }
  return profileFromRow(data);
}

/** Perfil visible con el JWT del usuario (respeta RLS / get_my_profile). */
export async function fetchUserVisibleProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfileState | null> {
  const { data, error } = await supabase.rpc("get_my_profile");

  if (!error && data) {
    const fromRpc = rowFromRpcPayload(data);
    if (fromRpc) return fromRpc;
  }

  if (error && !error.message.includes("does not exist")) {
    console.error("get_my_profile:", error.message);
  }

  const { data: row, error: selectError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("profiles select:", selectError.message);
    return null;
  }

  return profileFromRow(row);
}

async function ensureMissingProfileAsOperator(
  user: MissingProfileUser
): Promise<UserProfileState | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: existing } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return profileFromRow(existing);

  const { data: inserted, error: insertError } = await admin
    .from("profiles")
    .insert(missingProfileInsert(user))
    .select(PROFILE_SELECT)
    .single();

  if (insertError) {
    console.error("admin profiles insert:", insertError.message);
    return null;
  }

  return profileFromRow(inserted);
}

/** Garantiza fila en profiles; valida lectura con JWT del usuario. */
export async function ensureUserProfileServer(
  supabase: SupabaseClient,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<EnsureProfileResult> {
  let profile = await fetchUserVisibleProfile(supabase, user.id);

  if (profile) {
    return { ok: true, profile };
  }

  const { error: rpcError } = await supabase.rpc("ensure_user_profile");
  if (rpcError && !rpcError.message.includes("does not exist")) {
    console.error("ensure_user_profile:", rpcError.message);
  }

  profile = await fetchUserVisibleProfile(supabase, user.id);
  if (profile) {
    return { ok: true, profile };
  }

  await ensureMissingProfileAsOperator(user);
  profile = await fetchUserVisibleProfile(supabase, user.id);

  if (profile) {
    return { ok: true, profile };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      code: "missing_service_role",
      message:
        "Ejecuta 017_fix_profile_rls.sql en Supabase y añade SUPABASE_SERVICE_ROLE_KEY en .env.local.",
    };
  }

  return {
    ok: false,
    code: "db_error",
    message:
      "Perfil creado pero no legible. Ejecuta 017_fix_profile_rls.sql y recarga la página.",
  };
}

export async function repairStuckOnboardingServer(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase.rpc("finalize_user_onboarding");

  if (error) {
    if (!error.message.includes("does not exist")) {
      console.error("finalize_user_onboarding:", error.message);
    }
    return null;
  }

  return typeof data === "string" && data.length > 0 ? data : null;
}
