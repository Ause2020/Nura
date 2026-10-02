/**
 * SP-03 audit harness (temporal, NO integrado en npm test).
 *
 *   node scripts/audit-sp03-profile-identity.mjs            # aplica 001→053 y ataca
 *   node scripts/audit-sp03-profile-identity.mjs --upto 017 # estado hipotético de drift
 *
 * Aplica TODAS las migraciones del working tree en orden lexicográfico sobre
 * PGlite, con stubs de Supabase (roles, auth.*, storage.*, default privileges
 * de Supabase: ALL a anon/authenticated/service_role en public).
 * Los ataques se ejecutan como PostgREST: SET ROLE authenticated + GUC
 * request.jwt.claim(s).
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIG_DIR = join(ROOT, "supabase/migrations");

const args = process.argv.slice(2);
const uptoIdx = args.indexOf("--upto");
const UPTO = uptoIdx >= 0 ? args[uptoIdx + 1] : null;
const SKIP = new Set(
  (args.includes("--skip") ? args[args.indexOf("--skip") + 1] : "")
    .split(",")
    .filter(Boolean)
);
const JSON_OUT = args.includes("--json");

const SUPABASE_STUBS = `
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE supabase_storage_admin NOLOGIN;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'email'
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON auth.users TO supabase_auth_admin;
CREATE PUBLICATION supabase_realtime;

CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner UUID,
  public BOOLEAN DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[],
  avif_autodetection BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
CREATE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT reverse(split_part(reverse(name), '.', 1))
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;
`;

export async function buildDb({ upto = UPTO, skip = SKIP, log = !JSON_OUT } = {}) {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUBS);

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = [];
  const failed = [];
  for (const file of files) {
    const version = file.slice(0, 3);
    if (upto && version > upto) break;
    if (skip.has(version) || skip.has(file)) continue;
    const sql = readFileSync(join(MIG_DIR, file), "utf8");
    try {
      await db.exec(sql);
      applied.push(file);
    } catch (err) {
      failed.push({ file, error: err.message });
      if (log) console.log(`  [migration FAILED] ${file}: ${err.message}`);
    }
  }
  return { db, applied, failed };
}

async function profileState(db) {
  const policies = await db.query(`
    SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
    ORDER BY permissive DESC, cmd, policyname`);
  const grants = await db.query(`
    SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee IN ('anon','authenticated','service_role','supabase_auth_admin','PUBLIC')
    GROUP BY grantee ORDER BY grantee`);
  const triggers = await db.query(`
    SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
    ORDER BY tgname`);
  const authTriggers = await db.query(`
    SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal`);
  const constraints = await db.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass ORDER BY conname`);
  const columns = await db.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position`);
  const rls = await db.query(`
    SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass`);
  const fns = await db.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc ~* 'profiles'
      AND p.prosrc ~* '(insert into|update)\\s+(public\\.)?profiles'
    ORDER BY p.proname`);
  return {
    rls: rls.rows[0],
    columns: columns.rows,
    constraints: constraints.rows,
    policies: policies.rows,
    grants: grants.rows,
    triggers: triggers.rows,
    authTriggers: authTriggers.rows,
    writerFunctions: fns.rows,
  };
}

/** Request PostgREST simulada. */
async function asUser(db, uid, fn, role = "authenticated") {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
    await tx.query(
      `SELECT set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [claims, uid ?? "", role]
    );
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

async function attempt(db, uid, sql, params = []) {
  try {
    const res = await asUser(db, uid, (tx) => tx.query(sql, params));
    return { ok: true, rowCount: res.affectedRows ?? res.rows.length, rows: res.rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function fetchProfile(db, id) {
  const { rows } = await db.query(
    "SELECT organization_id, role, onboarding_completed FROM public.profiles WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

/**
 * auth.users sin disparar on_auth_user_created: modela un usuario de Auth que
 * no tiene fila en profiles (la precondición del ataque INSERT).
 */
async function createAuthUser(db, { email, meta = {} } = {}) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL session_replication_role = replica");
    await tx.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
       VALUES ($1, $2, $3, now())`,
      [id, email ?? `${id}@x.test`, JSON.stringify(meta)]
    );
  });
  return id;
}

