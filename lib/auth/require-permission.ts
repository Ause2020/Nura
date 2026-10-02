import { organizationRecordIsAllowed } from "@/lib/access/constants";
import {
  isPlatformAdmin,
  type PlatformAdminCandidate,
} from "@/lib/access/platform-admin";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AccessStatus, UserRole } from "@/types/database";

export class AuthzError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

export type AuthorizedSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  profile: {
    id: string;
    organization_id: string;
    role: UserRole;
  };
};

export async function assertOrganizationAccess(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  user: PlatformAdminCandidate;
}): Promise<void> {
  if (isPlatformAdmin(input.user)) return;

  const { data, error } = await input.supabase
    .from("organizations")
    .select("access_status, access_expires_at")
    .eq("id", input.organizationId)
    .maybeSingle();

  if (
    error ||
    !organizationRecordIsAllowed(
      data as {
        access_status: AccessStatus;
        access_expires_at: string | null;
      } | null
    )
  ) {
    throw new AuthzError(403, "Forbidden");
  }
}

export async function requirePermission(
  permission: Permission
): Promise<AuthorizedSession> {
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);

  if (!user) {
    throw new AuthzError(401, "Unauthorized");
  }

  if (!profile?.organization_id) {
    throw new AuthzError(403, "Forbidden");
  }

  if (!hasPermission(profile.role, permission)) {
    throw new AuthzError(403, "Forbidden");
  }

  const supabase = await createClient();
  await assertOrganizationAccess({
    supabase,
    organizationId: profile.organization_id,
    user,
  });

  return {
    supabase,
    user,
    profile: {
      id: user.id,
      organization_id: profile.organization_id,
      role: profile.role,
    },
  };
}

export function authzResponse(error: unknown): {
  body: { error: string };
  status: number;
} {
  if (error instanceof AuthzError) {
    return { body: { error: error.message }, status: error.status };
  }
  const message = error instanceof Error ? error.message : "Error";
  if (message === "Unauthorized") {
    return { body: { error: message }, status: 401 };
  }
  if (message === "Forbidden" || message.includes("administradores")) {
    return { body: { error: message }, status: 403 };
  }
  return { body: { error: message }, status: 400 };
}
