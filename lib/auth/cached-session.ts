import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveOrgLogoPublicUrl } from "@/lib/storage/org-logo";
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";

export type SessionProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  organization_id: string | null;
};

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  return (data as SessionProfile | null) ?? null;
});

export const getSessionOrganizationId = cache(async (): Promise<string | null> => {
  const profile = await getSessionProfile();
  return profile?.organization_id ?? null;
});

export type SessionOrganizationBrand = {
  name: string;
  logo_url: string | null;
};

/** Brand for the sidebar only. RLS returns the caller's org; no client org id. */
export const getSessionOrganizationBrand = cache(
  async (): Promise<SessionOrganizationBrand | null> => {
    const organizationId = await getSessionOrganizationId();
    if (!organizationId) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", organizationId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as SessionOrganizationBrand;
    return {
      name: row.name,
      logo_url: resolveOrgLogoPublicUrl(row.logo_url, organizationId),
    };
  }
);
