import type { SupplierScorecardWeights } from "@/types/database";

export const DEFAULT_SCORECARD_WEIGHTS: SupplierScorecardWeights = {
  quality: 0.4,
  compliance: 0.3,
  delivery: 0.2,
  service: 0.1,
};

export function parseScorecardWeights(
  raw: unknown
): SupplierScorecardWeights {
  if (!raw || typeof raw !== "object") return DEFAULT_SCORECARD_WEIGHTS;
  const obj = raw as Partial<SupplierScorecardWeights>;
  const quality = Number(obj.quality);
  const compliance = Number(obj.compliance);
  const delivery = Number(obj.delivery);
  const service = Number(obj.service);
  if (
    [quality, compliance, delivery, service].some(
      (v) => Number.isNaN(v) || v < 0 || v > 1
    )
  ) {
    return DEFAULT_SCORECARD_WEIGHTS;
  }
  const sum = quality + compliance + delivery + service;
  if (Math.abs(sum - 1) > 0.01) return DEFAULT_SCORECARD_WEIGHTS;
  return { quality, compliance, delivery, service };
}

export function computeWeightedScore(
  scores: {
    quality_score: number;
    delivery_score: number;
    service_score: number;
    compliance_score: number;
  },
  weights: SupplierScorecardWeights = DEFAULT_SCORECARD_WEIGHTS
): number {
  const overall = Math.round(
    scores.quality_score * weights.quality +
      scores.compliance_score * weights.compliance +
      scores.delivery_score * weights.delivery +
      scores.service_score * weights.service
  );
  return Math.min(100, Math.max(0, overall));
}

export const SCORECARD_CRITERIA: {
  key: keyof SupplierScorecardWeights;
  scoreKey:
    | "quality_score"
    | "compliance_score"
    | "delivery_score"
    | "service_score";
  label: string;
}[] = [
  { key: "quality", scoreKey: "quality_score", label: "Calidad" },
  { key: "compliance", scoreKey: "compliance_score", label: "Cumplimiento" },
  { key: "delivery", scoreKey: "delivery_score", label: "Entrega" },
  { key: "service", scoreKey: "service_score", label: "Servicio" },
];
