import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

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
