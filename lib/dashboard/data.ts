import { getOriginLabel } from "@/lib/capa/constants";
import { countCompletedSteps } from "@/lib/haccp-plan/checklists";
import {
  computeSystemScore,
  startOfDay,
  type ActivityItem,
  type DashboardTask,
  type ExecutiveKpi,
  type MonthlyScorePoint,
  type NcOriginCount,
  type OperationalMetrics,
} from "@/lib/dashboard/utils";
import { buildModuleKpiWidgetsFromMetrics, type ModuleKpiWidget } from "@/lib/dashboard/kpi-widgets";
import {
  parseDashboardMetrics,
  recordsComplianceRate,
} from "@/lib/dashboard/metrics";
import {
  isMissingRpcError,
  loadDashboardMetricsFallback,
} from "@/lib/dashboard/metrics-fallback";
import { createClient } from "@/lib/supabase/server";
import type { NcOrigin } from "@/types/database";

const LIMIT = {
  activitySubmissions: 8,
  activityAudits: 5,
  activityNcs: 5,
  todayAudits: 8,
  openNcs: 15,
  capaActions: 20,
  weekItems: 5,
} as const;

export interface ThisWeekItem {
  id: string;
  href: string;
  label: string;
  sublabel?: string;
  urgent: boolean;
}

export interface ThisWeekData {
  newNcs: ThisWeekItem[];
  totalOpenNcs: number;
  overdueCapaActions: ThisWeekItem[];
  dueSoonCapaActions: ThisWeekItem[];
  deviationRecords: ThisWeekItem[];
  upcomingAudits: ThisWeekItem[];
}

