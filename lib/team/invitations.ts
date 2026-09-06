import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_TEAM_USERS } from "@/lib/team/constants";
import { getInvitationUrl } from "@/lib/team/urls";
import type { Invitation, UserRole } from "@/types/database";

export function generateInvitationToken(): string {
  return randomBytes(24).toString("hex");
}

export function getInvitationExpiryDate(days = 7): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export { getInvitationUrl, buildInvitationUrl } from "@/lib/team/urls";
export async function isEmailInOrganization(
  email: string,
  organizationId: string
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { data: profilesData } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId);

  const target = email.trim().toLowerCase();

  for (const profile of (profilesData ?? []) as { id: string }[]) {
    const { data: authData } = await admin.auth.admin.getUserById(profile.id);
    if (authData.user?.email?.toLowerCase() === target) return true;
  }

  return false;
}

export async function countOrganizationUsers(organizationId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  return count ?? 0;
}

export async function countPendingInvitations(
  organizationId: string
): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;

  const { count } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("accepted", false)
    .gt("expires_at", new Date().toISOString());

  return count ?? 0;
}

export async function assertTeamCapacity(organizationId: string) {
  const [users, pending] = await Promise.all([
    countOrganizationUsers(organizationId),
    countPendingInvitations(organizationId),
  ]);

  if (users + pending >= MAX_TEAM_USERS) {
    throw new Error(`Límite de ${MAX_TEAM_USERS} usuarios alcanzado`);
  }
}

export function isInvitationValid(invitation: Invitation): boolean {
  if (invitation.accepted) return false;
  return new Date(invitation.expires_at).getTime() > Date.now();
}

export async function getInvitationByToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("invitations")
    .select("*, organizations(name)")
    .eq("token", token)
    .maybeSingle();

  return data as (Invitation & { organizations: { name: string } | null }) | null;
}

export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  password: string;
}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");

  const invitation = await getInvitationByToken(input.token);
  if (!invitation || !isInvitationValid(invitation)) {
    throw new Error("Invitación inválida o expirada");
  }

  await assertTeamCapacity(invitation.organization_id);

  const email = invitation.email.trim().toLowerCase();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  });

  if (authError || !authData.user) {
    if (authError?.message?.includes("already been registered")) {
      throw new Error("Este email ya tiene cuenta. Inicia sesión para aceptar.");
    }
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", authData.user.id)
    .maybeSingle();

  const profilePayload = {
    organization_id: invitation.organization_id,
    full_name: input.fullName.trim(),
    role: invitation.role as UserRole,
    onboarding_completed: true,
  };

  if (existingProfile) {
    const { error: profileError } = await admin
      .from("profiles")
      .update(profilePayload)
      .eq("id", authData.user.id);
    if (profileError) throw new Error(profileError.message);
  } else {
    const { error: profileError } = await admin.from("profiles").insert({
      id: authData.user.id,
      ...profilePayload,
    });
    if (profileError) throw new Error(profileError.message);
  }

  await admin
    .from("invitations")
    .update({ accepted: true, accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { userId: authData.user.id, email };
}

export async function acceptInvitationForExistingUser(
  token: string,
  userId: string,
  userEmail: string
) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");

  const invitation = await getInvitationByToken(token);
  if (!invitation || !isInvitationValid(invitation)) {
    throw new Error("Invitación inválida o expirada");
  }

  const invitedEmail = invitation.email.trim().toLowerCase();
  if (userEmail.trim().toLowerCase() !== invitedEmail) {
    throw new Error("Debes iniciar sesión con el email de la invitación");
  }

  const { data: profileData } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  const profile = profileData as { organization_id: string | null } | null;

  if (
    profile?.organization_id &&
    profile.organization_id !== invitation.organization_id
  ) {
    throw new Error("Tu cuenta ya pertenece a otra organización");
  }

  if (profile?.organization_id === invitation.organization_id) {
    await admin
      .from("invitations")
      .update({ accepted: true, accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
    return { userId, email: invitedEmail, alreadyMember: true };
  }

  await assertTeamCapacity(invitation.organization_id);

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      organization_id: invitation.organization_id,
      role: invitation.role as UserRole,
      onboarding_completed: true,
    })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  await admin
    .from("invitations")
    .update({ accepted: true, accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { userId, email: invitedEmail };
}
