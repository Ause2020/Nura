import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
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

const RESTRICTED_TRANSITIONS = new Set([
  "approved->draft",
  "published->obsolete",
]);

const MANAGE_TRANSITIONS = new Set([
  "draft->in_review",
  "in_review->approved",
  "in_review->draft",
  "approved->published",
  "published->draft",
]);

export function canTransitionStatus(
  role: UserRole,
  from: DocumentStatus,
  to: DocumentStatus
): boolean {
  const key = `${from}->${to}`;
  if (RESTRICTED_TRANSITIONS.has(key)) {
    return hasPermission(role, PERMISSIONS.documents.transitionRestricted);
  }
  if (MANAGE_TRANSITIONS.has(key)) {
    return hasPermission(role, PERMISSIONS.documents.manage);
  }
  return false;
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
  const { uploadPrivateObject } = await import("@/lib/storage/private");
  const uploaded = await uploadPrivateObject(supabase, {
    bucket: DOCUMENTS_BUCKET,
    organizationId,
    entityId: documentId,
    file,
    upsert: true,
  });

  if ("error" in uploaded) {
    return { error: uploaded.error };
  }

  return { fileUrl: uploaded.path, fileName: file.name };
}
