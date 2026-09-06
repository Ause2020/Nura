import { getOriginLabel } from "@/lib/capa/constants";
import { getStageLabel } from "@/lib/capa/workflow";
import type { CapaStage, NcOrigin } from "@/types/database";
import type {
  InsightAnalysis,
  InsightFinding,
  InsightPriority,
  InsightRisk,
  QualitySnapshot,
} from "@/lib/ai-insights/types";

function riskFromFindings(findings: InsightFinding[]): InsightRisk {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "warning")) return "attention";
  return "ok";
}

function planStatusLabel(status: string): string {
  if (status === "approved") return "aprobado";
  if (status === "completed") return "completado";
  if (status === "in_progress") return "en progreso";
  return "borrador";
}

export function buildFindings(snapshot: QualitySnapshot): InsightFinding[] {
  const findings: InsightFinding[] = [];
  const { haccp, monitoreo, ncs, training } = snapshot;

  if (!haccp.hasPlan) {
    findings.push({
      id: "haccp-missing",
      module: "haccp",
      severity: "critical",
      title: "No hay un plan HACCP activo",
      detail: "El sistema no encontró un plan de 12 pasos. Hay que iniciarlo para operar con criterio Codex.",
      href: "/haccp",
    });
  } else {
    if (haccp.completedSteps < 12) {
      const next = haccp.incompleteSteps[0];
      findings.push({
        id: "haccp-incomplete",
        module: "haccp",
        severity: haccp.completedSteps < 6 ? "critical" : "warning",
        title: `Plan HACCP incompleto (${haccp.completedSteps}/12 pasos)`,
        detail: next
          ? `Siguiente brecha: ${next.title}. Falta: ${next.missingItems.slice(0, 3).join("; ")}.`
          : `El plan está ${planStatusLabel(haccp.status)} y sigue en el paso ${haccp.currentStep}.`,
        href: "/haccp",
      });
    }

    const expiredTeam = haccp.team.filter((m) => m.trainingExpired);
    const untrained = haccp.team.filter((m) => m.missingTraining);
    if (expiredTeam.length > 0) {
      findings.push({
        id: "haccp-training-expired",
        module: "haccp",
        severity: "critical",
        title: "Capacitación HACCP del equipo vencida",
        detail: `${expiredTeam.map((m) => m.name).join(", ")} superan los 12 meses desde la última capacitación.`,
        href: "/haccp",
      });
    } else if (untrained.length > 0) {
      findings.push({
        id: "haccp-training-missing",
        module: "haccp",
        severity: "warning",
        title: "Equipo HACCP sin capacitación registrada",
        detail: `${untrained.map((m) => m.name).join(", ")} no tienen fecha de capacitación.`,
        href: "/haccp",
      });
    }

    if (haccp.currentStep >= 5 && !haccp.validationSigned) {
      findings.push({
        id: "haccp-validation",
        module: "haccp",
        severity: "warning",
        title: "Validación in situ sin firmar",
        detail: "El diagrama de flujo no tiene acta de validación firmada (paso 5).",
        href: "/haccp",
      });
    }

    if (haccp.ccpCount > 0 && haccp.limitsDefined < haccp.ccpCount) {
      findings.push({
        id: "haccp-limits",
        module: "haccp",
        severity: "warning",
        title: "PCC sin límites críticos",
        detail: `${haccp.ccpCount} PCC determinados y ${haccp.limitsDefined} con límite crítico documentado.`,
        href: "/haccp",
      });
    }

    if (haccp.ccpCount > 0 && haccp.monitoringPlansDefined < haccp.ccpCount) {
      findings.push({
        id: "haccp-monitoring-plan",
        module: "haccp",
        severity: "warning",
        title: "PCC sin plan de monitoreo",
        detail: `Faltan planes QUÉ/CÓMO/CUÁNDO/QUIÉN en ${haccp.ccpCount - haccp.monitoringPlansDefined} PCC.`,
        href: "/haccp",
      });
    }
  }

  if (monitoreo.trend === "worsening") {
    findings.push({
      id: "mon-trend",
      module: "monitoreo",
      severity: "warning",
      title: "Tendencia de monitoreo a la baja",
      detail: `Cumplimiento 7 días: PCC ${monitoreo.pccRecords7d.compliancePct}% · formularios ${monitoreo.submissions7d.compliancePct}%. Peor que la semana anterior.`,
      href: "/registros",
    });
  }

  if (monitoreo.pccRecords7d.nonConforming > 0 || monitoreo.submissions7d.deviations > 0) {
    findings.push({
      id: "mon-deviations",
      module: "monitoreo",
      severity:
        monitoreo.pccRecords7d.nonConforming + monitoreo.submissions7d.deviations >= 3
          ? "critical"
          : "warning",
      title: "Desviaciones en los últimos 7 días",
      detail: `${monitoreo.pccRecords7d.nonConforming} registros PCC fuera de límite y ${monitoreo.submissions7d.deviations} formularios con desviación.`,
      href: "/registros",
    });
  }

  if (monitoreo.pccsWithoutRecentRecords.length > 0) {
    findings.push({
      id: "mon-silent-pcc",
      module: "monitoreo",
      severity: "warning",
      title: "PCC sin registros esta semana",
      detail: monitoreo.pccsWithoutRecentRecords.slice(0, 4).join(" · "),
      href: "/registros",
    });
  }

  if (
    haccp.ccpCount > 0 &&
    monitoreo.pccRecords7d.total === 0 &&
    monitoreo.submissions7d.total === 0
  ) {
    findings.push({
      id: "mon-empty",
      module: "monitoreo",
      severity: "critical",
      title: "Sin actividad de monitoreo en 7 días",
      detail: "Hay PCC definidos pero no se cargaron registros ni formularios esta semana.",
      href: "/registros",
    });
  }

  if (ncs.criticalOpen > 0) {
    findings.push({
      id: "nc-critical",
      module: "nc",
      severity: "critical",
      title: `${ncs.criticalOpen} NC crítica${ncs.criticalOpen === 1 ? "" : "s"} abierta${ncs.criticalOpen === 1 ? "" : "s"}`,
      detail: "Requieren contención y causa raíz con prioridad inmediata.",
      href: "/capa",
    });
  }

  if (ncs.overdue > 0) {
    const sample = ncs.overdueItems
      .slice(0, 3)
      .map((n) => n.number)
      .join(", ");
    findings.push({
      id: "nc-overdue",
      module: "nc",
      severity: "critical",
      title: `${ncs.overdue} no conformidad${ncs.overdue === 1 ? "" : "es"} vencida${ncs.overdue === 1 ? "" : "s"}`,
      detail: sample ? `Incluye ${sample}.` : "Hay plazos CAPA superados.",
      href: ncs.overdueItems[0] ? `/capa/${ncs.overdueItems[0].id}` : "/capa",
    });
  }

  if (ncs.stuck.length > 0) {
    const sample = ncs.stuck[0];
    findings.push({
      id: "nc-stuck",
      module: "nc",
      severity: "warning",
      title: `${ncs.stuck.length} NC estancada${ncs.stuck.length === 1 ? "" : "s"} (+14 días)`,
      detail: `${sample.number} lleva ${sample.daysOpen} días en ${getStageLabel(sample.stage as CapaStage)}.`,
      href: `/capa/${sample.id}`,
    });
  }

  const topOrigin = Object.entries(ncs.byOrigin).sort((a, b) => b[1] - a[1])[0];
  if (topOrigin && topOrigin[1] >= 3) {
    findings.push({
      id: "nc-origin",
      module: "nc",
      severity: "warning",
      title: "Origen recurrente de no conformidades",
      detail: `${topOrigin[1]} NC abiertas vienen de ${getOriginLabel(topOrigin[0] as NcOrigin)}.`,
      href: "/capa",
    });
  }

  if (training.expiredCompletions.length > 0) {
    findings.push({
      id: "training-expired",
      module: "haccp",
      severity: "warning",
      title: "Certificaciones de capacitación vencidas",
      detail: training.expiredCompletions
        .slice(0, 3)
        .map((t) => `${t.userName} · ${t.courseTitle}`)
        .join("; "),
      href: "/haccp",
    });
  } else if (training.expiringSoon.length > 0) {
    findings.push({
      id: "training-expiring",
      module: "haccp",
      severity: "info",
      title: "Capacitaciones por vencer (30 días)",
      detail: training.expiringSoon
        .slice(0, 3)
        .map((t) => `${t.userName} · ${t.courseTitle}`)
        .join("; "),
      href: "/haccp",
    });
  }

  return findings;
}

