/**
 * Platform admin de Nura (no es un rol de organización).
 *
 * Requiere las cuatro señales; cualquier ausencia falla cerrado:
 *   1. email presente
 *   2. email confirmado (`email_confirmed_at`), aunque Supabase no exija "Confirm email"
 *   3. email en `NURA_ADMIN_EMAILS`
 *   4. `app_metadata.nura_platform_admin === true`
 *
 * `app_metadata` solo la escribe service_role / Auth Admin API. `user_metadata`
 * es editable por el propio usuario y nunca se consulta aquí.
 *
 * El objeto debe venir de `supabase.auth.getUser()` (validado por Auth), no de
 * claims decodificados localmente ni del cliente.
 */
export const PLATFORM_ADMIN_APP_METADATA_KEY = "nura_platform_admin";

export type PlatformAdminCandidate =
  | {
      email?: string | null;
      email_confirmed_at?: string | null;
      app_metadata?: Record<string, unknown> | null;
    }
  | null
  | undefined;

function configuredAdminEmails(): string[] {
  const configured = process.env.NURA_ADMIN_EMAILS;
  if (!configured?.trim()) return [];
  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hasConfirmedEmail(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(Date.parse(value));
}

export function isPlatformAdmin(user: PlatformAdminCandidate): boolean {
  if (!user || typeof user !== "object") return false;

  const email =
    typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return false;

  if (!hasConfirmedEmail(user.email_confirmed_at)) return false;

  const appMetadata = user.app_metadata;
  if (
    !appMetadata ||
    typeof appMetadata !== "object" ||
    appMetadata[PLATFORM_ADMIN_APP_METADATA_KEY] !== true
  ) {
    return false;
  }

  return configuredAdminEmails().includes(email);
}

export async function requirePlatformAdmin(): Promise<{
  email: string;
  userId: string;
}> {
  const { getSessionUser } = await import("@/lib/auth/cached-session");
  const user = await getSessionUser();

  if (!user?.email || !isPlatformAdmin(user)) {
    throw new Error("Unauthorized");
  }

  return { email: user.email, userId: user.id };
}
