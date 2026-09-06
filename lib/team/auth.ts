import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export async function requireOrgAdmin() {
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);

  if (!user) throw new Error("Unauthorized");

  if (!profile?.organization_id || profile.role !== "admin") {
    throw new Error("Solo administradores pueden gestionar el equipo");
  }

  return {
    supabase: await createClient(),
    user,
    profile: {
      id: user.id,
      organization_id: profile.organization_id,
      role: profile.role,
    },
  };
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
