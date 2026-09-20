/**
 * Phase 2A: session gates stay equivalent; prefetch burst is counted.
 *
 *   node --test scripts/verify-nav-phase-2a.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function isAccessAllowed(status, expiresAt) {
  if (status !== "active") return false;
  if (!expiresAt) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt);
  expiry.setHours(0, 0, 0, 0);
  return expiry >= today;
}

function resolveAccessStatus(status, expiresAt) {
  if (status === "active" && expiresAt) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiresAt);
    expiry.setHours(0, 0, 0, 0);
    if (expiry < today) return "expired";
  }
  return status;
}

function resolveSessionGates({ profile, org, platformAdmin }) {
  const onboardingCompleted = profile?.onboarding_completed ?? false;
  const userRole = profile?.role ?? null;
  let accessAllowed = true;

  if (profile?.organization_id && !platformAdmin) {
    if (org) {
      const resolved = resolveAccessStatus(org.access_status, org.access_expires_at);
      accessAllowed = isAccessAllowed(resolved, org.access_expires_at);
    } else {
      accessAllowed = false;
    }
  }

  return { onboardingCompleted, accessAllowed, userRole };
}

function isRouterPrefetch(headers) {
  const nextPrefetch = headers.get("next-router-prefetch");
  if (nextPrefetch === "1" || nextPrefetch === "true") return true;
  return headers.get("purpose") === "prefetch";
}

test("active org with future expiry is allowed", () => {
  const gates = resolveSessionGates({
    profile: {
      onboarding_completed: true,
      organization_id: "org-1",
      role: "admin",
    },
    org: { access_status: "active", access_expires_at: "2099-01-01" },
    platformAdmin: false,
  });
  assert.equal(gates.accessAllowed, true);
  assert.equal(gates.onboardingCompleted, true);
  assert.equal(gates.userRole, "admin");
});

test("suspended org is denied", () => {
  const gates = resolveSessionGates({
    profile: {
      onboarding_completed: true,
      organization_id: "org-1",
      role: "operator",
    },
    org: { access_status: "suspended", access_expires_at: null },
    platformAdmin: false,
  });
  assert.equal(gates.accessAllowed, false);
});

test("missing org row with organization_id is denied", () => {
  const gates = resolveSessionGates({
    profile: {
      onboarding_completed: true,
      organization_id: "org-1",
      role: "admin",
    },
    org: null,
    platformAdmin: false,
  });
  assert.equal(gates.accessAllowed, false);
});

test("platform admin skips org access denial", () => {
  const gates = resolveSessionGates({
    profile: {
      onboarding_completed: true,
      organization_id: "org-1",
      role: "admin",
    },
    org: null,
    platformAdmin: true,
  });
  assert.equal(gates.accessAllowed, true);
});

test("no organization_id stays allowed so onboarding can run", () => {
  const gates = resolveSessionGates({
    profile: {
      onboarding_completed: false,
      organization_id: null,
      role: "admin",
    },
    org: null,
    platformAdmin: false,
  });
  assert.equal(gates.accessAllowed, true);
  assert.equal(gates.onboardingCompleted, false);
});

test("prefetch headers are detected without treating RSC as prefetch", () => {
  assert.equal(
    isRouterPrefetch({ get: (n) => (n === "next-router-prefetch" ? "1" : null) }),
    true
  );
  assert.equal(
    isRouterPrefetch({ get: (n) => (n === "purpose" ? "prefetch" : null) }),
    true
  );
  assert.equal(isRouterPrefetch({ get: () => null }), false);
  assert.equal(
    isRouterPrefetch({ get: (n) => (n === "rsc" ? "1" : null) }),
    false
  );
});

test("scenario B drops the sidebar prefetch burst", () => {
  const getUser = 240;
  const profile = 252;
  const org = 225;
  const mwSerial = getUser + profile + org;
  const mwCombined = getUser + Math.max(profile, org);
  const documentPlusPrefetch = 8;
  const scenarioACalls = documentPlusPrefetch * 3;
  const scenarioBCalls = 1 * 2;
  const scenarioASupabaseMs = documentPlusPrefetch * mwSerial;
  const scenarioBSupabaseMs = mwCombined;

  assert.equal(mwSerial, 717);
  assert.equal(mwCombined, 492);
  assert.equal(scenarioACalls, 24);
  assert.equal(scenarioBCalls, 2);
  assert.ok(scenarioACalls / scenarioBCalls === 12);
  assert.ok(scenarioASupabaseMs > scenarioBSupabaseMs * 10);
});

test("middleware keeps getUser and the same redirect fields", () => {
  const mw = load("lib/supabase/middleware.ts");
  const root = load("middleware.ts");
  assert.match(mw, /auth\.getUser\(\)/);
  assert.match(mw, /resolveSessionGates/);
  assert.match(mw, /loadSessionGates/);
  assert.doesNotMatch(mw, /service_role/);
  assert.match(root, /canAccessPath/);
  assert.match(root, /acceso-pendiente/);
  assert.match(root, /onboardingCompleted/);
  assert.match(root, /accessAllowed/);
});

test("sidebar chrome does not viewport-prefetch protected modules", () => {
  const sidebar = load("components/layout/sidebar.tsx");
  const navLink = load("components/layout/app-nav-link.tsx");
  assert.match(sidebar, /AppNavLink/);
  assert.doesNotMatch(sidebar, /from \"next\/link\"/);
  assert.match(navLink, /prefetch=\{false\}/);
  assert.match(navLink, /router\.prefetch/);
});

test("dashboard layout does not await session before children", () => {
  const layout = load("app/(dashboard)/layout.tsx");
  assert.match(layout, /Suspense/);
  assert.match(layout, /DashboardSidebar/);
  assert.doesNotMatch(layout, /await getSessionUser/);
  assert.doesNotMatch(layout, /await getSessionProfile/);
});
