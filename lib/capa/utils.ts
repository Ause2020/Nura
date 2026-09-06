import type { CapaAction, Nonconformity, NcSeverity, NcStatus } from "@/types/database";
import { CLOSED_STATUSES, OPEN_STATUSES, IN_PROGRESS_STATUSES } from "@/lib/capa/constants";

export function getSuggestedDueDate(severity: NcSeverity): string {
  const days =
    severity === "critical"
      ? 3
      : severity === "major"
        ? 7
        : 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export function isPastDue(dueDate: string | null, status: NcStatus): boolean {
  if (!dueDate || status === "closed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function isDueWithinHours(dueDate: string | null, hours: number): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  const limit = Date.now() + hours * 3600000;
  return due.getTime() <= limit && due.getTime() >= Date.now();
}

export function truncateText(text: string, max = 60): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function computeCapaMetrics(ncs: Nonconformity[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const open = ncs.filter((nc) => OPEN_STATUSES.includes(nc.status)).length;
  const overdue = ncs.filter(
    (nc) => nc.status !== "closed" && isPastDue(nc.due_date, nc.status)
  ).length;
  const closedThisMonth = ncs.filter((nc) => {
    if (!nc.closed_at) return false;
    return new Date(nc.closed_at) >= monthStart;
  }).length;

  const monthNcs = ncs.filter((nc) => new Date(nc.created_at) >= monthStart);
  const recurrent = monthNcs.filter((nc) => nc.recurrence).length;
  const recurrenceRate =
    monthNcs.length > 0 ? Math.round((recurrent / monthNcs.length) * 100) : 0;

  return { open, overdue, closedThisMonth, recurrenceRate };
}

export function filterByTab(
  ncs: Nonconformity[],
  tab: "open" | "in_progress" | "closed"
): Nonconformity[] {
  if (tab === "open") {
    return ncs.filter((nc) => OPEN_STATUSES.includes(nc.status));
  }
  if (tab === "in_progress") {
    return ncs.filter((nc) => IN_PROGRESS_STATUSES.includes(nc.status));
  }
  return ncs.filter((nc) => CLOSED_STATUSES.includes(nc.status));
}

export function getPrimaryResponsible(actions: CapaAction[]): string | null {
  const pending = actions.find(
    (a) => a.status === "pending" || a.status === "in_progress" || a.status === "overdue"
  );
  return pending?.responsible ?? actions[0]?.responsible ?? null;
}

export async function generateNcNumber(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NC-${year}-`;

  const { data } = await supabase
    .from("nonconformities")
    .select("nc_number")
    .eq("organization_id", organizationId)
    .like("nc_number", `${prefix}%`)
    .order("nc_number", { ascending: false })
    .limit(1);

  const last = (data as { nc_number: string }[] | null)?.[0]?.nc_number;
  const lastNum = last ? parseInt(last.split("-").pop() ?? "0", 10) : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, "0")}`;
}

export function allActionsCompleted(actions: CapaAction[]): boolean {
  if (actions.length === 0) return false;
  return actions.every((a) => a.status === "completed");
}
