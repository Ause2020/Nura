/**
 * Contratos de 041_optimize_rls.sql: InitPlan, mismos ACL, sin aflojar RLS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const migration = readFileSync(
  join(ROOT, "supabase/migrations/041_optimize_rls.sql"),
  "utf8"
);
const dashboard = readFileSync(
  join(ROOT, "supabase/migrations/039_dashboard_metrics.sql"),
  "utf8"
);
const kiosk = readFileSync(
  join(ROOT, "supabase/migrations/040_kiosk_metrics.sql"),
  "utf8"
);

test("041 no desactiva RLS ni promociona INVOKER a DEFINER", () => {
  assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.doesNotMatch(migration, /FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.doesNotMatch(migration, /get_dashboard_metrics/);
  assert.doesNotMatch(migration, /get_kiosk_metrics/);
  assert.match(dashboard, /SECURITY INVOKER/);
  assert.match(kiosk, /SECURITY INVOKER/);
});

test("el generador quality usa InitPlan, no rbac_same_org(columna)", () => {
  const crud = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public._rbac_quality_crud")
  );
  const crudFn = crud.slice(0, crud.indexOf("CREATE OR REPLACE FUNCTION public._rbac_quality_via_plan"));
  assert.match(
    crudFn,
    /organization_id = \(SELECT public\.current_organization_id\(\)\)/
  );
  assert.match(crudFn, /\(SELECT public\.rbac_quality\(\)\)/);
  assert.doesNotMatch(crudFn, /rbac_same_org\(organization_id\)/);
});

test("hijas HACCP usan EXISTS al padre con InitPlan", () => {
  const via = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public._rbac_quality_via_plan")
  );
  const viaFn = via.slice(
    0,
    via.indexOf("CREATE OR REPLACE FUNCTION public._rbac_quality_via_audit")
  );
  assert.match(viaFn, /EXISTS \(/);
  assert.match(viaFn, /p\.id = plan_id/);
  assert.match(
    viaFn,
    /p\.organization_id = \(SELECT public\.current_organization_id\(\)\)/
  );
  assert.match(viaFn, /\(SELECT public\.rbac_quality\(\)\)/);
  assert.doesNotMatch(viaFn, /plan_id IN \(/);
  assert.doesNotMatch(viaFn, /rbac_same_org\(organization_id\)/);
});

test("audit findings/items pasan a pred directo por organization_id", () => {
  assert.match(
    migration,
    /_rbac_quality_crud\('audit_checklist_items'\)/
  );
  assert.match(migration, /_rbac_quality_crud\('audit_findings'\)/);
  const afterItems = migration.slice(
    migration.indexOf("_rbac_quality_crud('audit_checklist_items')")
  );
  assert.doesNotMatch(
    afterItems.slice(0, 400),
    /_rbac_quality_via_audit\('audit_checklist_items'\)/
  );
});

test("producción filtra por organization_id, no por JOIN al padre", () => {
  const prod = migration.slice(
    migration.indexOf("production_form_sections_select_rbac")
  );
  const prodFn = prod.slice(0, prod.indexOf("monitoring_qr_links_select_rbac"));
  assert.match(
    prodFn,
    /organization_id = \(SELECT public\.current_organization_id\(\)\)/
  );
  assert.doesNotMatch(prodFn, /template_id IN \(/);
  assert.doesNotMatch(prodFn, /section_id IN \(/);
  assert.doesNotMatch(prodFn, /submission_id IN \(/);
});

test("NC, documentos y notifications conservan el ACL de 036", () => {
  assert.match(migration, /nonconformities_insert_rbac/);
  assert.match(
    migration,
    /rbac_is\('admin', 'quality_manager', 'operator'\)/
  );
  assert.match(migration, /status IN \('published', 'obsolete'\)/);
  assert.match(migration, /notifications_select/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(
    migration,
    /notifications_insert[\s\S]+current_organization_id\(\)/
  );
});

test("041 crea índices RLS y no pisa 039/040", () => {
  assert.match(migration, /idx_profiles_organization_id/);
  assert.match(migration, /idx_production_form_fields_org/);
  assert.match(migration, /idx_audit_findings_org/);
  assert.match(migration, /idx_haccp_ccp_decisions_hazard/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.get_dashboard_metrics/);
});
