/**
 * Contratos de ai_daily_insights: un insight por org+día, sin Claude en Dashboard,
 * agregados para el prompt, UNIQUE + ON CONFLICT.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const generate = readFileSync(join(ROOT, "lib/ai-insights/generate.ts"), "utf8");
const store = readFileSync(join(ROOT, "lib/ai-insights/store.ts"), "utf8");
const snapshot = readFileSync(join(ROOT, "lib/ai-insights/snapshot.ts"), "utf8");
const dashboard = readFileSync(
  join(ROOT, "app/(dashboard)/dashboard/page.tsx"),
  "utf8"
);
const analisis = readFileSync(
  join(ROOT, "app/(dashboard)/analisis/page.tsx"),
  "utf8"
);
const enricher = readFileSync(
  join(ROOT, "components/ai-insights/analisis-enricher.tsx"),
  "utf8"
);
const api = readFileSync(join(ROOT, "app/api/ai/daily-insight/route.ts"), "utf8");
const cron = readFileSync(join(ROOT, "lib/notifications/cron.ts"), "utf8");
const migration = readFileSync(
  join(ROOT, "supabase/migrations/044_ai_daily_insights_telemetry.sql"),
  "utf8"
);
const schema = readFileSync(
  join(ROOT, "supabase/migrations/033_ai_daily_insights.sql"),
  "utf8"
);

test("Dashboard no llama a Claude ni genera insights", () => {
  assert.match(dashboard, /getInsightTeaser/);
  assert.doesNotMatch(dashboard, /generateDailyInsight|getOrCreateDailyInsight|callClaude/);
});

test("abrir /analisis no dispara Claude en background", () => {
  assert.match(analisis, /loadOrCreateDailyInsight/);
  assert.doesNotMatch(analisis, /AnalisisEnricher|needsAi|isAiConfigured/);
  assert.match(enricher, /force:\s*true/);
  assert.doesNotMatch(enricher, /useEffect/);
});

test("get-or-create consulta org+fecha y no llama Claude", () => {
  const fn = generate.slice(generate.indexOf("export async function getOrCreateDailyInsight"));
  assert.match(fn, /getInsightForDate/);
  assert.match(fn, /insertDailyInsightIfAbsent/);
  assert.match(fn, /withAi:\s*false/);
  assert.doesNotMatch(fn.slice(0, 800), /interpretWithAi|callClaude/);
});

test("Claude solo corre con force explícito", () => {
  const gen = generate.slice(generate.indexOf("export async function generateDailyInsight"));
  assert.match(gen, /if \(!options\.force\)/);
  assert.match(gen, /withAi:\s*true/);
  assert.match(api, /force === true/);
});

test("UNIQUE org+fecha y ON CONFLICT DO NOTHING", () => {
  assert.match(schema, /UNIQUE \(organization_id, period_date\)/);
  assert.match(store, /onConflict:\s*"organization_id,period_date"/);
  assert.match(store, /ignoreDuplicates:\s*true/);
  assert.match(migration, /ADD CONSTRAINT ai_daily_insights_organization_id_period_date_key/);
});

test("el snapshot usa conteos y no baja históricos abiertos", () => {
  assert.match(snapshot, /count:\s*"exact",\s*head:\s*true/);
  assert.doesNotMatch(snapshot, /\.limit\(200\)|\.limit\(400\)/);
  assert.match(generate, /compactForAi/);
});

test("se registran modelo, tokens, duración y resultado", () => {
  assert.match(store, /input_tokens/);
  assert.match(store, /duration_ms/);
  assert.match(store, /generation_result/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS input_tokens/);
  assert.match(generate, /generationResult/);
});

test("cron no llama Claude: getOrCreateDailyInsight", () => {
  assert.match(cron, /getOrCreateDailyInsight/);
  assert.doesNotMatch(cron, /generateDailyInsight/);
});

test("044 no toca RLS", () => {
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP POLICY/);
});
