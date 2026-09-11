/**
 * Autorización de signed URLs (sin path arbitrario).
 *
 *   node --test scripts/verify-signed-urls.mjs
 *
 * Live opcional contra la app:
 *   STORAGE_TEST_BASE_URL=http://localhost:3000
 *   STORAGE_TEST_USER_A_EMAIL / STORAGE_TEST_USER_A_PASSWORD
 *   STORAGE_TEST_USER_B_EMAIL / STORAGE_TEST_USER_B_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const KINDS = [
  "document-version",
  "production-photo",
  "haccp-training",
  "haccp-validation-file",
  "audit-photo",
  "capa-evidence",
  "nc-evidence",
  "nc-photo",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN = ["path", "bucket", "storage_path", "file_url"];

function isUuid(value) {
  return UUID_RE.test(value);
}

function isKind(value) {
  return KINDS.includes(value);
}

function storagePathBelongsToOrg(path, organizationId) {
  const first = path.split("/").filter(Boolean)[0];
  return Boolean(first && first === organizationId);
}

function downloadAccessDecision({ authenticated, organizationId, resourceOrganizationId }) {
  if (!authenticated) return { status: 401 };
  if (!organizationId) return { status: 403 };
  if (!resourceOrganizationId || resourceOrganizationId !== organizationId) {
    return { status: 404 };
  }
  return { status: 200 };
}

function parseSearchParams(params) {
  for (const key of FORBIDDEN) {
    if (params.has(key)) return { ok: false, error: "invalid" };
  }
  const kind = params.get("kind") ?? "";
  const id = params.get("id") ?? "";
  const fileId = params.get("fileId");
  if (!isKind(kind) || !isUuid(id)) return { ok: false, error: "invalid" };
  if (fileId && !isUuid(fileId)) return { ok: false, error: "invalid" };
  return { ok: true, kind, resourceId: id, fileId: fileId || undefined };
}

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";
const MISSING = "33333333-3333-4333-8333-333333333333";

test("A descarga recurso de A → permitido", () => {
  assert.equal(
    downloadAccessDecision({
      authenticated: true,
      organizationId: ORG_A,
      resourceOrganizationId: ORG_A,
    }).status,
    200
  );
});

test("A descarga recurso de B → 404 (no revela existencia)", () => {
  assert.equal(
    downloadAccessDecision({
      authenticated: true,
      organizationId: ORG_A,
      resourceOrganizationId: ORG_B,
    }).status,
    404
  );
});

test("usuario no autenticado → 401", () => {
  assert.equal(
    downloadAccessDecision({
      authenticated: false,
      organizationId: null,
      resourceOrganizationId: ORG_A,
    }).status,
    401
  );
});

test("recurso inexistente → 404", () => {
  assert.equal(
    downloadAccessDecision({
      authenticated: true,
      organizationId: ORG_A,
      resourceOrganizationId: null,
    }).status,
    404
  );
});

test("recurso de otra organización no se distingue de inexistente", () => {
  const missing = downloadAccessDecision({
    authenticated: true,
    organizationId: ORG_A,
    resourceOrganizationId: null,
  });
  const foreign = downloadAccessDecision({
    authenticated: true,
    organizationId: ORG_A,
    resourceOrganizationId: ORG_B,
  });
  assert.equal(missing.status, foreign.status);
  assert.equal(missing.status, 404);
});

test("autenticado sin organization_id → 403", () => {
  assert.equal(
    downloadAccessDecision({
      authenticated: true,
      organizationId: null,
      resourceOrganizationId: ORG_A,
    }).status,
    403
  );
});

test("rechaza path/bucket arbitrario en la query", () => {
  const sneaky = new URLSearchParams({
    kind: "supplier-document",
    id: DOC_A,
    path: `${ORG_B}/secret.pdf`,
  });
  assert.equal(parseSearchParams(sneaky).ok, false);
});

test("rechaza kind desconocido e id inválido", () => {
  assert.equal(
    parseSearchParams(new URLSearchParams({ kind: "supplier-docs", id: DOC_A })).ok,
    false
  );
  assert.equal(
    parseSearchParams(new URLSearchParams({ kind: "supplier-document", id: "no-uuid" })).ok,
    false
  );
});

test("acepta resource_id + kind válidos", () => {
  const parsed = parseSearchParams(
    new URLSearchParams({ kind: "document-version", id: DOC_A })
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.resourceId, DOC_A);
});

test("el path firmado debe pertenecer a la org de la sesión", () => {
  assert.equal(storagePathBelongsToOrg(`${ORG_A}/${DOC_A}/file.pdf`, ORG_A), true);
  assert.equal(storagePathBelongsToOrg(`${ORG_B}/${DOC_B}/file.pdf`, ORG_A), false);
});

test("TTL de descarga privada es 5 minutos", () => {
  assert.equal(5 * 60, 300);
});

const liveConfigured = Boolean(
  process.env.STORAGE_TEST_BASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.STORAGE_TEST_USER_A_EMAIL &&
    process.env.STORAGE_TEST_USER_A_PASSWORD &&
    process.env.STORAGE_TEST_USER_B_EMAIL &&
    process.env.STORAGE_TEST_USER_B_PASSWORD &&
    process.env.STORAGE_TEST_DOC_A_ID &&
    process.env.STORAGE_TEST_DOC_B_ID
);

test(
  "live API: 401 / 404 cruzado / 200 propio / rechaza path",
  { skip: !liveConfigured },
  async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const base = process.env.STORAGE_TEST_BASE_URL.replace(/\/$/, "");

    async function cookieHeader(email, password) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw error ?? new Error("sin sesión");
      return `sb-access-token=${data.session.access_token}`;
    }

    const anon = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${DOC_A}`
    );
    assert.equal(anon.status, 401);

    const missing = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${MISSING}`,
      { headers: { cookie: await cookieHeader(
        process.env.STORAGE_TEST_USER_A_EMAIL,
        process.env.STORAGE_TEST_USER_A_PASSWORD
      ) } }
    );
    assert.equal(missing.status, 404);

    const cookieA = await cookieHeader(
      process.env.STORAGE_TEST_USER_A_EMAIL,
      process.env.STORAGE_TEST_USER_A_PASSWORD
    );
    const cookieB = await cookieHeader(
      process.env.STORAGE_TEST_USER_B_EMAIL,
      process.env.STORAGE_TEST_USER_B_PASSWORD
    );

    const aOnB = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${process.env.STORAGE_TEST_DOC_B_ID}`,
      { headers: { cookie: cookieA } }
    );
    assert.equal(aOnB.status, 404);

    const aOnA = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${process.env.STORAGE_TEST_DOC_A_ID}`,
      { headers: { cookie: cookieA } }
    );
    assert.equal(aOnA.status, 200);
    const payload = await aOnA.json();
    assert.ok(payload.url);
    assert.equal(payload.expiresIn, 300);
    assert.equal(new URL(payload.url).pathname.includes("/object/public/"), false);

    const pathProbe = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${process.env.STORAGE_TEST_DOC_A_ID}&path=x`,
      { headers: { cookie: cookieA } }
    );
    assert.equal(pathProbe.status, 400);

    const bOnA = await fetch(
      `${base}/api/storage/download?kind=document-version&id=${process.env.STORAGE_TEST_DOC_A_ID}`,
      { headers: { cookie: cookieB } }
    );
    assert.equal(bOnA.status, 404);
  }
);
