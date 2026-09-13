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

type InsertRow = {
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  dedup_key: string | null;
  read: false;
};

function toInsertRow(input: CreateNotificationInput): InsertRow {
  return {
    organization_id: input.organizationId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
    dedup_key: input.dedupKey ?? null,
    read: false,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function isMissingConflictTarget(error: { message?: string } | null): boolean {
  return /no unique or exclusion constraint matching the ON CONFLICT/i.test(
    error?.message ?? ""
  );
}

async function insertPlain(
  supabase: SupabaseClient,
  rows: InsertRow[]
): Promise<NotificationRow[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("*");

  if (!error) return (data ?? []) as NotificationRow[];
  if (isUniqueViolation(error)) return [];
  return [];
}

async function insertIgnoringDuplicates(
  supabase: SupabaseClient,
  rows: InsertRow[]
): Promise<NotificationRow[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("notifications")
    .upsert(rows, {
      onConflict: "organization_id,user_id,dedup_key",
      ignoreDuplicates: true,
    })
    .select("*");

  if (!error) return (data ?? []) as NotificationRow[];
  if (isUniqueViolation(error)) return [];
  if (isMissingConflictTarget(error)) {
    return insertPlain(supabase, rows);
  }
  return [];
}

export async function createNotifications(
  supabase: SupabaseClient,
  inputs: CreateNotificationInput[]
): Promise<NotificationRow[]> {
  if (inputs.length === 0) return [];

  const withKey: InsertRow[] = [];
  const withoutKey: InsertRow[] = [];
  for (const input of inputs) {
    const row = toInsertRow(input);
    if (row.dedup_key) withKey.push(row);
    else withoutKey.push(row);
  }

  const [deduped, plain] = await Promise.all([
    insertIgnoringDuplicates(supabase, withKey),
    insertPlain(supabase, withoutKey),
  ]);

  return [...deduped, ...plain];
}

export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<NotificationRow | null> {
  const created = await createNotifications(supabase, [input]);
  return created[0] ?? null;
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
  if (profiles.length === 0) return 0;

  const created = await createNotifications(
    supabase,
    profiles.map((profile) => ({
      ...input,
      organizationId,
      userId: profile.id,
    }))
  );

  return created.length;
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
