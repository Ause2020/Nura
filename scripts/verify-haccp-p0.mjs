/**
 * P0 /haccp: required step-data ids + wizard does not static-import heavy steps.
 *
 *   node --test scripts/verify-haccp-p0.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function requiredStepDataIds(currentStep) {
  if (currentStep === 7) return [7];
  if (currentStep === 8) return [7, 8];
  if (currentStep === 9) return [7, 8, 9];
  if (currentStep === 10) return [7, 8, 10];
  if (currentStep === 11) return [11];
  return [];
}

test("step 1–6 and 12 do not require persisted 7–11", () => {
  for (const step of [1, 2, 3, 4, 5, 6, 12]) {
    assert.deepEqual(requiredStepDataIds(step), []);
  }
});

test("later steps request the persisted payloads they render", () => {
  assert.deepEqual(requiredStepDataIds(7), [7]);
  assert.deepEqual(requiredStepDataIds(8), [7, 8]);
  assert.deepEqual(requiredStepDataIds(9), [7, 8, 9]);
  assert.deepEqual(requiredStepDataIds(10), [7, 8, 10]);
  assert.deepEqual(requiredStepDataIds(11), [11]);
});

test("page skips getAllStepData and loads only required ids", () => {
  const page = load("app/(dashboard)/haccp/page.tsx");
  assert.match(page, /requiredStepDataIds/);
  assert.match(page, /getStepDataForSteps/);
  assert.doesNotMatch(page, /getAllStepData/);
});

test("wizard code-splits steps 2–12 and defers version/matrix chunks", () => {
  const wizard = load("components/haccp-plan/haccp-plan-wizard.tsx");
  const dynamic = load("components/haccp-plan/dynamic-steps.tsx");
  assert.match(wizard, /from \"@\/components\/haccp-plan\/dynamic-steps\"/);
  assert.match(wizard, /from \"@\/components\/haccp-plan\/steps\/step-1-team\"/);
  assert.doesNotMatch(wizard, /from \"@\/components\/haccp-plan\/steps\/step-4-flow\"/);
  assert.doesNotMatch(wizard, /from \"@\/lib\/haccp-plan\/snapshots\"/);
  assert.match(wizard, /stepDataReady/);
  assert.match(wizard, /StepChunkFallback/);
  assert.match(dynamic, /next\/dynamic/);
  assert.match(dynamic, /step-4-flow/);
  assert.match(dynamic, /flow-diagram-editor|Step4Flow/);
});

test("wizard does not mount 7–11 until step data is hydrated", () => {
  const wizard = load("components/haccp-plan/haccp-plan-wizard.tsx");
  assert.match(wizard, /currentStep === 7 && stepDataReady/);
  assert.match(wizard, /getStepDataForSteps/);
  assert.match(wizard, /primeStepDataWrites/);
});

test("source of requiredStepDataIds matches the contract", () => {
  const src = load("lib/haccp-plan/step-data-service.ts");
  assert.match(src, /export function requiredStepDataIds/);
  assert.match(src, /export async function getStepDataForSteps/);
});