export function buildRulesAnalysis(
  snapshot: QualitySnapshot,
  findings: InsightFinding[]
): InsightAnalysis {
  const overallRisk = riskFromFindings(findings);
  const nextStep = snapshot.haccp.incompleteSteps[0];

  const headline =
    overallRisk === "ok"
      ? "El sistema de inocuidad está bajo control"
      : overallRisk === "critical"
        ? "Hay brechas críticas que hay que atender hoy"
        : "El plan avanza, pero hay pendientes que no pueden esperar";

  const summaryParts: string[] = [];
  summaryParts.push(
    snapshot.haccp.hasPlan
      ? `El plan HACCP está ${planStatusLabel(snapshot.haccp.status)} (${snapshot.haccp.completedSteps}/12 pasos).`
      : "Aún no hay un plan HACCP de 12 pasos."
  );
  if (nextStep) {
    summaryParts.push(`Lo más urgente del plan es completar «${nextStep.title}».`);
  }
  summaryParts.push(
    `Monitoreo 7 días: ${snapshot.monitoreo.pccRecords7d.total} registros PCC (${snapshot.monitoreo.pccRecords7d.compliancePct}% conforme) y ${snapshot.monitoreo.submissions7d.total} formularios.`
  );
  summaryParts.push(
    `Hay ${snapshot.ncs.open} NC abiertas, ${snapshot.ncs.overdue} vencidas y ${snapshot.ncs.criticalOpen} críticas.`
  );

  const priorities = findingsToPriorities(findings);

  return {
    headline,
    summary: summaryParts.join(" "),
    overallRisk,
    haccpNarrative: haccpNarrative(snapshot),
    monitoreoNarrative: monitoreoNarrative(snapshot),
    ncNarrative: ncNarrative(snapshot),
    priorities,
  };
}

