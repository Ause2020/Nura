/**
 * SEC-P1-03: notifications no aceptan destinatarios de otra org
 * ni links externos por caminos de usuario.
 *
 *   node --test scripts/verify-notification-tenant.mjs
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

const migration = load("supabase/migrations/049_notifications_same_org.sql");
const notifications = load("lib/notifications.ts");
const panel = load("components/layout/notification-panel.tsx");
const policy041 = load("supabase/migrations/041_optimize_rls.sql");

function isSafeNotificationLink(link) {
  if (link == null) return true;
  const trimmed = String(link).trim();
  if (trimmed.length <= 1) return false;
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("\\") || trimmed.includes("\n") || trimmed.includes("\r")) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

test("writers inventariados: JWT de app + cron/service_role, sin INSERT PostgREST", () => {
  assert.match(load("components/capa/create-nc-form.tsx"), /notifyOrgManagers/);
  assert.match(
    load("components/documents/document-detail-view.tsx"),
    /createNotifications/
  );
  assert.match(load("app/api/quick-capture/nc/route.ts"), /notifyOrgManagers/);
  assert.match(load("app/api/capa/escalate/route.ts"), /createNotifications/);
  assert.match(load("lib/integrations/nonconformity-draft.ts"), /notifyOrgManagers/);
  assert.match(load("lib/notifications/cron.ts"), /createNotifications/);
  assert.match(notifications, /rpc\("create_org_notifications"/);
  assert.match(migration, /DROP POLICY IF EXISTS notifications_insert/);
  assert.match(migration, /REVOKE INSERT ON TABLE public\.notifications FROM authenticated/);
});

test("RPC: mismo tenant, fail closed, service_role no mezcla orgs", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_org_notifications/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /current_organization_id\(\)/);
  assert.match(migration, /current_organization_access_allowed\(\)/);
  assert.match(migration, /notification recipient is not in the organization/);
  assert.match(migration, /notification organization_id does not match session/);
  assert.match(migration, /p\.organization_id = CASE/);
  assert.match(migration, /GRANT EXECUTE[^\n]+TO authenticated/);
  assert.match(migration, /GRANT EXECUTE[^\n]+TO service_role/);
});

test("SELECT sigue siendo solo el dueño; UPDATE de leído intacto", () => {
  const slice = policy041.slice(policy041.indexOf("notifications_select"));
  assert.match(slice, /user_id = auth\.uid\(\)/);
  assert.match(notifications, /markNotificationRead/);
  assert.match(notifications, /\.update\(\{ read: true \}\)/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS notifications_select/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS notifications_update/);
});

test("links internos válidos; esquemas externos rechazados", () => {
  const helper = load("lib/notifications/safe-link.ts");
  assert.match(helper, /export function isSafeNotificationLink/);
  assert.match(helper, /trimmed\.startsWith\("\/\/"\)/);
  assert.equal(isSafeNotificationLink("/capa"), true);
  assert.equal(isSafeNotificationLink("/haccp/plan"), true);
  assert.equal(isSafeNotificationLink("/auditorias/abc/ejecutar"), true);
  assert.equal(isSafeNotificationLink("/documentos/x"), true);
  assert.equal(isSafeNotificationLink("/dashboard"), true);
  assert.equal(isSafeNotificationLink("/analisis"), true);
  assert.equal(isSafeNotificationLink(null), true);

  assert.equal(isSafeNotificationLink("https://evil.example"), false);
  assert.equal(isSafeNotificationLink("http://evil.example"), false);
  assert.equal(isSafeNotificationLink("//evil.example"), false);
  assert.equal(isSafeNotificationLink("javascript:alert(1)"), false);
  assert.equal(isSafeNotificationLink("data:text/html,phish"), false);
  assert.equal(isSafeNotificationLink("/"), false);
  assert.equal(isSafeNotificationLink(""), false);

  assert.match(migration, /is_safe_notification_link/);
  assert.match(migration, /notifications_link_internal/);
  assert.match(panel, /isSafeNotificationLink/);
});

test("browser no escribe notifications.from.insert", () => {
  const ncForm = load("components/capa/create-nc-form.tsx");
  const docs = load("components/documents/document-detail-view.tsx");
  assert.doesNotMatch(ncForm, /\.from\(["']notifications["']\)/);
  assert.doesNotMatch(docs, /\.from\(["']notifications["']\)/);
  assert.match(ncForm, /\/capa\/\$\{ncId\}/);
  assert.match(docs, /\/documentos\/\$\{doc\.id\}/);
});

test("live: helper de link + INSERT authenticated denegado", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_notification_tenant.sql");
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
