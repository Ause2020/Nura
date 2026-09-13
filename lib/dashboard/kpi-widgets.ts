import { getReviewAlert } from "@/lib/documents/utils";
import { isPastDue, isDueWithinHours } from "@/lib/capa/utils";
import { startOfDay } from "@/lib/dashboard/utils";
import type { LastAuditRow, DashboardMetricsPayload } from "@/lib/dashboard/metrics";
import type {
  Audit,
  ControlledDocument,
  Nonconformity,
} from "@/types/database";

export type KpiWidgetStatus = "success" | "warning" | "danger";

export interface ModuleKpiWidget {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  status: KpiWidgetStatus;
  href: string;
  kiosk?: boolean;
}

function statusFromThresholds(
  value: number,
  greenMin: number,
  yellowMin: number
): KpiWidgetStatus {
  if (value >= greenMin) return "success";
  if (value >= yellowMin) return "warning";
  return "danger";
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function computeProductionMonitoringWidget(
  submissions: {
    submitted_at: string;
    status: string;
    has_deviation: boolean;
  }[]
): ModuleKpiWidget {
  const todayStart = startOfDay(new Date());
  const weekStart = startOfWeek(new Date());

  const today = submissions.filter(
    (s) => new Date(s.submitted_at) >= todayStart
  );
  const week = submissions.filter(
    (s) => new Date(s.submitted_at) >= weekStart
  );

  const todayOk = today.filter(
    (s) => s.status === "ok" && !s.has_deviation
  ).length;
  const weekOk = week.filter(
    (s) => s.status === "ok" && !s.has_deviation
  ).length;

  const todayPct =
    today.length > 0 ? Math.round((todayOk / today.length) * 100) : 100;
  const weekPct =
    week.length > 0 ? Math.round((weekOk / week.length) * 100) : 100;

  return {
    id: "production",
    label: "Monitoreo",
    value: `${todayPct}%`,
    subtitle: `Hoy ${todayOk}/${today.length || 0} · Semana ${weekPct}% (${weekOk}/${week.length || 0})`,
    status: statusFromThresholds(todayPct, 90, 70),
    href: "/registros",
    kiosk: true,
  };
}

export function computeCapaWidget(ncs: Nonconformity[]): ModuleKpiWidget {
  const open = ncs.filter((nc) => nc.status !== "closed");
  const overdue = open.filter((nc) => isPastDue(nc.due_date, nc.status));
  const dueSoon = open.filter(
    (nc) =>
      !isPastDue(nc.due_date, nc.status) &&
      isDueWithinHours(nc.due_date, 48)
  );
  const critical = open.filter((nc) => nc.severity === "critical");

  let status: KpiWidgetStatus = "success";
  if (overdue.length > 0 || critical.length > 0) status = "danger";
  else if (dueSoon.length > 0) status = "warning";

  return {
    id: "capa",
    label: "CAPA / NC",
    value: String(open.length),
    subtitle: `${overdue.length} vencidas · ${dueSoon.length} por vencer · ${critical.length} críticas`,
    status,
    href: "/capa",
    kiosk: true,
  };
}

export function computeDocumentsWidget(
  documents: ControlledDocument[]
): ModuleKpiWidget {
  const published = documents.filter((d) => d.status === "published");
  const overdue = published.filter(
    (d) => getReviewAlert(d.next_review_date) === "overdue"
  ).length;
  const dueSoon = published.filter(
    (d) => getReviewAlert(d.next_review_date) === "due_soon"
  ).length;

  let status: KpiWidgetStatus = "success";
  if (overdue > 0) status = "danger";
  else if (dueSoon > 0) status = "warning";

  return {
    id: "documents",
    label: "Documentos controlados",
    value: String(overdue + dueSoon),
    subtitle:
      overdue + dueSoon === 0
        ? "Revisión al día"
        : `${overdue} vencidos · ${dueSoon} por vencer (<30 d)`,
    status,
    href: "/documentos",
  };
}

export function computeAuditWidget(audits: Audit[]): ModuleKpiWidget {
  const completed = audits
    .filter((a) => a.status === "completed" && a.completed_date)
    .sort(
      (a, b) =>
        new Date(b.completed_date!).getTime() -
        new Date(a.completed_date!).getTime()
    );

  const last = completed[0];
  const score = last?.compliance_score ?? null;

  const lastTwo = completed.slice(0, 2);
  let trend = "Sin historial";
  if (lastTwo.length === 2) {
    const diff =
      Number(lastTwo[0].compliance_score ?? 0) -
      Number(lastTwo[1].compliance_score ?? 0);
    trend =
      diff > 0
        ? `+${Math.round(diff)}% vs. anterior`
        : diff < 0
          ? `${Math.round(diff)}% vs. anterior`
          : "Igual que la anterior";
  } else if (last) {
    trend = new Date(last.completed_date!).toLocaleDateString("es");
  }

  const numScore = score !== null ? Number(score) : null;
  const status: KpiWidgetStatus =
    numScore === null
      ? "warning"
      : statusFromThresholds(numScore, 85, 70);

  return {
    id: "audits",
    label: "Última auditoría",
    value: numScore !== null ? `${Math.round(numScore)}%` : "—",
    subtitle: last ? `${last.title} · ${trend}` : "Sin auditorías completadas",
    status,
    href: last ? `/auditorias/${last.id}/informe` : "/auditorias",
  };
}

export function buildModuleKpiWidgetsFromMetrics(
  metrics: DashboardMetricsPayload
): ModuleKpiWidget[] {
  const todayPct =
    metrics.submissions.today_total > 0
      ? Math.round(
          (metrics.submissions.today_ok / metrics.submissions.today_total) * 100
        )
      : 100;
  const weekPct =
    metrics.submissions.week_total > 0
      ? Math.round(
          (metrics.submissions.week_ok / metrics.submissions.week_total) * 100
        )
      : 100;

  const lastAudits = metrics.last_audits;
  const last = lastAudits[0] as LastAuditRow | undefined;
  const prev = lastAudits[1] as LastAuditRow | undefined;
  let trend = "Sin historial";
  if (last && prev) {
    const diff =
      Number(last.compliance_score ?? 0) - Number(prev.compliance_score ?? 0);
    trend =
      diff > 0
        ? `+${Math.round(diff)}% vs. anterior`
        : diff < 0
          ? `${Math.round(diff)}% vs. anterior`
          : "Igual que la anterior";
  } else if (last?.completed_date) {
    trend = new Date(last.completed_date).toLocaleDateString("es");
  }

  const score = last?.compliance_score ?? null;
  const numScore = score !== null ? Number(score) : null;
  const docsAlert =
    metrics.documents.review_overdue + metrics.documents.review_due_soon;

  return [
    {
      id: "production",
      label: "Monitoreo",
      value: `${todayPct}%`,
      subtitle: `Hoy ${metrics.submissions.today_ok}/${metrics.submissions.today_total || 0} · Semana ${weekPct}% (${metrics.submissions.week_ok}/${metrics.submissions.week_total || 0})`,
      status: statusFromThresholds(todayPct, 90, 70),
      href: "/registros",
      kiosk: true,
    },
    {
      id: "capa",
      label: "CAPA / NC",
      value: String(metrics.ncs.open),
      subtitle: `${metrics.ncs.overdue} vencidas · ${metrics.ncs.due_soon_48h} por vencer · ${metrics.ncs.critical_open} críticas`,
      status:
        metrics.ncs.overdue > 0 || metrics.ncs.critical_open > 0
          ? "danger"
          : metrics.ncs.due_soon_48h > 0
            ? "warning"
            : "success",
      href: "/capa",
      kiosk: true,
    },
    {
      id: "documents",
      label: "Documentos controlados",
      value: String(docsAlert),
      subtitle:
        docsAlert === 0
          ? "Revisión al día"
          : `${metrics.documents.review_overdue} vencidos · ${metrics.documents.review_due_soon} por vencer (<30 d)`,
      status:
        metrics.documents.review_overdue > 0
          ? "danger"
          : metrics.documents.review_due_soon > 0
            ? "warning"
            : "success",
      href: "/documentos",
    },
    {
      id: "audits",
      label: "Última auditoría",
      value: numScore !== null ? `${Math.round(numScore)}%` : "—",
      subtitle: last ? `${last.title} · ${trend}` : "Sin auditorías completadas",
      status:
        numScore === null ? "warning" : statusFromThresholds(numScore, 85, 70),
      href: last ? `/auditorias/${last.id}/informe` : "/auditorias",
    },
  ];
}

export function computeModuleKpiWidgets(input: {
  productionSubmissions: {
    submitted_at: string;
    status: string;
    has_deviation: boolean;
    area: string | null;
  }[];
  documents: ControlledDocument[];
  ncs: Nonconformity[];
  audits: Audit[];
}): ModuleKpiWidget[] {
  return [
    computeProductionMonitoringWidget(input.productionSubmissions),
    computeCapaWidget(input.ncs),
    computeDocumentsWidget(input.documents),
    computeAuditWidget(input.audits),
  ];
}

export function filterKioskWidgets(widgets: ModuleKpiWidget[]): ModuleKpiWidget[] {
  return widgets.filter((w) => w.kiosk);
}

export function collectSiteAreas(
  submissions: { area: string | null }[],
  templateAreas: (string | null)[]
): string[] {
  const set = new Set<string>();
  for (const s of submissions) {
    if (s.area?.trim()) set.add(s.area.trim());
  }
  for (const a of templateAreas) {
    if (a?.trim()) set.add(a.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}
