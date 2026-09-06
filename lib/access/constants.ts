import type { AccessStatus } from "@/types/database";

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  pending: "Pendiente",
  active: "Activo",
  suspended: "Suspendido",
  expired: "Vencido",
};

export function getAccessStatusLabel(status: AccessStatus): string {
  return ACCESS_STATUS_LABELS[status] ?? status;
}

export function isAccessAllowed(
  status: AccessStatus,
  expiresAt: string | null
): boolean {
  if (status !== "active") return false;
  if (!expiresAt) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt);
  expiry.setHours(0, 0, 0, 0);
  return expiry >= today;
}

export function resolveAccessStatus(
  status: AccessStatus,
  expiresAt: string | null
): AccessStatus {
  if (status === "active" && expiresAt) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiresAt);
    expiry.setHours(0, 0, 0, 0);
    if (expiry < today) return "expired";
  }
  return status;
}
