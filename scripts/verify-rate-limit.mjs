/**
 * Controles de rate limiting: clasificación, claves, headers, 429,
 * store compartido (multi-instancia) y cobertura de endpoints.
 *
 *   node --test scripts/verify-rate-limit.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildBucketKeys,
  classifyPath,
  consumeFixedWindow,
  DEFAULT_POLICIES,
  getClientIp,
  hashSubject,
  isCronAuthorized,
  isRateLimitDisabled,
  normalizePath,
  RATE_LIMIT_ERROR_BODY,
  rateLimitResponseInit,
  resolvePolicies,
} from "../lib/rate-limit/core.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".next-verify" ||
      entry === ".git"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function headers(map) {
  return {
    get(name) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

test("defaults match the documented policy families", () => {
  assert.equal(DEFAULT_POLICIES.PUBLIC_FORM.max, 20);
  assert.equal(DEFAULT_POLICIES.PUBLIC_FORM.windowSec, 60);
  assert.equal(DEFAULT_POLICIES.UPLOAD.max, 5);
  assert.equal(DEFAULT_POLICIES.UPLOAD.windowSec, 600);
  assert.equal(DEFAULT_POLICIES.AUTH.max, 5);
  assert.equal(DEFAULT_POLICIES.AUTH.windowSec, 60);
  assert.equal(DEFAULT_POLICIES.AI.max, 10);
  assert.equal(DEFAULT_POLICIES.ADMIN.max, 60);
  assert.ok(DEFAULT_POLICIES.ADMIN.max > DEFAULT_POLICIES.AUTH.max);
});

test("limits are configurable via environment variables", () => {
  const policies = resolvePolicies({
    RATE_LIMIT_AUTH_MAX: "3",
    RATE_LIMIT_AUTH_WINDOW_SEC: "120",
    RATE_LIMIT_AI_MAX: "2",
  });
  assert.equal(policies.AUTH.max, 3);
  assert.equal(policies.AUTH.windowSec, 120);
  assert.equal(policies.AI.max, 2);
  assert.equal(policies.PUBLIC_FORM.max, 20);
});

test("invalid env values fall back instead of opening the limiter", () => {
  const policies = resolvePolicies({
    RATE_LIMIT_AUTH_MAX: "0",
    RATE_LIMIT_AUTH_WINDOW_SEC: "-5",
    RATE_LIMIT_AI_MAX: "not-a-number",
  });
  assert.equal(policies.AUTH.max, 1);
  assert.equal(policies.AUTH.windowSec, 1);
  assert.equal(policies.AI.max, 10);
});

test("classifies every current API and the priority legacy paths", () => {
  const cases = [
    ["/api/monitoreo/qr-submit", {}, "PUBLIC_FORM"],
    ["/api/monitoreo/ocr", { hasUser: true }, "AI"],
    ["/api/monitoreo/ocr", {}, "UNAUTH_PROBE"],
    ["/api/auth/login", {}, "AUTH"],
    ["/api/auth/forgot-password", {}, "AUTH"],
    ["/auth/callback", {}, "AUTH"],
    ["/api/team/accept", {}, "AUTH"],
    ["/api/team/invite", { hasUser: true }, "EMAIL"],
    ["/api/team/create-user", { hasUser: true }, "EMAIL"],
    ["/api/ai/nc-analysis", { hasUser: true }, "AI"],
    ["/api/ai/daily-insight", { hasUser: true }, "AI"],
    ["/api/capa/escalate", { hasUser: true }, "HEAVY"],
    ["/api/notifications/cron", { cronAuthorized: true }, "CRON"],
    ["/api/notifications/cron", { hasUser: true }, "HEAVY"],
    ["/api/notifications/cron", {}, "UNAUTH_PROBE"],
    ["/api/notifications/audit-completed", { hasUser: true }, "EMAIL"],
    ["/api/notifications/complaint-critical", { hasUser: true }, "EMAIL"],
    ["/api/admin/organizations", { hasUser: true }, "ADMIN"],
    ["/api/admin/provision-client", { hasUser: true }, "ADMIN"],
    ["/api/admin/provision-user", { hasUser: true }, "ADMIN"],
    ["/api/quick-capture/registro", { hasUser: true }, "WRITE"],
    ["/api/quick-capture/nc", { hasUser: true }, "WRITE"],
    ["/api/settings/export", { hasUser: true }, "HEAVY"],
    ["/api/export/audit-pdf/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", { hasUser: true }, "HEAVY"],
    ["/api/storage/download", { hasUser: true }, "AUTHENTICATED"],
    ["/api/settings/organization", { hasUser: true }, "AUTHENTICATED"],
    ["/api/team/members", { hasUser: true }, "AUTHENTICATED"],
    ["/api/kiosk/metrics", { hasUser: true }, "AUTHENTICATED"],
    ["/api/kiosk/metrics", {}, "UNAUTH_PROBE"],
    ["/m/qr-token", {}, "PUBLIC_PAGE"],
    ["/registro-calidad/legacy-token", {}, "PUBLIC_PAGE"],
    ["/invitacion/invite-token", {}, "PUBLIC_PAGE"],
    ["/dashboard", { hasUser: true }, null],
  ];

  for (const [path, ctx, expected] of cases) {
    assert.equal(classifyPath(path, ctx), expected, path);
  }
});

test("normalizePath never logs raw tokens or ids", () => {
  assert.equal(normalizePath("/proveedor/super-secret-token"), "/proveedor/:token");
  assert.equal(normalizePath("/m/qr-abc"), "/m/:token");
  assert.equal(
    normalizePath("/api/export/audit-pdf/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    "/api/export/audit-pdf/:id"
  );
  assert.equal(
    normalizePath("/api/suppliers/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/portal-token"),
    "/api/suppliers/:id/portal-token"
  );
});

test("trusted Vercel IP wins over spoofed forwarding headers", () => {
  const ip = getClientIp(
    headers({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
      "x-real-ip": "198.51.100.1",
      "cf-connecting-ip": "198.51.100.1",
      "true-client-ip": "198.51.100.1",
    })
  );
  assert.equal(ip, "203.0.113.9");
});

test("changing untrusted IP headers does not bypass a known Vercel IP", () => {
  const a = getClientIp(
    headers({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1",
    })
  );
  const b = getClientIp(
    headers({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "8.8.8.8",
      "x-real-ip": "9.9.9.9",
    })
  );
  assert.equal(a, b);
});

test("shared store enforces the same window across two instances", () => {
  const shared = new Map();
  const key = "rl:AUTH:ip:abc";
  const now = Date.parse("2026-09-10T12:00:00Z");
  const a = consumeFixedWindow(shared, key, 2, 60, now);
  const b = consumeFixedWindow(shared, key, 2, 60, now + 10);
  const c = consumeFixedWindow(shared, key, 2, 60, now + 20);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(c.allowed, false);
  assert.equal(c.retryAfter > 0, true);
});

test("429 response is generic and includes Retry-After", () => {
  const init = rateLimitResponseInit(41.8);
  assert.equal(init.status, 429);
  assert.equal(init.headers["Retry-After"], "41");
  assert.equal(RATE_LIMIT_ERROR_BODY.error, "Too many requests");
  assert.equal("remaining" in RATE_LIMIT_ERROR_BODY, false);
  assert.equal("limit" in RATE_LIMIT_ERROR_BODY, false);
});

test("bucket keys hash subjects and never use organization_id", async () => {
  const spec = resolvePolicies().AUTH;
  const buckets = await buildBucketKeys({
    policy: "AUTH",
    spec,
    ip: "203.0.113.9",
    email: "user@example.com",
    pepper: "test-pepper",
  });
  const serialized = JSON.stringify(buckets);
  assert.equal(serialized.includes("user@example.com"), false);
  assert.equal(serialized.includes("203.0.113.9"), false);
  assert.equal(serialized.includes("organization"), false);
  assert.ok(buckets.every((b) => b.key.startsWith("rl:AUTH:")));
});

test("token subjects are hashed", async () => {
  const token = "portal-secret-token-value";
  const buckets = await buildBucketKeys({
    policy: "UPLOAD",
    spec: resolvePolicies().UPLOAD,
    ip: "203.0.113.9",
    token,
    pepper: "test-pepper",
    only: ["token"],
  });
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].key.includes(token), false);
  const expected = await hashSubject(token, "test-pepper");
  assert.ok(buckets[0].key.endsWith(expected));
});

test("authenticated policies do not key solely by IP", async () => {
  const buckets = await buildBucketKeys({
    policy: "AUTHENTICATED",
    spec: resolvePolicies().AUTHENTICATED,
    ip: "203.0.113.9",
    userId: "user-1",
    pepper: "test-pepper",
  });
  assert.deepEqual(
    buckets.map((b) => b.type),
    ["user"]
  );
});

test("AI uses user + a higher secondary IP cap so one NAT is not blocked", async () => {
  const spec = resolvePolicies();
  assert.ok(spec.AI.ipSecondary.max > spec.AI.max);
  const buckets = await buildBucketKeys({
    policy: "AI",
    spec: spec.AI,
    ip: "203.0.113.9",
    userId: "user-1",
    pepper: "test-pepper",
  });
  assert.deepEqual(
    buckets.map((b) => b.type).sort(),
    ["ip", "user"]
  );
});

test("cron authorization is exact and not prefix-based", () => {
  assert.equal(isCronAuthorized("Bearer secret", "secret"), true);
  assert.equal(isCronAuthorized("Bearer secret", "secret-extra"), false);
  assert.equal(isCronAuthorized("Bearer ", "secret"), false);
  assert.equal(isCronAuthorized(null, "secret"), false);
});

test("disabled flag is explicit only", () => {
  assert.equal(isRateLimitDisabled({}), false);
  assert.equal(isRateLimitDisabled({ RATE_LIMIT_DISABLED: "true" }), true);
  assert.equal(isRateLimitDisabled({ RATE_LIMIT_DISABLED: "no" }), false);
});

test("middleware enforces server-side limits for all classified traffic", () => {
  const middleware = readFileSync(join(ROOT, "middleware.ts"), "utf8");
  assert.match(middleware, /enforceRateLimit/);
  assert.match(middleware, /userId:\s*user\?\.id/);
});

test("auth forms go through first-party rate-limited APIs", () => {
  const login = readFileSync(join(ROOT, "app/(auth)/login/login-form.tsx"), "utf8");
  const forgot = readFileSync(
    join(ROOT, "app/(auth)/recuperar/forgot-password-form.tsx"),
    "utf8"
  );
  assert.match(login, /\/api\/auth\/login/);
  assert.doesNotMatch(login, /signInWithPassword/);
  assert.match(forgot, /\/api\/auth\/forgot-password/);
  assert.doesNotMatch(forgot, /resetPasswordForEmail/);
});

test("tokenized abuse surfaces add a token dimension", () => {
  const qr = readFileSync(join(ROOT, "app/api/monitoreo/qr-submit/route.ts"), "utf8");
  const accept = readFileSync(join(ROOT, "app/api/team/accept/route.ts"), "utf8");
  for (const src of [qr, accept]) {
    assert.match(src, /rateLimitResponse/);
    assert.match(src, /only:\s*\["token"\]/);
  }
});

test("every app/api route exists in the classifier inventory", () => {
  const files = walk(join(ROOT, "app/api")).filter((f) =>
    /route\.tsx?$/.test(f)
  );
  assert.ok(files.length >= 20);
  for (const file of files) {
    const rel = file
      .slice(join(ROOT, "app").length)
      .replace(/\\/g, "/")
      .replace(/\/route\.tsx?$/, "");
    const path = rel.replace(/\[id\]/g, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    const policy = classifyPath(path, { hasUser: true });
    assert.ok(policy, `unclassified API route: ${rel}`);
  }
});

test("Postgres migration is service_role only and fail-closed RPCs exist", () => {
  const sql = readFileSync(
    join(ROOT, "supabase/migrations/037_rate_limiting.sql"),
    "utf8"
  );
  assert.match(sql, /consume_rate_limit/);
  assert.match(sql, /consume_rate_limits/);
  assert.match(sql, /UNLOGGED TABLE/);
  assert.match(sql, /record_rate_limit_abuse/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*service_role/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.rate_limit_windows/);
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*anon/);
  assert.doesNotMatch(sql, /GRANT SELECT[\s\S]*authenticated/);
});
