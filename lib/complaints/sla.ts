import type { ComplaintSeverity, ComplaintStatus } from "@/types/database";

export type ComplaintAutoNcThreshold =
  | "none"
  | "safety_critical"
  | "quality";

export const DEFAULT_COMPLAINT_SLA_HOURS = 72;

export function computeResponseDueAt(
  receivedDate: string,
  slaHours: number = DEFAULT_COMPLAINT_SLA_HOURS
): string {
  const base = new Date(receivedDate);
  base.setHours(12, 0, 0, 0);
  base.setTime(base.getTime() + slaHours * 3600000);
  return base.toISOString();
}

export function hoursUntilDue(responseDueAt: string | null): number | null {
  if (!responseDueAt) return null;
  return Math.round(
    (new Date(responseDueAt).getTime() - Date.now()) / 3600000
  );
}

export function isResponseOverdue(
  complaint: {
    status: ComplaintStatus;
    response_date: string | null;
    response_due_at: string | null;
  }
): boolean {
  if (complaint.status === "closed" || complaint.response_date) return false;
  if (!complaint.response_due_at) return false;
  return new Date(complaint.response_due_at).getTime() < Date.now();
}

export function isResponseDueSoon(
  complaint: {
    status: ComplaintStatus;
    response_date: string | null;
    response_due_at: string | null;
  },
  withinHours = 24
): boolean {
  if (complaint.status === "closed" || complaint.response_date) return false;
  const hours = hoursUntilDue(complaint.response_due_at);
  if (hours === null) return false;
  return hours >= 0 && hours <= withinHours;
}

export function shouldAutoCreateNc(
  severity: ComplaintSeverity,
  threshold: ComplaintAutoNcThreshold
): boolean {
  if (threshold === "none") return false;
  if (threshold === "safety_critical") {
    return severity === "safety_critical";
  }
  return severity === "safety_critical" || severity === "quality";
}

export function parseAutoNcThreshold(raw: unknown): ComplaintAutoNcThreshold {
  if (raw === "none" || raw === "quality" || raw === "safety_critical") {
    return raw;
  }
  return "safety_critical";
}

export function parseSlaHours(raw: unknown): number {
  const n = Number(raw);
  if (Number.isNaN(n) || n < 1 || n > 720) return DEFAULT_COMPLAINT_SLA_HOURS;
  return Math.round(n);
}

export function slaStatusLabel(
  complaint: {
    status: ComplaintStatus;
    response_date: string | null;
    response_due_at: string | null;
  }
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (complaint.response_date || complaint.status === "closed") {
    return { label: "Respondido", tone: "success" };
  }
  if (isResponseOverdue(complaint)) {
    return { label: "SLA vencido", tone: "danger" };
  }
  if (isResponseDueSoon(complaint)) {
    const h = hoursUntilDue(complaint.response_due_at);
    return { label: `SLA · ${h ?? 0}h restantes`, tone: "warning" };
  }
  const h = hoursUntilDue(complaint.response_due_at);
  if (h !== null) {
    return { label: `SLA · ${h}h`, tone: "neutral" };
  }
  return { label: "Sin SLA", tone: "neutral" };
}