/** Signup/createUser real: GoTrue inserta como supabase_auth_admin, sin claims JWT. */
async function goTrueSignup(db, meta = {}) {
  const id = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE supabase_auth_admin");
      await tx.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`,
        [id, `${id}@signup.test`, JSON.stringify(meta)]
      );
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, id, error: err.message };
  }
}

async function asService(db, sql, params) {
  return asUser(db, null, (tx) => tx.query(sql, params), "service_role");
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

/** Usuario con perfil provisionado vía service_role (como provisionClient / invitaciones). */
async function provisioned(db, orgId, role) {
  const id = await createAuthUser(db);
  await asService(
    db,
    `INSERT INTO public.profiles (id, organization_id, role, onboarding_completed, full_name)
     VALUES ($1, $2, $3, true, 'seed')
     ON CONFLICT (id) DO UPDATE
       SET organization_id = EXCLUDED.organization_id,
           role = EXCLUDED.role,
           onboarding_completed = true`,
    [id, orgId, role]
  );
  return id;
}

async function seedProfile(db, sql, params) {
  return asService(db, sql, params);
}

function verdict(before, result, after, expectChange) {
  if (!result.ok) return `DENIED (${result.error})`;
  if (result.rowCount === 0) return "DENIED (0 rows — RLS USING filtered)";
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (!changed) return "NO EFFECT (statement ok, values unchanged/neutralized)";
  return expectChange(after) ? "ALLOWED ← VULNERABLE" : `ALTERED (${JSON.stringify(after)})`;
}

export async function runAttacks(db) {
  const out = [];
  const record = (section, name, v, detail) => out.push({ section, name, verdict: v, detail });

  const victimOrg = await createOrg(db, "Victim Org");
  const orgA = await createOrg(db, "Org A");
  const orgB = await createOrg(db, "Org B");
  const ghostOrg = randomUUID();

  // Signup real vía GoTrue (supabase_auth_admin, sin JWT) con metadata maliciosa
  const signup = await goTrueSignup(db, { role: "admin", organization_id: victimOrg, full_name: "evil" });
  const autoProfile = signup.ok ? await fetchProfile(db, signup.id) : null;
  record("signup", "GoTrue signup (raw_user_meta_data role=admin, organization_id=victim) → handle_new_user",
    signup.ok
      ? `auth user creado; profile=${JSON.stringify(autoProfile)}${autoProfile?.role === "admin" ? " ← metadata role honored" : ""}`
      : `SIGNUP FAILS: ${signup.error}`, autoProfile);

  // ─── INSERT (usuario sin profile) ───
  for (const role of ["admin", "quality_manager", "operator"]) {
    for (const [label, org] of [["victim", victimOrg], ["null", null], ["inexistente", ghostOrg]]) {
      const uid = await createAuthUser(db);
      await db.query("DELETE FROM public.profiles WHERE id = $1", [uid]);
      const res = await attempt(
        db, uid,
        `INSERT INTO public.profiles (id, organization_id, role, onboarding_completed, full_name)
         VALUES (auth.uid(), $1, $2, true, 'x') RETURNING organization_id, role, onboarding_completed`,
        [org, role]
      );
      const after = await fetchProfile(db, uid);
      let v;
      if (!res.ok) v = `DENIED (${res.error})`;
      else if (!after) v = "DENIED (no row)";
      else if (after.role === role && after.organization_id === org && after.onboarding_completed)
        v = role === "operator" && org === null ? "ALLOWED (benigno: operator sin org)" : "ALLOWED ← VULNERABLE";
      else v = `NEUTRALIZED → ${JSON.stringify(after)}`;
      record("insert", `new user INSERT role=${role} org=${label} onboarding=true`, v, after);
    }
  }

  // INSERT para otro usuario (id ≠ auth.uid())
  {
    const attacker = await createAuthUser(db);
    const target = await createAuthUser(db);
    await db.query("DELETE FROM public.profiles WHERE id = ANY($1)", [[attacker, target]]);
    const res = await attempt(
      db, attacker,
      `INSERT INTO public.profiles (id, full_name, organization_id, role) VALUES ($1, 'x', $2, 'admin')`,
      [target, victimOrg]
    );
    const targetRow = await fetchProfile(db, target);
    const attackerRow = await fetchProfile(db, attacker);
    let v;
    if (!res.ok) v = `DENIED (${res.error})`;
    else if (targetRow) v = `ALLOWED ← VULNERABLE (target=${JSON.stringify(targetRow)})`;
    else v = `NEUTRALIZED → id reescrito a auth.uid(); attacker=${JSON.stringify(attackerRow)}, target=null`;
    record("insert", "INSERT profile con id de OTRO usuario (role=admin, org=victim)", v, null);
  }

  // Upsert sobre perfil existente (PostgREST Prefer: resolution=merge-duplicates)
  {
    const op = await provisioned(db, orgA, "operator");
    const before = await fetchProfile(db, op);
    const res = await attempt(
      db, op,
      `INSERT INTO public.profiles (id, full_name, organization_id, role, onboarding_completed)
       VALUES (auth.uid(), 'x', $1, 'admin', true)
       ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role`,
      [orgB]
    );
    const after = await fetchProfile(db, op);
    record("insert", "operator A UPSERT (on conflict update) → role=admin org=B", verdict(before, res, after,
      (a) => a.role === "admin" || a.organization_id === orgB), after);
  }

  // ─── UPDATE propio ───
  const selfUpdates = [
    ["operator", "role → admin", "role = 'admin'", (a) => a.role === "admin"],
    ["operator", "role → quality_manager", "role = 'quality_manager'", (a) => a.role === "quality_manager"],
    ["operator", "organization_id → Org B", `organization_id = '${orgB}'`, (a) => a.organization_id === orgB],
    ["operator", "organization_id → NULL", "organization_id = NULL", (a) => a.organization_id === null],
    ["admin", "organization_id → Org B", `organization_id = '${orgB}'`, (a) => a.organization_id === orgB],
    ["quality_manager", "role → admin", "role = 'admin'", (a) => a.role === "admin"],
    ["quality_manager", "organization_id → Org B", `organization_id = '${orgB}'`, (a) => a.organization_id === orgB],
    ["admin", "role → operator (self-demote)", "role = 'operator'", (a) => a.role === "operator"],
  ];
  for (const [role, label, setClause, isEscalated] of selfUpdates) {
    const uid = await provisioned(db, orgA, role);
    const before = await fetchProfile(db, uid);
    const res = await attempt(db, uid, `UPDATE public.profiles SET ${setClause} WHERE id = auth.uid()`);
    const after = await fetchProfile(db, uid);
    record("update", `${role} Org A: ${label}`, verdict(before, res, after, isEscalated), after);
  }

  // onboarding_completed: operador con onboarding=false → true
  {
    const uid = await provisioned(db, orgA, "operator");
    await seedProfile(db, "UPDATE public.profiles SET onboarding_completed = false WHERE id = $1", [uid]);
    const before = await fetchProfile(db, uid);
    const res = await attempt(db, uid, `UPDATE public.profiles SET onboarding_completed = true WHERE id = auth.uid()`);
    const after = await fetchProfile(db, uid);
    record("update", "operator Org A (onboarding=false): onboarding_completed → true",
      verdict(before, res, after, (a) => a.onboarding_completed === true), after);
  }

  // Usuario sin org (perfil operator NULL) → organization_id victim / role admin
  {
    const uid = await createAuthUser(db);
    await seedProfile(
      db,
      `INSERT INTO public.profiles (id, full_name, role, organization_id) VALUES ($1, 'x', 'operator', NULL)
       ON CONFLICT (id) DO UPDATE SET role = 'operator', organization_id = NULL, onboarding_completed = false`,
      [uid]
    );
    for (const [label, setClause, check] of [
      ["organization_id → victim", `organization_id = '${victimOrg}'`, (a) => a.organization_id === victimOrg],
      ["role → admin", "role = 'admin'", (a) => a.role === "admin"],
    ]) {
      const before = await fetchProfile(db, uid);
      const res = await attempt(db, uid, `UPDATE public.profiles SET ${setClause} WHERE id = auth.uid()`);
      const after = await fetchProfile(db, uid);
      record("update", `orgless operator: ${label}`, verdict(before, res, after, check), after);
    }
  }

  // Perfil admin sin org (lo que crea ensureProfileWithAdmin / handle_new_user 016 — SP-04)
  for (const [label, setClause] of [
    ["organization_id → victim", `organization_id = '${victimOrg}'`],
    ["organization_id → victim + role admin", `organization_id = '${victimOrg}', role = 'admin'`],
  ]) {
    const uid = await createAuthUser(db);
    await seedProfile(
      db,
      `INSERT INTO public.profiles (id, full_name, role, organization_id) VALUES ($1, 'x', 'admin', NULL)`,
      [uid]
    );
    const before = await fetchProfile(db, uid);
    const res = await attempt(db, uid, `UPDATE public.profiles SET ${setClause} WHERE id = auth.uid()`);
    const after = await fetchProfile(db, uid);
    record("update", `orgless ADMIN (SP-04): ${label}`,
      verdict(before, res, after, (a) => a.organization_id === victimOrg), after);
  }

  // ─── Cross-user / cross-tenant ───
  const pairs = [
    ["operator", "same-org", orgA, orgA],
    ["quality_manager", "same-org", orgA, orgA],
    ["admin", "same-org", orgA, orgA],
    ["operator", "cross-org", orgA, orgB],
    ["admin", "cross-org", orgA, orgB],
  ];
  for (const [actorRole, scope, actorOrg, targetOrg] of pairs) {
    const actor = await provisioned(db, actorOrg, actorRole);
    const target = await provisioned(db, targetOrg, "operator");
    const section = scope === "same-org" ? "cross-user" : "cross-tenant";

    const sel = await attempt(db, actor, "SELECT id, role FROM public.profiles WHERE id = $1", [target]);
    record(section, `${actorRole} A SELECT perfil de B (${scope})`,
      sel.ok ? (sel.rows.length ? "VISIBLE" : "NOT VISIBLE") : `DENIED (${sel.error})`, null);

    for (const [label, setClause, check] of [
      ["role → admin", "role = 'admin'", (a) => a.role === "admin"],
      ["organization_id → actor/other org", `organization_id = '${scope === "same-org" ? orgB : actorOrg}'`,
        (a) => a.organization_id !== targetOrg],
      ["full_name", "full_name = 'pwned'", () => true],
    ]) {
      const before = await fetchProfile(db, target);
      const res = await attempt(db, actor, `UPDATE public.profiles SET ${setClause} WHERE id = $1`, [target]);
      const after = await fetchProfile(db, target);
      let v = verdict(before, res, after, check);
      if (label === "full_name" && res.ok && res.rowCount > 0) v = "ALLOWED (UPDATE row matched)";
      record(section, `${actorRole} A UPDATE B (${scope}): ${label}`, v, after);
      // restaurar
      await seedProfile(
        db,
        "UPDATE public.profiles SET role = 'operator', organization_id = $2, full_name = 'seed' WHERE id = $1",
        [target, targetOrg]
      );
    }

    const del = await attempt(db, actor, "DELETE FROM public.profiles WHERE id = $1", [target]);
    const still = await fetchProfile(db, target);
    record(section, `${actorRole} A DELETE B (${scope})`,
      !del.ok ? `DENIED (${del.error})` : still ? "DENIED (0 rows)" : "ALLOWED ← VULNERABLE", null);
  }

  // DELETE propio (para re-INSERT)
  {
    const op = await provisioned(db, orgA, "operator");
    const del = await attempt(db, op, "DELETE FROM public.profiles WHERE id = auth.uid()");
    const still = await fetchProfile(db, op);
    record("delete", "operator DELETE su propio profile (para re-INSERT)",
      !del.ok ? `DENIED (${del.error})` : still ? "DENIED (0 rows)" : "ALLOWED", null);
  }

  // anon
  {
    const res = await attempt(db, null,
      "INSERT INTO public.profiles (id, full_name, organization_id, role) VALUES (gen_random_uuid(), 'x', $1, 'admin')",
      [victimOrg]);
    out.push({ section: "anon", name: "anon INSERT profile admin victim",
      verdict: res.ok ? "ALLOWED ← VULNERABLE" : `DENIED (${res.error})` });
  }

  // RPCs DEFINER que escriben profiles, invocadas como atacante
  {
    const uid = await createAuthUser(db);
    await db.query("DELETE FROM public.profiles WHERE id = $1", [uid]);
    const ens = await attempt(db, uid, "SELECT public.ensure_user_profile()");
    record("rpc", "ensure_user_profile() sin perfil", ens.ok ? `ok → ${JSON.stringify(await fetchProfile(db, uid))}` : `DENIED (${ens.error})`, null);
    const fin = await attempt(db, uid, "SELECT public.finalize_user_onboarding()");
    record("rpc", "finalize_user_onboarding() sin org", fin.ok ? `ok → ${JSON.stringify(await fetchProfile(db, uid))}` : `DENIED (${fin.error})`, null);
    const cuo = await attempt(db, uid, "SELECT public.complete_user_onboarding('X','food','CL')");
    record("rpc", "complete_user_onboarding() sin org", cuo.ok ? `ok → ${JSON.stringify(await fetchProfile(db, uid))}` : `DENIED (${cuo.error})`, null);
  }

  return out;
}

/**
 * --no-recursion: sustituye SOLO en esta BD de prueba las policies UPDATE
 * recursivas por equivalentes sin subconsulta sobre profiles, para medir qué
 * protege el trigger protect_profile_identity por sí solo (modela un futuro
 * fix de la recursión o un hosted con policies distintas).
 */
const NO_RECURSION = `
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_admin_update_team" ON public.profiles;
CREATE POLICY "profiles_admin_update_team" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.rbac_admin() AND organization_id = public.current_organization_id() AND id <> auth.uid())
  WITH CHECK (public.rbac_admin() AND organization_id = public.current_organization_id());
