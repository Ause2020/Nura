/**
 * Contratos de performance del dashboard: agregados en SQL, listas acotadas.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const migration = readFileSync(
  join(ROOT, "supabase/migrations/039_dashboard_metrics.sql"),
  "utf8"
);
const data = readFileSync(join(ROOT, "lib/dashboard/data.ts"), "utf8");

test("get_dashboard_metrics es SECURITY INVOKER y no DEFINER", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_dashboard_metrics\(\)/);
  assert.match(migration, /SECURITY INVOKER/);
  const fnBlock = migration.slice(migration.indexOf("get_dashboard_metrics"));
  assert.doesNotMatch(fnBlock, /SECURITY DEFINER/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_dashboard_metrics\(\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_dashboard_metrics\(\) FROM PUBLIC/);
});

test("el dashboard no descarga históricos completos para KPIs", () => {
  assert.match(data, /rpc\("get_dashboard_metrics"\)/);
  assert.doesNotMatch(data, /\.limit\(500\)/);
  assert.doesNotMatch(
    data,
    /\.from\("audits"\)[\s\S]{0,200}\.eq\("organization_id", orgId\)\s*;/
  );
  assert.match(data, /\.limit\(LIMIT\./);
});

test("las listas del dashboard tienen límites estrictos", () => {
  assert.match(data, /activitySubmissions: 8/);
  assert.match(data, /activityAudits: 5/);
  assert.match(data, /activityNcs: 5/);
  assert.match(data, /capaActions: 20/);
  assert.match(data, /weekItems: 5/);
  assert.match(data, /\.eq\("organization_id", orgId\)/);
});
