import type { SupplierDocStatus, SupplierScorecardWeights } from "@/types/database";
import {
  DEFAULT_SCORECARD_WEIGHTS,
  computeWeightedScore,
} from "@/lib/suppliers/scorecard";

const MS_DAY = 86400000;

/** Días antes del vencimiento para marcar documento como "por vencer". */
export const DOC_EXPIRY_WARNING_DAYS = 30;

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_DAY);
}

export function computeDocStatus(
  expiryDate: string | null
): SupplierDocStatus {
  if (!expiryDate) return "valid";
  const days = daysUntil(expiryDate);
  if (days < 0) return "expired";
  if (days <= DOC_EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
}

export function computeOverallScore(
  scores: {
    quality_score: number;
    delivery_score: number;
    service_score: number;
    compliance_score: number;
  },
  weights: SupplierScorecardWeights = DEFAULT_SCORECARD_WEIGHTS
): number {
  return computeWeightedScore(scores, weights);
}

export function classifySupplier(overallScore: number): "A" | "B" | "C" {
  if (overallScore >= 85) return "A";
  if (overallScore >= 70) return "B";
  return "C";
}

export function isEvaluationOverdue(
  nextEvaluationDate: string | null
): boolean {
  if (!nextEvaluationDate) return true;
  return daysUntil(nextEvaluationDate) < 0;
}

export function suggestNextEvaluationDate(
  criticality: string,
  monthsOverride?: number | null
): string {
  const date = new Date();
  const months =
    monthsOverride ??
    (criticality === "critical" ? 6 : criticality === "major" ? 12 : 24);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split("T")[0];
}
