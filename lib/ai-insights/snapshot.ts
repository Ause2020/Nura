import { STEP_CHECKLISTS, stepChecklistStats } from "@/lib/haccp-plan/checklists";
import { STEP_META } from "@/lib/haccp-plan/constants";
import type { ChecklistProgress, HazardRow } from "@/lib/haccp-plan/types";
import { isPastDue } from "@/lib/capa/utils";
import { daysBetween, periodDateInSantiago } from "@/lib/ai-insights/period";
import type { InsightDbClient } from "@/lib/ai-insights/db";
import type {
  MonitoreoTrend,
  QualitySnapshot,
  WindowStats,
} from "@/lib/ai-insights/types";

const HACCP_TRAINING_VALIDITY_DAYS = 365;
const STUCK_NC_DAYS = 14;

function windowFromCounts(total: number, conforming: number, nonConforming: number): WindowStats {
  return {
    total,
    conforming,
    nonConforming,
    compliancePct: total > 0 ? Math.round((conforming / total) * 100) : 100,
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

async function countExact(
  client: InsightDbClient,
  table: string,
  apply: (query: ReturnType<InsightDbClient["from"]>) => Promise<{ count: number | null }>
): Promise<number> {
  const query = client.from(table).select("id", { count: "exact", head: true });
  const { count } = await apply(query);
  return count ?? 0;
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
  const stuckBefore = new Date(now);
  stuckBefore.setDate(now.getDate() - STUCK_NC_DAYS);

  const iso7 = d7.toISOString();
  const iso14 = d14.toISOString();
  const iso30 = d30.toISOString();
  const todayIso = now.toISOString().slice(0, 10);
  const soonIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString().slice(0, 10);

  const [
    planRes,
    stepDataRes,
    openNcsRes,
    overdueNcsRes,
    stuckNcsRes,
    openCount,
    overdueCount,
    criticalCount,
    dueSoonCount,
    closed30d,
    pcc7Total,
    pcc7Ok,
    pcc7Bad,
    pccPrevTotal,
    pccPrevOk,
    pccPrevBad,
    pcc30Total,
    pcc30Ok,
    pcc30Bad,
    pccIdsRes,
    pccDevRes,
    sub7Total,
    sub7Ok,
    sub7Dev,
    subPrevTotal,
    subPrevOk,
    subPrevDev,
    subDevRes,
  ] = await Promise.all([
    client
      .from("haccp_plans")
      .select("id, name, status, current_step, checklist_progress")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("haccp_step_data")
      .select("step_id, data")
      .eq("organization_id", organizationId)
      .in("step_id", [7, 8, 9]),
    client
      .from("nonconformities")
      .select("status, severity, origin, capa_stage, due_date, detected_at, created_at")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .limit(150),
    client
      .from("nonconformities")
      .select("id, nc_number, due_date, severity, status")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .or(`status.eq.overdue,due_date.lt.${todayIso}`)
      .limit(8),
    client
      .from("nonconformities")
      .select("id, nc_number, capa_stage, detected_at, created_at, severity")
      .eq("organization_id", organizationId)
      .neq("status", "closed")
      .lte("detected_at", stuckBefore.toISOString())
      .order("detected_at", { ascending: true })
      .limit(6),
    countExact(client, "nonconformities", (q) =>
      q.eq("organization_id", organizationId).neq("status", "closed")
    ),
    countExact(client, "nonconformities", (q) =>
      q
        .eq("organization_id", organizationId)
        .neq("status", "closed")
        .or(`status.eq.overdue,due_date.lt.${todayIso}`)
    ),
    countExact(client, "nonconformities", (q) =>
      q
        .eq("organization_id", organizationId)
        .neq("status", "closed")
        .eq("severity", "critical")
    ),
    countExact(client, "nonconformities", (q) =>
      q
        .eq("organization_id", organizationId)
        .neq("status", "closed")
        .gte("due_date", todayIso)
        .lte("due_date", soonIso)
    ),
    countExact(client, "nonconformities", (q) =>
      q
        .eq("organization_id", organizationId)
        .eq("status", "closed")
        .gte("closed_at", iso30)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q.eq("organization_id", organizationId).gte("recorded_at", iso7)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso7)
        .eq("conforms", true)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso7)
        .eq("conforms", false)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso14)
        .lt("recorded_at", iso7)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso14)
        .lt("recorded_at", iso7)
        .eq("conforms", true)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso14)
        .lt("recorded_at", iso7)
        .eq("conforms", false)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q.eq("organization_id", organizationId).gte("recorded_at", iso30)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso30)
        .eq("conforms", true)
    ),
    countExact(client, "haccp_monitoring_records", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("recorded_at", iso30)
        .eq("conforms", false)
    ),
    client
      .from("haccp_monitoring_records")
      .select("pcc_reference_id")
      .eq("organization_id", organizationId)
      .gte("recorded_at", iso7)
      .limit(80),
    client
      .from("haccp_monitoring_records")
      .select("recorded_at, parameter, measured_value")
      .eq("organization_id", organizationId)
      .eq("conforms", false)
      .gte("recorded_at", iso7)
      .order("recorded_at", { ascending: false })
      .limit(5),
    countExact(client, "production_form_submissions", (q) =>
      q.eq("organization_id", organizationId).gte("submitted_at", iso7)
    ),
    countExact(client, "production_form_submissions", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("submitted_at", iso7)
        .eq("status", "ok")
        .eq("has_deviation", false)
    ),
    countExact(client, "production_form_submissions", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("submitted_at", iso7)
        .or("has_deviation.eq.true,status.eq.deviation")
    ),
    countExact(client, "production_form_submissions", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("submitted_at", iso14)
        .lt("submitted_at", iso7)
    ),
    countExact(client, "production_form_submissions", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("submitted_at", iso14)
        .lt("submitted_at", iso7)
        .eq("status", "ok")
        .eq("has_deviation", false)
    ),
    countExact(client, "production_form_submissions", (q) =>
      q
        .eq("organization_id", organizationId)
        .gte("submitted_at", iso14)
        .lt("submitted_at", iso7)
        .or("has_deviation.eq.true,status.eq.deviation")
    ),
    client
      .from("production_form_submissions")
      .select("submitted_at")
      .eq("organization_id", organizationId)
      .eq("has_deviation", true)
      .gte("submitted_at", iso7)
      .order("submitted_at", { ascending: false })
      .limit(5),
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
      client
        .from("haccp_plan_products")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id),
      client
        .from("haccp_plan_hazards")
        .select("severity, probability")
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
    }[])
      .map((member) => {
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
      })
      .filter((member) => member.missingTraining || member.trainingExpired);

    productsCount = productsRes.count ?? 0;
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

  const recordedPccIds = new Set(
    ((pccIdsRes.data ?? []) as { pcc_reference_id: string }[]).map((r) => r.pcc_reference_id)
  );
  const pccsWithoutRecentRecords = ccpHazards
    .filter((h) => !recordedPccIds.has(h.id))
    .map((h) => h.processStep || h.description || `PCC ${h.id.slice(0, 6)}`)
    .slice(0, 8);

  const pccRecords7d = windowFromCounts(pcc7Total, pcc7Ok, pcc7Bad);
  const pccRecordsPrev7d = windowFromCounts(pccPrevTotal, pccPrevOk, pccPrevBad);
  const pccRecords30d = windowFromCounts(pcc30Total, pcc30Ok, pcc30Bad);

  const submissions7d = {
    total: sub7Total,
    ok: sub7Ok,
    deviations: sub7Dev,
    compliancePct: sub7Total > 0 ? Math.round((sub7Ok / sub7Total) * 100) : 100,
  };
  const submissionsPrev7d = {
    total: subPrevTotal,
    ok: subPrevOk,
    deviations: subPrevDev,
    compliancePct: subPrevTotal > 0 ? Math.round((subPrevOk / subPrevTotal) * 100) : 100,
  };

  const recentDeviations = [
    ...((pccDevRes.data ?? []) as {
      recorded_at: string;
      parameter: string;
      measured_value: string;
    }[]).map((r) => ({
      date: r.recorded_at,
      parameter: r.parameter || "PCC",
      value: r.measured_value || "",
      source: "pcc" as const,
    })),
    ...((subDevRes.data ?? []) as { submitted_at: string }[]).map((s) => ({
      date: s.submitted_at,
      parameter: "Formulario de producción",
      value: "desviación",
      source: "form" as const,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const openSample = (openNcsRes.data ?? []) as {
    status: string;
    severity: string;
    origin: string;
    capa_stage: string | null;
    due_date: string | null;
    detected_at: string;
    created_at: string;
  }[];

  const overdueItems = ((overdueNcsRes.data ?? []) as {
    id: string;
    nc_number: string;
    due_date: string | null;
    severity: string;
    status: string;
  }[])
    .filter((nc) => isPastDue(nc.due_date, nc.status as never) || nc.status === "overdue")
    .map((nc) => ({
      id: nc.id,
      number: nc.nc_number,
      dueDate: nc.due_date ?? "",
      severity: nc.severity,
    }));

  const stuck = ((stuckNcsRes.data ?? []) as {
    id: string;
    nc_number: string;
    capa_stage: string | null;
    detected_at: string;
    created_at: string;
    severity: string;
  }[]).map((nc) => ({
    id: nc.id,
    number: nc.nc_number,
    stage: nc.capa_stage ?? "identification",
    daysOpen: daysBetween(nc.detected_at || nc.created_at, now),
    severity: nc.severity,
  }));

  const avgOpenAgeDays =
    openSample.length > 0
      ? Math.round(
          openSample.reduce(
            (sum, nc) => sum + daysBetween(nc.detected_at || nc.created_at, now),
            0
          ) / openSample.length
        )
      : 0;

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
      open: openCount,
      overdue: overdueCount,
      criticalOpen: criticalCount,
      dueSoon: dueSoonCount,
      closed30d,
      avgOpenAgeDays,
      byStatus: countBy(openSample.map((nc) => nc.status)),
      byStage: countBy(openSample.map((nc) => nc.capa_stage ?? "identification")),
      byOrigin: countBy(openSample.map((nc) => nc.origin)),
      stuck,
      overdueItems,
    },
  };
}
