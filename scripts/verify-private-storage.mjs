/**
 * Verifica parsing de paths y, si hay credenciales, aislamiento multi-tenant.
 *
 * Unidad (siempre):
 *   node --test scripts/verify-private-storage.mjs
 *
 * Aislamiento live (opcional):
 *   STORAGE_TEST_USER_A_EMAIL / STORAGE_TEST_USER_A_PASSWORD
 *   STORAGE_TEST_USER_B_EMAIL / STORAGE_TEST_USER_B_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const OBJECT_MARKERS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
];

function extractStoragePath(stored, bucket) {
  const value = stored.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, "");
  }
  try {
    const url = new URL(value);
    for (const marker of OBJECT_MARKERS) {
      const prefix = `${marker}${bucket}/`;
      const idx = url.pathname.indexOf(prefix);
      if (idx !== -1) {
        return decodeURIComponent(url.pathname.slice(idx + prefix.length));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildPrivateObjectPath(organizationId, entityId, fileName) {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
  const ext = raw.replace(/[^a-z0-9]/g, "") || "bin";
  const id = "11111111-1111-1111-1111-111111111111";
  return `${organizationId}/${entityId}/${id}.${ext}`;
}

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ENTITY = "cccccccc-cccc-cccc-cccc-cccccccccccc";

test("nuevos uploads usan organization_id/entity_id/uuid.ext", () => {
  const path = buildPrivateObjectPath(ORG_A, ENTITY, "informe.PDF");
  assert.equal(path, `${ORG_A}/${ENTITY}/11111111-1111-1111-1111-111111111111.pdf`);
});

test("extrae path crudo persistido en la base", () => {
  const stored = `${ORG_A}/${ENTITY}/file.jpg`;
  assert.equal(extractStoragePath(stored, "nc-photos"), stored);
});

test("extrae path desde URL pública legacy", () => {
  const stored = `https://xyz.supabase.co/storage/v1/object/public/controlled-documents/${ORG_A}/${ENTITY}/old.pdf`;
  assert.equal(
    extractStoragePath(stored, "controlled-documents"),
    `${ORG_A}/${ENTITY}/old.pdf`
  );
});

test("extrae path desde signed URL", () => {
  const stored = `https://xyz.supabase.co/storage/v1/object/sign/haccp-evidence/${ORG_A}/${ENTITY}/ev.png?token=abc`;
  assert.equal(
    extractStoragePath(stored, "haccp-evidence"),
    `${ORG_A}/${ENTITY}/ev.png`
  );
});

test("no extrae path de otro bucket", () => {
  const stored = `https://xyz.supabase.co/storage/v1/object/public/controlled-documents/${ORG_B}/x.pdf`;
  assert.equal(extractStoragePath(stored, "nc-photos"), null);
});

test("path de org A no coincide con prefijo de org B", () => {
  const pathA = `${ORG_A}/${ENTITY}/secret.pdf`;
  assert.equal(pathA.startsWith(`${ORG_B}/`), false);
  assert.equal(extractStoragePath(pathA, "controlled-documents")?.split("/")[0], ORG_A);
});

const liveConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.STORAGE_TEST_USER_A_EMAIL &&
    process.env.STORAGE_TEST_USER_A_PASSWORD &&
    process.env.STORAGE_TEST_USER_B_EMAIL &&
    process.env.STORAGE_TEST_USER_B_PASSWORD
);

test(
  "live: A accede a A; A no accede a B; anónimo no accede",
  { skip: !liveConfigured },
  async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const bucket = "haccp-evidence";

    async function sessionClient(email, password) {
      const client = createClient(url, anon);
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return client;
    }

    const clientA = await sessionClient(
      process.env.STORAGE_TEST_USER_A_EMAIL,
      process.env.STORAGE_TEST_USER_A_PASSWORD
    );
    const clientB = await sessionClient(
      process.env.STORAGE_TEST_USER_B_EMAIL,
      process.env.STORAGE_TEST_USER_B_PASSWORD
    );
    const anonClient = createClient(url, anon);

    const { data: profileA, error: profileAError } = await clientA
      .from("profiles")
      .select("organization_id")
      .single();
    const { data: profileB, error: profileBError } = await clientB
      .from("profiles")
      .select("organization_id")
      .single();
    if (profileAError || profileBError || !profileA || !profileB) {
      throw new Error("No se pudieron leer profiles de A/B");
    }
    if (profileA.organization_id === profileB.organization_id) {
      throw new Error("Los usuarios de prueba deben pertenecer a organizaciones distintas");
    }

    const pathA = `${profileA.organization_id}/${ENTITY}/nura-storage-probe.png`;
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJTU5ErkJggg=="
      ),
      (c) => c.charCodeAt(0)
    );
    const payload = new Blob([png], { type: "image/png" });

    const uploaded = await clientA.storage.from(bucket).upload(pathA, payload, {
      upsert: true,
      contentType: "image/png",
    });
    if (uploaded.error) throw uploaded.error;

    const signedA = await clientA.storage.from(bucket).createSignedUrl(pathA, 60);
    assert.ok(signedA.data?.signedUrl, "usuario A debe firmar su propio archivo");

    const listB = await clientB.storage.from(bucket).list(profileA.organization_id);
    const listedForeign = (listB.data ?? []).some(
      (obj) => obj.name === "nura-storage-probe.png" || obj.name === ENTITY
    );
    assert.equal(listedForeign, false, "usuario B no debe listar archivos de A");

    const signedB = await clientB.storage.from(bucket).createSignedUrl(pathA, 60);
    assert.ok(signedB.error || !signedB.data?.signedUrl, "usuario B no debe descargar archivos de A");

    const updateB = await clientB.storage.from(bucket).update(pathA, payload, {
      contentType: "image/png",
    });
    assert.ok(updateB.error, "usuario B no debe modificar archivos de A");

    const removeB = await clientB.storage.from(bucket).remove([pathA]);
    const stillThere = await clientA.storage.from(bucket).createSignedUrl(pathA, 60);
    assert.ok(stillThere.data?.signedUrl, "usuario B no debe poder borrar archivos de A");
    if (!removeB.error) {
      assert.ok(stillThere.data?.signedUrl);
    }

    const signedAnon = await anonClient.storage.from(bucket).createSignedUrl(pathA, 60);
    assert.ok(
      signedAnon.error || !signedAnon.data?.signedUrl,
      "anónimo no debe acceder a archivos privados"
    );

    await clientA.storage.from(bucket).remove([pathA]);
  }
);
