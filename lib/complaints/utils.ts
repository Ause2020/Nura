import type {
  CapaAction,
  CustomerComplaint,
  ComplaintStatus,
  Nonconformity,
} from "@/types/database";

const MS_DAY = 86400000;
const RESPONSE_TARGET_DAYS = 5;
const RECURRENCE_WINDOW_DAYS = 90;
const RECURRENCE_THRESHOLD = 2;

export function daysOpen(complaint: CustomerComplaint): number {
  const start = new Date(complaint.received_date);
  start.setHours(0, 0, 0, 0);
  const end = complaint.closed_at
    ? new Date(complaint.closed_at)
    : new Date();
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / MS_DAY)
  );
}

export function daysToRespond(complaint: CustomerComplaint): number | null {
  if (!complaint.response_date) return null;
  const received = new Date(complaint.received_date);
  const responded = new Date(complaint.response_date);
  received.setHours(0, 0, 0, 0);
  responded.setHours(0, 0, 0, 0);
  return Math.round((responded.getTime() - received.getTime()) / MS_DAY);
}

export type ComplaintTab = "open" | "investigating" | "closed";

export function filterComplaintsByTab(
  complaints: CustomerComplaint[],
  tab: ComplaintTab
): CustomerComplaint[] {
  if (tab === "open") {
    return complaints.filter((c) => c.status === "open");
  }
  if (tab === "investigating") {
    return complaints.filter(
      (c) => c.status === "investigating" || c.status === "responded"
    );
  }
  return complaints.filter((c) => c.status === "closed");
}

export function computeComplaintMetrics(
  complaints: CustomerComplaint[],
  slaHours = RESPONSE_TARGET_DAYS * 24
) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = complaints.filter(
    (c) => new Date(c.received_date) >= monthStart
  ).length;

  const responded = complaints.filter((c) => c.response_date);
  const avgResponseDays =
    responded.length > 0
      ? Math.round(
          responded.reduce((sum, c) => sum + (daysToRespond(c) ?? 0), 0) /
            responded.length
        )
      : 0;

  const criticalOpen = complaints.filter(
    (c) =>
      c.severity === "safety_critical" &&
      c.status !== "closed"
  ).length;

  const recurrent = complaints.filter((c) => c.recurrence).length;
  const recurrenceRate =
    complaints.length > 0
      ? Math.round((recurrent / complaints.length) * 100)
      : 0;

  return {
    thisMonth,
    avgResponseDays,
    criticalOpen,
    recurrenceRate,
    responseTargetDays: Math.round(slaHours / 24),
    slaHours,
  };
}

export function detectRecurrence(
  complaint: Pick<CustomerComplaint, "complaint_type" | "product_id" | "received_date">,
  all: CustomerComplaint[],
  excludeId?: string
): boolean {
  if (!complaint.product_id) return false;

  const windowStart = new Date(complaint.received_date);
  windowStart.setDate(windowStart.getDate() - RECURRENCE_WINDOW_DAYS);

  const similar = all.filter((c) => {
    if (excludeId && c.id === excludeId) return false;
    if (c.product_id !== complaint.product_id) return false;
    if (c.complaint_type !== complaint.complaint_type) return false;
    const d = new Date(c.received_date);
    return d >= windowStart && d <= new Date(complaint.received_date);
  });

  return similar.length >= RECURRENCE_THRESHOLD;
}

export async function generateComplaintNumber(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;

  const { data } = await supabase
    .from("customer_complaints")
    .select("complaint_number")
    .eq("organization_id", organizationId)
    .like("complaint_number", `${prefix}%`)
    .order("complaint_number", { ascending: false })
    .limit(1);

  const last = (data as { complaint_number: string }[] | null)?.[0]
    ?.complaint_number;
  const lastNum = last ? parseInt(last.split("-").pop() ?? "0", 10) : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, "0")}`;
}

export function canCloseComplaint(
  complaint: CustomerComplaint,
  nc: Nonconformity | null,
  actions: CapaAction[]
): { ok: boolean; reason?: string } {
  if (!complaint.response_date || !complaint.response_summary?.trim()) {
    return { ok: false, reason: "Debes registrar la respuesta al cliente" };
  }

  if (complaint.nc_id && nc && nc.status !== "closed") {
    if (actions.length === 0) {
      return {
        ok: false,
        reason:
          "La NC vinculada requiere al menos una acción correctiva antes de cerrar",
      };
    }
  }

  return { ok: true };
}

export interface MonthlyComplaintPoint {
  label: string;
  count: number;
}

export function computeMonthlyComplaintTrend(
  complaints: CustomerComplaint[],
  months = 6
): MonthlyComplaintPoint[] {
  const points: MonthlyComplaintPoint[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("es", { month: "short", year: "2-digit" });
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);

    const count = complaints.filter((c) => {
      const rd = new Date(c.received_date);
      return rd >= start && rd <= end;
    }).length;

    points.push({ label, count });
  }

  return points;
}

export interface ComplaintTypeCount {
  type: string;
  label: string;
  count: number;
}

export function topComplaintTypes(
  complaints: CustomerComplaint[],
  labelFn: (type: string) => string,
  limit = 5
): ComplaintTypeCount[] {
  const map = new Map<string, number>();
  const quarterStart = new Date();
  quarterStart.setMonth(quarterStart.getMonth() - 3);

  for (const c of complaints) {
    if (new Date(c.received_date) < quarterStart) continue;
    map.set(c.complaint_type, (map.get(c.complaint_type) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([type, count]) => ({ type, label: labelFn(type), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface ProductComplaintCount {
  productId: string;
  productName: string;
  count: number;
}

export function topProductsByComplaints(
  complaints: CustomerComplaint[],
  productNames: Map<string, string>,
  limit = 3
): ProductComplaintCount[] {
  const map = new Map<string, number>();
  const quarterStart = new Date();
  quarterStart.setMonth(quarterStart.getMonth() - 3);

  for (const c of complaints) {
    if (!c.product_id || new Date(c.received_date) < quarterStart) continue;
    map.set(c.product_id, (map.get(c.product_id) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([productId, count]) => ({
      productId,
      productName: productNames.get(productId) ?? "Producto",
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
