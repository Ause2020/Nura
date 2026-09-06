export type HaccpPlanStatus = "draft" | "in_progress" | "completed" | "approved";

export type HazardType = "biological" | "chemical" | "physical" | "allergen";

export type DiagramNodeType =
  | "start"
  | "step"
  | "pcc"
  | "allergen"
  | "decision"
  | "end";

export type DiagramEdgeType = "straight" | "step" | "bezier";

export type DiagramSide = "top" | "bottom" | "left" | "right";

export interface RiskLevel {
  value: number;
  label: string;
}

export interface RiskMatrix {
  severity: RiskLevel[];
  probability: RiskLevel[];
  significanceThreshold: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  area: string;
  qual: string;
  trainingDate: string;
  trainingEvidence: EvidenceFile | null;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface IntendedUse {
  usage: string;
  additionalNotes: string;
}

export interface ConsumerGroups {
  general: boolean;
  infants: boolean;
  children: boolean;
  pregnant: boolean;
  elderly: boolean;
  immunocompromised: boolean;
}

export interface Product {
  id: string;
  name: string;
  specs: ProductSpec[];
  allergens: string;
  hasAllergens: boolean;
  resolutionNumber: string;
  intendedUse: IntendedUse;
  consumerGroups: ConsumerGroups;
}

export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  label: string;
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  type: DiagramEdgeType;
  sourceSide?: DiagramSide;
  targetSide?: DiagramSide;
  label?: string;
}

export interface ProcessDiagram {
  id: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  zoom: number;
  panX: number;
  panY: number;
}

export interface EvidenceFile {
  id: string;
  name: string;
  type: string;
  url: string;
  date: string;
}

export interface PlanValidation {
  files: EvidenceFile[];
  observations: string;
  validatedAt: string | null;
  validatedBy: string | null;
}

export interface Hazard {
  id: string;
  diagramId: string;
  stepId: string;
  description: string;
  cause: string;
  type: HazardType;
  severity: number;
  probability: number;
  justification: string;
  preventiveMeasure: string;
}

export interface HazardRow {
  id: string;
  processStep: string;
  hazardType: HazardType;
  description: string;
  likelihood: number;
  severity: number;
  riskRanking: number;
  justification: string;
  significant: boolean;
  controlMeasures: string;
  q1?: boolean | null;
  q2?: boolean | null;
  q3?: boolean | null;
  q4?: boolean | null;
  isCCP?: boolean;
}

export interface CriticalLimit {
  hazardId: string;
  pccNumber: number;
  parameter: string;
  criticalLimit: string;
  operationalLimit: string;
  scientificBasis: string;
  monitoringMethod: string;
}

export interface MonitoringPlan {
  hazardId: string;
  pccNumber: number;
  what: string;
  how: string;
  frequency: string;
  who: string;
  records: string;
  calibration: string;
}

export interface CorrectiveAction {
  hazardId: string;
  pccNumber: number;
  productAction: string;
  processCorrection: string;
  responsible: string;
  notifyTo: string;
  records: string;
  preventiveAction: string;
}

export type VerificationCategory =
  | "calibration"
  | "sampling"
  | "records_review"
  | "internal_audit"
  | "validation"
  | "supplier"
  | "other";

export interface VerificationActivity {
  id: string;
  category: VerificationCategory;
  description: string;
  frequency: string;
  responsible: string;
  records: string;
  status: "pending" | "scheduled" | "completed";
}

export type ChecklistProgress = Record<string, Record<string, boolean>>;

export interface HaccpPlan {
  id: string;
  organizationId: string;
  createdBy: string | null;
  name: string;
  status: HaccpPlanStatus;
  currentStep: number;
  riskMatrix: RiskMatrix;
  checklistProgress: ChecklistProgress;
  createdAt: string;
  updatedAt: string;
}

export interface HaccpPlanDetails {
  plan: HaccpPlan;
  team: TeamMember[];
  products: Product[];
  diagrams: ProcessDiagram[];
  validation: PlanValidation;
  hazards: Hazard[];
}

export type CcpQuestionKey = "q1" | "q2" | "q3" | "q4";

export type CcpQuestionTexts = Partial<Record<CcpQuestionKey, string>>;

export interface Step7Payload {
  hazards: HazardRow[];
  questions?: CcpQuestionTexts;
}

export interface Step8Payload {
  criticalLimits: CriticalLimit[];
}

export interface Step9Payload {
  monitoringPlans: MonitoringPlan[];
}

export interface Step10Payload {
  correctiveActions: CorrectiveAction[];
}

export interface Step11Payload {
  verificationPlan: {
    activities: VerificationActivity[];
    generalObservations: string;
  };
}
