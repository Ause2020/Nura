/**
 * Contratos de performance de notifications:
 * upsert ON CONFLICT, cron sin N+1 ni histórico inútil, Realtime intacto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const notifications = readFileSync(join(ROOT, "lib/notifications.ts"), "utf8");
const cron = readFileSync(join(ROOT, "lib/notifications/cron.ts"), "utf8");
const bell = readFileSync(
  join(ROOT, "components/layout/notification-bell.tsx"),
  "utf8"
);
const migration = readFileSync(
  join(ROOT, "supabase/migrations/043_notifications_dedup.sql"),
  "utf8"
);
const send = readFileSync(join(ROOT, "lib/email/send.ts"), "utf8");

test("createNotification no hace SELECT previo: upsert ON CONFLICT DO NOTHING", () => {
  assert.match(notifications, /onConflict:\s*"organization_id,user_id,dedup_key"/);
  assert.match(notifications, /ignoreDuplicates:\s*true/);
  assert.doesNotMatch(
    notifications,
    /\.eq\("dedup_key"[\s\S]{0,80}maybeSingle/
  );
});

test("notifyOrgManagers inserta managers en un solo batch", () => {
  assert.match(notifications, /export async function createNotifications/);
  const notify = notifications.slice(
    notifications.indexOf("export async function notifyOrgManagers")
  );
  assert.match(notify, /createNotifications/);
  assert.doesNotMatch(notify, /for \(const profile/);
});

test("cron filtra NC/auditorías y no baja el histórico abierto", () => {
  assert.match(cron, /\.lte\("due_date", in48hIso\)/);
  assert.match(cron, /\.gte\("scheduled_date", todayIso\)/);
  assert.match(cron, /\.lte\("scheduled_date", in7dIso\)/);
  assert.match(cron, /count:\s*"exact",\s*head:\s*true/);
  assert.match(cron, /createNotifications/);
  assert.doesNotMatch(cron, /await createNotification\(/);
});

test("cron de todas las orgs solo procesa access_status active y salta orgs sin managers", () => {
  assert.match(cron, /\.eq\("access_status", "active"\)/);
  assert.match(cron, /if \(managers\.length === 0\)/);
});

test("emails se resuelven una vez por org, no por cada NC", () => {
  assert.match(send, /export async function getUserEmails/);
  assert.match(cron, /getUserEmails/);
  assert.doesNotMatch(cron, /getUserEmail\(/);
});

test("Realtime de notifications se conserva", () => {
  assert.match(bell, /postgres_changes/);
  assert.match(bell, /table:\s*"notifications"/);
  assert.match(bell, /event:\s*"INSERT"/);
  assert.match(bell, /event:\s*"UPDATE"/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notifications/);
});

test("043 expone UNIQUE para ON CONFLICT y no toca RLS", () => {
  assert.match(migration, /ADD CONSTRAINT notifications_dedup_key/);
  assert.match(migration, /UNIQUE \(organization_id, user_id, dedup_key\)/);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /DROP POLICY/);
});
