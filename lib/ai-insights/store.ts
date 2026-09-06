import type { InsightDbClient } from "@/lib/ai-insights/db";
import type {
  DailyInsight,
  InsightAnalysis,
  InsightFinding,
  InsightRisk,
  InsightSource,
  QualitySnapshot,
} from "@/lib/ai-insights/types";

function asInsight(row: Record<string, unknown>): DailyInsight {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    periodDate: String(row.period_date).slice(0, 10),
    generatedAt: String(row.generated_at),
    source: (row.source as InsightSource) ?? "rules",
    model: (row.model as string | null) ?? null,
    overallRisk: (row.overall_risk as InsightRisk) ?? "attention",
    headline: typeof row.headline === "string" ? row.headline : "",
    summary: typeof row.summary === "string" ? row.summary : "",
    snapshot: (row.snapshot as QualitySnapshot) ?? ({} as QualitySnapshot),
    findings: Array.isArray(row.findings) ? (row.findings as InsightFinding[]) : [],
    analysis: (row.analysis as InsightAnalysis) ?? {
      headline: "",
      summary: "",
      overallRisk: "attention",
      haccpNarrative: "",
      monitoreoNarrative: "",
      ncNarrative: "",
      priorities: [],
    },
  };
}

export async function getInsightForDate(
  organizationId: string,
  periodDate: string,
  client: InsightDbClient
): Promise<DailyInsight | null> {
  const { data, error } = await client
    .from("ai_daily_insights")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("period_date", periodDate)
    .maybeSingle();

  if (error || !data) return null;
  return asInsight(data as Record<string, unknown>);
}

export async function getLatestInsight(
  organizationId: string,
  client: InsightDbClient
): Promise<DailyInsight | null> {
  const { data, error } = await client
    .from("ai_daily_insights")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return asInsight(data as Record<string, unknown>);
}

export function isMissingInsightTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /ai_daily_insights/i.test(message)
  );
}

export async function upsertDailyInsight(
  organizationId: string,
  input: {
    periodDate: string;
    source: InsightSource;
    model: string | null;
    overallRisk: InsightRisk;
    headline: string;
    summary: string;
    snapshot: QualitySnapshot;
    findings: InsightFinding[];
    analysis: InsightAnalysis;
  },
  client: InsightDbClient
): Promise<DailyInsight> {
  const now = new Date().toISOString();
  const payload = {
    organization_id: organizationId,
    period_date: input.periodDate,
    generated_at: now,
    source: input.source,
    model: input.model,
    overall_risk: input.overallRisk,
    headline: input.headline,
    summary: input.summary,
    snapshot: input.snapshot,
    findings: input.findings,
    analysis: input.analysis,
    updated_at: now,
  };

  const { data, error } = await client
    .from("ai_daily_insights")
    .upsert(payload, { onConflict: "organization_id,period_date" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo guardar el análisis diario");
  }

  return asInsight(data as Record<string, unknown>);
}
