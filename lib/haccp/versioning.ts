import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { DocumentStatus, UserRole } from "@/types/database";

export type HaccpPlanStatus = DocumentStatus;

export async function computeHaccpPlanSignatureHash(input: {
  userId: string;
  productId: string;
  versionId?: string | null;
  fromStatus: HaccpPlanStatus | null;
  toStatus: HaccpPlanStatus;
  timestamp: string;
}): Promise<string> {
  const payload = [
    input.userId,
    input.productId,
    input.versionId ?? "",
    input.fromStatus ?? "",
    input.toStatus,
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

export function canTransitionPlanStatus(
  role: UserRole,
  from: HaccpPlanStatus,
  to: HaccpPlanStatus
): boolean {
  const key = `${from}->${to}`;
  if (RESTRICTED_TRANSITIONS.has(key)) {
    return hasPermission(role, PERMISSIONS.haccp.transitionRestricted);
  }
  if (MANAGE_TRANSITIONS.has(key)) {
    return hasPermission(role, PERMISSIONS.haccp.manage);
  }
  return false;
}

export function getAvailablePlanTransitions(
  role: UserRole,
  status: HaccpPlanStatus
): HaccpPlanStatus[] {
  const all: HaccpPlanStatus[] = [
    "draft",
    "in_review",
    "approved",
    "published",
    "obsolete",
  ];
  return all.filter(
    (to) => to !== status && canTransitionPlanStatus(role, status, to)
  );
}

export const PLAN_STATUS_LABELS: Record<HaccpPlanStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  published: "Publicado",
  obsolete: "Obsoleto",
};

export function getPlanStatusBadgeVariant(
  status: HaccpPlanStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") return "success";
  if (status === "approved") return "success";
  if (status === "in_review") return "warning";
  if (status === "obsolete") return "neutral";
  return "warning";
}
