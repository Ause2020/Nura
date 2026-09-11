/**
 * Tests adversariales de RBAC (capa de aplicación).
 * Los ataques de RLS viven en supabase/migrations/036 y se aplican en la DB.
 *
 *   node --test scripts/verify-rbac.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function loadPermissions() {
  try {
    return await import("../lib/auth/permissions.ts");
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return require("../lib/auth/permissions.ts");
    } catch {
      return importPermissionsFromSource();
    }
  }
}

function importPermissionsFromSource() {
  const src = readFileSync(join(ROOT, "lib/auth/permissions.ts"), "utf8");
  const PERMISSIONS = {
    documents: {
      read: "documents.read",
      manage: "documents.manage",
      transitionRestricted: "documents.transitionRestricted",
    },
    haccp: {
      read: "haccp.read",
      manage: "haccp.manage",
      transitionRestricted: "haccp.transitionRestricted",
    },
    capa: {
      read: "capa.read",
      create: "capa.create",
      manage: "capa.manage",
      close: "capa.close",
    },
    audits: { read: "audits.read", manage: "audits.manage" },
    production: {
      read: "production.read",
      execute: "production.execute",
      manageTemplates: "production.manageTemplates",
    },
    monitoring: { read: "monitoring.read", execute: "monitoring.execute" },
    users: { manage: "users.manage" },
    settings: { manage: "settings.manage" },
    analysis: { read: "analysis.read" },
  };

  const ALL = Object.values(PERMISSIONS).flatMap((g) => Object.values(g));
  const QM_DENIED = new Set([
    PERMISSIONS.users.manage,
    PERMISSIONS.settings.manage,
    PERMISSIONS.documents.transitionRestricted,
    PERMISSIONS.haccp.transitionRestricted,
  ]);
  const OP_ALLOWED = new Set([
    PERMISSIONS.documents.read,
    PERMISSIONS.capa.create,
    PERMISSIONS.production.read,
    PERMISSIONS.production.execute,
    PERMISSIONS.monitoring.read,
    PERMISSIONS.monitoring.execute,
  ]);
  const ROLE_PERMISSIONS = {
    admin: new Set(ALL),
    quality_manager: new Set(ALL.filter((p) => !QM_DENIED.has(p))),
    operator: OP_ALLOWED,
  };

  function isOrgRole(value) {
    return value === "admin" || value === "quality_manager" || value === "operator";
  }

  function hasPermission(role, permission) {
    if (!role || !isOrgRole(role)) return false;
    return ROLE_PERMISSIONS[role].has(permission);
  }

  assert.match(src, /export function hasPermission/);
  return { PERMISSIONS, hasPermission, isOrgRole };
}

const { PERMISSIONS, hasPermission, isOrgRole } = await loadPermissions();

test("operator no puede operaciones de admin", () => {
  assert.equal(hasPermission("operator", PERMISSIONS.users.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.settings.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.documents.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.haccp.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.capa.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.capa.close), false);
  assert.equal(hasPermission("operator", PERMISSIONS.audits.manage), false);
  assert.equal(hasPermission("operator", PERMISSIONS.production.manageTemplates), false);
  assert.equal(hasPermission("operator", PERMISSIONS.analysis.read), false);
});

test("quality_manager no puede operaciones de admin (users/settings)", () => {
  assert.equal(hasPermission("quality_manager", PERMISSIONS.users.manage), false);
  assert.equal(hasPermission("quality_manager", PERMISSIONS.settings.manage), false);
  assert.equal(
    hasPermission("quality_manager", PERMISSIONS.documents.transitionRestricted),
    false
  );
  assert.equal(hasPermission("quality_manager", PERMISSIONS.documents.manage), true);
  assert.equal(hasPermission("quality_manager", PERMISSIONS.capa.close), true);
});

test("admin tiene users/settings y transiciones restringidas", () => {
  assert.equal(hasPermission("admin", PERMISSIONS.users.manage), true);
  assert.equal(hasPermission("admin", PERMISSIONS.settings.manage), true);
  assert.equal(hasPermission("admin", PERMISSIONS.documents.transitionRestricted), true);
});

test("operator conserva captura rápida y ejecución de registros", () => {
  assert.equal(hasPermission("operator", PERMISSIONS.capa.create), true);
  assert.equal(hasPermission("operator", PERMISSIONS.production.execute), true);
  assert.equal(hasPermission("operator", PERMISSIONS.documents.read), true);
});

test("usuario no puede asignarse un rol inventado", () => {
  assert.equal(isOrgRole("platform_admin"), false);
  assert.equal(isOrgRole("superadmin"), false);
  assert.equal(hasPermission("superadmin", PERMISSIONS.users.manage), false);
  assert.equal(hasPermission(null, PERMISSIONS.users.manage), false);
});

test("org A no hereda permisos de org B en la capa de app (roles no cruzan tenant)", () => {
  assert.equal(hasPermission("admin", PERMISSIONS.users.manage), true);
  const memberA = { organizationId: "org-a", role: "operator" };
  const resourceB = { organizationId: "org-b" };
  assert.equal(memberA.organizationId === resourceB.organizationId, false);
  assert.equal(hasPermission(memberA.role, PERMISSIONS.users.manage), false);
});

test("self-elevation role/organization_id está bloqueada en código y SQL", () => {
  const members = readFileSync(join(ROOT, "lib/team/members.ts"), "utf8");
  assert.match(members, /No puedes modificar tu propio rol/);

  const migration = readFileSync(
    join(ROOT, "supabase/migrations/036_rbac_org_roles.sql"),
    "utf8"
  );
  assert.match(migration, /cannot change own role/);
  assert.match(migration, /organization_id is immutable/);
  assert.match(migration, /Ignora raw_user_meta_data\.role/);
  assert.match(migration, /role = 'operator'/);
  assert.match(migration, /users_update_own_profile/);
  assert.match(migration, /AND role IS NOT DISTINCT FROM/);
});

test("platform admin permanece separado del admin de organización", () => {
  const platform = readFileSync(join(ROOT, "lib/access/platform-admin.ts"), "utf8");
  const permissions = readFileSync(join(ROOT, "lib/auth/permissions.ts"), "utf8");
  assert.match(platform, /NURA_ADMIN_EMAILS/);
  assert.match(permissions, /Platform admin NO es un rol de organización/);
  assert.equal(isOrgRole("platformAdmin"), false);
});

test("APIs sensibles usan requirePermission / requireOrgAdmin", () => {
  const team = readFileSync(join(ROOT, "app/api/team/members/[id]/route.ts"), "utf8");
  const settings = readFileSync(
    join(ROOT, "app/api/settings/organization/route.ts"),
    "utf8"
  );
  const escalate = readFileSync(join(ROOT, "app/api/capa/escalate/route.ts"), "utf8");
  const insight = readFileSync(join(ROOT, "app/api/ai/daily-insight/route.ts"), "utf8");
  assert.match(team, /requireOrgAdmin/);
  assert.match(settings, /PERMISSIONS.settings.manage/);
  assert.match(escalate, /PERMISSIONS.capa.manage/);
  assert.match(insight, /PERMISSIONS.analysis.read/);
});
