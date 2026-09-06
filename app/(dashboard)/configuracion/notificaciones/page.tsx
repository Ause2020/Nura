import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { getNotificationPreferences } from "@/lib/settings/preferences";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NotificacionesSettingsPage() {
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

  const preferences = await getNotificationPreferences(profile.organization_id);

  return <NotificationPreferencesForm initialPreferences={preferences} />;
}