`;

/**
 * --equivalent: mismas condiciones de 036 pero leyendo la fila actual vía
 * SECURITY DEFINER (sin recursión). Mide si la INTENCIÓN de las policies
 * protege, independientemente del error de recursión.
 */
const EQUIVALENT = `
CREATE OR REPLACE FUNCTION public._audit_my_profile_snapshot()
RETURNS TABLE (organization_id uuid, role text, onboarding_completed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.organization_id, p.role, p.onboarding_completed FROM public.profiles p WHERE p.id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public._audit_profile_org(p_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.organization_id FROM public.profiles p WHERE p.id = p_id
$$;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT s.role FROM public._audit_my_profile_snapshot() s)
    AND organization_id IS NOT DISTINCT FROM (SELECT s.organization_id FROM public._audit_my_profile_snapshot() s)
    AND onboarding_completed IS NOT DISTINCT FROM (SELECT s.onboarding_completed FROM public._audit_my_profile_snapshot() s)
  );
DROP POLICY IF EXISTS "profiles_admin_update_team" ON public.profiles;
CREATE POLICY "profiles_admin_update_team" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT public.rbac_admin()) AND organization_id = (SELECT public.current_organization_id()) AND id <> auth.uid())
  WITH CHECK (
    (SELECT public.rbac_admin())
    AND organization_id = (SELECT public.current_organization_id())
    AND organization_id IS NOT DISTINCT FROM public._audit_profile_org(profiles.id)
  );
