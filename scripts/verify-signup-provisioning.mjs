/**
 * SP-01 (onboarding sin auto-provisión) + SP-02 (platform admin fail-closed).
 *
 *   node --test scripts/verify-signup-provisioning.mjs
 *
 * SP-01 corre contra Postgres real embebido (PGlite) con un esquema mínimo que
 * emula Supabase: roles anon/authenticated/service_role y auth.uid()/auth.role()
 * leyendo los mismos GUC que PostgREST (request.jwt.claim.*). Se ejecuta el SQL
 * real de 036 (baseline vulnerable) y de 053 (fix).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function load(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const MIGRATION_053 = load(
  "supabase/migrations/053_require_provisioned_onboarding.sql"
);

function legacyOnboardingFunction() {
  const src = load("supabase/migrations/036_rbac_org_roles.sql");
  const start = src.indexOf(
    "CREATE OR REPLACE FUNCTION public.complete_user_onboarding"
  );
  const end = src.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start, "036 complete_user_onboarding no encontrado");
  return src.slice(start, end + 3);
}

const BASE_SCHEMA = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  country TEXT,
  city TEXT,
  employees_range TEXT,
  certifications TEXT[] DEFAULT '{}',
  access_status TEXT NOT NULL DEFAULT 'active',
  access_granted_at TIMESTAMPTZ,
  access_expires_at DATE,
  provisioned_by UUID
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  role TEXT NOT NULL DEFAULT 'operator',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.notification_preferences (
  organization_id UUID UNIQUE REFERENCES public.organizations(id)
);

-- Comportamiento de 016: crea el perfil como admin si falta (SP-04, fuera de alcance).
CREATE FUNCTION public.ensure_user_profile() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (id) DO NOTHING;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_insert_organizations" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service_role_all_organizations" ON public.organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.organizations TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT ON public.notification_preferences TO authenticated, service_role;
`;

async function createDb() {
  const db = await PGlite.create();
  await db.exec(BASE_SCHEMA);
  return db;
}

/** Ejecuta fn como una request PostgREST con el JWT indicado. */
async function asJwt(db, { sub = "", role }, fn) {
  return db.transaction(async (tx) => {
    await tx.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true)`,
      [sub, role]
    );
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

function callOnboarding(tx, name = "Self Provisioned SA") {
  return tx.query(
    `SELECT public.complete_user_onboarding($1, 'food', 'CL', NULL, NULL, '{}') AS org_id`,
    [name]
  );
}

async function countOrgs(db) {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.organizations");
  return rows[0].n;
}

async function getProfile(db, id) {
  const { rows } = await db.query(
    "SELECT organization_id, role, onboarding_completed FROM public.profiles WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

async function provisionOrg(db, { status = "active", expires = null } = {}) {
  const { rows } = await db.query(
    `INSERT INTO public.organizations (name, industry, country, access_status, access_expires_at)
     VALUES ('Provisioned Org', 'food', 'CL', $1, $2) RETURNING id`,
    [status, expires]
  );
  return rows[0].id;
}

// ─── SP-01: baseline ───

describe("SP-01 baseline (036 sin 053)", () => {
  let db;
  before(async () => {
    db = await createDb();
    await db.exec(legacyOnboardingFunction());
  });
  after(() => db.close());

  test("reproduce la auto-provisión: usuario sin org queda admin de org active", async () => {
    const uid = randomUUID();
    await db.query(
      "INSERT INTO public.profiles (id, role) VALUES ($1, 'operator')",
      [uid]
    );

    const { rows } = await asJwt(db, { sub: uid, role: "authenticated" }, (tx) =>
      callOnboarding(tx)
    );

    assert.ok(rows[0].org_id, "036 devuelve una organización nueva");
    const profile = await getProfile(db, uid);
    assert.equal(profile.role, "admin");
    assert.equal(profile.onboarding_completed, true);
    const { rows: org } = await db.query(
      "SELECT access_status FROM public.organizations WHERE id = $1",
      [rows[0].org_id]
    );
    assert.equal(org[0].access_status, "active");
  });
});

// ─── SP-01: con 053 ───

describe("SP-01 con migración 053", () => {
  let db;
  before(async () => {
    db = await createDb();
    await db.exec(legacyOnboardingFunction());
    await db.exec(MIGRATION_053);
    await db.exec(MIGRATION_053);
  });
  after(() => db.close());

  test("usuario sin organization_id → DENIED organization_not_provisioned, sin efectos", async () => {
    const uid = randomUUID();
    await db.query(
      "INSERT INTO public.profiles (id, role) VALUES ($1, 'operator')",
      [uid]
    );
    const orgsBefore = await countOrgs(db);

    await assert.rejects(
      asJwt(db, { sub: uid, role: "authenticated" }, (tx) => callOnboarding(tx)),
      (err) => {
        assert.match(err.message, /^organization_not_provisioned$/);
        assert.equal(err.code, "42501");
        return true;
      }
    );

    assert.equal(await countOrgs(db), orgsBefore, "no se creó organización");
    const profile = await getProfile(db, uid);
    assert.equal(profile.organization_id, null, "organization_id sigue null");
    assert.equal(profile.role, "operator", "role no elevado");
    assert.equal(profile.onboarding_completed, false, "onboarding no completado");
  });

  test("usuario autenticado sin fila profiles → DENIED, no crea perfil admin ni org", async () => {
    const uid = randomUUID();
    const orgsBefore = await countOrgs(db);

    await assert.rejects(
      asJwt(db, { sub: uid, role: "authenticated" }, (tx) => callOnboarding(tx)),
      /profile_not_found/
    );

    assert.equal(await countOrgs(db), orgsBefore);
    assert.equal(await getProfile(db, uid), null);
  });

  test("sin JWT (anon) → DENIED; anon no tiene EXECUTE", async () => {
    await assert.rejects(
      asJwt(db, { role: "anon" }, (tx) => callOnboarding(tx)),
      /permission denied/
    );
  });

  test("usuario provisionado (admin/invitación) completa onboarding sin cambios de identidad", async () => {
    const orgId = await provisionOrg(db);
    const uid = randomUUID();
    await db.query(
      `INSERT INTO public.profiles (id, organization_id, role, onboarding_completed)
       VALUES ($1, $2, 'supervisor', FALSE)`,
      [uid, orgId]
    );
    const orgsBefore = await countOrgs(db);

    const { rows } = await asJwt(db, { sub: uid, role: "authenticated" }, (tx) =>
      callOnboarding(tx, "Nombre controlado por el cliente")
    );

    assert.equal(rows[0].org_id, orgId);
    assert.equal(await countOrgs(db), orgsBefore);
    const profile = await getProfile(db, uid);
    assert.equal(profile.organization_id, orgId);
    assert.equal(profile.role, "supervisor", "role no cambia");
    assert.equal(profile.onboarding_completed, true);
    const { rows: org } = await db.query(
      "SELECT name, access_status FROM public.organizations WHERE id = $1",
      [orgId]
    );
    assert.equal(org[0].name, "Provisioned Org", "p_name del cliente se ignora");
    assert.equal(org[0].access_status, "active");
  });

  test("usuario provisionado ya onboarded: idempotente", async () => {
    const orgId = await provisionOrg(db);
    const uid = randomUUID();
    await db.query(
      `INSERT INTO public.profiles (id, organization_id, role, onboarding_completed)
       VALUES ($1, $2, 'admin', TRUE)`,
      [uid, orgId]
    );
    const { rows } = await asJwt(db, { sub: uid, role: "authenticated" }, (tx) =>
      callOnboarding(tx)
    );
    assert.equal(rows[0].org_id, orgId);
  });

  test("organización suspendida o expirada → organization_access_denied, onboarding intacto", async () => {
    for (const opts of [
      { status: "suspended" },
      { status: "pending" },
      { status: "active", expires: "2000-01-01" },
    ]) {
      const orgId = await provisionOrg(db, opts);
      const uid = randomUUID();
      await db.query(
        `INSERT INTO public.profiles (id, organization_id, role) VALUES ($1, $2, 'operator')`,
        [uid, orgId]
      );
      await assert.rejects(
        asJwt(db, { sub: uid, role: "authenticated" }, (tx) => callOnboarding(tx)),
        /organization_access_denied/
      );
      const profile = await getProfile(db, uid);
      assert.equal(profile.onboarding_completed, false);
      assert.equal(profile.role, "operator");
    }
  });

  test("INSERT directo en organizations como authenticated/anon → bloqueado", async () => {
    const uid = randomUUID();
    const orgsBefore = await countOrgs(db);
    for (const role of ["authenticated", "anon"]) {
      await assert.rejects(
        asJwt(db, { sub: role === "anon" ? "" : uid, role }, (tx) =>
          tx.query(
            "INSERT INTO public.organizations (name, access_status) VALUES ('x', 'active')"
          )
        ),
        /permission denied|organization_not_provisioned/
      );
    }
    assert.equal(await countOrgs(db), orgsBefore);
  });

  test("trigger bloquea INSERT desde JWT authenticated aunque exista GRANT + policy permisiva", async () => {
    await db.exec(`
      GRANT INSERT ON public.organizations TO authenticated;
      CREATE POLICY "authenticated_insert_organizations" ON public.organizations
        FOR INSERT TO authenticated WITH CHECK (true);
    `);
    try {
      await assert.rejects(
        asJwt(db, { sub: randomUUID(), role: "authenticated" }, (tx) =>
          tx.query("INSERT INTO public.organizations (name) VALUES ('bypass')")
        ),
        /organization_not_provisioned/
      );
    } finally {
      await db.exec(`
        DROP POLICY "authenticated_insert_organizations" ON public.organizations;
        REVOKE INSERT ON public.organizations FROM authenticated;
      `);
    }
  });

  test("SECURITY DEFINER con JWT authenticated tampoco puede insertar organizaciones", async () => {
    await db.exec(`
      CREATE FUNCTION public._sp01_definer_insert() RETURNS uuid
      LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
        INSERT INTO public.organizations (name) VALUES ('definer') RETURNING id
      $$;
      GRANT EXECUTE ON FUNCTION public._sp01_definer_insert() TO authenticated;
    `);
    await assert.rejects(
      asJwt(db, { sub: randomUUID(), role: "authenticated" }, (tx) =>
        tx.query("SELECT public._sp01_definer_insert()")
      ),
      /organization_not_provisioned/
    );
  });

  test("service_role y SQL editor (sin JWT) siguen provisionando", async () => {
    const orgsBefore = await countOrgs(db);
    await asJwt(db, { role: "service_role" }, (tx) =>
      tx.query(
        "INSERT INTO public.organizations (name, access_status) VALUES ('via service_role', 'active')"
      )
    );
    await db.query("INSERT INTO public.organizations (name) VALUES ('via sql editor')");
    assert.equal(await countOrgs(db), orgsBefore + 2);
  });

  test("policy authenticated_insert_organizations eliminada y sin privilegio INSERT", async () => {
    const { rows: policies } = await db.query(
      `SELECT policyname FROM pg_policies
       WHERE tablename = 'organizations' AND cmd IN ('INSERT', 'ALL')`
    );
    assert.deepEqual(
      policies.map((p) => p.policyname),
      ["service_role_all_organizations"]
    );
    const { rows: priv } = await db.query(`
      SELECT has_table_privilege('authenticated', 'public.organizations', 'INSERT') AS auth_insert,
             has_table_privilege('anon', 'public.organizations', 'INSERT') AS anon_insert,
             has_function_privilege('anon',
               'public.complete_user_onboarding(text,text,text,text,text,text[])', 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated',
               'public.complete_user_onboarding(text,text,text,text,text,text[])', 'EXECUTE') AS auth_exec
    `);
    assert.deepEqual(priv[0], {
      auth_insert: false,
      anon_insert: false,
      anon_exec: false,
      auth_exec: true,
    });
  });
});

describe("SP-01 estático", () => {
  test("053 no crea organizaciones ni toca role/organization_id/access_status", () => {
    const fn = MIGRATION_053.slice(
      MIGRATION_053.indexOf("CREATE OR REPLACE FUNCTION public.complete_user_onboarding"),
      MIGRATION_053.indexOf("REVOKE ALL ON FUNCTION public.complete_user_onboarding")
    );
    assert.doesNotMatch(fn, /INSERT INTO public\.organizations/);
    assert.doesNotMatch(fn, /ensure_user_profile/);
    const updates = [...fn.matchAll(/UPDATE\s+(public\.\w+)\s+SET([\s\S]*?)WHERE/g)];
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1], "public.profiles");
    assert.equal(updates[0][2].trim(), "onboarding_completed = TRUE");
    assert.doesNotMatch(fn, /\brole\s*=/);
    const body = fn.slice(fn.indexOf("AS $$"));
    assert.doesNotMatch(body, /\bp_[a-z_]+\b/, "parámetros del cliente no se usan");
  });

  test("onboarding UI no muestra el wizard a usuarios sin organización", () => {
    const page = load("app/onboarding/page.tsx");
    assert.match(page, /!visibleProfile\?\.organization_id[\s\S]*redirect\("\/acceso-pendiente"\)/);
    const session = load("lib/auth/session.ts");
    assert.match(session, /organization_not_provisioned/);
  });

  test("migraciones históricas 016/036 intactas en el árbol", () => {
    assert.match(
      load("supabase/migrations/036_rbac_org_roles.sql"),
      /INSERT INTO public\.organizations/
    );
    assert.match(
      load("supabase/migrations/016_production_bootstrap.sql"),
      /CREATE OR REPLACE FUNCTION public\.complete_user_onboarding/
    );
  });
});

// ─── SP-02 ───

async function loadPlatformAdmin() {
  const { outputText } = ts.transpileModule(load("lib/access/platform-admin.ts"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "platform-admin.ts",
  });
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`
  );
}

