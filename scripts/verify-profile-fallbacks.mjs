/**
 * SP-04: fallbacks de profile nunca reconstruyen admin.
 *
 *   node --test scripts/verify-profile-fallbacks.mjs
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

async function loadMissingProfile() {
  const { outputText } = ts.transpileModule(load("lib/auth/missing-profile.ts"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "missing-profile.ts",
  });
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`
  );
}

test("MISSING PROFILE → NOT ADMIN", async () => {
  const { missingProfileInsert } = await loadMissingProfile();
  const row = missingProfileInsert({
    id: "11111111-1111-4111-8111-111111111111",
    email: "attacker@example.com",
    user_metadata: {
      role: "admin",
      organization_id: "victim-org",
      onboarding_completed: true,
      full_name: "Attacker",
    },
  });

  assert.equal(row.role, "operator");
  assert.notEqual(row.role, "admin");
  assert.equal(row.organization_id, null);
  assert.equal(row.onboarding_completed, false);
  assert.equal(row.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(row.full_name, "Attacker");
});

test("session fallbacks insert operator without user-controlled identity", () => {
  const client = load("lib/auth/session.ts");
  const server = load("lib/auth/session-server.ts");

  assert.match(client, /missingProfileInsert\(user\)/);
  assert.match(server, /missingProfileInsert\(user\)/);
  assert.match(server, /ensureMissingProfileAsOperator/);
  assert.doesNotMatch(client, /ensureProfileWithAdmin/);
  assert.doesNotMatch(server, /ensureProfileWithAdmin/);
  assert.doesNotMatch(client, /role:\s*["']admin["']/);
  assert.doesNotMatch(server, /role:\s*["']admin["']/);
  assert.doesNotMatch(client, /user_metadata\?\.role/);
  assert.doesNotMatch(server, /user_metadata\?\.role/);
  assert.doesNotMatch(client, /user_metadata\?\.organization_id/);
  assert.doesNotMatch(server, /user_metadata\?\.organization_id/);
});

test("missing-profile helper never copies role or org from metadata", () => {
  const src = load("lib/auth/missing-profile.ts");
  assert.match(src, /role:\s*"operator"/);
  assert.match(src, /organization_id:\s*null/);
  assert.match(src, /onboarding_completed:\s*false/);
  assert.doesNotMatch(src, /user_metadata\?\.role/);
  assert.doesNotMatch(src, /["']admin["']/);
});