export interface DashboardData {
  userName: string;
  tasks: DashboardTask[];
  metrics: OperationalMetrics;
  activities: ActivityItem[];
  globalScore: number;
  kpis: ExecutiveKpi[];
  monthlyTrend: MonthlyScorePoint[];
  ncByOrigin: NcOriginCount[];
  recordsComplianceRate: number;
  moduleWidgets: ModuleKpiWidget[];
  siteAreas: string[];
  thisWeek: ThisWeekData;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function truncateLabel(text: string): string {
  if (text.length <= 60) return text;
  return `${text.slice(0, 57)}…`;
}

function severityLabel(severity: string): string {
  if (severity === "critical") return "Crítica";
  if (severity === "major") return "Mayor";
  if (severity === "minor") return "Menor";
  return "Observación";
}

function ncStatusLabel(status: string): string {
  if (status === "open") return "Abierta";
  if (status === "in_analysis") return "En análisis";
  if (status === "overdue") return "Vencida";
  return status;
}

function templateName(
  row: { production_form_templates?: { name?: string } | null }
): string {
  return row.production_form_templates?.name ?? "Monitoreo";
}

export async function fetchDashboardData(
  orgId: string,
  userName: string
): Promise<DashboardData> {
  const supabase = await createClient();
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const sevenDaysAhead = new Date(today.getTime() + 7 * 86400000);
  const fourteenDaysAhead = new Date(today.getTime() + 14 * 86400000);

  const todayIso = isoDate(today);
  const tomorrowIso = isoDate(tomorrow);
  const weekAgoIso = sevenDaysAgo.toISOString();
  const weekAheadIso = isoDate(sevenDaysAhead);
  const twoWeeksIso = isoDate(fourteenDaysAhead);

  const [
    { data: metricsRpc, error: metricsError },
    { data: upcomingAuditsData },
    { data: recentAuditsData },
    { data: openNcsData },
    { data: recentNcsData },
    { data: capaActionsData },
    { data: recentSubmissionsData },
    { data: deviationData },
  ] = await Promise.all([
    supabase.rpc("get_dashboard_metrics"),
    supabase
      .from("audits")
      .select("id, title, scheduled_date, status")
      .eq("organization_id", orgId)
      .in("status", ["scheduled", "in_progress"])
      .gte("scheduled_date", todayIso)
      .lte("scheduled_date", twoWeeksIso)
      .order("scheduled_date", { ascending: true })
      .limit(LIMIT.todayAudits),
    supabase
      .from("audits")
      .select("id, title, completed_date, created_at")
      .eq("organization_id", orgId)
      .eq("status", "completed")
      .order("completed_date", { ascending: false, nullsFirst: false })
      .limit(LIMIT.activityAudits),
    supabase
      .from("nonconformities")
      .select("id, nc_number, status, severity, due_date, detected_at, area")
      .eq("organization_id", orgId)
      .neq("status", "closed")
      .or(
        `and(due_date.gte.${todayIso},due_date.lte.${tomorrowIso}),detected_at.gte.${weekAgoIso}`
      )
      .order("detected_at", { ascending: false })
      .limit(LIMIT.openNcs),
    supabase
      .from("nonconformities")
      .select("id, nc_number, status, detected_at, closed_at, created_at")
      .eq("organization_id", orgId)
      .order("detected_at", { ascending: false })
      .limit(LIMIT.activityNcs),
    supabase
      .from("capa_actions")
      .select("id, status, due_date, description, nc_id")
      .eq("organization_id", orgId)
      .neq("status", "completed")
      .lte("due_date", weekAheadIso)
      .order("due_date", { ascending: true })
      .limit(LIMIT.capaActions),
    supabase
      .from("production_form_submissions")
      .select(
        "id, submitted_at, has_deviation, area, template_id, production_form_templates(name)"
      )
      .eq("organization_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(LIMIT.activitySubmissions),
    supabase
      .from("production_form_submissions")
      .select(
        "id, submitted_at, area, template_id, production_form_templates(name)"
      )
      .eq("organization_id", orgId)
      .eq("has_deviation", true)
      .gte("submitted_at", weekAgoIso)
      .order("submitted_at", { ascending: false })
      .limit(LIMIT.weekItems),
  ]);

  if (metricsError && !isMissingRpcError(metricsError)) {
    throw new Error(
      metricsError.message ||
        "No se pudieron cargar los indicadores del dashboard (aplica 039_dashboard_metrics.sql)"
    );
  }

  const aggregates = metricsError
    ? await loadDashboardMetricsFallback(supabase, orgId)
    : parseDashboardMetrics(metricsRpc);
  const completedSteps = aggregates.haccp_checklist_progress
    ? countCompletedSteps(aggregates.haccp_checklist_progress)
    : 0;
  const haccpAvg = (completedSteps / 12) * 100;
  const complianceRate = recordsComplianceRate(aggregates.submissions);

  const systemScore = computeSystemScore({
    haccpAvgCompletion: haccpAvg,
    recordsCompliancePct: complianceRate,
    openNcs: aggregates.ncs.open,
    overdueNcs: aggregates.ncs.overdue,
    auditsCompleted: aggregates.audits_month.completed,
    auditsScheduled: aggregates.audits_month.scheduled,
  });

  const upcomingAudits = (upcomingAuditsData ?? []) as {
    id: string;
    title: string;
    scheduled_date: string;
    status: string;
  }[];
  const recentAudits = (recentAuditsData ?? []) as {
    id: string;
    title: string;
    completed_date: string | null;
    created_at: string;
  }[];
  const openNcs = (openNcsData ?? []) as {
    id: string;
    nc_number: string;
    status: string;
    severity: string;
    due_date: string | null;
    detected_at: string;
    area: string | null;
  }[];
  const recentNcs = (recentNcsData ?? []) as {
    id: string;
    nc_number: string;
    status: string;
    detected_at: string;
    closed_at: string | null;
    created_at: string;
  }[];
  const capaActions = (capaActionsData ?? []) as {
    id: string;
    status: string;
    due_date: string;
    description: string;
    nc_id: string;
  }[];
  const recentSubmissions = (recentSubmissionsData ?? []) as {
    id: string;
    submitted_at: string;
    has_deviation: boolean;
    area: string | null;
    template_id: string;
    production_form_templates?: { name?: string } | null;
  }[];
  const deviations = (deviationData ?? []) as {
    id: string;
    submitted_at: string;
    area: string | null;
    template_id: string;
    production_form_templates?: { name?: string } | null;
  }[];

  const tasks: DashboardTask[] = [];
  for (const audit of upcomingAudits) {
    if (audit.scheduled_date !== todayIso) continue;
    tasks.push({
      id: `audit-${audit.id}`,
      type: "audit",
      title: audit.title,
      subtitle: "Auditoría programada hoy",
      href: `/auditorias/${audit.id}/ejecutar`,
      urgent: false,
    });
  }
  for (const nc of openNcs) {
    if (!nc.due_date) continue;
    const isToday = nc.due_date === todayIso;
    const isTomorrow = nc.due_date === tomorrowIso;
    if (!isToday && !isTomorrow) continue;
    tasks.push({
      id: `nc-${nc.id}`,
      type: "capa",
      title: nc.nc_number,
      subtitle: isToday ? "Vence hoy" : "Vence mañana",
      href: `/capa/${nc.id}`,
      urgent: isToday || nc.severity === "critical",
    });
  }

  const activities: ActivityItem[] = [
    ...recentSubmissions.map((sub) => ({
      id: `registro-${sub.id}`,
      type: "registro" as const,
      description: `Monitoreo: ${templateName(sub)}${sub.has_deviation ? " (desviación)" : ""}`,
      timestamp: sub.submitted_at,
      href: "/registros",
    })),
    ...recentAudits.map((audit) => ({
      id: `audit-${audit.id}`,
      type: "audit" as const,
      description: `Auditoría completada: ${audit.title}`,
      timestamp: audit.completed_date ?? audit.created_at,
      href: `/auditorias/${audit.id}/informe`,
    })),
    ...recentNcs.map((nc) => ({
      id: `nc-${nc.id}`,
      type: (nc.status === "closed" ? "capa" : "nc") as ActivityItem["type"],
      description:
        nc.status === "closed"
          ? `NC cerrada: ${nc.nc_number}`
          : `Nueva NC: ${nc.nc_number}`,
      timestamp:
        nc.status === "closed" ? nc.closed_at ?? nc.created_at : nc.detected_at,
      href: `/capa/${nc.id}`,
    })),
  ].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const avgThis = aggregates.audit_compliance.this_month;
  const avgLast = aggregates.audit_compliance.last_month;
  const kpis: ExecutiveKpi[] = [
    {
      label: "Conformidad en auditorías",
      value: avgThis !== null ? `${Math.round(avgThis)}%` : "—",
      trend:
        avgLast !== null && avgThis !== null
          ? avgThis >= avgLast
            ? "up"
            : avgThis < avgLast
              ? "down"
              : "flat"
          : "flat",
      trendLabel: "vs. mes anterior",
    },
    {
      label: "Tiempo cierre CAPA",
      value:
        aggregates.avg_closure_days !== null
          ? `${aggregates.avg_closure_days} días`
          : "—",
      trend: "flat",
      trendLabel: "promedio reciente",
    },
    {
      label: "NCs registradas",
      value: String(aggregates.ncs.total),
      trend:
        aggregates.ncs.this_month > aggregates.ncs.last_month ? "down" : "up",
      trendLabel: "total acumulado",
    },
    {
      label: "Monitoreo del mes",
      value: `${complianceRate}%`,
      trend:
        complianceRate >= 90 ? "up" : complianceRate >= 75 ? "flat" : "down",
      trendLabel: `${aggregates.submissions.month_total} completados`,
    },
  ];

  const monthlyTrend: MonthlyScorePoint[] = aggregates.monthly.map((point) => {
    const [year, month] = point.ym.split("-").map(Number);
    const label = Number.isFinite(year) && Number.isFinite(month)
      ? new Date(year, month - 1, 1).toLocaleDateString("es", { month: "short" })
      : point.ym;
    const score =
      point.audit_avg != null
        ? Math.round(point.audit_avg)
        : Math.max(35, 100 - point.nc_count * 10);
    return { month: label, score };
  });

  const ncByOrigin: NcOriginCount[] = aggregates.nc_by_origin.map((item) => ({
    origin: item.origin,
    label: getOriginLabel(item.origin as NcOrigin),
    count: item.count,
  }));

  const thisWeek: ThisWeekData = {
    newNcs: openNcs
      .filter(
        (nc) => nc.status !== "closed" && new Date(nc.detected_at) >= sevenDaysAgo
      )
      .slice(0, LIMIT.weekItems)
      .map((nc) => ({
        id: nc.id,
        href: `/capa/${nc.id}`,
        label: nc.nc_number,
        sublabel: `${severityLabel(nc.severity)} · ${ncStatusLabel(nc.status)}${nc.area ? ` · ${nc.area}` : ""}`,
        urgent: nc.severity === "critical" || nc.status === "overdue",
      })),
    totalOpenNcs: aggregates.ncs.open,
    overdueCapaActions: capaActions
      .filter((action) => action.due_date < todayIso)
      .slice(0, LIMIT.weekItems)
      .map((action) => ({
        id: action.id,
        href: `/capa/${action.nc_id}`,
        label: truncateLabel(action.description),
        sublabel: `Venció el ${new Date(action.due_date).toLocaleDateString("es")}`,
        urgent: true,
      })),
    dueSoonCapaActions: capaActions
      .filter(
        (action) => action.due_date >= todayIso && action.due_date <= weekAheadIso
      )
      .slice(0, LIMIT.weekItems)
      .map((action) => ({
        id: action.id,
        href: `/capa/${action.nc_id}`,
        label: truncateLabel(action.description),
        sublabel: `Vence el ${new Date(action.due_date).toLocaleDateString("es")}`,
        urgent: false,
      })),
    deviationRecords: deviations.slice(0, LIMIT.weekItems).map((row) => ({
      id: row.id,
      href: `/registros/${row.id}`,
      label: templateName(row),
      sublabel: `${new Date(row.submitted_at).toLocaleDateString("es")}${row.area ? ` · ${row.area}` : ""}`,
      urgent: true,
    })),
    upcomingAudits: upcomingAudits.slice(0, LIMIT.weekItems).map((audit) => ({
      id: audit.id,
      href: `/auditorias/${audit.id}/ejecutar`,
      label: audit.title,
      sublabel: new Date(audit.scheduled_date).toLocaleDateString("es"),
      urgent: audit.status === "in_progress",
    })),
  };

  return {
    userName,
    tasks,
    metrics: {
      haccpComplete: completedSteps,
      haccpTotal: 12,
      recordsTemplatesActive: aggregates.records_templates_active,
      recordsSubmissionsMonth: aggregates.submissions.month_total,
      openNcs: aggregates.ncs.open,
      criticalOrOverdueNcs: aggregates.ncs.critical_or_overdue,
      auditsScheduledMonth: aggregates.audits_month.scheduled,
      auditsCompletedMonth: aggregates.audits_month.completed,
      systemScore,
      overdueCapas: aggregates.overdue_capa_actions,
    },
    activities: activities.slice(0, 10),
    globalScore: systemScore,
    kpis,
    monthlyTrend,
    ncByOrigin,
    recordsComplianceRate: complianceRate,
    moduleWidgets: buildModuleKpiWidgetsFromMetrics(aggregates),
    siteAreas: aggregates.site_areas,
    thisWeek,
  };
}
