import type { ChecklistProgress } from "@/lib/haccp-plan/types";
import {
  emptyDashboardMetrics,
  type DashboardMetricsPayload,
} from "@/lib/dashboard/metrics";

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/** Only `.from()` is used: select/eq/order/limit/gte on the PostgREST builder. */
export type MetricsFallbackClient = Pick<ServerSupabase, "from">;

export function isMissingRpcError(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const message = error.message ?? "";
  return message.includes("schema cache") || message.includes("PGRST202");
}

function utcDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfUtcIsoWeek(value: Date): Date {
  const day = value.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - offset)
  );
}

function addUtcMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

async function selectRows<T>(query: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as T[];
}

export async function loadDashboardMetricsFallback(
  supabase: MetricsFallbackClient,
  orgId: string
): Promise<DashboardMetricsPayload & { urgent_tasks: number }> {
  const now = new Date();
  const today = startOfUtcDay(now);
  const todayIso = utcDateOnly(today);
  const monthStart = startOfUtcMonth(today);
  const nextMonth = addUtcMonths(monthStart, 1);
  const lastMonthStart = addUtcMonths(monthStart, -1);
  const weekStart = startOfUtcIsoWeek(today);
  const from = weekStart < monthStart ? weekStart : monthStart;
  const fromIso = from.toISOString();
  const closedSince = new Date(now.getTime() - 30 * 86400000).toISOString();
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
  const monthStartIso = utcDateOnly(monthStart);
  const nextMonthIso = utcDateOnly(nextMonth);
  const lastMonthStartIso = utcDateOnly(lastMonthStart);
  const lastMonthEndIso = utcDateOnly(new Date(monthStart.getTime() - 86400000));
  const monthEndIso = utcDateOnly(new Date(nextMonth.getTime() - 86400000));
  const reviewSoonIso = utcDateOnly(new Date(today.getTime() + 30 * 86400000));

  const [
    plans,
    templates,
    submissions,
    ncs,
    capaActions,
    audits,
    documents,
  ] = await Promise.all([
    selectRows<{ checklist_progress: ChecklistProgress | null }>(
      supabase
        .from("haccp_plans")
        .select("checklist_progress")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(1)
    ),
    selectRows<{ is_active: boolean }>(
      supabase
        .from("production_form_templates")
        .select("is_active")
        .eq("organization_id", orgId)
    ),
    selectRows<{
      submitted_at: string;
      status: string;
      has_deviation: boolean;
    }>(
      supabase
        .from("production_form_submissions")
        .select("submitted_at, status, has_deviation")
        .eq("organization_id", orgId)
        .gte("submitted_at", fromIso)
    ),
    selectRows<{
      status: string;
      severity: string | null;
      due_date: string | null;
      created_at: string;
      closed_at: string | null;
      detected_at: string | null;
      origin: string | null;
    }>(
      supabase
        .from("nonconformities")
        .select("status, severity, due_date, created_at, closed_at, detected_at, origin")
        .eq("organization_id", orgId)
    ),
    selectRows<{ status: string; due_date: string | null }>(
      supabase
        .from("capa_actions")
        .select("status, due_date")
        .eq("organization_id", orgId)
    ),
    selectRows<{
      id: string;
      title: string;
      status: string;
      scheduled_date: string;
      completed_date: string | null;
      compliance_score: number | null;
    }>(
      supabase
        .from("audits")
        .select("id, title, status, scheduled_date, completed_date, compliance_score")
        .eq("organization_id", orgId)
    ),
    selectRows<{ status: string; next_review_date: string | null }>(
      supabase
        .from("controlled_documents")
        .select("status, next_review_date")
        .eq("organization_id", orgId)
    ),
  ]);

  const monthStartMs = monthStart.getTime();
  const nextMonthMs = nextMonth.getTime();
  const lastMonthStartMs = lastMonthStart.getTime();
  const todayMs = today.getTime();
  const weekStartMs = weekStart.getTime();

  const isOk = (row: { status: string; has_deviation: boolean }) =>
    row.status === "ok" && row.has_deviation === false;
  const monthSubs = submissions.filter(
    (row) => new Date(row.submitted_at).getTime() >= monthStartMs
  );
  const todaySubs = submissions.filter(
    (row) => new Date(row.submitted_at).getTime() >= todayMs
  );
  const weekSubs = submissions.filter(
    (row) => new Date(row.submitted_at).getTime() >= weekStartMs
  );

  const openNcs = ncs.filter((row) => row.status !== "closed");
  const overdueNcs = openNcs.filter(
    (row) => row.due_date != null && row.due_date < todayIso
  );
  const dueSoon = openNcs.filter((row) => {
    if (!row.due_date) return false;
    const endOfDue = new Date(`${row.due_date}T23:59:59.000Z`);
    return endOfDue >= now && endOfDue <= in48h;
  });

  const recentClosed = ncs.filter(
    (row) =>
      row.status === "closed" &&
      row.closed_at &&
      row.detected_at &&
      row.closed_at >= closedSince
  );
  const allClosed = ncs.filter(
    (row) => row.status === "closed" && row.closed_at && row.detected_at
  );
  const closureSource = recentClosed.length > 0 ? recentClosed : allClosed;
  const avgClosure =
    closureSource.length === 0
      ? null
      : Math.round(
          closureSource.reduce((sum, row) => {
            const days = Math.max(
              1,
              Math.round(
                (new Date(row.closed_at!).getTime() -
                  new Date(row.detected_at!).getTime()) /
                  86400000
              )
            );
            return sum + days;
          }, 0) / closureSource.length
        );

  const originCounts = new Map<string, number>();
  for (const row of ncs) {
    const origin = row.origin ?? "other";
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  }

  const monthAudits = audits.filter(
    (row) => row.scheduled_date >= monthStartIso && row.scheduled_date < nextMonthIso
  );
  const completedAudits = audits.filter(
    (row) => row.status === "completed" && row.completed_date
  );
  const lastAudits = [...completedAudits]
    .sort((a, b) => (b.completed_date ?? "").localeCompare(a.completed_date ?? ""))
    .slice(0, 2);

  const avgScore = (rows: { compliance_score: number | null }[]) => {
    const scores = rows
      .map((row) => row.compliance_score)
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (scores.length === 0) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  };

  const published = documents.filter((row) => row.status === "published");
  const monthly: DashboardMetricsPayload["monthly"] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const start = addUtcMonths(monthStart, -i);
    const end = addUtcMonths(start, 1);
    const startIso = utcDateOnly(start);
    const endIso = utcDateOnly(end);
    monthly.push({
      ym: startIso.slice(0, 7),
      audit_avg: avgScore(
        completedAudits.filter(
          (row) =>
            row.completed_date &&
            row.completed_date >= startIso &&
            row.completed_date < endIso
        )
      ),
      nc_count: ncs.filter((row) => {
        const created = row.created_at.slice(0, 10);
        return created >= startIso && created < endIso;
      }).length,
    });
  }

  const payload = emptyDashboardMetrics();
  payload.ok = true;
  payload.haccp_checklist_progress = plans[0]?.checklist_progress ?? null;
  payload.records_templates_active = templates.filter((row) => row.is_active).length;
  payload.submissions = {
    month_total: monthSubs.length,
    month_ok: monthSubs.filter(isOk).length,
    today_total: todaySubs.length,
    today_ok: todaySubs.filter(isOk).length,
    week_total: weekSubs.length,
    week_ok: weekSubs.filter(isOk).length,
  };
  payload.ncs = {
    total: ncs.length,
    open: openNcs.length,
    overdue: overdueNcs.length,
    critical_or_overdue: openNcs.filter(
      (row) =>
        row.severity === "critical" ||
        row.status === "overdue" ||
        (row.due_date != null && row.due_date < todayIso)
    ).length,
    due_soon_48h: dueSoon.length,
    critical_open: openNcs.filter((row) => row.severity === "critical").length,
    this_month: ncs.filter((row) => {
      const created = new Date(row.created_at).getTime();
      return created >= monthStartMs && created < nextMonthMs;
    }).length,
    last_month: ncs.filter((row) => {
      const created = new Date(row.created_at).getTime();
      return created >= lastMonthStartMs && created < monthStartMs;
    }).length,
  };
  payload.avg_closure_days = avgClosure;
  payload.nc_by_origin = [...originCounts.entries()]
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count);
  payload.overdue_capa_actions = capaActions.filter(
    (row) => row.status !== "completed" && row.due_date != null && row.due_date < todayIso
  ).length;
  payload.audits_month = {
    scheduled: monthAudits.length,
    completed: monthAudits.filter((row) => row.status === "completed").length,
  };
  payload.audit_compliance = {
    this_month: avgScore(
      completedAudits.filter(
        (row) =>
          row.completed_date &&
          row.completed_date >= monthStartIso &&
          row.completed_date <= monthEndIso
      )
    ),
    last_month: avgScore(
      completedAudits.filter(
        (row) =>
          row.completed_date &&
          row.completed_date >= lastMonthStartIso &&
          row.completed_date <= lastMonthEndIso
      )
    ),
  };
  payload.last_audits = lastAudits.map((row) => ({
    id: row.id,
    title: row.title,
    compliance_score: row.compliance_score,
    completed_date: row.completed_date ?? "",
  }));
  payload.documents = {
    review_overdue: published.filter(
      (row) => row.next_review_date != null && row.next_review_date < todayIso
    ).length,
    review_due_soon: published.filter(
      (row) =>
        row.next_review_date != null &&
        row.next_review_date >= todayIso &&
        row.next_review_date <= reviewSoonIso
    ).length,
  };
  payload.monthly = monthly;
  payload.site_areas = [];
  return {
    ...payload,
    urgent_tasks: kioskUrgentTasks(ncs, todayIso),
  };
}

export function kioskUrgentTasks(
  ncs: { status: string; due_date: string | null; severity: string | null }[],
  todayIso: string
): number {
  const tomorrow = new Date(`${todayIso}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowIso = utcDateOnly(tomorrow);
  return ncs.filter(
    (row) =>
      row.status !== "closed" &&
      row.due_date != null &&
      (row.due_date === todayIso ||
        (row.due_date === tomorrowIso && row.severity === "critical"))
  ).length;
}

