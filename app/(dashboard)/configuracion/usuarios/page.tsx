import { redirect } from "next/navigation";
import { TeamUsersDashboard } from "@/components/team/team-users-dashboard";
import { listPendingInvitations, listTeamMembers } from "@/lib/team/list";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function TeamUsersPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileData as Pick<Profile, "organization_id"> | null;
  if (!profile?.organization_id) redirect("/dashboard");

  let organizationName = "Mi Empresa";
  const { data: orgData } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .single();

  const org = orgData as { name: string } | null;
  if (org) organizationName = org.name;

  const [members, invitations] = await Promise.all([
    listTeamMembers(profile.organization_id),
    listPendingInvitations(profile.organization_id),
  ]);

  return (
    <TeamUsersDashboard
      members={members}
      invitations={invitations}
      currentUserId={user.id}
      organizationName={organizationName}
    />
  );
}
