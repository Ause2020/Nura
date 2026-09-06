import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Invitation, Profile, UserRole } from "@/types/database";

export interface TeamMemberRow {
  id: string;
  full_name: string;
  role: UserRole;
  email: string;
  created_at: string;
}

export async function listTeamMembers(
  organizationId: string
): Promise<TeamMemberRow[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data: profilesData } = await admin
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const profiles = (profilesData ?? []) as Pick<
    Profile,
    "id" | "full_name" | "role" | "created_at"
  >[];

  const members = await Promise.all(
    profiles.map(async (profile) => {
      const { data: authData } = await admin.auth.admin.getUserById(profile.id);
      return {
        ...profile,
        email: authData.user?.email ?? "",
      };
    })
  );

  return members;
}

export async function listPendingInvitations(
  organizationId: string
): Promise<Invitation[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("accepted", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return (data ?? []) as Invitation[];
}
