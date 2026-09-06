import type { ComplaintStatus } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export async function logComplaintStatusChange(
  supabase: SupabaseClient,
  input: {
    complaintId: string;
    organizationId: string;
    fromStatus: ComplaintStatus | null;
    toStatus: ComplaintStatus;
    changedBy: string | null;
    comment?: string | null;
  }
): Promise<void> {
  await supabase.from("complaint_status_log").insert({
    complaint_id: input.complaintId,
    organization_id: input.organizationId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    changed_by: input.changedBy,
    comment: input.comment ?? null,
  });
}
