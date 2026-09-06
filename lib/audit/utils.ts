import type { AuditChecklistItem, AuditChecklistResult } from "@/types/database";

export function calculateComplianceScore(
  items: { result: AuditChecklistResult | null }[]
): number {
  const evaluated = items.filter(
    (i) => i.result && i.result !== "not_evaluated" && i.result !== "na"
  );
  if (evaluated.length === 0) return 0;

  let points = 0;
  for (const item of evaluated) {
    if (item.result === "complies") points += 1;
    else if (item.result === "partial") points += 0.5;
  }

  return Math.round((points / evaluated.length) * 100);
}

export function getSectionScores(
  items: Pick<AuditChecklistItem, "section" | "result">[]
): { section: string; score: number; total: number }[] {
  const sections = new Map<string, { points: number; total: number }>();

  for (const item of items) {
    if (!item.result || item.result === "not_evaluated" || item.result === "na")
      continue;

    const current = sections.get(item.section) ?? { points: 0, total: 0 };
    current.total += 1;
    if (item.result === "complies") current.points += 1;
    else if (item.result === "partial") current.points += 0.5;
    sections.set(item.section, current);
  }

  return Array.from(sections.entries()).map(([section, { points, total }]) => ({
    section,
    score: total > 0 ? Math.round((points / total) * 100) : 0,
    total,
  }));
}

export function countResults(items: { result: AuditChecklistResult | null }[]) {
  return {
    complies: items.filter((i) => i.result === "complies").length,
    partial: items.filter((i) => i.result === "partial").length,
    not_complies: items.filter((i) => i.result === "not_complies").length,
    na: items.filter((i) => i.result === "na").length,
    pending: items.filter(
      (i) => !i.result || i.result === "not_evaluated"
    ).length,
  };
}

export function getTopFindingSections(
  findings: { description: string }[],
  items: Pick<AuditChecklistItem, "id" | "section">[],
  findingItemIds: Map<string, string>
): string[] {
  const sectionCounts = new Map<string, number>();
  for (const itemId of Array.from(findingItemIds.keys())) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      sectionCounts.set(item.section, (sectionCounts.get(item.section) ?? 0) + 1);
    }
  }
  return Array.from(sectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([section]) => section);
}
