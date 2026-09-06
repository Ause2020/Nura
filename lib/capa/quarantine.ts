import type { NcSeverity } from "@/types/database";

const SEVERITY_RANK: Record<NcSeverity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  observation: 1,
};

export function shouldQuarantineLot(
  severity: NcSeverity,
  threshold: NcSeverity = "major",
  lotNumber?: string | null
): boolean {
  if (!lotNumber?.trim()) return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

export function getQuarantineThresholdLabel(threshold: NcSeverity): string {
  const labels: Record<NcSeverity, string> = {
    critical: "Crítica",
    major: "Mayor",
    minor: "Menor",
    observation: "Observación",
  };
  return labels[threshold];
}
