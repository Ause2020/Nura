import { STEP_CHECKLISTS, stepChecklistStats } from "@/lib/haccp-plan/checklists";
import { STEP_META } from "@/lib/haccp-plan/constants";
import type { ChecklistProgress, HazardRow } from "@/lib/haccp-plan/types";
import { isDueWithinHours, isPastDue } from "@/lib/capa/utils";
import { daysBetween, periodDateInSantiago } from "@/lib/ai-insights/period";
import type { InsightDbClient } from "@/lib/ai-insights/db";
import type {
  MonitoreoTrend,
  QualitySnapshot,
  WindowStats,
} from "@/lib/ai-insights/types";

const HACCP_TRAINING_VALIDITY_DAYS = 365;
const STUCK_NC_DAYS = 14;

function emptyWindow(): WindowStats {
  return { total: 0, conforming: 0, nonConforming: 0, compliancePct: 100 };
}

function windowStats(
  rows: { conforms: boolean | null }[]
): WindowStats {
  const total = rows.length;
  const conforming = rows.filter((r) => r.conforms === true).length;
  const nonConforming = rows.filter((r) => r.conforms === false).length;
  return {
    total,
    conforming,
    nonConforming,
    compliancePct: total > 0 ? Math.round((conforming / total) * 100) : 100,
  };
}

function submissionWindow(
  rows: { status: string; has_deviation: boolean }[]
) {
  const total = rows.length;
  const deviations = rows.filter((r) => r.has_deviation || r.status === "deviation").length;
  const ok = rows.filter((r) => r.status === "ok" && !r.has_deviation).length;
  return {
    total,
    ok,
    deviations,
    compliancePct: total > 0 ? Math.round((ok / total) * 100) : 100,
  };
}

function deriveTrend(
  current: { total: number; compliancePct: number },
  previous: { total: number; compliancePct: number }
): MonitoreoTrend {
  if (current.total === 0 && previous.total === 0) return "insufficient";
  if (current.total === 0 && previous.total > 0) return "worsening";
  if (previous.total === 0) return current.compliancePct >= 90 ? "stable" : "insufficient";
  const delta = current.compliancePct - previous.compliancePct;
  if (delta <= -8) return "worsening";
  if (delta >= 8) return "improving";
  return "stable";
}

function countBy(items: string[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const key of items) {
    acc[key] = (acc[key] ?? 0) + 1;
  }
  return acc;
}

