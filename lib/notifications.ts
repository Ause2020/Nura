import type { NotificationType } from "@/lib/notifications/constants";

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  dedupKey?: string | null;
}

export interface NotificationRow {
  id: string;
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  dedup_key: string | null;
  created_at: string;
}

type SupabaseClient = {
  from: (table: string) => ReturnType<
    ReturnType<typeof import("@/lib/supabase/client").createClient>["from"]
  >;
};

export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<NotificationRow | null> {
  if (input.dedupKey) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("dedup_key", input.dedupKey)
      .maybeSingle();

    if (existing) return null;
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      dedup_key: input.dedupKey ?? null,
      read: false,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return data as NotificationRow;
}

export async function notifyOrgManagers(
  supabase: SupabaseClient,
  organizationId: string,
  input: Omit<CreateNotificationInput, "organizationId" | "userId">
): Promise<number> {
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "quality_manager"]);

  const profiles = (profilesData ?? []) as { id: string }[];
  let created = 0;

  for (const profile of profiles) {
    const row = await createNotification(supabase, {
      ...input,
      organizationId,
      userId: profile.id,
    });
    if (row) created++;
  }

  return created;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}
