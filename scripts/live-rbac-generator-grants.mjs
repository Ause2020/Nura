/**
 * Live JWT probe after 051. Uses .env.local. Fixtures nura_p1_live_* only.
 * Fake table args for generators. Cleans up on exit.
 *
 *   node scripts/live-rbac-generator-grants.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {}
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STAMP = Date.now().toString(36);
const PREFIX = "nura_p1_live_";
const PASSWORD = `P1liv3!${randomBytes(9).toString("base64url")}`;
const FAKE_TABLE = "nura_051_no_such_table";

const ADMIN_RPCS = [
  "_rbac_quality_crud",
  "_rbac_quality_via_plan",
  "_rbac_quality_via_audit",
  "_rbac_drop_all_policies",
  "apply_org_access_gate",
];

const RUNTIME_RPCS = [
  { name: "current_user_role", args: {} },
  { name: "rbac_is", args: { allowed: ["admin"] } },
  { name: "rbac_quality", args: {} },
  { name: "current_organization_access_allowed", args: {} },
];

function loadEnv() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(ROOT, file), "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      }
    } catch {
      /* optional */
    }
  }
  return out;
}

function denied(error) {
  const msg = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return (
    msg.includes("permission denied") ||
    msg.includes("not executable") ||
    msg.includes("42501") ||
    msg.includes("pgrst202") ||
    msg.includes("could not find the function")
  );
}

function rlsDenied(error) {
  const msg = `${error?.message || ""}`.toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("org_access_gate") ||
    error?.code === "42501"
  );
}

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE in .env.local");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIds = [];
const orgIds = [];

async function createOrg(suffix) {
  const { data, error } = await admin
    .from("organizations")
    .insert({
      name: `${PREFIX}${suffix}_${STAMP}`,
      industry: "otro",
      country: "CL",
      access_status: "active",
      access_granted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "org insert failed");
  orgIds.push(data.id);
  return data.id;
}

async function createUser(orgId, role, suffix) {
  const email = `${PREFIX}${suffix}_${STAMP}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Live ${role}` },
  });
  if (error || !data.user) throw new Error(error?.message || "auth user failed");
  userIds.push(data.user.id);
  const { error: pErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    organization_id: orgId,
    full_name: `Live ${role}`,
    role,
    onboarding_completed: true,
  });
  if (pErr) throw new Error(pErr.message);
  return { email, role, id: data.user.id };
}

async function jwtClient(email) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(error.message);
  return client;
}