describe("SP-02 isPlatformAdmin", () => {
  const ADMIN = "ops@nura.test";
  const CONFIRMED = "2026-01-01T00:00:00Z";
  let isPlatformAdmin;
  let KEY;
  let previousEnv;

  before(async () => {
    previousEnv = process.env.NURA_ADMIN_EMAILS;
    process.env.NURA_ADMIN_EMAILS = ` other@nura.test , ${ADMIN.toUpperCase()} `;
    ({ isPlatformAdmin, PLATFORM_ADMIN_APP_METADATA_KEY: KEY } =
      await loadPlatformAdmin());
  });

  after(() => {
    if (previousEnv === undefined) delete process.env.NURA_ADMIN_EMAILS;
    else process.env.NURA_ADMIN_EMAILS = previousEnv;
  });

  const provisioned = () => ({
    email: ADMIN,
    email_confirmed_at: CONFIRMED,
    app_metadata: { provider: "email", [KEY]: true },
    user_metadata: {},
  });

  test("platform admin provisionado correctamente → true", () => {
    assert.equal(isPlatformAdmin(provisioned()), true);
    assert.equal(
      isPlatformAdmin({ ...provisioned(), email: "  Ops@Nura.Test " }),
      true
    );
  });

  test("email allowlisted pero NO confirmado → false", () => {
    for (const email_confirmed_at of [undefined, null, "", "not-a-date"]) {
      assert.equal(
        isPlatformAdmin({ ...provisioned(), email_confirmed_at }),
        false,
        String(email_confirmed_at)
      );
    }
  });

  test("email confirmado pero NO allowlisted → false", () => {
    assert.equal(
      isPlatformAdmin({ ...provisioned(), email: "attacker@evil.test" }),
      false
    );
  });

  test("user_metadata controlada por el usuario no otorga privilegios", () => {
    assert.equal(
      isPlatformAdmin({
        email: ADMIN,
        email_confirmed_at: CONFIRMED,
        app_metadata: { provider: "email" },
        user_metadata: {
          [KEY]: true,
          role: "platform_admin",
          is_admin: true,
          email_confirmed_at: CONFIRMED,
        },
      }),
      false
    );
  });

  test("app_metadata sin flag booleano true → false", () => {
    for (const value of [undefined, false, "true", 1, {}]) {
      assert.equal(
        isPlatformAdmin({ ...provisioned(), app_metadata: { [KEY]: value } }),
        false,
        String(value)
      );
    }
    assert.equal(isPlatformAdmin({ ...provisioned(), app_metadata: null }), false);
  });

  test("entrada ausente o allowlist vacía → false (fail closed)", () => {
    for (const user of [null, undefined, {}, { ...provisioned(), email: "" }]) {
      assert.equal(isPlatformAdmin(user), false);
    }
    assert.equal(isPlatformAdmin(ADMIN), false, "un string de email ya no basta");

    const saved = process.env.NURA_ADMIN_EMAILS;
    try {
      for (const value of [undefined, "", " , "]) {
        if (value === undefined) delete process.env.NURA_ADMIN_EMAILS;
        else process.env.NURA_ADMIN_EMAILS = value;
        assert.equal(isPlatformAdmin(provisioned()), false);
      }
    } finally {
      process.env.NURA_ADMIN_EMAILS = saved;
    }
  });
});

