/**
 * SEC-P2-07: logo_url no provoca SSRF. Solo object paths / URLs del bucket
 * `logos` de ESTE proyecto; el PDF descarga por Storage API, nunca fetch(userUrl).
 *
 *   node --test scripts/verify-ssrf-logo-url.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const helperSrc = load("lib/storage/org-logo.ts");
const settingsApi = load("app/api/settings/organization/route.ts");
const pdfRoute = load("app/api/export/audit-pdf/[id]/route.tsx");
const pdfDoc = load("lib/export/audit-pdf-document.tsx");
const migration = load("supabase/migrations/052_protect_org_logo_url.sql");
const brand = load("lib/auth/cached-session.ts");
const informe = load("app/(dashboard)/auditorias/[id]/informe/page.tsx");
const empresa = load("app/(dashboard)/configuracion/empresa/page.tsx");

const PROJECT = "https://nura-test.supabase.co";
const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ORG = "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const VALID_PATH = `${ORG}/logo-1.png`;
const VALID_URL = `${PROJECT}/storage/v1/object/public/logos/${VALID_PATH}`;

const REJECT = [
  "http://127.0.0.1:8080/logo.png",
  "http://localhost/logo.png",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.1/logo.png",
  "file:///etc/passwd",
  "data:image/png;base64,AAAA",
  "https://evil.example/logo.png",
  `https://otherproject.supabase.co/storage/v1/object/public/logos/${VALID_PATH}`,
  `https://evil.example/storage/v1/object/public/logos/${VALID_PATH}`,
  `${PROJECT}.evil.example/storage/v1/object/public/logos/${VALID_PATH}`,
  `https://evil.example/${PROJECT}/storage/v1/object/public/logos/${VALID_PATH}`,
];

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

async function loadHelper() {
  const source = helperSrc.replace(
    /import \{ PUBLIC_STORAGE_BUCKETS \} from "@\/lib\/storage\/paths";\r?\nimport \{ LOGO_MAX_BYTES \} from "@\/lib\/settings\/constants";\r?\n/,
    "const PUBLIC_STORAGE_BUCKETS = { logos: 'logos' };\nconst LOGO_MAX_BYTES = 2 * 1024 * 1024;\n"
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "org-logo.ts",
  });
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`);
}

test("write path normaliza y rechaza logo_url arbitrario", () => {
  assert.match(settingsApi, /normalizeOrgLogoForWrite/);
  assert.match(settingsApi, /Logo inválido/);
  assert.match(settingsApi, /status: 400/);
  assert.doesNotMatch(
    settingsApi,
    /patch\.logo_url = body\.logo_url \? String\(body\.logo_url\)/
  );
});

test("PDF no pasa logo_url a react-pdf Image", () => {
  assert.match(pdfRoute, /loadOrgLogoImageBytes/);
  assert.match(pdfRoute, /\.download\(objectPath\)/);
  assert.match(pdfRoute, /LOGOS_BUCKET/);
  assert.doesNotMatch(pdfRoute, /organizationLogoUrl:/);
  assert.doesNotMatch(pdfDoc, /organizationLogoUrl/);
  assert.match(pdfDoc, /organizationLogoImage/);
  assert.match(pdfDoc, /src=\{\{\s*data:/);
  assert.doesNotMatch(pdfDoc, /<Image src=\{organizationLogo/);
});

test("052: trigger path-only, no reescribe legacy en otros UPDATEs", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_org_logo_url\(\)/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.organizations/);
  assert.match(migration, /NEW\.logo_url IS NOT DISTINCT FROM OLD\.logo_url/);
  assert.match(migration, /must be a logos object path/);
  assert.doesNotMatch(migration, /047_protect|048_org_access|050_reconcile|051_lock/);
  assert.doesNotMatch(migration, /CREATE POLICY/);
});

test("client read paths resuelven URL pública del proyecto", () => {
  assert.match(brand, /resolveOrgLogoPublicUrl/);
  assert.match(informe, /resolveOrgLogoPublicUrl/);
  assert.match(empresa, /resolveOrgLogoPublicUrl/);
});

test("parser: permite path y URL de ESTE proyecto; rechaza SSRF", async () => {
  const helper = await loadHelper();
  const opts = { organizationId: ORG, supabaseUrl: PROJECT };

  assert.equal(helper.parseOrgLogoObjectPath(null, opts), null);
  assert.equal(helper.parseOrgLogoObjectPath("", opts), null);
  assert.equal(helper.parseOrgLogoObjectPath(VALID_PATH, opts), VALID_PATH);
  assert.equal(helper.parseOrgLogoObjectPath(VALID_URL, opts), VALID_PATH);
  assert.equal(
    helper.parseOrgLogoObjectPath(
      `${PROJECT}/storage/v1/object/sign/logos/${VALID_PATH}?token=abc`,
      opts
    ),
    VALID_PATH
  );

  for (const url of REJECT) {
    assert.equal(
      helper.parseOrgLogoObjectPath(url, opts),
      null,
      `should reject ${url}`
    );
  }

  assert.equal(
    helper.parseOrgLogoObjectPath(`${OTHER_ORG}/logo-1.png`, opts),
    null
  );
  assert.equal(helper.parseOrgLogoObjectPath(`${ORG}/../logo.png`, opts), null);
  assert.equal(
    helper.parseOrgLogoObjectPath(`${ORG}/logo.svg`, opts),
    null
  );

  assert.throws(() => helper.normalizeOrgLogoForWrite(REJECT[0], ORG, PROJECT));
  assert.equal(helper.normalizeOrgLogoForWrite(VALID_URL, ORG, PROJECT), VALID_PATH);
  assert.equal(helper.normalizeOrgLogoForWrite("", ORG, PROJECT), null);

  const publicUrl = helper.resolveOrgLogoPublicUrl(VALID_PATH, ORG, PROJECT);
  assert.equal(publicUrl, VALID_URL);
  assert.equal(helper.resolveOrgLogoPublicUrl(REJECT[6], ORG, PROJECT), null);
});

test("PDF loader: válido descarga path; legacy malicioso no llama download", async () => {
  const helper = await loadHelper();
  const calls = [];
  const download = async (objectPath) => {
    calls.push(objectPath);
    return PNG;
  };

  const ok = await helper.loadOrgLogoImageBytes(VALID_URL, ORG, download, {
    supabaseUrl: PROJECT,
  });
  assert.equal(ok.format, "png");
  assert.deepEqual(calls, [VALID_PATH]);

  calls.length = 0;
  const none = await helper.loadOrgLogoImageBytes(null, ORG, download, {
    supabaseUrl: PROJECT,
  });
  assert.equal(none, null);
  assert.deepEqual(calls, []);

  for (const url of REJECT) {
    calls.length = 0;
    const skipped = await helper.loadOrgLogoImageBytes(url, ORG, download, {
      supabaseUrl: PROJECT,
    });
    assert.equal(skipped, null, `must not load ${url}`);
    assert.deepEqual(calls, [], `must not download for ${url}`);
  }

  const tooBig = await helper.loadOrgLogoImageBytes(
    VALID_PATH,
    ORG,
    async () => new Uint8Array(3 * 1024 * 1024),
    { supabaseUrl: PROJECT, maxBytes: 2 * 1024 * 1024 }
  );
  assert.equal(tooBig, null);
});

test("live: trigger 052 presente", (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  const sqlPath = join(ROOT, "supabase/verify_org_logo_url.sql");
  if (!databaseUrl || !existsSync(sqlPath)) {
    t.skip("DATABASE_URL no configurada — se omite el ejercicio live");
    return;
  }
  const psql = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { encoding: "utf8" }
  );
  if (psql.error && psql.error.code === "ENOENT") {
    t.skip("psql no está en PATH");
    return;
  }
  assert.equal(psql.status, 0, psql.stderr || psql.stdout);
});
