import { callClaude, isAiConfigured, parseAiJson } from "@/lib/ai/anthropic";
import type { InsightDbClient } from "@/lib/ai-insights/db";
import { buildFindings, buildRulesAnalysis } from "@/lib/ai-insights/findings";
import { periodDateInSantiago } from "@/lib/ai-insights/period";
import { collectQualitySnapshot } from "@/lib/ai-insights/snapshot";
import {
  getInsightForDate,
  getLatestInsight,
  insertDailyInsightIfAbsent,
  isMissingInsightTable,
  upsertDailyInsight,
  type InsightWriteInput,
} from "@/lib/ai-insights/store";
import type {
  DailyInsight,
  InsightAnalysis,
  InsightPriority,
  InsightRisk,
  QualitySnapshot,
} from "@/lib/ai-insights/types";

const SYSTEM_PROMPT = `Eres el analista de inocuidad de Nura. No conversas: emites un briefing diario para el gerente de calidad.
Respondes ÚNICAMENTE en español, con JSON válido, sin markdown ni texto extra.
Tono: directo, operativo, sin relleno. Nunca inventes datos que no estén en el snapshot.
Prioriza riesgo para el alimento y cumplimiento Codex / NCh 2861.`;

function compactForAi(snapshot: QualitySnapshot) {
  return {
    haccp: {
      status: snapshot.haccp.status,
      completedSteps: snapshot.haccp.completedSteps,
      currentStep: snapshot.haccp.currentStep,
      incomplete: snapshot.haccp.incompleteSteps.slice(0, 4).map((s) => ({
        step: s.step,
        title: s.title,
        missing: s.missingItems.slice(0, 3),
      })),
      ccpCount: snapshot.haccp.ccpCount,
      limitsDefined: snapshot.haccp.limitsDefined,
      monitoringPlansDefined: snapshot.haccp.monitoringPlansDefined,
      validationSigned: snapshot.haccp.validationSigned,
      teamIssues: snapshot.haccp.team
        .filter((m) => m.missingTraining || m.trainingExpired)
        .map((m) => ({
          name: m.name,
          missing: m.missingTraining,
          expired: m.trainingExpired,
        })),
    },
    monitoreo: {
      trend: snapshot.monitoreo.trend,
      pcc7d: snapshot.monitoreo.pccRecords7d,
      forms7d: snapshot.monitoreo.submissions7d,
      silentPcc: snapshot.monitoreo.pccsWithoutRecentRecords.slice(0, 5),
      deviations: snapshot.monitoreo.recentDeviations.slice(0, 5),
    },
    ncs: {
      open: snapshot.ncs.open,
      overdue: snapshot.ncs.overdue,
      criticalOpen: snapshot.ncs.criticalOpen,
      dueSoon: snapshot.ncs.dueSoon,
      avgOpenAgeDays: snapshot.ncs.avgOpenAgeDays,
      byOrigin: snapshot.ncs.byOrigin,
      stuck: snapshot.ncs.stuck.slice(0, 4),
      overdueItems: snapshot.ncs.overdueItems.slice(0, 4),
    },
  };
}

function sanitizeAnalysis(
  parsed: Partial<InsightAnalysis> | null,
  fallback: InsightAnalysis
): InsightAnalysis {
  const risks: InsightRisk[] = ["ok", "attention", "critical"];
  const overallRisk = risks.includes(parsed?.overallRisk as InsightRisk)
    ? (parsed?.overallRisk as InsightRisk)
    : fallback.overallRisk;

  const priorities = (parsed?.priorities ?? [])
    .filter((p) => p?.title && p?.why)
    .slice(0, 5)
    .map((p): InsightPriority => ({
      title: String(p.title).slice(0, 140),
      why: String(p.why).slice(0, 240),
      href: typeof p.href === "string" && p.href.startsWith("/") ? p.href : "/dashboard",
      module:
        p.module === "haccp" || p.module === "monitoreo" || p.module === "nc"
          ? p.module
          : "haccp",
      urgency:
        p.urgency === "now" || p.urgency === "soon" || p.urgency === "watch"
          ? p.urgency
          : "soon",
    }));

  return {
    headline: (parsed?.headline ?? fallback.headline).slice(0, 160),
    summary: (parsed?.summary ?? fallback.summary).slice(0, 800),
    overallRisk,
    haccpNarrative: (parsed?.haccpNarrative ?? fallback.haccpNarrative).slice(0, 400),
    monitoreoNarrative: (parsed?.monitoreoNarrative ?? fallback.monitoreoNarrative).slice(
      0,
      400
    ),
    ncNarrative: (parsed?.ncNarrative ?? fallback.ncNarrative).slice(0, 400),
    priorities: priorities.length > 0 ? priorities : fallback.priorities,
  };
}

