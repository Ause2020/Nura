import { getSessionProfile } from "@/lib/auth/cached-session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import type { UserRole } from "@/types/database";

export async function requireOrgAdmin() {
  return requirePermission(PERMISSIONS.users.manage);
}

export async function getCurrentUserRole(): Promise<{
  role: UserRole;
  organizationId: string | null;
} | null> {
  const profile = await getSessionProfile();
  if (!profile) return null;

  return {
    role: profile.role,
    organizationId: profile.organization_id,
  };
}
