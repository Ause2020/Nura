/**
 * Contrato 050: drift 030 *_all → quality-only en diseño HACCP.
 * Monitoreo PCC: operator SELECT/INSERT (flujo /registros/historico).
 *
 *   node --test scripts/verify-haccp-rbac-drift.mjs
 *
 * Live opcional:
 *   DATABASE_URL=postgres://...  node --test scripts/verify-haccp-rbac-drift.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const migration = load("supabase/migrations/050_reconcile_haccp_rbac.sql");
const teamPerms = load("lib/team/permissions.ts");
const historico = load("app/(dashboard)/registros/historico/page.tsx");
const monitorLib = load("lib/haccp-plan/monitoring-records.ts");
const contract = load("lib/haccp-plan/monitoring-contract.ts");
const permissions = load("lib/auth/permissions.ts");

const DESIGN_ALL = [
  "haccp_plans_all",
  "haccp_teams_all",
  "haccp_plan_products_all",
  "haccp_diagrams_all",
  "haccp_validations_all",
  "haccp_plan_hazards_all",
  "haccp_ccp_decisions_all",
  "haccp_step_data_all",
  "haccp_monitoring_records_all",
];

const VIA_PLAN = [
  "haccp_teams",
  "haccp_plan_products",
  "haccp_diagrams",
  "haccp_validations",
  "haccp_plan_hazards",
  "haccp_ccp_decisions",
];

test("050 no edita migraciones históricas P1/RBAC", () => {
  assert.doesNotMatch(migration, /041_optimize_rls|047_protect|048_org_access|049_notifications/);
  assert.match(migration, /No edita 030\/036\/041\/047\/048\/049/);
});

test("050 exige generadores 048 antes de regenerar", () => {
  assert.match(migration, /apply_org_access_gate\(text\)/);
  assert.match(migration, /_rbac_quality_crud\(text\)/);
  assert.match(migration, /_rbac_quality_via_plan\(text\)/);
  assert.match(migration, /050 requires 048 generators/);
});

test("helpers restaurados: auth.uid only, DEFINER, grants mínimos", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.current_user_role\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rbac_is\(VARIADIC allowed text\[\]\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rbac_quality\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\._rbac_drop_all_policies\(p_table text\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = public/);
  assert.match(migration, /WHERE id = auth\.uid\(\)/);
  assert.match(migration, /rbac_is\('admin', 'quality_manager'\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.current_user_role\(\) TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rbac_quality\(\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\._rbac_drop_all_policies\(text\) FROM authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\._rbac_quality_crud\(text\) FROM authenticated/);
});

test("elimina las nueve policies 030 *_all por nombre", () => {
  for (const name of DESIGN_ALL) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS "${name}"`));
  }
});

test("regenera diseño con generadores 048 y repone org_access_gate", () => {
  assert.match(migration, /_rbac_quality_crud\('haccp_plans'\)/);
  assert.match(migration, /_rbac_quality_crud\('haccp_step_data'\)/);
  assert.doesNotMatch(migration, /_rbac_quality_crud\('haccp_monitoring_records'\)/);
  for (const table of VIA_PLAN) {
    assert.match(migration, new RegExp(`_rbac_quality_via_plan\\('${table}'\\)`));
  }
  assert.match(migration, /apply_org_access_gate\('haccp_monitoring_records'\)/);
});

test("operator no diseña el plan; sí opera monitoreo PCC", () => {
  assert.match(permissions, /PERMISSIONS\.monitoring\.execute/);
  assert.match(permissions, /haccp\.manage/);
  assert.match(teamPerms, /"\/registros"/);
  assert.doesNotMatch(teamPerms, /"\/haccp"/);
  assert.match(historico, /PccMonitoringPanel/);
  assert.match(historico, /listMonitoringRecords/);
  assert.match(monitorLib, /createMonitoringRecord/);
  assert.match(monitorLib, /from\("haccp_monitoring_records"\)/);
  assert.match(monitorLib, /\.insert\(/);
  assert.match(contract, /getStepData\(organizationId, 7/);
  assert.match(migration, /haccp_step_data_select_operator/);
  assert.match(migration, /haccp_monitoring_records_insert_org/);
  assert.match(migration, /haccp_monitoring_records_select_org/);
  assert.match(migration, /haccp_monitoring_records_update_rbac/);
  assert.match(migration, /AND \(SELECT public\.rbac_quality\(\)\)/);
});

test("live: leftovers 030 ausentes + helpers + gate", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_haccp_rbac_drift.sql");
  if (!databaseUrl || !existsSync(sqlPath)) {
    t.skip("DATABASE_URL no configurada — se omite el ejercicio live");
    return;
  }
  const psql = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { encoding: "utf8" }
  );
  if (psql.error && psql.error.code === "ENOENT") {
    t.skip("psql no está en PATH");
    return;
  }
  assert.equal(psql.status, 0, psql.stderr || psql.stdout);
});
