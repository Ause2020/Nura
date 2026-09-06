import { redirect } from "next/navigation";
import { AccessInfoSection } from "@/components/settings/access-info-section";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function AccesoSettingsPage() {
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

  const { data: orgData } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single();

  const organization = orgData as Organization | null;
  if (!organization) redirect("/dashboard");

  return <AccessInfoSection organization={organization} />;
}