export async function collectQualitySnapshot(
  organizationId: string,
  client: InsightDbClient
): Promise<QualitySnapshot> {
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(now.getDate() - 7);
  const d14 = new Date(now);
  d14.setDate(now.getDate() - 14);
  const d30 = new Date(now);
  d30.setDate(now.getDate() - 30);

  const iso7 = d7.toISOString();
  const iso14 = d14.toISOString();
  const iso30 = d30.toISOString();

  const [
    planRes,
    ncsRes,
    pccRes,
    submissionsRes,
    stepDataRes,
    completionsRes,
    coursesRes,
    profilesRes,
  ] = await Promise.all([
    client
      .from("haccp_plans")
      .select("id, name, status, current_step, checklist_progress")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("nonconformities")
      .select(
        "id, nc_number, status, severity, origin, capa_stage, due_date, detected_at, created_at, closed_at"
      )
      .eq("organization_id", organizationId)
      .order("detected_at", { ascending: false })
      .limit(200),
    client
      .from("haccp_monitoring_records")
      .select("id, pcc_reference_id, recorded_at, parameter, measured_value, conforms")
      .eq("organization_id", organizationId)
      .gte("recorded_at", iso30)
      .order("recorded_at", { ascending: false })
      .limit(400),
    client
      .from("production_form_submissions")
      .select("id, submitted_at, status, has_deviation")
      .eq("organization_id", organizationId)
      .gte("submitted_at", iso14)
      .order("submitted_at", { ascending: false })
      .limit(400),
    client
      .from("haccp_step_data")
      .select("step_id, data")
      .eq("organization_id", organizationId)
      .in("step_id", [7, 8, 9]),
    client
      .from("training_completions")
      .select("user_id, course_id, valid_until, passed")
      .eq("organization_id", organizationId)
      .eq("passed", true),
    client
      .from("training_courses")
      .select("id, title")
      .eq("organization_id", organizationId),
    client
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", organizationId),
  ]);

  const plan = (planRes.data ?? null) as {
    id: string;
    name: string;
    status: string;
    current_step: number;
    checklist_progress: ChecklistProgress;
  } | null;

  let team: QualitySnapshot["haccp"]["team"] = [];
  let productsCount = 0;
  let hazardsCount = 0;
  let significantHazards = 0;
  let validationSigned = false;

  if (plan) {
    const [teamRes, productsRes, hazardsRes, validationRes] = await Promise.all([
      client
        .from("haccp_teams")
        .select("name, role, training_date, training_evidence")
        .eq("plan_id", plan.id),
      client.from("haccp_plan_products").select("id").eq("plan_id", plan.id),
      client
        .from("haccp_plan_hazards")
        .select("id, severity, probability")
        .eq("plan_id", plan.id),
      client
        .from("haccp_validations")
        .select("validated_at")
        .eq("plan_id", plan.id)
        .maybeSingle(),
    ]);

    team = ((teamRes.data ?? []) as {
      name: string;
      role: string;
      training_date: string | null;
      training_evidence: unknown;
    }[]).map((member) => {
      const trainingDate = member.training_date;
      const age = trainingDate ? daysBetween(trainingDate, now) : null;
      return {
        name: member.name || "Sin nombre",
        role: member.role || "",
        trainingDate,
        missingTraining: !trainingDate,
        trainingExpired: age !== null && age > HACCP_TRAINING_VALIDITY_DAYS,
        missingEvidence: !member.training_evidence,
      };
    });

    productsCount = (productsRes.data ?? []).length;
    const hazards = (hazardsRes.data ?? []) as {
      severity?: number;
      probability?: number;
    }[];
    hazardsCount = hazards.length;
    significantHazards = hazards.filter((h) => {
      const score = (h.severity ?? 0) * (h.probability ?? 0);
      return score >= 9;
    }).length;
    validationSigned = Boolean(
      (validationRes.data as { validated_at?: string | null } | null)?.validated_at
    );
  }

  const progress = plan?.checklist_progress ?? {};
  const incompleteSteps = Object.keys(STEP_CHECKLISTS)
    .map(Number)
    .map((step) => {
      const stats = stepChecklistStats(step, progress);
      const items = STEP_CHECKLISTS[step] ?? [];
      const stepProgress = progress[String(step)] ?? {};
      const missingItems = items.filter((_, index) => stepProgress[String(index)] !== true);
      return {
        step,
        title: STEP_META.find((s) => s.id === step)?.title ?? `Paso ${step}`,
        missingItems,
        done: stats.done,
        total: stats.total,
      };
    })
    .filter((s) => s.missingItems.length > 0)
    .map(({ step, title, missingItems }) => ({ step, title, missingItems }));

  const completedSteps = Object.keys(STEP_CHECKLISTS).filter((id) => {
    const stats = stepChecklistStats(Number(id), progress);
    return stats.total > 0 && stats.done === stats.total;
  }).length;

  const stepRows = (stepDataRes.data ?? []) as { step_id: number; data: unknown }[];
  const step7 = stepRows.find((r) => r.step_id === 7)?.data as
    | { hazards?: HazardRow[] }
    | undefined;
  const step8 = stepRows.find((r) => r.step_id === 8)?.data as
    | { criticalLimits?: { hazardId: string }[] }
    | undefined;
  const step9 = stepRows.find((r) => r.step_id === 9)?.data as
    | { monitoringPlans?: { hazardId: string; pccNumber?: number }[] }
    | undefined;

  const ccpHazards = (step7?.hazards ?? []).filter((h) => h.isCCP);
  const ccpCount = ccpHazards.length;
  const limitsDefined = step8?.criticalLimits?.length ?? 0;
  const monitoringPlansDefined = step9?.monitoringPlans?.length ?? 0;

  const pccRows = (pccRes.data ?? []) as {
    pcc_reference_id: string;
    recorded_at: string;
    parameter: string;
    measured_value: string;
    conforms: boolean | null;
  }[];

  const pcc7 = pccRows.filter((r) => new Date(r.recorded_at) >= d7);
  const pccPrev7 = pccRows.filter(
    (r) => new Date(r.recorded_at) >= d14 && new Date(r.recorded_at) < d7
  );

  const pccRecords7d = windowStats(pcc7);
  const pccRecordsPrev7d = windowStats(pccPrev7);
  const pccRecords30d = windowStats(pccRows);

  const recordedPccIds = new Set(pcc7.map((r) => r.pcc_reference_id));
  const pccsWithoutRecentRecords = ccpHazards
    .filter((h) => !recordedPccIds.has(h.id))
    .map((h) => h.processStep || h.description || `PCC ${h.id.slice(0, 6)}`)
    .slice(0, 8);

  const submissions = (submissionsRes.data ?? []) as {
    submitted_at: string;
    status: string;
    has_deviation: boolean;
  }[];
  const sub7 = submissions.filter((s) => new Date(s.submitted_at) >= d7);
  const subPrev7 = submissions.filter(
    (s) => new Date(s.submitted_at) >= d14 && new Date(s.submitted_at) < d7
  );
  const submissions7d = submissionWindow(sub7);
  const submissionsPrev7d = submissionWindow(subPrev7);

  const combinedCurrent = {
    total: pccRecords7d.total + submissions7d.total,
    compliancePct:
      pccRecords7d.total + submissions7d.total > 0
        ? Math.round(
            ((pccRecords7d.conforming + submissions7d.ok) /
              (pccRecords7d.total + submissions7d.total)) *
              100
          )
        : 100,
  };
  const combinedPrev = {
    total: pccRecordsPrev7d.total + submissionsPrev7d.total,
    compliancePct:
      pccRecordsPrev7d.total + submissionsPrev7d.total > 0
        ? Math.round(
            ((pccRecordsPrev7d.conforming + submissionsPrev7d.ok) /
              (pccRecordsPrev7d.total + submissionsPrev7d.total)) *
              100
          )
        : 100,
  };

  const recentDeviations = [
    ...pcc7
      .filter((r) => r.conforms === false)
      .map((r) => ({
        date: r.recorded_at,
        parameter: r.parameter || "PCC",
        value: r.measured_value || "",
        source: "pcc" as const,
      })),
    ...sub7
      .filter((s) => s.has_deviation || s.status === "deviation")
      .map((s) => ({
        date: s.submitted_at,
        parameter: "Formulario de producción",
        value: "desviación",
        source: "form" as const,
      })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const ncs = (ncsRes.data ?? []) as {
    id: string;
    nc_number: string;
    status: string;
    severity: string;
    origin: string;
    capa_stage: string | null;
    due_date: string | null;
    detected_at: string;
    created_at: string;
    closed_at: string | null;
  }[];

  const openNcs = ncs.filter((nc) => nc.status !== "closed");
  const overdueItems = openNcs
    .filter((nc) => isPastDue(nc.due_date, nc.status as never) || nc.status === "overdue")
    .map((nc) => ({
      id: nc.id,
      number: nc.nc_number,
      dueDate: nc.due_date ?? "",
      severity: nc.severity,
    }));

  const stuck = openNcs
    .map((nc) => {
      const daysOpen = daysBetween(nc.detected_at || nc.created_at, now);
      return {
        id: nc.id,
        number: nc.nc_number,
        stage: nc.capa_stage ?? "identification",
        daysOpen,
        severity: nc.severity,
      };
    })
    .filter((nc) => nc.daysOpen >= STUCK_NC_DAYS)
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .slice(0, 6);

  const avgOpenAgeDays =
    openNcs.length > 0
      ? Math.round(
          openNcs.reduce(
            (sum, nc) => sum + daysBetween(nc.detected_at || nc.created_at, now),
            0
          ) / openNcs.length
        )
      : 0;

  const nameByUser = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [
      p.id,
      p.full_name,
    ])
  );
  const titleByCourse = new Map(
    ((coursesRes.data ?? []) as { id: string; title: string }[]).map((c) => [
      c.id,
      c.title,
    ])
  );

  const latestByUserCourse = new Map<
    string,
    { user_id: string; course_id: string; valid_until: string | null }
  >();
  for (const row of (completionsRes.data ?? []) as {
    user_id: string;
    course_id: string;
    valid_until: string | null;
  }[]) {
    if (!row.valid_until) continue;
    const key = `${row.user_id}:${row.course_id}`;
    const existing = latestByUserCourse.get(key);
    if (!existing || row.valid_until > (existing.valid_until ?? "")) {
      latestByUserCourse.set(key, row);
    }
  }

  const expiredCompletions: QualitySnapshot["training"]["expiredCompletions"] = [];
  const expiringSoon: QualitySnapshot["training"]["expiringSoon"] = [];
  for (const row of Array.from(latestByUserCourse.values())) {
    if (!row.valid_until) continue;
    const days = daysBetween(row.valid_until, now);
    const item = {
      userName: nameByUser.get(row.user_id) ?? "Colaborador",
      courseTitle: titleByCourse.get(row.course_id) ?? "Curso",
      validUntil: row.valid_until,
    };
    if (days > 0) expiredCompletions.push(item);
    else if (days >= -30) expiringSoon.push(item);
  }

  return {
    generatedAt: now.toISOString(),
    periodDate: periodDateInSantiago(now),
    haccp: {
      hasPlan: Boolean(plan),
      name: plan?.name ?? "Plan HACCP",
      status: plan?.status ?? "draft",
      currentStep: plan?.current_step ?? 1,
      completedSteps,
      incompleteSteps,
      productsCount,
      hazardsCount,
      significantHazards,
      ccpCount,
      limitsDefined,
      monitoringPlansDefined,
      validationSigned,
      team,
    },
    monitoreo: {
      pccRecords7d,
      pccRecordsPrev7d,
      pccRecords30d,
      submissions7d,
      submissionsPrev7d,
      trend: deriveTrend(combinedCurrent, combinedPrev),
      pccsWithoutRecentRecords,
      recentDeviations,
    },
    ncs: {
      open: openNcs.length,
      overdue: overdueItems.length,
      criticalOpen: openNcs.filter((nc) => nc.severity === "critical").length,
      dueSoon: openNcs.filter(
        (nc) =>
          !isPastDue(nc.due_date, nc.status as never) &&
          isDueWithinHours(nc.due_date, 48)
      ).length,
      closed30d: ncs.filter(
        (nc) => nc.status === "closed" && nc.closed_at && new Date(nc.closed_at) >= d30
      ).length,
      avgOpenAgeDays,
      byStatus: countBy(ncs.map((nc) => nc.status)),
      byStage: countBy(openNcs.map((nc) => nc.capa_stage ?? "identification")),
      byOrigin: countBy(ncs.filter((nc) => nc.status !== "closed").map((nc) => nc.origin)),
      stuck,
      overdueItems,
    },
    training: {
      expiredCompletions: expiredCompletions.slice(0, 8),
      expiringSoon: expiringSoon.slice(0, 8),
    },
  };
}
