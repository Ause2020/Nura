import { organizationRecordIsAllowed } from "@/lib/access/constants";
import type { AccessStatus, UserRole } from "@/types/database";

export type SessionGateProfile = {
  onboarding_completed: boolean;
  organization_id: string | null;
  role: UserRole;
};

export type SessionGateOrg = {
  access_status: AccessStatus;
  access_expires_at: string | null;
};

export type SessionGates = {
  onboardingCompleted: boolean;
  accessAllowed: boolean;
  userRole: UserRole | null;
};

/**
 * Same gates middleware already applied. Profile + org must come from the
 * JWT-scoped Supabase client (RLS), never from the browser.
 */
export function resolveSessionGates(input: {
  profile: SessionGateProfile | null;
  org: SessionGateOrg | null;
  platformAdmin: boolean;
}): SessionGates {
  const onboardingCompleted = input.profile?.onboarding_completed ?? false;
  const userRole = input.profile?.role ?? null;
  let accessAllowed = true;

  if (input.profile?.organization_id && !input.platformAdmin) {
    accessAllowed = organizationRecordIsAllowed(input.org);
  }

  return { onboardingCompleted, accessAllowed, userRole };
}
