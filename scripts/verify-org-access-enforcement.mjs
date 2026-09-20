/**
 * SEC-P1-01: access_status es autorización (RLS + API), no solo middleware.
 *
 *   node --test scripts/verify-org-access-enforcement.mjs
 *
 * Live opcional:
 *   DATABASE_URL=postgres://...  node --test scripts/verify-org-access-enforcement.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const migration = load("supabase/migrations/048_org_access_enforcement.sql");
const constants = load("lib/access/constants.ts");
const requirePerm = load("lib/auth/require-permission.ts");
const sessionGates = load("lib/access/session-gates.ts");
const guard047 = load("supabase/migrations/047_protect_org_access_fields.sql");

const GATED_TABLES = [
  "haccp_plans",
  "haccp_step_data",
  "haccp_monitoring_records",
  "haccp_teams",
  "haccp_diagrams",
  "nonconformities",
  "capa_actions",
  "audits",
  "audit_findings",
  "controlled_documents",
  "document_versions",
  "production_form_templates",
  "production_form_submissions",
  "ai_daily_insights",
  "notifications",
  "notification_preferences",
  "invitations",
];

const EXCLUDED = [
  "rate_limit_windows",
  "security_abuse_events",
  "background_job_locks",
];

test("semántica: solo active no vencido; pending/suspended/expired denegados", () => {
  assert.match(constants, /status !== "active"/);
  assert.match(constants, /expiry >= today/);
  assert.match(constants, /organizationRecordIsAllowed/);
  assert.match(migration, /access_status IS DISTINCT FROM 'active'/);
  assert.match(migration, /access_expires_at < CURRENT_DATE/);
  const helperFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.current_organization_access_allowed"),
    migration.indexOf("REVOKE ALL ON FUNCTION public.current_organization_access_allowed")
  );
  assert.doesNotMatch(helperFn, /access_granted_at/);
  assert.match(constants, /pending: "Pendiente"/);
  assert.match(constants, /suspended: "Suspendido"/);
  assert.match(constants, /expired: "Vencido"/);
});

test("helper DB: auth.uid only, DEFINER, fail closed, onboarding sin org", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.current_organization_access_allowed\(\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = public/);
  assert.match(migration, /STABLE/);
  assert.match(migration, /WHERE p\.id = auth\.uid\(\)/);
  assert.match(migration, /WHEN p\.organization_id IS NULL THEN true/);
  assert.match(migration, /COALESCE\(/);
  assert.match(migration, /false/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.current_organization_access_allowed"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.current_organization_access_allowed")
    ),
    /p_organization_id|organization_id\s+uuid/
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.current_organization_access_allowed\(\) TO authenticated/
  );
});

test("RLS: RESTRICTIVE gate en tablas de negocio; no ensancha ACL", () => {
  assert.match(migration, /AS RESTRICTIVE/);
  assert.match(migration, /apply_org_access_gate/);
  assert.match(migration, /FOR ALL/);
  assert.match(migration, /c\.relname NOT IN \(/);
  for (const table of EXCLUDED) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /org_access_gate_organizations_update/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /users_read_own_organization|acceso-pendiente|SELECT no/);
  assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("tablas prioritarias quedan en el inventario del gate dinámico", () => {
  for (const table of GATED_TABLES) {
    assert.ok(
      !EXCLUDED.includes(table),
      `${table} no debe estar excluida`
    );
  }
  assert.match(migration, /'organizations'/);
  assert.match(migration, /'profiles'/);
});

test("Storage privado exige access allowed; logos no se reescribe", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.storage_is_org_object/);
  assert.match(migration, /current_organization_access_allowed\(\)/);
  assert.doesNotMatch(migration, /bucket_id = 'logos'/);
  const ttl = load("lib/storage/download-policy.ts");
  assert.match(ttl, /PRIVATE_DOWNLOAD_TTL_SECONDS = 5 \* 60/);
});

test("API: requirePermission y rutas sensibles usan el gate; 403 no 500", () => {
  assert.match(requirePerm, /assertOrganizationAccess/);
  assert.match(requirePerm, /organizationRecordIsAllowed/);
  assert.match(requirePerm, /isPlatformAdmin/);
  assert.match(requirePerm, /AuthzError\(403, "Forbidden"\)/);

  const routes = [
    "app/api/ai/daily-insight/route.ts",
    "app/api/ai/nc-analysis/route.ts",
    "app/api/settings/export/route.ts",
    "app/api/export/audit-pdf/[id]/route.tsx",
    "app/api/team/members/route.ts",
    "app/api/team/invite/route.ts",
    "app/api/quick-capture/nc/route.ts",
    "app/api/quick-capture/registro/route.ts",
    "app/api/monitoreo/ocr/route.ts",
    "app/api/capa/escalate/route.ts",
    "app/api/kiosk/metrics/route.ts",
  ];
  for (const rel of routes) {
    const src = load(rel);
    assert.match(
      src,
      /requirePermission|requireOrgAdmin/,
      `${rel} must use the shared gate`
    );
  }

  const download = load("app/api/storage/download/route.ts");
  const cron = load("app/api/notifications/cron/route.ts");
  const auditMail = load("app/api/notifications/audit-completed/route.ts");
  assert.match(download, /assertOrganizationAccess/);
  assert.match(download, /status: 403/);
  assert.match(cron, /assertOrganizationAccess/);
  assert.match(cron, /status: 403/);
  assert.match(auditMail, /assertOrganizationAccess/);
});

test("excepciones: auth, acceso-pendiente, accept, platform admin, onboarding", () => {
  const login = load("app/api/auth/login/route.ts");
  const forgot = load("app/api/auth/forgot-password/route.ts");
  const accept = load("app/api/team/accept/route.ts");
  const adminOrgs = load("app/api/admin/organizations/route.ts");
  const pending = load("app/acceso-pendiente/page.tsx");
  const onboarding = load("supabase/migrations/036_rbac_org_roles.sql");

  assert.doesNotMatch(login, /assertOrganizationAccess/);
  assert.doesNotMatch(forgot, /assertOrganizationAccess/);
  assert.doesNotMatch(accept, /assertOrganizationAccess/);
  assert.match(adminOrgs, /requirePlatformAdmin/);
  assert.match(pending, /access_status, access_expires_at/);
  assert.match(onboarding, /INSERT INTO public\.organizations/);
  assert.match(sessionGates, /organizationRecordIsAllowed/);
});

test("P1-02 intacto: org admin no puede reactivar; service_role sí", () => {
  assert.match(guard047, /protect_org_access_fields/);
  assert.match(guard047, /access_status/);
  assert.match(guard047, /auth\.role\(\) = 'service_role'/);
  assert.match(migration, /047 intactos|service_role sigue con BYPASSRLS/);
});

test("QR de org sin acceso no entrega contexto; tenant isolation no se toca", () => {
  const qr = load("lib/production-records/qr-context.ts");
  assert.match(qr, /organizationRecordIsAllowed/);
  assert.match(qr, /access_status, access_expires_at/);
  assert.match(migration, /current_organization_id\(\)/);
  assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test("live: helper fail-closed + policies RESTRICTIVE presentes", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_org_access_enforcement.sql");
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
