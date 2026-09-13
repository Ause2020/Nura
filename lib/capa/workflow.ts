import type { CapaAction, CapaStage, Nc5Whys, Nonconformity } from "@/types/database";

export const CAPA_STAGES: {
  id: CapaStage;
  label: string;
  description: string;
}[] = [
  {
    id: "identification",
    label: "Identificación",
    description: "Datos de la NC y responsable asignado",
  },
  {
    id: "containment",
    label: "Contención inmediata",
    description: "Acciones para aislar el producto o proceso afectado",
  },
  {
    id: "investigation",
    label: "Investigación",
    description: "Análisis de causa raíz (5 Whys o Ishikawa)",
  },
  {
    id: "action_plan",
    label: "Plan de acción",
    description: "Acciones correctivas y preventivas definidas",
  },
  {
    id: "implementation",
    label: "Implementación",
    description: "Ejecución con evidencia documentada",
  },
  {
    id: "effectiveness",
    label: "Verificación de efectividad",
    description: "Confirmar que la CAPA fue efectiva",
  },
  {
    id: "closure",
    label: "Cierre",
    description: "Firma del Gerente de Calidad",
  },
];

export function getStageLabel(stage: CapaStage | null | undefined): string {
  if (!stage || stage === "closed") return "Cerrada";
  return CAPA_STAGES.find((s) => s.id === stage)?.label ?? stage;
}

export function getNextStage(stage: CapaStage): CapaStage | null {
  const order: CapaStage[] = [
    "identification",
    "containment",
    "investigation",
    "action_plan",
    "implementation",
    "effectiveness",
    "closure",
    "closed",
  ];
  const idx = order.indexOf(stage);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

export interface StageValidationContext {
  nc: Nonconformity;
  actions: CapaAction[];
  fiveWhys: Nc5Whys | null;
}

export function validateStageAdvance(
  stage: CapaStage,
  ctx: StageValidationContext
): string | null {
  switch (stage) {
    case "identification":
      if (!ctx.nc.assigned_to) {
        return "Asigna un responsable de la CAPA";
      }
      return null;
    case "containment":
      if (!ctx.nc.containment_description?.trim()) {
        return "Documenta la contención inmediata";
      }
      return null;
    case "investigation":
      if (!ctx.nc.root_cause_summary?.trim()) {
        return "Completa el análisis de causa raíz";
      }
      return null;
    case "action_plan":
      if (ctx.actions.length === 0) {
        return "Agrega al menos una acción al plan";
      }
      return null;
    case "implementation": {
      const incomplete = ctx.actions.filter((a) => a.status !== "completed");
      const missingEvidence = ctx.actions.filter(
        (a) => a.status === "completed" && !a.evidence_description?.trim()
      );
      if (incomplete.length > 0) {
        return "Completa todas las acciones con evidencia";
      }
      if (missingEvidence.length > 0) {
        return "Todas las acciones completadas deben tener evidencia";
      }
      return null;
    }
    case "effectiveness":
      if (ctx.nc.effectiveness_result === "pending") {
        return "Registra el resultado de la verificación de efectividad";
      }
      if (ctx.nc.effectiveness_result === "ineffective") {
        return "La efectividad fue no conforme — reabre investigación desde el botón correspondiente";
      }
      return null;
    case "closure":
      return null;
    default:
      return null;
  }
}

export async function computeCapaSignatureHash(input: {
  userId: string;
  ncId: string;
  fromStage: CapaStage | null;
  toStage: CapaStage;
  timestamp: string;
}): Promise<string> {
  const payload = [
    input.userId,
    input.ncId,
    input.fromStage ?? "",
    input.toStage,
    input.timestamp,
  ].join("|");

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getStageIndex(stage: CapaStage): number {
  return CAPA_STAGES.findIndex((s) => s.id === stage);
}

export function isStageComplete(
  stage: CapaStage,
  currentStage: CapaStage
): boolean {
  if (currentStage === "closed") return true;
  return getStageIndex(stage) < getStageIndex(currentStage);
}

export function isCurrentStage(stage: CapaStage, currentStage: CapaStage): boolean {
  return stage === currentStage;
}
