/**
 * Contratos de persistencia HACCP: skip si no cambió, debounce+flush,
 * bulk CCP, diagrama sin SELECT previo ni write por frame.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const writeGuard = readFileSync(join(ROOT, "lib/haccp-plan/write-guard.ts"), "utf8");
const dataService = readFileSync(join(ROOT, "lib/haccp-plan/data-service.ts"), "utf8");
const stepService = readFileSync(join(ROOT, "lib/haccp-plan/step-data-service.ts"), "utf8");
const debounce = readFileSync(
  join(ROOT, "lib/haccp-plan/use-debounced-callback.ts"),
  "utf8"
);
const wizard = readFileSync(
  join(ROOT, "components/haccp-plan/haccp-plan-wizard.tsx"),
  "utf8"
);
const editor = readFileSync(
  join(ROOT, "components/haccp-plan/diagram/flow-diagram-editor.tsx"),
  "utf8"
);

test("write-guard compara payloads sin updated_at", () => {
  assert.match(writeGuard, /export function shouldSkipWrite/);
  assert.match(writeGuard, /export function rememberWrite/);
  assert.match(writeGuard, /export function stripUpdatedAt/);
  assert.match(writeGuard, /JSON\.stringify\(value\)/);
});

test("saveStepData escribe localStorage siempre y salta el upsert remoto si no cambió", () => {
  assert.match(stepService, /LOCAL_BACKUP_KEY/);
  assert.match(stepService, /export function writeStepLocalBackup/);
  const saveFn = stepService.slice(stepService.indexOf("export async function saveStepData"));
  assert.match(saveFn, /writeLocal\(stepId, payload\)/);
  assert.match(saveFn, /shouldSkipWrite\(key, payload\)/);
  const skipIdx = saveFn.indexOf("shouldSkipWrite");
  const upsertIdx = saveFn.indexOf(".upsert(");
  assert.ok(skipIdx > 0 && upsertIdx > skipIdx, "skip debe ir antes del upsert remoto");
});

test("paso 7 hace un saveStepData y un bulk upsert de ccp_decisions", () => {
  const persist7 = wizard.slice(wizard.indexOf("const persistStep7"));
  const persist7Fn = persist7.slice(0, persist7.indexOf("const persistStep8"));
  assert.match(persist7Fn, /saveStepData\(organizationId, 7/);
  assert.match(persist7Fn, /upsertCcpDecisions\(/);
  assert.doesNotMatch(persist7Fn, /rows\.forEach/);
  assert.doesNotMatch(persist7Fn, /upsertCcpDecision\(/);
  assert.match(dataService, /export async function upsertCcpDecisions/);
  const bulk = dataService.slice(dataService.indexOf("export async function upsertCcpDecisions"));
  const bulkFn = bulk.slice(0, bulk.indexOf("export async function upsertCcpDecision("));
  assert.match(bulkFn, /from\("haccp_ccp_decisions"\)\.upsert\(/);
  assert.match(bulkFn, /onConflict:\s*"plan_id,hazard_id"/);
  assert.match(bulkFn, /shouldSkipWrite/);
  assert.doesNotMatch(bulkFn, /\.forEach\(/);
});

test("syncDiagrams hace un upsert por id y no SELECT previo", () => {
  const sync = dataService.slice(dataService.indexOf("export async function syncDiagrams"));
  const syncFn = sync.slice(0, sync.indexOf("export async function upsertValidation"));
  assert.match(syncFn, /from\("haccp_diagrams"\)/);
  assert.match(syncFn, /\.upsert\(/);
  assert.match(syncFn, /onConflict:\s*"id"/);
  assert.match(syncFn, /shouldSkipWrite/);
  assert.doesNotMatch(syncFn, /\.select\("id"\)/);
  assert.doesNotMatch(syncFn, /Promise\.all\(/);
});

test("el debounce expone flush para no perder writes pendientes", () => {
  assert.match(debounce, /flush:\s*\(\)\s*=>\s*void/);
  assert.match(debounce, /argsRef/);
  assert.match(wizard, /persistDiagrams\.flush\(\)/);
  assert.match(wizard, /visibilitychange/);
  assert.match(wizard, /writeStepLocalBackup/);
});

test("el diagrama no llama onChange en cada frame de pan/drag/wheel", () => {
  assert.match(editor, /patchActive\([\s\S]*false\s*\)/);
  assert.match(editor, /commitWorking\(/);
  assert.match(editor, /scheduleWheelCommit/);
  assert.match(editor, /interactingRef/);
  const move = editor.slice(editor.indexOf("onPointerMove"));
  const moveFn = move.slice(0, move.indexOf("onPointerUp"));
  assert.doesNotMatch(moveFn, /onChange\(/);
  assert.match(moveFn, /persist:\s*false|,\s*false\s*\)/);
});

test("el wizard consolida current_step, checklist y status en un patch", () => {
  assert.match(wizard, /const queuePlanPatch = useCallback/);
  assert.match(wizard, /queuePlanPatch\(\{ current_step: currentStep \}\)/);
  assert.match(wizard, /queuePlanPatch\(\{ checklist_progress: next \}\)/);
  assert.doesNotMatch(wizard, /persistStep\(/);
  assert.doesNotMatch(wizard, /persistChecklist/);
});
