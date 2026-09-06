import { getOriginLabel } from "@/lib/capa/constants";
import { countCompletedSteps } from "@/lib/haccp-plan/checklists";
import type { ChecklistProgress } from "@/lib/haccp-plan/types";
import {
  computeAvgCapaClosureDays,
  computeMonthlyTrend,
  computeSystemScore,
  startOfDay,
  type ActivityItem,
  type DashboardTask,
  type ExecutiveKpi,
  type MonthlyScorePoint,
  type NcOriginCount,
  type OperationalMetrics,
} from "@/lib/dashboard/utils";
import {
  collectSiteAreas,
  computeModuleKpiWidgets,
  type ModuleKpiWidget,
} from "@/lib/dashboard/kpi-widgets";
import { createClient } from "@/lib/supabase/server";
import type {
  Audit,
  ControlledDocument,
  HaccpProduct,
  Nonconformity,
} from "@/types/database";

export interface ThisWeekItem {
  id: string;
  href: string;
  label: string;
  sublabel?: string;
  urgent: boolean;
}

export interface ThisWeekData {
  /** NCs abiertas (no cerradas) creadas en los últimos 7 días */
  newNcs: ThisWeekItem[];
  totalOpenNcs: number;
  /** Acciones CAPA ya vencidas */
  overdueCapaActions: ThisWeekItem[];
  /** Acciones CAPA que vencen en los próximos 7 días */
  dueSoonCapaActions: ThisWeekItem[];
  /** Monitoreos de proceso con desviación en los últimos 7 días */
  deviationRecords: ThisWeekItem[];
  /** Auditorías programadas en los próximos 14 días */
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

export async function fetchDashboardData(
  orgId: string,
  userName: string
): Promise<DashboardData> {
  const supabase = await createClient();
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthStartIso = monthStart.toISOString().split("T")[0];
  const monthEndIso = monthEnd.toISOString().split("T")[0];

  const [
    { data: productsData },
    { data: planData },
    { data: auditsData },
    { data: ncsData },
    { data: capaActionsData },
    { data: documentsData },
    { data: productionSubmissionsData },
    { data: productionTemplatesData },
  ] = await Promise.all([
    supabase
      .from("haccp_products")
      .select("id, name, plan_completion, status")
      .eq("organization_id", orgId)
      .neq("status", "archived"),
    supabase
      .from("haccp_plans")
      .select("checklist_progress")
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audits")
      .select(
        "id, title, scheduled_date, completed_date, status, compliance_score, created_at"
      )
      .eq("organization_id", orgId)
      .order("scheduled_date", { ascending: false }),
    supabase
      .from("nonconformities")
      .select(
        "id, nc_number, status, severity, origin, due_date, detected_at, created_at, closed_at, area"
      )
      .eq("organization_id", orgId)
      .order("detected_at", { ascending: false }),
    supabase
      .from("capa_actions")
      .select("id, status, due_date, description, nc_id")
      .eq("organization_id", orgId),
    supabase
      .from("controlled_documents")
      .select("id, status, next_review_date")
      .eq("organization_id", orgId),
    supabase
      .from("production_form_submissions")
      .select("id, submitted_at, status, has_deviation, area, template_id")
      .eq("organization_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(500),
    supabase
      .from("production_form_templates")
      .select("id, name, area")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  const products = (productsData ?? []) as Pick<
    HaccpProduct,
    "id" | "name" | "plan_completion" | "status"
  >[];
  const audits = (auditsData ?? []) as Audit[];
  const ncs = (ncsData ?? []) as Nonconformity[];
  const capaActions = (capaActionsData ?? []) as {
    id: string;
    status: string;
    due_date: string;
    description: string;
    nc_id: string;
  }[];
  const documents = (documentsData ?? []) as ControlledDocument[];
  const productionSubmissions = (productionSubmissionsData ?? []) as {
    id: string;
    submitted_at: string;
    status: string;
    has_deviation: boolean;
    area: string | null;
    template_id: string;
  }[];
  const productionTemplates = (productionTemplatesData ?? []) as {
    id: string;
    name: string;
    area: string | null;
  }[];

  const templateNameById = new Map(
    productionTemplates.map((t) => [t.id, t.name] as const)
  );

  const moduleWidgets = computeModuleKpiWidgets({
    productionSubmissions,
    documents,
    ncs,
    audits,
  });

  const siteAreas = collectSiteAreas(
    productionSubmissions,
    productionTemplates.map((t) => t.area)
  );

  const submissionsThisMonth = productionSubmissions.filter(
    (s) => new Date(s.submitted_at) >= monthStart
  );
  const submissionsOkThisMonth = submissionsThisMonth.filter(
    (s) => s.status === "ok" && !s.has_deviation
  );
  const recordsComplianceRate =
    submissionsThisMonth.length > 0
      ? Math.round(
          (submissionsOkThisMonth.length / submissionsThisMonth.length) * 100
        )
      : 100;

  const tasks: DashboardTask[] = [];

  for (const audit of audits) {
    const scheduled = startOfDay(new Date(audit.scheduled_date));
    if (
      isSameDayHelper(scheduled, today) &&
      (audit.status === "scheduled" || audit.status === "in_progress")
    ) {
      tasks.push({
        id: `audit-${audit.id}`,
        type: "audit",
        title: audit.title,
        subtitle: "Auditoría programada hoy",
        href: `/auditorias/${audit.id}/ejecutar`,
        urgent: false,
      });
    }
  }

  for (const nc of ncs) {
    if (nc.status === "closed" || !nc.due_date) continue;
    const due = startOfDay(new Date(nc.due_date));
    const isToday = isSameDayHelper(due, today);
    const isTomorrow = isSameDayHelper(due, tomorrow);
    if (isToday || isTomorrow) {
      tasks.push({
        id: `nc-${nc.id}`,
        type: "capa",
        title: nc.nc_number,
        subtitle: isToday ? "Vence hoy" : "Vence mañana",
        href: `/capa/${nc.id}`,
        urgent: isToday || nc.severity === "critical",
      });
    }
  }

  const planProgress = (planData as { checklist_progress?: ChecklistProgress } | null)
    ?.checklist_progress;
  const completedSteps = planProgress ? countCompletedSteps(planProgress) : 0;
  const hasNewPlan = Boolean(planData);
  const haccpComplete = hasNewPlan
    ? completedSteps
    : products.filter((p) => p.plan_completion >= 80).length;
  const haccpTotal = hasNewPlan ? 12 : products.length;
  const haccpAvg = hasNewPlan
    ? (completedSteps / 12) * 100
    : products.length > 0
      ? products.reduce((s, p) => s + p.plan_completion, 0) / products.length
      : 0;

  const openNcs = ncs.filter((nc) => nc.status !== "closed").length;
  const criticalOrOverdue = ncs.filter(
    (nc) =>
      nc.status !== "closed" &&
      (nc.severity === "critical" ||
        nc.status === "overdue" ||
        (nc.due_date && new Date(nc.due_date) < today))
  ).length;

  const auditsThisMonth = audits.filter((a) => {
    const d = a.scheduled_date;
    return d >= monthStartIso && d <= monthEndIso;
  });
  const auditsCompletedMonth = auditsThisMonth.filter(
    (a) => a.status === "completed"
  ).length;

  const overdueCapas = capaActions.filter(
    (a) =>
      a.status !== "completed" &&
      startOfDay(new Date(a.due_date)) < today
  ).length;

  const overdueNcs = ncs.filter(
    (nc) =>
      nc.status !== "closed" &&
      nc.due_date &&
      startOfDay(new Date(nc.due_date)) < today
  ).length;

  const systemScore = computeSystemScore({
    haccpAvgCompletion: haccpAvg,
    recordsCompliancePct: recordsComplianceRate,
    openNcs,
    overdueNcs,
    auditsCompleted: auditsCompletedMonth,
    auditsScheduled: auditsThisMonth.length,
  });

  const metrics: OperationalMetrics = {
    haccpComplete,
    haccpTotal,
    recordsTemplatesActive: productionTemplates.length,
    recordsSubmissionsMonth: submissionsThisMonth.length,
    openNcs,
    criticalOrOverdueNcs: criticalOrOverdue,
    auditsScheduledMonth: auditsThisMonth.length,
    auditsCompletedMonth,
    systemScore,
    overdueCapas,
  };

  const activities: ActivityItem[] = [];

  for (const sub of productionSubmissions.slice(0, 15)) {
    const name = templateNameById.get(sub.template_id) ?? "Monitoreo";
    activities.push({
      id: `registro-${sub.id}`,
      type: "registro",
      description: `Monitoreo: ${name}${sub.has_deviation ? " (desviación)" : ""}`,
      timestamp: sub.submitted_at,
      href: "/registros",
    });
  }

  for (const audit of audits.filter((a) => a.status === "completed").slice(0, 10)) {
    activities.push({
      id: `audit-${audit.id}`,
      type: "audit",
      description: `Auditoría completada: ${audit.title}`,
      timestamp: audit.completed_date ?? audit.created_at,
      href: `/auditorias/${audit.id}/informe`,
    });
  }

  for (const nc of ncs.slice(0, 10)) {
    activities.push({
      id: `nc-${nc.id}`,
      type: nc.status === "closed" ? "capa" : "nc",
      description:
        nc.status === "closed"
          ? `NC cerrada: ${nc.nc_number}`
          : `Nueva NC: ${nc.nc_number}`,
      timestamp: nc.status === "closed" ? nc.closed_at ?? nc.created_at : nc.detected_at,
      href: `/capa/${nc.id}`,
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const completedAudits = audits.filter((a) => a.status === "completed");
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const auditsLastMonth = completedAudits.filter((a) => {
    if (!a.completed_date) return false;
    const d = new Date(a.completed_date);
    return d >= lastMonthStart && d <= lastMonthEnd;
  });
  const auditsThisMonthCompleted = completedAudits.filter((a) => {
    if (!a.completed_date) return false;
    const d = new Date(a.completed_date);
    return d >= monthStart && d <= monthEnd;
  });

  const avgComplianceLastMonth =
    auditsLastMonth.length > 0
      ? auditsLastMonth.reduce((s, a) => s + Number(a.compliance_score ?? 0), 0) /
        auditsLastMonth.length
      : null;
  const avgComplianceThisMonth =
    auditsThisMonthCompleted.length > 0
      ? auditsThisMonthCompleted.reduce(
          (s, a) => s + Number(a.compliance_score ?? 0),
          0
        ) / auditsThisMonthCompleted.length
      : null;

  const avgClosure = computeAvgCapaClosureDays(ncs);
  const closedLast30 = ncs.filter((nc) => {
    if (!nc.closed_at) return false;
    return Date.now() - new Date(nc.closed_at).getTime() < 30 * 86400000;
  });
  const avgClosureRecent =
    closedLast30.length > 0
      ? computeAvgCapaClosureDays(closedLast30)
      : avgClosure;

  const originMap = new Map<string, number>();
  for (const nc of ncs) {
    originMap.set(nc.origin, (originMap.get(nc.origin) ?? 0) + 1);
  }
  const ncByOrigin: NcOriginCount[] = Array.from(originMap.entries()).map(
    ([origin, count]) => ({
      origin,
      label: getOriginLabel(origin as Nonconformity["origin"]),
      count,
    })
  );

  const kpis: ExecutiveKpi[] = [
    {
      label: "Conformidad en auditorías",
      value:
        avgComplianceThisMonth !== null
          ? `${Math.round(avgComplianceThisMonth)}%`
          : "—",
      trend:
        avgComplianceLastMonth !== null && avgComplianceThisMonth !== null
          ? avgComplianceThisMonth >= avgComplianceLastMonth
            ? "up"
            : avgComplianceThisMonth < avgComplianceLastMonth
              ? "down"
              : "flat"
          : "flat",
      trendLabel: "vs. mes anterior",
    },
    {
      label: "Tiempo cierre CAPA",
      value: avgClosureRecent !== null ? `${avgClosureRecent} días` : "—",
      trend: "flat",
      trendLabel: "promedio reciente",
    },
    {
      label: "NCs registradas",
      value: String(ncs.length),
      trend:
        ncs.filter((nc) => new Date(nc.created_at) >= monthStart).length >
        ncs.filter((nc) => {
          const d = new Date(nc.created_at);
          return d >= lastMonthStart && d <= lastMonthEnd;
        }).length
          ? "down"
          : "up",
      trendLabel: "total acumulado",
    },
    {
      label: "Monitoreo del mes",
      value: `${recordsComplianceRate}%`,
      trend:
        recordsComplianceRate >= 90
          ? "up"
          : recordsComplianceRate >= 75
            ? "flat"
            : "down",
      trendLabel: `${submissionsThisMonth.length} completados`,
    },
  ];

  // ─── "Esta semana" — computed from already-fetched data ─────────────────────
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const sevenDaysAhead = new Date(today.getTime() + 7 * 86400000);
  const fourteenDaysAhead = new Date(today.getTime() + 14 * 86400000);

  const getSeverityLabel = (s: string) =>
    s === "critical" ? "Crítica" : s === "major" ? "Mayor" : s === "minor" ? "Menor" : "Observación";
  const getStatusLabel = (s: string) =>
    s === "open" ? "Abierta" : s === "in_analysis" ? "En análisis" : s === "overdue" ? "Vencida" : s;

  // New NCs (last 7 days, not closed)
  const newNcs: ThisWeekItem[] = ncs
    .filter((nc) => nc.status !== "closed" && new Date(nc.detected_at) >= sevenDaysAgo)
    .slice(0, 5)
    .map((nc) => ({
      id: nc.id,
      href: `/capa/${nc.id}`,
      label: nc.nc_number,
      sublabel: `${getSeverityLabel(nc.severity)} · ${getStatusLabel(nc.status)}${nc.area ? ` · ${nc.area}` : ""}`,
      urgent: nc.severity === "critical" || nc.status === "overdue",
    }));

  const totalOpenNcs = ncs.filter((nc) => nc.status !== "closed").length;

  // Overdue CAPA actions (due < today, not completed)
  const overdueCapaActions: ThisWeekItem[] = capaActions
    .filter(
      (a) => a.status !== "completed" && startOfDay(new Date(a.due_date)) < today
    )
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      href: `/capa/${a.nc_id}`,
      label: a.description.length > 60 ? a.description.slice(0, 57) + "…" : a.description,
      sublabel: `Venció el ${new Date(a.due_date).toLocaleDateString("es")}`,
      urgent: true,
    }));

  // CAPA actions due soon (today → +7 days, not completed)
  const dueSoonCapaActions: ThisWeekItem[] = capaActions
    .filter((a) => {
      if (a.status === "completed") return false;
      const d = startOfDay(new Date(a.due_date));
      return d >= today && d <= sevenDaysAhead;
    })
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      href: `/capa/${a.nc_id}`,
      label: a.description.length > 60 ? a.description.slice(0, 57) + "…" : a.description,
      sublabel: `Vence el ${new Date(a.due_date).toLocaleDateString("es")}`,
      urgent: false,
    }));

  // Deviation records (last 7 days)
  const deviationRecords: ThisWeekItem[] = productionSubmissions
    .filter((s) => s.has_deviation && new Date(s.submitted_at) >= sevenDaysAgo)
    .slice(0, 5)
    .map((s) => {
      const name = templateNameById.get(s.template_id) ?? "Monitoreo";
      return {
        id: s.id,
        href: `/registros/${s.id}`,
        label: name,
        sublabel: `${new Date(s.submitted_at).toLocaleDateString("es")}${s.area ? ` · ${s.area}` : ""}`,
        urgent: true,
      };
    });

  // Upcoming audits (next 14 days, not completed/cancelled)
  const upcomingAudits: ThisWeekItem[] = audits
    .filter((a) => {
      if (a.status === "completed" || a.status === "cancelled") return false;
      const d = new Date(a.scheduled_date);
      return d >= today && d <= fourteenDaysAhead;
    })
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      href:
        a.status === "in_progress"
          ? `/auditorias/${a.id}/ejecutar`
          : `/auditorias/${a.id}/ejecutar`,
      label: a.title,
      sublabel: new Date(a.scheduled_date).toLocaleDateString("es"),
      urgent: a.status === "in_progress",
    }));

  const thisWeek: ThisWeekData = {
    newNcs,
    totalOpenNcs,
    overdueCapaActions,
    dueSoonCapaActions,
    deviationRecords,
    upcomingAudits,
  };
  // ──────────────────────────────────────────────────────────────────────────

  return {
    userName,
    tasks,
    metrics,
    activities: activities.slice(0, 10),
    globalScore: systemScore,
    kpis,
    monthlyTrend: computeMonthlyTrend(completedAudits, ncs),
    ncByOrigin,
    recordsComplianceRate,
    moduleWidgets,
    siteAreas,
    thisWeek,
  };
}

function isSameDayHelper(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
