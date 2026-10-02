/**
 * SP-03: identidad de profiles (054) sobre Postgres real (PGlite).
 *
 *   node --test scripts/verify-profile-identity.mjs
 *
 * Aplica la cadena real de supabase/migrations en dos estados:
 *   repo  — 001→054 completo
 *   drift — estado hosted verificado live (sin 036 ni 041) + 053 + 054
 * Los ataques se ejecutan como PostgREST (SET ROLE authenticated + claims JWT).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildDb } from "./audit-sp03-profile-identity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION_054 = readFileSync(
  join(ROOT, "supabase/migrations/054_harden_profile_identity.sql"),
  "utf8"
);

async function withClaims(db, { role, sub }, fn) {
  return db.transaction(async (tx) => {
    const claims = sub ? { sub, role } : { role };
    await tx.query(
      `SELECT set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [JSON.stringify(claims), sub ?? "", role]
    );
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

const asUser = (db, sub, sql, params = []) =>
  withClaims(db, { role: "authenticated", sub }, (tx) => tx.query(sql, params));

const asService = (db, sql, params = []) =>
  withClaims(db, { role: "service_role" }, (tx) => tx.query(sql, params));

async function profile(db, id) {
  const { rows } = await db.query(
    "SELECT id, organization_id, role, onboarding_completed, full_name FROM public.profiles WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

/** auth.users sin disparar handle_new_user → usuario sin fila en profiles. */
async function authUserWithoutProfile(db) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL session_replication_role = replica");
    await tx.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())",
      [id, `${id}@x.test`]
    );
  });
  return id;
}

/** Creación real vía GoTrue: supabase_auth_admin, sin JWT. */
async function goTrueCreateUser(db, meta) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE supabase_auth_admin");
    await tx.query(
      "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)",
      [id, `${id}@gotrue.test`, JSON.stringify(meta)]
    );
  });
  return id;
}

async function createOrg(db, name) {
  const { rows } = await asService(
    db,
    `INSERT INTO public.organizations (name, industry, country, access_status)
     VALUES ($1, 'food', 'CL', 'active') RETURNING id`,
    [name]
  );
  return rows[0].id;
}

/** Provisioning legítimo: GoTrue crea el user, service_role asigna org/rol. */
async function provisionMember(db, orgId, role) {
  const id = await goTrueCreateUser(db, { full_name: "seed" });
  await asService(
    db,
    `UPDATE public.profiles SET organization_id = $2, role = $3, onboarding_completed = true WHERE id = $1`,
    [id, orgId, role]
  );
  return id;
}

