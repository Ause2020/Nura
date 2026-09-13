export type InsightRisk = "ok" | "attention" | "critical";
export type InsightSource = "rules" | "ai";
export type InsightModule = "haccp" | "monitoreo" | "nc";
export type FindingSeverity = "info" | "warning" | "critical";
export type PriorityUrgency = "now" | "soon" | "watch";
export type MonitoreoTrend = "improving" | "stable" | "worsening" | "insufficient";

export interface InsightFinding {
  id: string;
  module: InsightModule;
  severity: FindingSeverity;
  title: string;
  detail: string;
  href: string;
}

export interface InsightPriority {
  title: string;
  why: string;
  href: string;
  module: InsightModule;
  urgency: PriorityUrgency;
}

export interface InsightAnalysis {
  headline: string;
  summary: string;
  overallRisk: InsightRisk;
  haccpNarrative: string;
  monitoreoNarrative: string;
  ncNarrative: string;
  priorities: InsightPriority[];
}

export interface WindowStats {
  total: number;
  conforming: number;
  nonConforming: number;
  compliancePct: number;
}

export interface QualitySnapshot {
  generatedAt: string;
  periodDate: string;
  haccp: {
    hasPlan: boolean;
    name: string;
    status: string;
    currentStep: number;
    completedSteps: number;
    incompleteSteps: {
      step: number;
      title: string;
      missingItems: string[];
    }[];
    productsCount: number;
    hazardsCount: number;
    significantHazards: number;
    ccpCount: number;
    limitsDefined: number;
    monitoringPlansDefined: number;
    validationSigned: boolean;
    team: {
      name: string;
      role: string;
      trainingDate: string | null;
      missingTraining: boolean;
      trainingExpired: boolean;
      missingEvidence: boolean;
    }[];
  };
  monitoreo: {
    pccRecords7d: WindowStats;
    pccRecordsPrev7d: WindowStats;
    pccRecords30d: WindowStats;
    submissions7d: {
      total: number;
      ok: number;
      deviations: number;
      compliancePct: number;
    };
    submissionsPrev7d: {
      total: number;
      ok: number;
      deviations: number;
      compliancePct: number;
    };
    trend: MonitoreoTrend;
    pccsWithoutRecentRecords: string[];
    recentDeviations: {
      date: string;
      parameter: string;
      value: string;
      source: "pcc" | "form";
    }[];
  };
  ncs: {
    open: number;
    overdue: number;
    criticalOpen: number;
    dueSoon: number;
    closed30d: number;
    avgOpenAgeDays: number;
    byStatus: Record<string, number>;
    byStage: Record<string, number>;
    byOrigin: Record<string, number>;
    stuck: {
      id: string;
      number: string;
      stage: string;
      daysOpen: number;
      severity: string;
    }[];
    overdueItems: {
      id: string;
      number: string;
      dueDate: string;
      severity: string;
    }[];
  };
}

export interface DailyInsight {
  id: string;
  organizationId: string;
  periodDate: string;
  generatedAt: string;
  source: InsightSource;
  model: string | null;
  overallRisk: InsightRisk;
  headline: string;
  summary: string;
  snapshot: QualitySnapshot;
  findings: InsightFinding[];
  analysis: InsightAnalysis;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  generationResult: string | null;
}

export type InsightTeaser = Pick<
  DailyInsight,
  "headline" | "summary" | "overallRisk" | "generatedAt" | "periodDate"
>;
