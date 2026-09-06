import {
  DEFAULT_CONSUMER_GROUPS,
  INITIAL_PRODUCT_SPECS,
} from "@/lib/haccp-plan/constants";
import { normalizeMatrix } from "@/lib/haccp-plan/risk";
import type {
  ConsumerGroups,
  DiagramEdge,
  DiagramNode,
  EvidenceFile,
  Hazard,
  HazardType,
  HaccpPlan,
  HaccpPlanStatus,
  IntendedUse,
  ProcessDiagram,
  Product,
  ProductSpec,
  TeamMember,
} from "@/lib/haccp-plan/types";

type Row = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mapPlan(row: Row): HaccpPlan {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    createdBy: (row.created_by as string | null) ?? null,
    name: asString(row.name, "Plan HACCP"),
    status: (asString(row.status, "draft") as HaccpPlanStatus) ?? "draft",
    currentStep: Math.min(12, Math.max(1, asNumber(row.current_step, 1))),
    riskMatrix: normalizeMatrix(row.risk_matrix),
    checklistProgress:
      row.checklist_progress && typeof row.checklist_progress === "object"
        ? (row.checklist_progress as HaccpPlan["checklistProgress"])
        : {},
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapEvidenceFile(raw: unknown): EvidenceFile | null {
  if (!raw || typeof raw !== "object") return null;
  return mapEvidenceFiles([raw])[0] ?? null;
}

export function mapTeamMember(row: Row): TeamMember {
  return {
    id: asString(row.id),
    name: asString(row.name),
    role: asString(row.role),
    area: asString(row.area),
    qual: asString(row.qualifications),
    trainingDate: asString(row.training_date).slice(0, 10),
    trainingEvidence: mapEvidenceFile(row.training_evidence),
  };
}

function mapSpecs(raw: unknown): ProductSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return INITIAL_PRODUCT_SPECS.map((spec) => ({ ...spec }));
  }
  return raw.map((item) => ({
    label: asString((item as ProductSpec).label, "Campo"),
    value: asString((item as ProductSpec).value),
  }));
}

function mapIntendedUse(raw: unknown): IntendedUse {
  const value = (raw ?? {}) as Partial<IntendedUse>;
  return {
    usage: asString(value.usage),
    additionalNotes: asString(value.additionalNotes),
  };
}

function mapConsumerGroups(raw: unknown): ConsumerGroups {
  const value = (raw ?? {}) as Partial<ConsumerGroups>;
  return {
    ...DEFAULT_CONSUMER_GROUPS,
    ...value,
  };
}

export function mapProduct(row: Row): Product {
  return {
    id: asString(row.id),
    name: asString(row.name, "Producto"),
    specs: mapSpecs(row.specifications),
    allergens: asString(row.allergens),
    hasAllergens: Boolean(row.has_allergens),
    resolutionNumber: asString(row.resolution_number),
    intendedUse: mapIntendedUse(row.intended_use),
    consumerGroups: mapConsumerGroups(row.consumer_groups),
  };
}

export function mapDiagram(row: Row): ProcessDiagram {
  return {
    id: asString(row.id),
    name: asString(row.name, "Proceso Principal"),
    nodes: Array.isArray(row.nodes) ? (row.nodes as DiagramNode[]) : [],
    edges: Array.isArray(row.edges) ? (row.edges as DiagramEdge[]) : [],
    zoom: asNumber(row.zoom, 1),
    panX: asNumber(row.pan_x, 0),
    panY: asNumber(row.pan_y, 0),
  };
}

export function mapEvidenceFiles(raw: unknown): EvidenceFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const file = item as Partial<EvidenceFile> & { data?: string };
    return {
      id: asString(file.id, crypto.randomUUID()),
      name: asString(file.name),
      type: asString(file.type),
      url: asString(file.url ?? file.data),
      date: asString(file.date, new Date().toISOString()),
    };
  });
}

export function mapHazard(row: Row, diagrams: ProcessDiagram[]): Hazard {
  const stepId = asString(row.step_id);
  const diagramId =
    diagrams.find((diagram) =>
      diagram.nodes.some((node) => node.id === stepId)
    )?.id ?? "";

  return {
    id: asString(row.id),
    diagramId,
    stepId,
    description: asString(row.description),
    cause: asString(row.cause),
    type: (asString(row.type, "biological") as HazardType) || "biological",
    severity: asNumber(row.severity, 1),
    probability: asNumber(row.probability, 1),
    justification: asString(row.justification),
    preventiveMeasure: asString(row.preventive_measure),
  };
}

export function teamToRow(member: TeamMember, planId: string, orderIndex: number) {
  return {
    id: member.id,
    plan_id: planId,
    name: member.name,
    role: member.role,
    area: member.area,
    qualifications: member.qual,
    training_date: member.trainingDate || null,
    training_evidence: member.trainingEvidence,
    order_index: orderIndex,
    updated_at: new Date().toISOString(),
  };
}

export function productToRow(product: Product, planId: string, orderIndex: number) {
  return {
    id: product.id,
    plan_id: planId,
    name: product.name,
    resolution_number: product.resolutionNumber,
    has_allergens: product.hasAllergens,
    allergens: product.allergens,
    specifications: product.specs,
    intended_use: product.intendedUse,
    consumer_groups: product.consumerGroups,
    order_index: orderIndex,
    updated_at: new Date().toISOString(),
  };
}

export function diagramToRow(
  diagram: ProcessDiagram,
  planId: string,
  orderIndex: number
) {
  return {
    id: diagram.id,
    plan_id: planId,
    name: diagram.name,
    nodes: diagram.nodes,
    edges: diagram.edges,
    zoom: diagram.zoom,
    pan_x: diagram.panX,
    pan_y: diagram.panY,
    order_index: orderIndex,
    updated_at: new Date().toISOString(),
  };
}

export function hazardToRow(
  hazard: Hazard,
  planId: string,
  threshold: number,
  stepName = ""
) {
  const score = hazard.severity * hazard.probability;
  return {
    id: hazard.id,
    plan_id: planId,
    step_name: stepName,
    step_id: hazard.stepId,
    description: hazard.description,
    type: hazard.type,
    cause: hazard.cause,
    severity: hazard.severity,
    probability: hazard.probability,
    is_significant: score >= threshold,
    justification: hazard.justification,
    preventive_measure: hazard.preventiveMeasure,
    updated_at: new Date().toISOString(),
  };
}
