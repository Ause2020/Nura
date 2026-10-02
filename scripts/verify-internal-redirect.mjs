/**
 * SEC-P2-01: sanitizeInternalRedirect — solo paths internos.
 *
 *   node --test scripts/verify-internal-redirect.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

async function loadHelper() {
  const { outputText } = ts.transpileModule(
    load("lib/auth/internal-redirect.ts"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: "internal-redirect.ts",
    }
  );
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`
  );
}

const loginForm = load("app/(auth)/login/login-form.tsx");
const callback = load("app/auth/callback/route.ts");
const helperSrc = load("lib/auth/internal-redirect.ts");

test("login y callback usan el helper; no hay router.push crudo", () => {
  assert.match(loginForm, /sanitizeInternalRedirect\(redirectTo, "\/dashboard"\)/);
  assert.doesNotMatch(loginForm, /router\.push\(redirectTo\)/);
  assert.match(callback, /sanitizeInternalRedirect\(searchParams\.get\("next"\), "\/login"\)/);
  assert.doesNotMatch(callback, /function safeNextPath/);
  const body = helperSrc.slice(helperSrc.indexOf("export function"));
  assert.doesNotMatch(body, /decodeURIComponent\(/);
});

test("acepta destinos internos inequívocos", async () => {
  const { sanitizeInternalRedirect } = await loadHelper();
  const accept = [
    "/dashboard",
    "/haccp",
    "/onboarding",
    "/invitacion/abc123",
    "/registros/historico?q=test",
    "/dashboard#section",
  ];
  for (const value of accept) {
    assert.equal(sanitizeInternalRedirect(value, "/fallback"), value);
  }
});

test("rechaza destinos externos, schemes y vacíos", async () => {
  const { sanitizeInternalRedirect } = await loadHelper();
  const fallback = "/dashboard";
  const reject = [
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "\\evil.example",
    "\\\\evil.example",
    "",
    "   ",
    null,
    undefined,
    "/\\evil.example",
    "/https://evil.example",
    "/javascript:alert(1)",
  ];
  for (const value of reject) {
    assert.equal(
      sanitizeInternalRedirect(value, fallback),
      fallback,
      `should reject ${String(value)}`
    );
  }
});

test("no re-decodifica: %2F%2F literal sigue siendo path interno", async () => {
  const { sanitizeInternalRedirect } = await loadHelper();
  assert.equal(
    sanitizeInternalRedirect("/%2F%2Fevil.example", "/dashboard"),
    "/%2F%2Fevil.example"
  );
  assert.equal(
    sanitizeInternalRedirect("//evil.example", "/dashboard"),
    "/dashboard"
  );
});

test("matriz vía URLSearchParams: encoded, whitespace y control chars", async () => {
  const { sanitizeInternalRedirect } = await loadHelper();
  const ORIGIN = "https://nura.example";
  const reject = [
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "/%5Cevil.example",
    "%5C%5Cevil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "%2F%2Fevil.example",
    "/%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "%2F%5Cevil.example",
    "/%09/evil.example",
    "%09//evil.example",
    "%20//evil.example",
    "/%0A/evil.example",
    "/%0D/evil.example",
    "/%00/evil.example",
    "https:evil.example",
  ];
  for (const raw of reject) {
    const got = new URLSearchParams(`redirect=${raw}`).get("redirect");
    for (const fallback of ["/dashboard", "/login"]) {
      assert.equal(
        sanitizeInternalRedirect(got, fallback),
        fallback,
        `should reject ${raw}`
      );
    }
  }

  const keep = [
    "/dashboard",
    "/haccp",
    "/onboarding",
    "/invitacion/abc123",
    "/registros/historico?q=test",
    "/dashboard#section",
  ];
  for (const raw of keep) {
    const got = new URLSearchParams(`redirect=${encodeURIComponent(raw)}`).get(
      "redirect"
    );
    const out = sanitizeInternalRedirect(got, "/fallback");
    assert.equal(out, raw);
    assert.equal(new URL(out, `${ORIGIN}/login`).origin, ORIGIN);
    assert.equal(new URL(`${ORIGIN}${out}`).origin, ORIGIN);
  }
});

test("regresión estática: productores internos y sinks", () => {
  const middleware = load("middleware.ts");
  const onboarding = load("app/onboarding/page.tsx");
  const invite = load("components/team/invitation-accept-form.tsx");
  const forgot = load("app/api/auth/forgot-password/route.ts");

  assert.match(middleware, /searchParams\.set\("redirect", pathname\)/);
  assert.match(onboarding, /redirect\("\/login\?redirect=\/onboarding"\)/);
  assert.match(invite, /\/login\?redirect=\/invitacion\/\$\{token\}/);
  assert.match(forgot, /redirectTo: `\$\{appOrigin\(\)\}\/auth\/callback\?next=\/recuperar\/nueva`/);
  assert.match(loginForm, /onboarding_completed/);
  assert.match(loginForm, /router\.push\("\/onboarding"\)/);
  assert.match(loginForm, /router\.push\("\/dashboard"\)/);
});
