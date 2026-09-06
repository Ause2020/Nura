import type { CustomerComplaint } from "@/types/database";
import { isResponseOverdue } from "@/lib/complaints/sla";

export interface CategoryPeriodPoint {
  category: string;
  label: string;
  count: number;
}

export interface SlaComplianceSummary {
  totalOpen: number;
  overdue: number;
  dueSoon: number;
  onTrack: number;
  complianceRate: number;
}

export function computeCategoryBreakdown(
  complaints: CustomerComplaint[],
  labelFn: (type: string) => string,
  days = 90
): CategoryPeriodPoint[] {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const map = new Map<string, number>();
  for (const c of complaints) {
    if (new Date(c.received_date) < since) continue;
    map.set(c.complaint_type, (map.get(c.complaint_type) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([category, count]) => ({
      category,
      label: labelFn(category),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeSlaCompliance(
  complaints: CustomerComplaint[]
): SlaComplianceSummary {
  const open = complaints.filter((c) => c.status !== "closed" && !c.response_date);
  const overdue = open.filter((c) => isResponseOverdue(c)).length;
  const dueSoon = open.filter(
    (c) =>
      !isResponseOverdue(c) &&
      c.response_due_at &&
      new Date(c.response_due_at).getTime() - Date.now() <= 24 * 3600000 &&
      new Date(c.response_due_at).getTime() >= Date.now()
  ).length;
  const onTrack = open.length - overdue - dueSoon;
  const complianceRate =
    open.length > 0
      ? Math.round(((open.length - overdue) / open.length) * 100)
      : 100;

  return {
    totalOpen: open.length,
    overdue,
    dueSoon,
    onTrack,
    complianceRate,
  };
}

export function filterOverdueComplaints(
  complaints: CustomerComplaint[]
): CustomerComplaint[] {
  return complaints.filter((c) => isResponseOverdue(c));
}
