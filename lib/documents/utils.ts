import type { DocumentStatus, UserRole } from "@/types/database";

export async function computeDocumentSignatureHash(input: {
  userId: string;
  action: string;
  documentId: string;
  versionId?: string | null;
  timestamp: string;
}): Promise<string> {
  const payload = [
    input.userId,
    input.action,
    input.documentId,
    input.versionId ?? "",
    input.timestamp,
  ].join("|");

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const TRANSITION_ROLES: Record<string, UserRole[]> = {
  "draft->in_review": ["admin", "quality_manager"],
  "in_review->approved": ["admin", "quality_manager"],
  "in_review->draft": ["admin", "quality_manager"],
  "approved->published": ["admin", "quality_manager"],
  "approved->draft": ["admin"],
  "published->obsolete": ["admin"],
  "published->draft": ["admin", "quality_manager"],
};

export function canTransitionStatus(
  role: UserRole,
  from: DocumentStatus,
  to: DocumentStatus
): boolean {
  const key = `${from}->${to}`;
  return TRANSITION_ROLES[key]?.includes(role) ?? false;
}

export function getAvailableTransitions(
  role: UserRole,
  status: DocumentStatus
): DocumentStatus[] {
  const all: DocumentStatus[] = [
    "draft",
    "in_review",
    "approved",
    "published",
    "obsolete",
  ];

  return all.filter(
    (to) => to !== status && canTransitionStatus(role, status, to)
  );
}

export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type ReviewAlert = "none" | "due_soon" | "overdue";

export function getReviewAlert(nextReviewDate: string | null): ReviewAlert {
  const days = daysUntil(nextReviewDate);
  if (days == null) return "none";
  if (days < 0) return "overdue";
  if (days <= 30) return "due_soon";
  return "none";
}

export function computeAckProgress(
  acks: { status: string }[]
): { total: number; completed: number; percent: number } {
  const total = acks.length;
  const completed = acks.filter((a) => a.status === "acknowledged").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

export const DOCUMENTS_BUCKET = "controlled-documents";

export async function uploadDocumentFile(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  organizationId: string,
  documentId: string,
  file: File
): Promise<{ fileUrl: string; fileName: string } | { error: string }> {
  const ext = file.name.split(".").pop() ?? "pdf";
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `${organizationId}/${documentId}/${Date.now()}-${safeName || `archivo.${ext}`}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: true });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return { fileUrl: data.publicUrl, fileName: file.name };
}
