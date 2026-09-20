/**
 * Contrato 051: generators RLS no ejecutables por PUBLIC/anon/authenticated.
 * Helpers runtime de policies siguen EXECUTE para authenticated.
 *
 *   node --test scripts/verify-rbac-generator-grants.mjs
 *
 * Live opcional:
 *   DATABASE_URL=postgres://...  node --test scripts/verify-rbac-generator-grants.mjs
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

const migration = load("supabase/migrations/051_lock_down_rbac_generators.sql");
const migration050 = load("supabase/migrations/050_reconcile_haccp_rbac.sql");
const migration048 = load("supabase/migrations/048_org_access_enforcement.sql");

const ADMIN_FNS = [
  "apply_org_access_gate",
  "_rbac_drop_all_policies",
  "_rbac_quality_crud",
  "_rbac_quality_via_plan",
  "_rbac_quality_via_audit",
  "rls_auto_enable",
];

const RUNTIME_FNS = [
  "current_user_role()",
  "rbac_is(text[])",
  "rbac_quality()",
  "rbac_admin()",
  "rbac_same_org(uuid)",
  "current_organization_id()",
  "current_organization_access_allowed()",
  "storage_is_org_object(text)",
  "storage_can_write_bucket(text)",
  "my_organization_id()",
];

test("051 es incremental: no edita históricas ni policies funcionales", () => {
  assert.match(migration, /No edita 030\/036\/041\/047\/048\/049\/050/);
  const sql = migration
    .replace(/--[^\n]*/g, "")
    .replace(/'[^']*'/g, "''");
  assert.doesNotMatch(sql, /\bCREATE\s+(OR\s+REPLACE\s+)?POLICY\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+POLICY\b/i);
  assert.doesNotMatch(sql, /\bALTER\s+POLICY\b/i);
  assert.doesNotMatch(sql, /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
  assert.doesNotMatch(sql, /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i);
  assert.doesNotMatch(sql, /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i);
  assert.doesNotMatch(sql, /\bCREATE\s+FUNCTION\b/i);
  assert.equal(
    migration050.includes("051_lock_down"),
    false,
    "050 no debe mencionar 051"
  );
  assert.equal(
    migration048.includes("051_lock_down"),
    false,
    "048 no debe mencionar 051"
  );
});

test("051 revoca generators admin de PUBLIC/anon/authenticated", () => {
  for (const name of ADMIN_FNS) {
    assert.match(migration, new RegExp(`'${name}'`));
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION %s FROM anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION %s FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO service_role/);
  assert.match(migration, /prosrc ~\* '\(CREATE\|DROP\|ALTER\)\\s\+POLICY'/);
});

test("051 no concede generators a authenticated ni anon", () => {
  const adminBlock = migration.slice(0, migration.indexOf("Runtime helpers"));
  assert.match(adminBlock, /apply_org_access_gate/);
  assert.doesNotMatch(adminBlock, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION %s TO anon/);
});

test("051 reafirma helpers runtime para authenticated, no anon", () => {
  for (const fn of RUNTIME_FNS) {
    assert.match(migration, new RegExp(fn.replace(/[()[\]]/g, "\\$&")));
  }
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION %s TO authenticated/
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION %s FROM anon/
  );
});

test("contrato 050 HACCP no se reescribe", () => {
  assert.match(migration050, /haccp_step_data_select_operator/);
  assert.match(migration050, /haccp_monitoring_records_insert_org/);
  assert.doesNotMatch(migration, /haccp_plans_all/);
  assert.doesNotMatch(migration, /_rbac_quality_crud\('haccp_/);
});

test("live: has_function_privilege authenticated/anon", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_rbac_generator_grants.sql");
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
