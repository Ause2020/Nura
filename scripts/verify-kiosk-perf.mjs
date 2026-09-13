/**
 * El kiosco no debe recargar el dashboard completo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const view = readFileSync(
  join(ROOT, "components/dashboard/plant-kiosk-view.tsx"),
  "utf8"
);
const page = readFileSync(join(ROOT, "app/(kiosk)/planta/page.tsx"), "utf8");
const api = readFileSync(join(ROOT, "app/api/kiosk/metrics/route.ts"), "utf8");
const sql = readFileSync(
  join(ROOT, "supabase/migrations/040_kiosk_metrics.sql"),
  "utf8"
);

test("el kiosco no usa router.refresh para el polling", () => {
  assert.doesNotMatch(view, /useRouter/);
  assert.doesNotMatch(view, /router\.refresh/);
  assert.match(view, /\/api\/kiosk\/metrics/);
  assert.match(view, /30/);
  assert.match(view, /60/);
  assert.match(view, /120/);
  assert.match(view, /300/);
});

test("la página de planta no carga el dashboard completo", () => {
  assert.doesNotMatch(page, /fetchDashboardData/);
  assert.match(page, /loadKioskSnapshot/);
});

test("get_kiosk_metrics es SECURITY INVOKER y el API exige sesión", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_kiosk_metrics\(\)/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_kiosk_metrics\(\) TO authenticated/);
  assert.match(api, /PERMISSIONS\.monitoring\.read/);
  assert.match(api, /get_kiosk_metrics|loadKioskSnapshot/);
});
