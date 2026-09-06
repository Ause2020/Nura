import { DEFAULT_RISK_MATRIX } from "@/lib/haccp-plan/constants";
import type { RiskLevel, RiskMatrix } from "@/lib/haccp-plan/types";

export function riskScore(severity: number, probability: number): number {
  return severity * probability;
}

export function isSignificant(
  severity: number,
  probability: number,
  threshold: number
): boolean {
  return riskScore(severity, probability) >= threshold;
}

export function normalizeMatrix(raw: unknown): RiskMatrix {
  if (!raw || typeof raw !== "object") return DEFAULT_RISK_MATRIX;
  const value = raw as Partial<RiskMatrix>;
  const severity = Array.isArray(value.severity)
    ? reindexLevels(value.severity)
    : DEFAULT_RISK_MATRIX.severity;
  const probability = Array.isArray(value.probability)
    ? reindexLevels(value.probability)
    : DEFAULT_RISK_MATRIX.probability;
  const threshold =
    typeof value.significanceThreshold === "number"
      ? value.significanceThreshold
      : DEFAULT_RISK_MATRIX.significanceThreshold;
  return {
    severity: severity.length >= 2 ? severity : DEFAULT_RISK_MATRIX.severity,
    probability:
      probability.length >= 2 ? probability : DEFAULT_RISK_MATRIX.probability,
    significanceThreshold: threshold,
  };
}

export function reindexLevels(levels: RiskLevel[]): RiskLevel[] {
  return levels.map((level, index) => ({
    value: index + 1,
    label: level.label?.trim() || `Nivel ${index + 1}`,
  }));
}
