import { provisionUser } from "@/lib/admin/provision";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

export async function createTeamMember(input: {
  organizationId: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}) {
  return provisionUser({
    organizationId: input.organizationId,
    email: input.email,
    password: input.password,
    fullName: input.fullName,
    role: input.role,
  });
}

export async function removeTeamMember(
  organizationId: string,
  memberId: string,
  actorId: string
) {
  if (memberId === actorId) {
    throw new Error("No puedes eliminarte a ti mismo");
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
  }

  const { data: member } = await admin
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", memberId)
    .single();

  const profile = member as {
    id: string;
    organization_id: string | null;
    role: UserRole;
  } | null;

  if (!profile || profile.organization_id !== organizationId) {
    throw new Error("Usuario no encontrado en tu organización");
  }

  if (profile.role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      throw new Error("Debe quedar al menos un administrador");
    }
  }

  await admin.auth.admin.deleteUser(memberId);
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  actorId: string,
  newRole: UserRole
) {
  if (memberId === actorId) {
    throw new Error("No puedes modificar tu propio rol");
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
  }

  const { data: member } = await admin
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", memberId)
    .single();

  const profile = member as {
    id: string;
    organization_id: string | null;
    role: UserRole;
  } | null;

  if (!profile || profile.organization_id !== organizationId) {
    throw new Error("Usuario no encontrado");
  }

  if (profile.role === "admin" && newRole !== "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      throw new Error("Debe quedar al menos un administrador");
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}
