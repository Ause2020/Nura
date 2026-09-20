/**
 * SEC-P1-02: org admin no puede mutar campos de acceso comercial.
 * El contrato vive en 047 (trigger). RLS de 041 sigue aislando el tenant.
 *
 *   node --test scripts/verify-org-access-guard.mjs
 *
 * Live opcional (ejercita el trigger en Postgres):
 *   DATABASE_URL=postgres://...  node --test scripts/verify-org-access-guard.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const migration = readFileSync(
  join(ROOT, "supabase/migrations/047_protect_org_access_fields.sql"),
  "utf8"
);
const rls = readFileSync(
  join(ROOT, "supabase/migrations/041_optimize_rls.sql"),
  "utf8"
);
const settingsApi = readFileSync(
  join(ROOT, "app/api/settings/organization/route.ts"),
  "utf8"
);
const provision = readFileSync(
  join(ROOT, "lib/admin/provision.ts"),
  "utf8"
);
const onboarding = readFileSync(
  join(ROOT, "supabase/migrations/036_rbac_org_roles.sql"),
  "utf8"
);
const orgType = readFileSync(join(ROOT, "types/database.ts"), "utf8");

const PRIVILEGED = [
  "access_status",
  "access_expires_at",
  "access_granted_at",
  "contract_notes",
  "provisioned_by",
];

const ALLOWED = [
  "name",
  "industry",
  "country",
  "city",
  "employees_range",
  "certifications",
  "logo_url",
];

function orgUpdatePolicy() {
  const start = rls.indexOf('CREATE POLICY "admins_update_own_organization"');
  assert.notEqual(start, -1, "falta policy admins_update_own_organization");
  return rls.slice(start, start + 450);
}

test("047: trigger BEFORE UPDATE, fallo explícito, no restaura, no toca INSERT", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_org_access_fields\(\)/);
  assert.match(migration, /BEFORE UPDATE ON public\.organizations/);
  assert.match(migration, /EXECUTE FUNCTION public\.protect_org_access_fields\(\)/);
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
  assert.match(migration, /RAISE EXCEPTION 'privileged organization access fields are restricted'/);
  assert.match(migration, /ERRCODE = '42501'/);
  assert.doesNotMatch(migration, /NEW\.access_status\s*:=\s*OLD\.access_status/);
  assert.doesNotMatch(migration, /BEFORE INSERT/);
  assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("schema inspected: solo existen los 5 campos comerciales; no hay billing/subscription", () => {
  const typeBlock = orgType.slice(
    orgType.indexOf("export interface Organization"),
    orgType.indexOf("export interface Profile")
  );
  for (const column of PRIVILEGED) {
    assert.match(typeBlock, new RegExp(`\\b${column}\\b`));
    assert.match(
      migration,
      new RegExp(`NEW\\.${column} IS DISTINCT FROM OLD\\.${column}`)
    );
  }
  assert.match(typeBlock, /nc_quarantine_severity_threshold/);
  assert.doesNotMatch(typeBlock, /billing|subscription|stripe|plan_id/i);
  assert.doesNotMatch(migration, /billing|subscription|stripe|plan_id/i);
});

test("1. org admin puede cambiar un campo normal permitido de su organización", () => {
  for (const column of ALLOWED) {
    assert.match(settingsApi, new RegExp(`body\\.${column}`));
    assert.match(settingsApi, new RegExp(`patch\\.${column}`));
  }
  const policy = orgUpdatePolicy();
  assert.match(policy, /id = \(SELECT public\.current_organization_id\(\)\)/);
  assert.match(policy, /rbac_admin\(\)/);
  assert.match(migration, /RETURN NEW/);
});

test("2. org admin NO puede cambiar access_status / expires / granted / contract_notes / provisioned_by", () => {
  const patchStart = settingsApi.indexOf("const patch");
  const patchEnd = settingsApi.indexOf("if (Object.keys(patch)");
  const patchBlock = settingsApi.slice(patchStart, patchEnd);
  for (const column of PRIVILEGED) {
    assert.doesNotMatch(patchBlock, new RegExp(column));
    assert.match(
      migration,
      new RegExp(`NEW\\.${column} IS DISTINCT FROM OLD\\.${column}`)
    );
  }
  assert.match(migration, /RAISE EXCEPTION 'privileged organization access fields are restricted'/);
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
});

test("3. quality_manager no puede modificar esos campos (RLS + trigger)", () => {
  const policy = orgUpdatePolicy();
  assert.match(policy, /rbac_admin\(\)/);
  assert.doesNotMatch(policy, /rbac_quality\(\)/);
  assert.match(migration, /IF auth\.role\(\) = 'service_role' THEN/);
  assert.match(migration, /RAISE EXCEPTION 'privileged organization access fields are restricted'/);
});

test("4. operator no puede modificar esos campos (RLS + trigger)", () => {
  const policy = orgUpdatePolicy();
  assert.doesNotMatch(policy, /rbac_is\('operator'/);
  assert.doesNotMatch(policy, /operator/);
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
});

test("5. service_role SÍ puede modificar los campos privilegiados", () => {
  assert.match(migration, /IF auth\.role\(\) = 'service_role' THEN\s+RETURN NEW;/);
  assert.match(provision, /createAdminClient/);
  assert.match(provision, /access_status: input\.accessStatus/);
  assert.match(provision, /access_granted_at/);
  assert.match(provision, /contract_notes/);
});

test("6. admin de Org A sigue sin poder actualizar Org B", () => {
  const policy = orgUpdatePolicy();
  assert.match(policy, /id = \(SELECT public\.current_organization_id\(\)\)/);
  assert.match(policy, /WITH CHECK/);
  assert.doesNotMatch(policy, /body\.organizationId/);
  assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("7. onboarding INSERT y provisioning de plataforma no se rompen", () => {
  const rpc = onboarding.slice(
    onboarding.indexOf("CREATE OR REPLACE FUNCTION public.complete_user_onboarding")
  );
  const rpcFn = rpc.slice(
    0,
    rpc.indexOf("CREATE OR REPLACE FUNCTION public.protect_profile_identity")
  );
  assert.match(rpcFn, /INSERT INTO public\.organizations/);
  assert.match(rpcFn, /access_status, access_granted_at/);
  assert.match(migration, /BEFORE UPDATE ON public\.organizations/);
  assert.doesNotMatch(migration, /BEFORE INSERT ON public\.organizations/);
  assert.match(provision, /createAdminClient/);
  assert.match(provision, /access_status: "active"/);
  assert.match(provision, /access_granted_at: new Date\(\)\.toISOString\(\)/);
});

test("live: trigger bloquea authenticated y permite service_role", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_org_access_guard.sql");
  if (!databaseUrl || !existsSync(sqlPath)) {
    t.skip("DATABASE_URL no configurada — se omite el ejercicio live del trigger");
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
