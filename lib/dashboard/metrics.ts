import type { ChecklistProgress } from "@/lib/haccp-plan/types";

export interface SubmissionAggregates {
  month_total: number;
  month_ok: number;
  today_total: number;
  today_ok: number;
  week_total: number;
  week_ok: number;
}

export interface NcAggregates {
  total: number;
  open: number;
  overdue: number;
  critical_or_overdue: number;
  due_soon_48h: number;
  critical_open: number;
  this_month: number;
  last_month: number;
}

export interface LastAuditRow {
  id: string;
  title: string;
  compliance_score: number | null;
  completed_date: string;
}

export interface DashboardMetricsPayload {
  ok: boolean;
  reason?: string;
  haccp_checklist_progress: ChecklistProgress | null;
  records_templates_active: number;
  submissions: SubmissionAggregates;
  ncs: NcAggregates;
  avg_closure_days: number | null;
  nc_by_origin: { origin: string; count: number }[];
  overdue_capa_actions: number;
  audits_month: { scheduled: number; completed: number };
  audit_compliance: { this_month: number | null; last_month: number | null };
  last_audits: LastAuditRow[];
  documents: { review_overdue: number; review_due_soon: number };
  monthly: { ym: string; audit_avg: number | null; nc_count: number }[];
  site_areas: string[];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function emptyDashboardMetrics(): DashboardMetricsPayload {
  return {
    ok: false,
    haccp_checklist_progress: null,
    records_templates_active: 0,
    submissions: {
      month_total: 0,
      month_ok: 0,
      today_total: 0,
      today_ok: 0,
      week_total: 0,
      week_ok: 0,
    },
    ncs: {
      total: 0,
      open: 0,
      overdue: 0,
      critical_or_overdue: 0,
      due_soon_48h: 0,
      critical_open: 0,
      this_month: 0,
      last_month: 0,
    },
    avg_closure_days: null,
    nc_by_origin: [],
    overdue_capa_actions: 0,
    audits_month: { scheduled: 0, completed: 0 },
    audit_compliance: { this_month: null, last_month: null },
    last_audits: [],
    documents: { review_overdue: 0, review_due_soon: 0 },
    monthly: [],
    site_areas: [],
  };
}

export function parseDashboardMetrics(raw: unknown): DashboardMetricsPayload {
  const empty = emptyDashboardMetrics();
  if (!raw || typeof raw !== "object") return empty;
  const row = raw as Record<string, unknown>;
  const submissions = (row.submissions ?? {}) as Record<string, unknown>;
  const ncs = (row.ncs ?? {}) as Record<string, unknown>;
  const auditsMonth = (row.audits_month ?? {}) as Record<string, unknown>;
  const compliance = (row.audit_compliance ?? {}) as Record<string, unknown>;
  const documents = (row.documents ?? {}) as Record<string, unknown>;

  return {
    ok: row.ok === true,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    haccp_checklist_progress:
      row.haccp_checklist_progress && typeof row.haccp_checklist_progress === "object"
        ? (row.haccp_checklist_progress as ChecklistProgress)
        : null,
    records_templates_active: asNumber(row.records_templates_active),
    submissions: {
      month_total: asNumber(submissions.month_total),
      month_ok: asNumber(submissions.month_ok),
      today_total: asNumber(submissions.today_total),
      today_ok: asNumber(submissions.today_ok),
      week_total: asNumber(submissions.week_total),
      week_ok: asNumber(submissions.week_ok),
    },
    ncs: {
      total: asNumber(ncs.total),
      open: asNumber(ncs.open),
      overdue: asNumber(ncs.overdue),
      critical_or_overdue: asNumber(ncs.critical_or_overdue),
      due_soon_48h: asNumber(ncs.due_soon_48h),
      critical_open: asNumber(ncs.critical_open),
      this_month: asNumber(ncs.this_month),
      last_month: asNumber(ncs.last_month),
    },
    avg_closure_days: asNullableNumber(row.avg_closure_days),
    nc_by_origin: Array.isArray(row.nc_by_origin)
      ? row.nc_by_origin.map((item) => {
          const entry = item as { origin?: string; count?: unknown };
          return { origin: String(entry.origin ?? "other"), count: asNumber(entry.count) };
        })
      : [],
    overdue_capa_actions: asNumber(row.overdue_capa_actions),
    audits_month: {
      scheduled: asNumber(auditsMonth.scheduled),
      completed: asNumber(auditsMonth.completed),
    },
    audit_compliance: {
      this_month: asNullableNumber(compliance.this_month),
      last_month: asNullableNumber(compliance.last_month),
    },
    last_audits: Array.isArray(row.last_audits)
      ? row.last_audits.map((item) => {
          const audit = item as LastAuditRow;
          return {
            id: String(audit.id),
            title: String(audit.title ?? ""),
            compliance_score: asNullableNumber(audit.compliance_score),
            completed_date: String(audit.completed_date ?? ""),
          };
        })
      : [],
    documents: {
      review_overdue: asNumber(documents.review_overdue),
      review_due_soon: asNumber(documents.review_due_soon),
    },
    monthly: Array.isArray(row.monthly)
      ? row.monthly.map((item) => {
          const point = item as { ym?: string; audit_avg?: unknown; nc_count?: unknown };
          return {
            ym: String(point.ym ?? ""),
            audit_avg: asNullableNumber(point.audit_avg),
            nc_count: asNumber(point.nc_count),
          };
        })
      : [],
    site_areas: Array.isArray(row.site_areas)
      ? row.site_areas.map((area) => String(area)).filter(Boolean)
      : [],
  };
}

export function recordsComplianceRate(submissions: SubmissionAggregates): number {
  if (submissions.month_total <= 0) return 100;
  return Math.round((submissions.month_ok / submissions.month_total) * 100);
}
