import type { Audit, AuditTemplate } from "@/types/database";

export interface ComplianceTrendPoint {
  label: string;
  auditId: string;
  completedDate: string;
  score: number;
  siteArea: string | null;
  templateName: string | null;
}

export interface ComplianceTrendSeries {
  key: string;
  label: string;
  points: ComplianceTrendPoint[];
  average: number;
}

export function buildComplianceTrendSeries(
  audits: Audit[],
  templates: Pick<AuditTemplate, "id" | "name">[],
  groupBy: "template" | "area"
): ComplianceTrendSeries[] {
  const templateMap = new Map(templates.map((t) => [t.id, t.name]));
  const completed = audits
    .filter((a) => a.status === "completed" && a.compliance_score != null)
    .sort((a, b) =>
      (a.completed_date ?? a.scheduled_date).localeCompare(
        b.completed_date ?? b.scheduled_date
      )
    );

  const groups = new Map<string, ComplianceTrendPoint[]>();

  for (const audit of completed) {
    const key =
      groupBy === "template"
        ? audit.template_id ?? "sin-plantilla"
        : audit.site_area?.trim() || "Sin área";

    const label =
      groupBy === "template"
        ? (audit.template_id
            ? templateMap.get(audit.template_id) ?? "Plantilla eliminada"
            : "Sin plantilla")
        : audit.site_area?.trim() || "Sin área";

    const list = groups.get(key) ?? [];
    list.push({
      label,
      auditId: audit.id,
      completedDate: audit.completed_date ?? audit.scheduled_date,
      score: Number(audit.compliance_score),
      siteArea: audit.site_area,
      templateName: audit.template_id
        ? templateMap.get(audit.template_id) ?? null
        : null,
    });
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([key, points]) => ({
    key,
    label: points[0]?.label ?? key,
    points,
    average:
      points.length > 0
        ? Math.round(
            points.reduce((sum, p) => sum + p.score, 0) / points.length
          )
        : 0,
  }));
}

export function getCalendarAuditsByDate(
  audits: Audit[]
): Map<string, Audit[]> {
  const map = new Map<string, Audit[]>();

  for (const audit of audits) {
    if (audit.status === "cancelled") continue;
    const date = audit.scheduled_date;
    const list = map.get(date) ?? [];
    list.push(audit);
    map.set(date, list);
  }

  return map;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("es", { month: "long", year: "numeric" });
}

export function toDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}