describe("SP-02 estático", () => {
  const helper = load("lib/access/platform-admin.ts");

  test("helper no lee user_metadata", () => {
    assert.doesNotMatch(helper, /\.user_metadata|\[["']user_metadata["']\]/);
  });

  test("todos los call sites pasan el usuario de Auth, no solo el email", () => {
    const files = [
      "lib/supabase/middleware.ts",
      "lib/auth/require-permission.ts",
      "components/layout/dashboard-sidebar.tsx",
      "app/(dashboard)/admin/acceso/page.tsx",
      "lib/access/platform-admin.ts",
    ];
    for (const rel of files) {
      const src = load(rel);
      assert.match(src, /isPlatformAdmin\(/, rel);
      assert.doesNotMatch(src, /isPlatformAdmin\([^)]*\.email\b/, rel);
    }
    for (const rel of [
      "lib/auth/require-permission.ts",
      "app/api/notifications/audit-completed/route.ts",
      "app/api/notifications/cron/route.ts",
      "app/api/storage/download/route.ts",
    ]) {
      const src = load(rel);
      assert.doesNotMatch(
        src,
        /assertOrganizationAccess\(\{[^}]*email:/,
        `${rel} no debe pasar solo email`
      );
    }
  });

  test("requirePlatformAdmin usa getSessionUser (auth.getUser validado)", () => {
    assert.match(helper, /getSessionUser\(\)/);
    assert.match(helper, /isPlatformAdmin\(user\)/);
  });
});