async function interpretWithAi(
  snapshot: QualitySnapshot,
  fallback: InsightAnalysis
): Promise<{
  analysis: InsightAnalysis;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  ok: boolean;
}> {
  if (!isAiConfigured()) {
    return {
      analysis: fallback,
      model: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: 0,
      ok: false,
    };
  }

  const userMessage = `
Datos agregados del sistema de inocuidad (hechos, no los inventes):
${JSON.stringify(compactForAi(snapshot))}

Emite el briefing del día. Responde SOLO con este JSON:
{
  "headline": "frase corta del estado (máx 120 caracteres)",
  "summary": "2 a 4 oraciones: qué pasa hoy y qué hay que hacer",
  "overallRisk": "ok" | "attention" | "critical",
  "haccpNarrative": "1-2 oraciones sobre el plan (faltantes, capacitación, PCC)",
  "monitoreoNarrative": "1-2 oraciones sobre tendencia y desviaciones",
  "ncNarrative": "1-2 oraciones sobre NC abiertas, vencidas y estancadas",
  "priorities": [
    {
      "title": "acción concreta",
      "why": "por qué hoy",
      "href": "/haccp" | "/registros" | "/capa" | "/capa/<id>",
      "module": "haccp" | "monitoreo" | "nc",
      "urgency": "now" | "soon" | "watch"
    }
  ]
}
Máximo 5 prioridades, la más urgente primero. Usa href reales del snapshot (ids de NC si existen).
`.trim();

  const result = await callClaude({
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 1200,
    maxInputChars: 4000,
    timeoutMs: 25_000,
  });

  if (!result.ok) {
    return {
      analysis: fallback,
      model: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: 0,
      ok: false,
    };
  }

  const parsed = parseAiJson<InsightAnalysis>(result.text);
  return {
    analysis: sanitizeAnalysis(parsed, fallback),
    model: "claude-haiku-4-5",
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    durationMs: result.usage.durationMs,
    ok: true,
  };
}

export interface GenerateInsightOptions {
  /** Regeneración explícita: pisa el insight del día y puede llamar a Claude. */
  force?: boolean;
}

async function buildInsightPayload(
  organizationId: string,
  client: InsightDbClient,
  options: { withAi: boolean }
): Promise<InsightWriteInput> {
  const started = Date.now();
  const snapshot = await collectQualitySnapshot(organizationId, client);
  const findings = buildFindings(snapshot);
  const rules = buildRulesAnalysis(snapshot, findings);

  if (!options.withAi) {
    return {
      periodDate: snapshot.periodDate,
      source: "rules",
      model: null,
      overallRisk: rules.overallRisk,
      headline: rules.headline,
      summary: rules.summary,
      snapshot,
      findings,
      analysis: rules,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - started,
      generationResult: "rules",
    };
  }

  const ai = await interpretWithAi(snapshot, rules);
  return {
    periodDate: snapshot.periodDate,
    source: ai.ok ? "ai" : "rules",
    model: ai.model,
    overallRisk: ai.analysis.overallRisk,
    headline: ai.analysis.headline,
    summary: ai.analysis.summary,
    snapshot,
    findings,
    analysis: ai.analysis,
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    durationMs: Date.now() - started,
    generationResult: ai.ok ? "ai" : "ai_error",
  };
}

/**
 * Devuelve el insight de hoy si existe. Si no, lo crea una vez (reglas, sin Claude).
 * UNIQUE (organization_id, period_date) + ON CONFLICT DO NOTHING evita carreras.
 */
export async function getOrCreateDailyInsight(
  organizationId: string,
  client: InsightDbClient
): Promise<DailyInsight> {
  const periodDate = periodDateInSantiago();
  const existing = await getInsightForDate(organizationId, periodDate, client);
  if (existing) return existing;

  const payload = await buildInsightPayload(organizationId, client, { withAi: false });
  const inserted = await insertDailyInsightIfAbsent(organizationId, payload, client);
  if (inserted) return inserted;

  const winner = await getInsightForDate(organizationId, periodDate, client);
  if (winner) return winner;
  throw new Error("No se pudo crear el análisis diario");
}

/**
 * force: regenera el día (snapshot + Claude si hay clave).
 * sin force: solo get-or-create, nunca Claude.
 */
export async function generateDailyInsight(
  organizationId: string,
  client: InsightDbClient,
  options: GenerateInsightOptions = {}
): Promise<DailyInsight> {
  if (!options.force) {
    return getOrCreateDailyInsight(organizationId, client);
  }

  const payload = await buildInsightPayload(organizationId, client, { withAi: true });
  return upsertDailyInsight(organizationId, payload, client);
}

export async function loadOrCreateDailyInsight(
  organizationId: string,
  client: InsightDbClient
): Promise<{ insight: DailyInsight | null; missingTable: boolean }> {
  try {
    const insight = await getOrCreateDailyInsight(organizationId, client);
    return { insight, missingTable: false };
  } catch (error) {
    const err = error as { message?: string; code?: string };
    if (isMissingInsightTable(err)) {
      return { insight: null, missingTable: true };
    }
    const latest = await getLatestInsight(organizationId, client).catch(() => null);
    if (latest) return { insight: latest, missingTable: false };
    throw error;
  }
}
