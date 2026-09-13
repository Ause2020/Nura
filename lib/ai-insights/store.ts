import type { InsightDbClient } from "@/lib/ai-insights/db";
import type {
  DailyInsight,
  InsightAnalysis,
  InsightFinding,
  InsightRisk,
  InsightSource,
  InsightTeaser,
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
    inputTokens:
      typeof row.input_tokens === "number" ? row.input_tokens : null,
    outputTokens:
      typeof row.output_tokens === "number" ? row.output_tokens : null,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    generationResult:
      typeof row.generation_result === "string" ? row.generation_result : null,
  };
}

export interface InsightWriteInput {
  periodDate: string;
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
  generationResult: string;
}

function toPayload(organizationId: string, input: InsightWriteInput) {
  const now = new Date().toISOString();
  return {
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
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    duration_ms: input.durationMs,
    generation_result: input.generationResult,
    updated_at: now,
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

export async function getInsightTeaser(
  organizationId: string,
  client: InsightDbClient
): Promise<InsightTeaser | null> {
  const { data, error } = await client
    .from("ai_daily_insights")
    .select("headline, summary, overall_risk, generated_at, period_date")
    .eq("organization_id", organizationId)
    .order("period_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    headline: string;
    summary: string;
    overall_risk: InsightRisk;
    generated_at: string;
    period_date: string;
  };
  return {
    headline: row.headline,
    summary: row.summary,
    overallRisk: row.overall_risk,
    generatedAt: row.generated_at,
    periodDate: String(row.period_date).slice(0, 10),
  };
}

function isMissingTelemetryColumn(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    /input_tokens|output_tokens|duration_ms|generation_result/i.test(message)
  );
}

function withoutTelemetry<T extends Record<string, unknown>>(payload: T) {
  const {
    input_tokens: _input,
    output_tokens: _output,
    duration_ms: _duration,
    generation_result: _result,
    ...core
  } = payload;
  return core;
}

export function isMissingInsightTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const code = error.code ?? "";
  if (isMissingTelemetryColumn(error)) return false;
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation ["']?ai_daily_insights["']? does not exist/i.test(message) ||
    /could not find the table ['"]public\.ai_daily_insights['"]/i.test(message)
  );
}

/** Primera escritura del día. Si otro proceso ganó el UNIQUE, no pisa. */
export async function insertDailyInsightIfAbsent(
  organizationId: string,
  input: InsightWriteInput,
  client: InsightDbClient
): Promise<DailyInsight | null> {
  const payload = toPayload(organizationId, input);
  let { data, error } = await client
    .from("ai_daily_insights")
    .upsert(payload, {
      onConflict: "organization_id,period_date",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();

  if (error && isMissingTelemetryColumn(error)) {
    ({ data, error } = await client
      .from("ai_daily_insights")
      .upsert(withoutTelemetry(payload), {
        onConflict: "organization_id,period_date",
        ignoreDuplicates: true,
      })
      .select("*")
      .maybeSingle());
  }

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return asInsight(data as Record<string, unknown>);
}

/** Regeneración explícita: pisa la fila del día. */
export async function upsertDailyInsight(
  organizationId: string,
  input: InsightWriteInput,
  client: InsightDbClient
): Promise<DailyInsight> {
  const payload = toPayload(organizationId, input);
  let { data, error } = await client
    .from("ai_daily_insights")
    .upsert(payload, {
      onConflict: "organization_id,period_date",
    })
    .select("*")
    .single();

  if (error && isMissingTelemetryColumn(error)) {
    ({ data, error } = await client
      .from("ai_daily_insights")
      .upsert(withoutTelemetry(payload), {
        onConflict: "organization_id,period_date",
      })
      .select("*")
      .single());
  }

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo guardar el análisis diario");
  }

  return asInsight(data as Record<string, unknown>);
}
