import { createClient } from "@/lib/supabase/server";
import type { NotificationPreferences } from "@/types/database";

export async function getNotificationPreferences(
  organizationId: string
): Promise<NotificationPreferences> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (data) return data as NotificationPreferences;

  const { data: created } = await supabase
    .from("notification_preferences")
    .insert({ organization_id: organizationId })
    .select("*")
    .single();

  return (created ?? {
    organization_id: organizationId,
    email_capa_due: true,
    email_weekly_summary: true,
    email_audit_completed: false,
    updated_at: new Date().toISOString(),
  }) as NotificationPreferences;
}

export async function getNotificationPreferencesAdmin(
  organizationId: string
): Promise<NotificationPreferences | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (data) return data as NotificationPreferences;

  const defaults: NotificationPreferences = {
    organization_id: organizationId,
    email_capa_due: true,
    email_weekly_summary: true,
    email_audit_completed: false,
    updated_at: new Date().toISOString(),
  };

  return defaults;
}
