import { countCompletedSteps } from "@/lib/haccp-plan/checklists";
import type { ChecklistProgress } from "@/lib/haccp-plan/types";
import { computeSystemScore } from "@/lib/dashboard/utils";
import type { ModuleKpiWidget } from "@/lib/dashboard/kpi-widgets";
import {
  isMissingRpcError,
  loadDashboardMetricsFallback,
} from "@/lib/dashboard/metrics-fallback";

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

export interface KioskSnapshot {
  widgets: ModuleKpiWidget[];
  globalScore: number;
  urgentTasks: number;
  recordsComplianceRate: number;
}

interface KioskSubmissions {
  month_total: number;
  month_ok: number;
  today_total: number;
  today_ok: number;
  week_total: number;
  week_ok: number;
}

interface KioskNcs {
  open: number;
  overdue: number;
  due_soon_48h: number;
  critical_open: number;
  urgent_tasks: number;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statusFromThresholds(
  value: number,
  greenMin: number,
  yellowMin: number
): ModuleKpiWidget["status"] {
  if (value >= greenMin) return "success";
  if (value >= yellowMin) return "warning";
  return "danger";
}

function parseSubmissions(raw: unknown): KioskSubmissions {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    month_total: asNumber(row.month_total),
    month_ok: asNumber(row.month_ok),
    today_total: asNumber(row.today_total),
    today_ok: asNumber(row.today_ok),
    week_total: asNumber(row.week_total),
    week_ok: asNumber(row.week_ok),
  };
}

function parseNcs(raw: unknown): KioskNcs {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    open: asNumber(row.open),
    overdue: asNumber(row.overdue),
    due_soon_48h: asNumber(row.due_soon_48h),
    critical_open: asNumber(row.critical_open),
    urgent_tasks: asNumber(row.urgent_tasks),
  };
}

export function emptyKioskSnapshot(): KioskSnapshot {
  return {
    widgets: buildKioskWidgets(
      {
        month_total: 0,
        month_ok: 0,
        today_total: 0,
        today_ok: 0,
        week_total: 0,
        week_ok: 0,
      },
      { open: 0, overdue: 0, due_soon_48h: 0, critical_open: 0, urgent_tasks: 0 }
    ),
    globalScore: 100,
    urgentTasks: 0,
    recordsComplianceRate: 100,
  };
}

function buildKioskWidgets(
  submissions: KioskSubmissions,
  ncs: KioskNcs
): ModuleKpiWidget[] {
  const todayPct =
    submissions.today_total > 0
      ? Math.round((submissions.today_ok / submissions.today_total) * 100)
      : 100;
  const weekPct =
    submissions.week_total > 0
      ? Math.round((submissions.week_ok / submissions.week_total) * 100)
      : 100;

  return [
    {
      id: "production",
      label: "Monitoreo",
      value: `${todayPct}%`,
      subtitle: `Hoy ${submissions.today_ok}/${submissions.today_total || 0} · Semana ${weekPct}% (${submissions.week_ok}/${submissions.week_total || 0})`,
      status: statusFromThresholds(todayPct, 90, 70),
      href: "/registros",
      kiosk: true,
    },
    {
      id: "capa",
      label: "CAPA / NC",
      value: String(ncs.open),
      subtitle: `${ncs.overdue} vencidas · ${ncs.due_soon_48h} por vencer · ${ncs.critical_open} críticas`,
      status:
        ncs.overdue > 0 || ncs.critical_open > 0
          ? "danger"
          : ncs.due_soon_48h > 0
            ? "warning"
            : "success",
      href: "/capa",
      kiosk: true,
    },
  ];
}

export function snapshotFromKioskRpc(raw: unknown): KioskSnapshot {
  if (!raw || typeof raw !== "object") return emptyKioskSnapshot();
  const row = raw as Record<string, unknown>;
  const submissions = parseSubmissions(row.submissions);
  const ncs = parseNcs(row.ncs);
  const audits = (row.audits_month ?? {}) as Record<string, unknown>;
  const progress =
    row.haccp_checklist_progress && typeof row.haccp_checklist_progress === "object"
      ? (row.haccp_checklist_progress as ChecklistProgress)
      : null;
  const completedSteps = progress ? countCompletedSteps(progress) : 0;
  const complianceRate =
    submissions.month_total > 0
      ? Math.round((submissions.month_ok / submissions.month_total) * 100)
      : 100;

  return {
    widgets: buildKioskWidgets(submissions, ncs),
    globalScore: computeSystemScore({
      haccpAvgCompletion: (completedSteps / 12) * 100,
      recordsCompliancePct: complianceRate,
      openNcs: ncs.open,
      overdueNcs: ncs.overdue,
      auditsCompleted: asNumber(audits.completed),
      auditsScheduled: asNumber(audits.scheduled),
    }),
    urgentTasks: ncs.urgent_tasks,
    recordsComplianceRate: complianceRate,
  };
}

export async function loadKioskSnapshot(
  supabase: Pick<ServerSupabase, "from" | "rpc">,
  orgId: string
): Promise<KioskSnapshot> {
  const { data, error } = await supabase.rpc("get_kiosk_metrics");
  if (!error) {
    return snapshotFromKioskRpc(data);
  }
  if (!isMissingRpcError(error)) {
    throw new Error(
      error.message ||
        "No se pudieron cargar los indicadores del kiosco (aplica 040_kiosk_metrics.sql)"
    );
  }

  const metrics = await loadDashboardMetricsFallback(supabase, orgId);
  return snapshotFromKioskRpc({
    ok: true,
    haccp_checklist_progress: metrics.haccp_checklist_progress,
    submissions: metrics.submissions,
    ncs: {
      ...metrics.ncs,
      urgent_tasks: metrics.urgent_tasks,
    },
    audits_month: metrics.audits_month,
  });
}