function findingsToPriorities(findings: InsightFinding[]): InsightPriority[] {
  const rank = { critical: 0, warning: 1, info: 2 };
  return [...findings]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 5)
    .map((f) => ({
      title: f.title,
      why: f.detail,
      href: f.href,
      module: f.module,
      urgency:
        f.severity === "critical" ? "now" : f.severity === "warning" ? "soon" : "watch",
    }));
}

function haccpNarrative(snapshot: QualitySnapshot): string {
  if (!snapshot.haccp.hasPlan) {
    return "No hay plan HACCP cargado. Sin los 12 pasos Codex no hay base para PCC ni monitoreo.";
  }
  const gaps = snapshot.haccp.incompleteSteps
    .slice(0, 2)
    .map((s) => s.title)
    .join(" y ");
  const teamIssues = snapshot.haccp.team.filter(
    (m) => m.missingTraining || m.trainingExpired
  ).length;
  return `Completitud ${snapshot.haccp.completedSteps}/12. ${
    gaps ? `Pendiente: ${gaps}.` : "Checklist cerrado."
  } ${teamIssues} integrante${teamIssues === 1 ? "" : "s"} del equipo con capacitación pendiente o vencida. ${
    snapshot.haccp.ccpCount
  } PCC · ${snapshot.haccp.limitsDefined} límites · ${snapshot.haccp.monitoringPlansDefined} planes de monitoreo.`;
}

function monitoreoNarrative(snapshot: QualitySnapshot): string {
  const trendLabel = {
    improving: "mejorando",
    stable: "estable",
    worsening: "empeorando",
    insufficient: "sin datos suficientes",
  }[snapshot.monitoreo.trend];
  return `Tendencia semanal ${trendLabel}. PCC 7d: ${snapshot.monitoreo.pccRecords7d.conforming}/${snapshot.monitoreo.pccRecords7d.total} conformes. Formularios: ${snapshot.monitoreo.submissions7d.ok}/${snapshot.monitoreo.submissions7d.total} sin desviación. ${
    snapshot.monitoreo.pccsWithoutRecentRecords.length
      ? `PCC sin registro: ${snapshot.monitoreo.pccsWithoutRecentRecords.slice(0, 3).join(", ")}.`
      : "Todos los PCC con registro reciente."
  }`;
}

function ncNarrative(snapshot: QualitySnapshot): string {
  return `${snapshot.ncs.open} abiertas · ${snapshot.ncs.overdue} vencidas · ${snapshot.ncs.criticalOpen} críticas · ${snapshot.ncs.stuck.length} estancadas. Edad media ${snapshot.ncs.avgOpenAgeDays} días. Cerradas en 30 días: ${snapshot.ncs.closed30d}.`;
}