`;

async function main() {
  const { db, applied, failed } = await buildDb();
  if (args.includes("--equivalent")) {
    try {
      await db.exec(EQUIVALENT);
    } catch (err) {
      console.log(`  [--equivalent FAILED] ${err.message}`);
    }
  }
  if (args.includes("--no-recursion")) {
    try {
      await db.exec(NO_RECURSION);
    } catch (err) {
      console.log(`  [--no-recursion FAILED] ${err.message}`);
    }
  }
  const state = await profileState(db);
  const attacks = await runAttacks(db);
  await db.close();

  if (JSON_OUT) {
    console.log(JSON.stringify({ upto: UPTO, skip: [...SKIP], applied, failed, state, attacks }, null, 2));
    return;
  }
  console.log(`\n== Migraciones aplicadas: ${applied.length}, fallidas: ${failed.length} (upto=${UPTO ?? "all"}, skip=${[...SKIP].join(",") || "none"})`);
  for (const f of failed) console.log(`   FAILED ${f.file}: ${f.error}`);
  console.log("\n== RLS", state.rls);
  console.log("\n== Policies public.profiles");
  for (const p of state.policies) {
    console.log(`- ${p.policyname} | ${p.cmd} | ${p.permissive} | ${p.roles}\n    USING: ${p.qual}\n    CHECK: ${p.with_check}`);
  }
  console.log("\n== Grants", state.grants);
  console.log("\n== Triggers profiles", state.triggers.map((t) => t.def));
  console.log("\n== Triggers auth.users", state.authTriggers.map((t) => t.def));
  console.log("\n== Constraints", state.constraints.map((c) => `${c.conname}: ${c.def}`));
  console.log("\n== Writer functions", state.writerFunctions);
  console.log("\n== Attacks");
  for (const a of attacks) console.log(`[${a.section}] ${a.name}\n    → ${a.verdict}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("audit-sp03-profile-identity.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
