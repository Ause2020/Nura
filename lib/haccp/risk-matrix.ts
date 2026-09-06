import type { Probability, Severity } from "@/types/database";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bug, FlaskConical, HardHat } from "lucide-react";

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const PROBABILITY_LABELS: Record<Probability, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const MATRIX_SEVERITIES: Severity[] = ["low", "medium", "high"];
export const MATRIX_PROBABILITIES: Probability[] = ["low", "medium", "high"];

export interface RiskResult {
  risk_level: string;
  is_significant: boolean;
}

export function calculateRisk(
  severity: Severity,
  probability: Probability
): RiskResult {
  const scoreMap: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const probMap: Record<Probability, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const score = scoreMap[severity] * probMap[probability];

  if (severity === "critical" || score >= 6) {
    return { risk_level: "crítico", is_significant: true };
  }
  if (score >= 4) {
    return { risk_level: "alto", is_significant: true };
  }
  if (score >= 2) {
    return { risk_level: "medio", is_significant: true };
  }
  return { risk_level: "bajo", is_significant: false };
}

export function getRiskBadgeVariant(
  riskLevel: string | null
): "success" | "warning" | "danger" | "neutral" {
  if (!riskLevel) return "neutral";
  if (riskLevel === "bajo") return "success";
  if (riskLevel === "medio") return "warning";
  return "danger";
}

export const HAZARD_TYPE_CONFIG: Record<
  string,
  { label: string; icon: LucideIcon; className: string }
> = {
  biological: {
    label: "Biológico",
    icon: Bug,
    className: "bg-red-50 text-danger ring-red-200",
  },
  chemical: {
    label: "Químico",
    icon: FlaskConical,
    className: "bg-amber-light text-amber ring-amber/30",
  },
  physical: {
    label: "Físico",
    icon: HardHat,
    className: "bg-zinc-100 text-ink-light ring-border",
  },
  allergen: {
    label: "Alérgeno",
    icon: AlertTriangle,
    className: "bg-purple-50 text-purple-700 ring-purple-200",
  },
};

export const DETERMINATION_LABELS: Record<string, string> = {
  ccp: "CCP",
  oprp: "OPRP",
  prp: "PRP",
  not_significant: "No significativo",
};

export function getMatrixCellColor(severity: Severity, probability: Probability): string {
  const { risk_level } = calculateRisk(severity, probability);
  if (risk_level === "bajo") return "bg-sage-light hover:bg-sage-light/80";
  if (risk_level === "medio") return "bg-amber-light hover:bg-amber-light/80";
  return "bg-red-50 hover:bg-red-100";
}