for (const scenario of [
  { name: "repo (001→054)", skip: new Set() },
  { name: "hosted drift (sin 036/041) + 053 + 054", skip: new Set(["036", "041"]) },
]) {
  describe(`SP-03 · ${scenario.name}`, () => {
    let db;
    let victimOrg;
    let orgA;
    let orgB;

    before(async () => {
      const built = await buildDb({ upto: null, skip: scenario.skip, log: false });
      db = built.db;
      assert.ok(
        built.applied.includes("054_harden_profile_identity.sql"),
        `054 no aplicó: ${JSON.stringify(built.failed)}`
      );
      victimOrg = await createOrg(db, "Victim");
      orgA = await createOrg(db, "Org A");
      orgB = await createOrg(db, "Org B");
    });

    after(() => db?.close());

    describe("NEW USER (sin profile) INSERT directo", () => {
      for (const role of ["admin", "quality_manager", "operator"]) {
        test(`${role} + victim org + onboarding=true → neutralizado a operator sin org`, async () => {
          const uid = await authUserWithoutProfile(db);
          await asUser(
            db,
            uid,
            `INSERT INTO public.profiles (id, full_name, organization_id, role, onboarding_completed)
             VALUES (auth.uid(), 'x', $1, $2, true)`,
            [victimOrg, role]
          );
          const p = await profile(db, uid);
          assert.equal(p.organization_id, null, "no elige tenant");
          assert.equal(p.role, "operator");
          assert.equal(p.onboarding_completed, false);
        });
      }

      test("operator + NULL org → único estado permitido", async () => {
        const uid = await authUserWithoutProfile(db);
        await asUser(
          db,
          uid,
          `INSERT INTO public.profiles (id, full_name, role) VALUES (auth.uid(), 'x', 'operator')`
        );
        const p = await profile(db, uid);
        assert.deepEqual(
          { org: p.organization_id, role: p.role, onb: p.onboarding_completed },
          { org: null, role: "operator", onb: false }
        );
      });

      test("fallback cliente de lib/auth/session.ts (role: admin) sigue funcionando como operator", async () => {
        const uid = await authUserWithoutProfile(db);
        await asUser(
          db,
          uid,
          `INSERT INTO public.profiles (id, full_name, role) VALUES ($1, 'x', 'admin')`,
          [uid]
        );
        assert.equal((await profile(db, uid)).role, "operator");
      });

      test("INSERT con id de otro usuario → no crea fila para el otro", async () => {
        const attacker = await authUserWithoutProfile(db);
        const victim = await authUserWithoutProfile(db);
        await asUser(
          db,
          attacker,
          `INSERT INTO public.profiles (id, full_name, organization_id, role) VALUES ($1, 'x', $2, 'admin')`,
          [victim, victimOrg]
        ).catch(() => {});
        assert.equal(await profile(db, victim), null);
      });

      test("ensure_user_profile() crea operator sin org ni onboarding", async () => {
        const uid = await authUserWithoutProfile(db);
        await asUser(db, uid, "SELECT public.ensure_user_profile()");
        const p = await profile(db, uid);
        assert.equal(p.role, "operator");
        assert.equal(p.organization_id, null);
        assert.equal(p.onboarding_completed, false);
      });
    });

    describe("EXISTING: cambios de identidad propios → DENIED", () => {
      const cases = [
        ["operator", "role → admin", (o) => ["UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()", []]],
        ["quality_manager", "role → admin", () => ["UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()", []]],
        ["operator", "role → quality_manager", () => ["UPDATE public.profiles SET role = 'quality_manager' WHERE id = auth.uid()", []]],
        ["operator", "Org A → Org B", (o) => ["UPDATE public.profiles SET organization_id = $1 WHERE id = auth.uid()", [o.orgB]]],
        ["admin", "Org A → Org B", (o) => ["UPDATE public.profiles SET organization_id = $1 WHERE id = auth.uid()", [o.orgB]]],
        ["admin", "Org A → NULL", () => ["UPDATE public.profiles SET organization_id = NULL WHERE id = auth.uid()", []]],
        ["admin", "role → operator", () => ["UPDATE public.profiles SET role = 'operator' WHERE id = auth.uid()", []]],
      ];
      for (const [role, label, build] of cases) {
        test(`${role}: ${label}`, async () => {
          const uid = await provisionMember(db, orgA, role);
          const before = await profile(db, uid);
          const [sql, params] = build({ orgB });
          await assert.rejects(asUser(db, uid, sql, params), (err) => {
            assert.doesNotMatch(err.message, /infinite recursion/);
            assert.match(err.message, /immutable|cannot be changed/);
            return true;
          });
          assert.deepEqual(await profile(db, uid), before);
        });
      }

      test("UPSERT (on conflict update) → admin + Org B → DENIED", async () => {
        const uid = await provisionMember(db, orgA, "operator");
        await assert.rejects(
          asUser(
            db,
            uid,
            `INSERT INTO public.profiles (id, full_name, organization_id, role) VALUES (auth.uid(), 'x', $1, 'admin')
             ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role`,
            [orgB]
          ),
          /immutable|cannot be changed/
        );
        const p = await profile(db, uid);
        assert.equal(p.role, "operator");
        assert.equal(p.organization_id, orgA);
      });

      test("perfil sin org (operator/admin) → asignarse victim org → DENIED", async () => {
        for (const role of ["operator", "admin"]) {
          const uid = await goTrueCreateUser(db, {});
          await asService(db, "UPDATE public.profiles SET role = $2 WHERE id = $1", [uid, role]);
          await assert.rejects(
            asUser(db, uid, "UPDATE public.profiles SET organization_id = $1, role = 'admin' WHERE id = auth.uid()", [victimOrg]),
            /immutable|cannot be changed/
          );
          assert.equal((await profile(db, uid)).organization_id, null);
        }
      });
    });

    describe("CROSS-USER / CROSS-TENANT", () => {
      test("admin A no modifica a miembros (mismo tenant ni otro) por UPDATE directo", async () => {
        const admin = await provisionMember(db, orgA, "admin");
        const mate = await provisionMember(db, orgA, "operator");
        const foreign = await provisionMember(db, orgB, "operator");
        for (const [target, sql, params] of [
          [mate, "UPDATE public.profiles SET role = 'admin' WHERE id = $1", [mate]],
          [mate, "UPDATE public.profiles SET organization_id = $2 WHERE id = $1", [mate, orgB]],
          [foreign, "UPDATE public.profiles SET organization_id = $2 WHERE id = $1", [foreign, orgA]],
          [foreign, "UPDATE public.profiles SET full_name = 'pwned' WHERE id = $1", [foreign]],
        ]) {
          const before = await profile(db, target);
          const res = await asUser(db, admin, sql, params);
          assert.equal(res.affectedRows ?? 0, 0);
          assert.deepEqual(await profile(db, target), before);
        }
      });

      test("perfil de otro tenant no es visible", async () => {
        const op = await provisionMember(db, orgA, "operator");
        const foreign = await provisionMember(db, orgB, "operator");
        const { rows } = await asUser(db, op, "SELECT id FROM public.profiles WHERE id = $1", [foreign]);
        assert.equal(rows.length, 0);
      });
    });

    describe("NORMAL PROFILE UPDATE", () => {
      test("full_name propio → OK, sin infinite recursion", async () => {
        const uid = await provisionMember(db, orgA, "operator");
        const res = await asUser(
          db,
          uid,
          "UPDATE public.profiles SET full_name = 'Nuevo Nombre', job_title = 'QA' WHERE id = auth.uid()"
        );
        assert.equal(res.affectedRows, 1);
        const p = await profile(db, uid);
        assert.equal(p.full_name, "Nuevo Nombre");
        assert.equal(p.role, "operator");
        assert.equal(p.organization_id, orgA);
      });

      test("update full-row con identidad sin cambios (PostgREST PATCH) → OK", async () => {
        const uid = await provisionMember(db, orgA, "quality_manager");
        const res = await asUser(
          db,
          uid,
          "UPDATE public.profiles SET full_name = 'X', role = 'quality_manager', organization_id = $1 WHERE id = auth.uid()",
          [orgA]
        );
        assert.equal(res.affectedRows, 1);
      });

      test("complete_user_onboarding (053) sigue marcando onboarding en usuario provisionado", async () => {
        const uid = await provisionMember(db, orgA, "operator");
        await asService(db, "UPDATE public.profiles SET onboarding_completed = false WHERE id = $1", [uid]);
        const { rows } = await asUser(
          db,
          uid,
          "SELECT public.complete_user_onboarding('X', 'food', 'CL') AS org"
        );
        assert.equal(rows[0].org, orgA);
        const p = await profile(db, uid);
        assert.equal(p.onboarding_completed, true);
        assert.equal(p.role, "operator");
      });

      test("onboarding_completed true → false por usuario se ignora", async () => {
        const uid = await provisionMember(db, orgA, "operator");
        await asUser(db, uid, "UPDATE public.profiles SET onboarding_completed = false WHERE id = auth.uid()");
        assert.equal((await profile(db, uid)).onboarding_completed, true);
      });
    });

    describe("GOTRUE / METADATA", () => {
      test("creación sin JWT → profile con id correcto, operator, sin org, onboarding false", async () => {
        const id = await goTrueCreateUser(db, { full_name: "Nueva Persona" });
        const p = await profile(db, id);
        assert.ok(p, "profile creado (sin F-1)");
        assert.equal(p.id, id);
        assert.equal(p.role, "operator");
        assert.equal(p.organization_id, null);
        assert.equal(p.onboarding_completed, false);
        assert.equal(p.full_name, "Nueva Persona");
      });

      test("raw_user_meta_data.role = admin / organization_id / onboarding → ignorados", async () => {
        const id = await goTrueCreateUser(db, {
          role: "admin",
          organization_id: victimOrg,
          onboarding_completed: true,
        });
        const p = await profile(db, id);
        assert.equal(p.role, "operator");
        assert.equal(p.organization_id, null);
        assert.equal(p.onboarding_completed, false);
      });
    });

    describe("SERVICE_ROLE", () => {
      test("provisioning legítimo asigna organization_id y role", async () => {
        const id = await goTrueCreateUser(db, {});
        await asService(
          db,
          "UPDATE public.profiles SET organization_id = $2, role = 'admin', onboarding_completed = true WHERE id = $1",
          [id, orgA]
        );
        const p = await profile(db, id);
        assert.equal(p.organization_id, orgA);
        assert.equal(p.role, "admin");
      });

      test("cambio de rol de miembro (lib/team/members.ts) y upsert de invitación", async () => {
        const id = await provisionMember(db, orgA, "operator");
        await asService(db, "UPDATE public.profiles SET role = 'quality_manager' WHERE id = $1", [id]);
        assert.equal((await profile(db, id)).role, "quality_manager");

        const fresh = await authUserWithoutProfile(db);
        await asService(
          db,
          `INSERT INTO public.profiles (id, full_name, organization_id, role, onboarding_completed)
           VALUES ($1, 'inv', $2, 'quality_manager', true)`,
          [fresh, orgB]
        );
        const p = await profile(db, fresh);
        assert.equal(p.organization_id, orgB);
        assert.equal(p.role, "quality_manager");
      });

      test("SQL editor / postgres (sin JWT) puede reasignar", async () => {
        const id = await provisionMember(db, orgA, "operator");
        await db.query("UPDATE public.profiles SET organization_id = $2 WHERE id = $1", [id, orgB]);
        assert.equal((await profile(db, id)).organization_id, orgB);
      });
    });

    describe("CATÁLOGO", () => {
      test("policies de profiles sin subconsultas a profiles; sin admin_update_team", async () => {
        const { rows } = await db.query(
          `SELECT policyname, cmd, qual, with_check FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'profiles'`
        );
        for (const p of rows) {
          const text = `${p.qual ?? ""} ${p.with_check ?? ""}`;
          assert.doesNotMatch(text, /FROM\s+(public\.)?profiles/i, p.policyname);
        }
        assert.ok(!rows.some((p) => p.policyname === "profiles_admin_update_team"));
        const insert = rows.find((p) => p.policyname === "users_insert_own_profile");
        assert.match(insert.with_check, /organization_id IS NULL/);
        assert.match(insert.with_check, /role = 'operator'/);
        assert.match(insert.with_check, /onboarding_completed IS NOT TRUE/);
      });

      test("trigger, constraint, default y privilegios", async () => {
        const { rows } = await db.query(`
          SELECT
            EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
                    AND tgname = 'protect_profile_identity' AND NOT tgisinternal) AS trigger,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass
                    AND conname = 'profiles_role_check') AS role_check,
            (SELECT column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') AS role_default,
            has_table_privilege('anon', 'public.profiles', 'INSERT') AS anon_insert,
            has_table_privilege('anon', 'public.profiles', 'UPDATE') AS anon_update,
            has_table_privilege('authenticated', 'public.profiles', 'DELETE') AS auth_delete,
            has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') AS auth_truncate,
            has_function_privilege('anon', 'public.ensure_user_profile()', 'EXECUTE') AS anon_ensure,
            has_function_privilege('authenticated', 'public.ensure_user_profile()', 'EXECUTE') AS auth_ensure
        `);
        assert.deepEqual(rows[0], {
          trigger: true,
          role_check: true,
          role_default: "'operator'::text",
          anon_insert: false,
          anon_update: false,
          auth_delete: false,
          auth_truncate: false,
          anon_ensure: false,
          auth_ensure: true,
        });
      });
    });
  });
}

describe("SP-03 · estático", () => {
  test("054 no reescribe NEW.id en contexto sin JWT (F-1) ni lee role de metadata", () => {
    const fn = MIGRATION_054.slice(
      MIGRATION_054.indexOf("CREATE OR REPLACE FUNCTION public.protect_profile_identity"),
      MIGRATION_054.indexOf("REVOKE ALL ON FUNCTION public.protect_profile_identity")
    );
    const bypass = fn.indexOf("IF v_jwt_role IS NULL OR v_jwt_role = 'service_role'");
    const rewrite = fn.indexOf("NEW.id := v_uid");
    assert.ok(bypass > 0 && rewrite > bypass, "el bypass sin JWT precede a cualquier reescritura de id");
    assert.doesNotMatch(MIGRATION_054, /raw_user_meta_data->>'role'/);
    assert.doesNotMatch(MIGRATION_054, /raw_user_meta_data->>'organization_id'/);
  });
});
