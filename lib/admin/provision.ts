import { createAdminClient } from "@/lib/supabase/admin";
import type { Industry, UserRole } from "@/types/database";

export interface ProvisionClientInput {
  organizationName: string;
  industry: Industry;
  country: string;
  city?: string | null;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  jobTitle?: string | null;
  contractNotes?: string | null;
  accessExpiresAt?: string | null;
  skipOnboarding?: boolean;
  provisionedBy?: string | null;
}

export interface ProvisionUserInput {
  organizationId: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  jobTitle?: string | null;
}

function getAdminOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
  }
  return admin;
}

export async function provisionClient(input: ProvisionClientInput) {
  const admin = getAdminOrThrow();

  const { data: orgData, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: input.organizationName.trim(),
      industry: input.industry,
      country: input.country.trim(),
      city: input.city?.trim() || null,
      access_status: "active",
      access_granted_at: new Date().toISOString(),
      access_expires_at: input.accessExpiresAt || null,
      contract_notes: input.contractNotes?.trim() || null,
      provisioned_by: input.provisionedBy || null,
    })
    .select("id, name")
    .single();

  if (orgError || !orgData) {
    throw new Error(orgError?.message ?? "No se pudo crear la organización");
  }

  const org = orgData as { id: string; name: string };

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      job_title: input.jobTitle?.trim() || null,
    },
  });

  if (authError || !authData.user) {
    await admin.from("organizations").delete().eq("id", org.id);
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  await upsertProvisionedProfile(admin, authData.user.id, {
    organization_id: org.id,
    full_name: input.fullName.trim(),
    role: input.role,
    job_title: input.jobTitle?.trim() || null,
    onboarding_completed: input.skipOnboarding ?? true,
  });

  return {
    organizationId: org.id,
    organizationName: org.name,
    userId: authData.user.id,
    email: authData.user.email,
  };
}

async function upsertProvisionedProfile(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  profile: {
    organization_id: string;
    full_name: string;
    role: UserRole;
    job_title: string | null;
    onboarding_completed: boolean;
  }
) {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from("profiles").update(profile).eq("id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("profiles").insert({
    id: userId,
    ...profile,
  });

  if (error) throw new Error(error.message);
}

export async function provisionUser(input: ProvisionUserInput) {
  const admin = getAdminOrThrow();

  const { data: orgData, error: orgError } = await admin
    .from("organizations")
    .select("id, name, access_status")
    .eq("id", input.organizationId)
    .maybeSingle();

  const org = orgData as {
    id: string;
    name: string;
    access_status: string;
  } | null;

  if (orgError || !org) {
    throw new Error("Organización no encontrada");
  }

  if (org.access_status !== "active") {
    throw new Error("La organización no tiene acceso activo");
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      job_title: input.jobTitle?.trim() || null,
    },
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  await upsertProvisionedProfile(admin, authData.user.id, {
    organization_id: org.id,
    full_name: input.fullName.trim(),
    role: input.role,
    job_title: input.jobTitle?.trim() || null,
    onboarding_completed: true,
  });

  return {
    organizationId: org.id,
    organizationName: org.name,
    userId: authData.user.id,
    email: authData.user.email,
  };
}

export async function updateOrganizationAccess(input: {
  organizationId: string;
  accessStatus: "active" | "suspended" | "pending";
  accessExpiresAt?: string | null;
  contractNotes?: string | null;
}) {
  const admin = getAdminOrThrow();

  const patch: Record<string, unknown> = {
    access_status: input.accessStatus,
    access_expires_at: input.accessExpiresAt ?? null,
  };

  if (input.contractNotes !== undefined) {
    patch.contract_notes = input.contractNotes;
  }

  if (input.accessStatus === "active") {
    patch.access_granted_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("organizations")
    .update(patch)
    .eq("id", input.organizationId);

  if (error) throw new Error(error.message);
}

export async function listOrganizationsForAdmin() {
  const admin = getAdminOrThrow();

  const { data: orgsData, error } = await admin
    .from("organizations")
    .select(
      "id, name, country, access_status, access_granted_at, access_expires_at, contract_notes, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const orgs = (orgsData ?? []) as {
    id: string;
    name: string;
    country: string;
    access_status: string;
    access_granted_at: string | null;
    access_expires_at: string | null;
    contract_notes: string | null;
    created_at: string;
  }[];

  const { data: profilesData } = await admin
    .from("profiles")
    .select("organization_id");

  const counts = new Map<string, number>();
  for (const profile of (profilesData ?? []) as { organization_id: string | null }[]) {
    if (!profile.organization_id) continue;
    counts.set(
      profile.organization_id,
      (counts.get(profile.organization_id) ?? 0) + 1
    );
  }

  return orgs.map((org) => ({
    ...org,
    user_count: counts.get(org.id) ?? 0,
  }));
}
