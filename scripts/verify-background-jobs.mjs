/**
 * Contratos del cron: prefiltro de orgs, lock, escalate bulk, sin jobs borrados.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const cron = readFileSync(join(ROOT, "lib/notifications/cron.ts"), "utf8");
const route = readFileSync(join(ROOT, "app/api/notifications/cron/route.ts"), "utf8");
const escalate = readFileSync(join(ROOT, "app/api/capa/escalate/route.ts"), "utf8");
const migration = readFileSync(
  join(ROOT, "supabase/migrations/045_background_job_lock.sql"),
  "utf8"
);

test("el cron global prefiltra orgs active + managers + trabajo del día", () => {
  assert.match(cron, /export async function listOrganizationsForNotificationCron/);
  assert.match(cron, /access_status", "active"/);
  assert.match(cron, /admin", "quality_manager"/);
  assert.match(cron, /lte\("due_date", in48hIso\)/);
  assert.match(cron, /period_date/);
});

test("managers y prefs se precargan fuera del loop de orgs", () => {
  const all = cron.slice(cron.indexOf("export async function runNotificationCronAllOrgs"));
  assert.match(all, /in\("organization_id", orgIds\)/);
  assert.match(all, /notification_preferences/);
  assert.match(all, /tryAcquireJobLock/);
  assert.match(cron, /try_acquire_job_lock/);
  assert.match(all, /cleanup_rate_limit_windows/);
});

test("escalate no hace notifyOrgManagers por fila", () => {
  assert.match(escalate, /createNotifications/);
  assert.doesNotMatch(escalate, /notifyOrgManagers/);
  assert.match(escalate, /PERMISSIONS.capa.manage/);
});

test("045 lock + índices, sin desactivar RLS de negocio", () => {
  assert.match(migration, /try_acquire_job_lock/);
  assert.match(migration, /idx_nonconformities_open_due_global/);
  assert.match(migration, /idx_audits_open_scheduled_global/);
  assert.match(migration, /GRANT EXECUTE[\s\S]+service_role/);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/);
});

test("la ruta de cron sigue existiendo", () => {
  assert.match(route, /runNotificationCronAllOrgs/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /runNotificationCronForOrg/);
});