async function cleanup() {
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  if (orgIds.length) {
    await admin.from("organizations").delete().in("id", orgIds);
  }
  const { data: leftover } = await admin
    .from("organizations")
    .select("id")
    .like("name", `${PREFIX}%`);
  if (leftover?.length) {
    const ids = leftover.map((r) => r.id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id")
      .in("organization_id", ids);
    for (const p of profiles || []) {
      await admin.auth.admin.deleteUser(p.id).catch(() => {});
    }
    await admin.from("organizations").delete().in("id", ids);
  }
}

try {
  const orgA = await createOrg("a");
  const orgB = await createOrg("b");
  const adminA = await createUser(orgA, "admin", "admin_a");
  const qmA = await createUser(orgA, "quality_manager", "qm_a");
  const opA = await createUser(orgA, "operator", "op_a");
  const adminB = await createUser(orgB, "admin", "admin_b");

  const asAdminA = await jwtClient(adminA.email);
  const asQmA = await jwtClient(qmA.email);
  const asOpA = await jwtClient(opA.email);
  const asAdminB = await jwtClient(adminB.email);
  const asAnon = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const fn of ADMIN_RPCS) {
    const { error } = await asAdminA.rpc(fn, { p_table: FAKE_TABLE });
    rec(
      `authenticated admin cannot execute ${fn}`,
      !!error && denied(error),
      error ? `${error.code || ""} ${error.message}` : "RPC succeeded (unexpected)"
    );
  }

  for (const fn of ADMIN_RPCS) {
    const { error } = await asOpA.rpc(fn, { p_table: FAKE_TABLE });
    rec(
      `authenticated operator cannot execute ${fn}`,
      !!error && denied(error),
      error ? `${error.code || ""} ${error.message}` : "RPC succeeded (unexpected)"
    );
  }

  for (const fn of ADMIN_RPCS) {
    const { error } = await asAnon.rpc(fn, { p_table: FAKE_TABLE });
    rec(
      `anon cannot execute ${fn}`,
      !!error && denied(error),
      error ? `${error.code || ""} ${error.message}` : "RPC succeeded (unexpected)"
    );
  }

  for (const fn of RUNTIME_RPCS) {
    const { data, error } = await asAdminA.rpc(fn.name, fn.args);
    rec(
      `authenticated can execute ${fn.name}`,
      !error,
      error ? error.message : JSON.stringify(data)
    );
  }

  const { data: plan, error: planErr } = await asAdminA
    .from("haccp_plans")
    .insert({ organization_id: orgA, name: `${PREFIX}plan_${STAMP}` })
    .select("id")
    .single();
  rec("admin HACCP plan INSERT", !planErr && !!plan?.id, planErr?.message);

  const { error: qmUpd } = await asQmA
    .from("haccp_plans")
    .update({ name: `${PREFIX}plan_qm_${STAMP}` })
    .eq("id", plan?.id || "00000000-0000-0000-0000-000000000000");
  rec("quality_manager HACCP plan UPDATE", !qmUpd, qmUpd?.message);

  const { data: opPlans, error: opSel } = await asOpA
    .from("haccp_plans")
    .select("id")
    .eq("organization_id", orgA);
  rec(
    "operator HACCP design SELECT empty",
    !opSel && Array.isArray(opPlans) && opPlans.length === 0,
    opSel?.message || `rows=${opPlans?.length}`
  );

  const { error: opIns } = await asOpA
    .from("haccp_plans")
    .insert({ organization_id: orgA, name: `${PREFIX}op_${STAMP}` });
  rec("operator HACCP design INSERT denied", !!opIns && rlsDenied(opIns), opIns?.message || "insert ok");

  const { error: monIns } = await asOpA.from("haccp_monitoring_records").insert({
    organization_id: orgA,
    pcc_reference_id: `${PREFIX}pcc`,
    parameter: "temp",
    measured_value: "4",
    created_by: opA.id,
  });
  rec("operator monitoring INSERT allowed", !monIns, monIns?.message);

  const { error: cross } = await asAdminA
    .from("haccp_plans")
    .select("id")
    .eq("organization_id", orgB);
  rec(
    "tenant A cannot see B plans",
    !cross && true,
    cross?.message
  );
  const { data: bSeen } = await asAdminA
    .from("haccp_plans")
    .select("id")
    .eq("organization_id", orgB);
  rec("tenant isolation A→B SELECT 0", Array.isArray(bSeen) && bSeen.length === 0, `rows=${bSeen?.length}`);

  const { error: bOwn } = await asAdminB
    .from("haccp_plans")
    .insert({ organization_id: orgB, name: `${PREFIX}plan_b_${STAMP}` });
  rec("admin B still writes own HACCP", !bOwn, bOwn?.message);

  const { error: susErr } = await admin
    .from("organizations")
    .update({ access_status: "suspended" })
    .eq("id", orgA);
  if (susErr) throw new Error(susErr.message);

  const { data: susPlans } = await asOpA.from("haccp_plans").select("id");
  rec("suspended org operator SELECT 0", Array.isArray(susPlans) && susPlans.length === 0, `rows=${susPlans?.length}`);

  const { error: susMon } = await asOpA.from("haccp_monitoring_records").insert({
    organization_id: orgA,
    pcc_reference_id: `${PREFIX}pcc_sus`,
    parameter: "temp",
    measured_value: "5",
    created_by: opA.id,
  });
  rec(
    "suspended org monitoring INSERT blocked",
    !!susMon && (rlsDenied(susMon) || /org_access_gate/i.test(susMon.message || "")),
    susMon?.message || "insert ok"
  );

  await admin.from("organizations").update({ access_status: "active" }).eq("id", orgA);
} catch (err) {
  rec("live harness", false, err instanceof Error ? err.message : String(err));
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
