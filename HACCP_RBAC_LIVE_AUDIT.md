# Finding

On the hosted development/staging project (`fbunktfkihythsclhgnw.supabase.co`), a JWT whose `profiles.role` was confirmed as `operator` can do **INSERT, SELECT, UPDATE and DELETE** on `public.haccp_plans` for its own active organization.

That matches the **030** tenant-wide `FOR ALL` policies (`haccp_plans_all` and the sibling `*_all` policies), not the **036/041/048** quality-only RBAC.

048 is present and working. It is **not** the hole: when the same org is `suspended`, the operator INSERT fails with policy **`org_access_gate`**. Cross-tenant A→B stays denied.

`pg_policies` / `pg_catalog` / `information_schema` are **not** exposed on PostgREST, and this environment has no `DATABASE_URL` / `psql` / Supabase CLI. Policy **names** below for the 030 leftovers are identified by elimination against the repo plus live behavior. The one policy name observed **directly** in a Postgres error is `org_access_gate`.

# Expected RBAC

Final state implied by the current repository (036 applied, then 041 rewrite, then 048 gate — **048 does not re-run** `_rbac_quality_crud('haccp_plans')`; it only adds the RESTRICTIVE gate and updates the generators):

**Write (INSERT/UPDATE/DELETE) and SELECT on HACCP 12-step tables:** `admin` and `quality_manager` only (`rbac_quality()`).

**Operator:** no.

**048 `org_access_gate`:** RESTRICTIVE `FOR ALL` to `authenticated`. AND with existing ACL. Blocks pending/suspended/expired. Does not grant writes.

Expected policies on `haccp_plans`:

| policyname | permissive? | cmd | roles | USING / WITH CHECK |
| --- | --- | --- | --- | --- |
| `haccp_plans_select_rbac` | PERMISSIVE | SELECT | authenticated | `organization_id = current_organization_id() AND rbac_quality()` |
| `haccp_plans_insert_rbac` | PERMISSIVE | INSERT | authenticated | WITH CHECK same |
| `haccp_plans_update_rbac` | PERMISSIVE | UPDATE | authenticated | USING + WITH CHECK same |
| `haccp_plans_delete_rbac` | PERMISSIVE | DELETE | authenticated | USING same |
| `org_access_gate` | **RESTRICTIVE** | ALL | authenticated | `current_organization_access_allowed()` |

`haccp_plans_all` must **not** exist.

Child tables with `plan_id`: `*_select/insert/update/delete_rbac` via `_rbac_quality_via_plan` (quality + plan in current org) + `org_access_gate`.

`haccp_step_data` / `haccp_monitoring_records`: same as `haccp_plans` (`_rbac_quality_crud`).

# Migration history

Chronology for `public.haccp_plans` (and the 8 sibling 12-step tables unless noted).

| Migration | Policy | Command | Role | USING | WITH CHECK | Later fate in repo |
| --- | --- | --- | --- | --- | --- | --- |
| **030** | `"haccp_plans_all"` | ALL | authenticated | `organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())` | same | **Must be dropped** when 036/041 `_rbac_quality_crud('haccp_plans')` runs (`_rbac_drop_all_policies`). There is **no** `DROP POLICY IF EXISTS "haccp_plans_all"` by name anywhere else. |
| **030** | `"haccp_teams_all"` … `"haccp_ccp_decisions_all"` | ALL | authenticated | `plan_id IN (SELECT id FROM haccp_plans WHERE org = caller org)` | same | Dropped only by `_rbac_quality_via_plan`. |
| **030** | `"haccp_step_data_all"`, `"haccp_monitoring_records_all"` | ALL | authenticated | org = caller org | same | Dropped only by `_rbac_quality_crud`. |
| **032** | — | — | — | — | — | Columns on `haccp_teams` only. No policy change. |
| **036** | `haccp_plans_{select,insert,update,delete}_rbac` | per-cmd | authenticated | `rbac_same_org(organization_id) AND rbac_quality()` | same on writes | Replaced in **041** (InitPlan form). Creates helpers `current_user_role`, `rbac_is`, `rbac_quality`, `_rbac_drop_all_policies`. |
| **041** | same `*_rbac` names | per-cmd | authenticated | `organization_id = current_organization_id() AND rbac_quality()` | same | Still the expected ACL. Drops all non-`service_role%` policies first (including 030 leftovers **if this ran**). |
| **041_remove_legacy_qms** | — | — | — | — | — | Lists HACCP tables as protected. Does not change their policies. |
| **047** | — | — | — | — | — | Organizations access columns only. |
| **048** | `org_access_gate` | ALL RESTRICTIVE | authenticated | `current_organization_access_allowed()` | same | Added. Does **not** drop `haccp_plans_all`. Redefines `rbac_same_org` (adds access gate) and `_rbac_quality_crud` / `_rbac_quality_via_plan` so a **future** regen also applies the gate. **Does not invoke** those generators on `haccp_plans`. |

# Live policies

PostgREST refused:

- `pg_catalog.pg_policy` → `Invalid schema: pg_catalog`
- `information_schema.role_table_grants` / `table_privileges` → `Invalid schema`
- `public.pg_policies` → PGRST205 (not in schema cache)

So this section is **live behavior + error text**, not a `pg_policies` dump.

Observed on `haccp_plans`:

| Observation | What it implies |
| --- | --- |
| Operator JWT: INSERT/SELECT/UPDATE/DELETE all succeed on own org | A **PERMISSIVE** policy allows `authenticated` without `rbac_quality()`. Shape is `FOR ALL`, not INSERT-only. |
| Only repo policy with that shape | **030 `"haccp_plans_all"`** |
| Suspended org: INSERT error names **`org_access_gate`** | 048 RESTRICTIVE policy is live and AND-ed. |
| Cross-org INSERT | Generic RLS deny (030 WITH CHECK fails). |
| Anon INSERT | Generic RLS deny (no matching permissive policy for anon). |
| `current_organization_access_allowed()` callable, returns true/false as expected | 048 helper live. |
| `current_user_role`, `rbac_quality`, `rbac_is`, `_rbac_drop_all_policies` **absent** from PostgREST OpenAPI | **036 helpers were not applied** (or were dropped). 041 quality policies cannot exist without `rbac_quality()`. |
| Live RPCs that **do** exist | `current_organization_id`, `rbac_same_org` (rewritten by **048**), `apply_org_access_gate`, `_rbac_quality_crud`, `_rbac_quality_via_plan`, `_rbac_quality_via_audit` (bodies from **048**; calling the generators would **mutate** policies — not invoked). |
| Extra live RPC **not in the repo** | `rls_auto_enable` — not called. |

**EXPECTED FROM REPO vs ACTUAL LIVE**

| | Repo (036+041+048) | Live hosted |
| --- | --- | --- |
| Quality-only `*_rbac` | Present | **Absent** (036/041 not applied; `rbac_quality` missing) |
| `haccp_plans_all` (030) | Dropped | **Present in effect** |
| `org_access_gate` (048) | Present | **Present** (named in error) |

The policy that allows operator INSERT is the leftover **030 PERMISSIVE `haccp_plans_all`** (FOR ALL, same-org, no role check). 048’s `org_access_gate` only ANDs “org is active”.

# Grants

Distinguished from RLS:

| Principal | Evidence | Conclusion |
| --- | --- | --- |
| `anon` | INSERT reached RLS (`new row violates row-level security policy`), not `permission denied for table` | Table **GRANT INSERT** exists; RLS blocks. |
| `authenticated` | JWT DML succeeds when a policy allows | Table GRANT for SELECT/INSERT/UPDATE/DELETE exists. The bug is **RLS**, not a missing GRANT. |
| `service_role` | Fixture seed/cleanup via service_role | BYPASSRLS; not the operator path. |

Default Supabase grants on `public` tables typically give `anon`/`authenticated` broad table privileges and rely on RLS. That matches what we saw.

# Exact root cause

1. **030** created `haccp_plans_all`: any `authenticated` user whose profile org matches the row can do ALL commands.
2. **036/041** are the only migrations that drop that policy (via `_rbac_drop_all_policies` inside `_rbac_quality_crud`). Those migrations **did not land** on this database: `rbac_quality()` / `current_user_role()` are not live.
3. **048** added `org_access_gate` and rewrote generators, but **did not replace** the 030 ACL. PERMISSIVE OR + RESTRICTIVE AND ⇒ operator still writes while the org is `active`.
4. Same leftover pattern applies to the other 030 `*_all` HACCP policies.

This is the same class of hosted drift already seen with **043** (repo migration not applied until a later manual step).

# Live role matrix

Fixtures: org A `active` with confirmed roles `admin` / `quality_manager` / `operator`; org B `active` with admin + quality. JWT/PostgREST only. Fixtures `nura_p1_live_*` deleted after the run.

## `haccp_plans`

| Actor | INSERT | SELECT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| Admin A | allowed | allowed | allowed | allowed |
| Quality A | allowed | allowed | allowed | allowed |
| Operator A | **allowed (unexpected)** | **allowed (unexpected)** | **allowed (unexpected)** | **allowed (unexpected)** |

## Cross-tenant A → B (`haccp_plans`)

| Actor | SELECT B UUID | UPDATE B | DELETE B | INSERT with `organization_id = B` |
| --- | --- | --- | --- | --- |
| Operator A | 0 rows | 0 rows | 0 rows | RLS denied |
| Admin A | 0 rows | — | — | — |
| Quality B | own row still visible | — | — | — |

No cross-tenant break.

## 048 while A `suspended` (pre-issued operator/quality JWTs)

| Check | Result |
| --- | --- |
| `current_organization_access_allowed()` | `false` |
| Operator SELECT | 0 rows |
| Quality SELECT | 0 rows |
| Operator INSERT | denied — `org_access_gate` |

Then A was reactivated with service_role and fixtures were removed.

# HACCP table audit

Expected write roles for all nine: `admin` + `quality_manager` only.

| Table | Expected write | Actual live write (JWT, org active) | Unexpected permissive policies | Status |
| --- | --- | --- | --- | --- |
| `haccp_plans` | admin, QM | admin, QM, **operator** (full CRUD) | 030 `haccp_plans_all` (in effect) | **DRIFT** |
| `haccp_teams` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_teams_all` | **DRIFT** |
| `haccp_plan_products` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_plan_products_all` | **DRIFT** |
| `haccp_diagrams` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_diagrams_all` | **DRIFT** |
| `haccp_validations` | admin, QM | Quality INSERT ok; **operator SELECT + UPDATE** (INSERT not re-tried after unique `plan_id`) | 030 `haccp_validations_all` | **DRIFT** |
| `haccp_plan_hazards` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_plan_hazards_all` | **DRIFT** |
| `haccp_ccp_decisions` | admin, QM | Quality INSERT ok; operator INSERT reached **UNIQUE** (`plan_id, hazard_id`) — RLS allowed the write; operator SELECT ok | 030 `haccp_ccp_decisions_all` | **DRIFT** |
| `haccp_step_data` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_step_data_all` | **DRIFT** |
| `haccp_monitoring_records` | admin, QM | Quality INSERT ok; **operator INSERT + SELECT** | 030 `haccp_monitoring_records_all` | **DRIFT** |

No table in this set is OK versus repo RBAC.

# Tenant isolation

Holds for `haccp_plans`: A cannot read/update/delete B’s row or insert into B’s `organization_id`.

030’s WITH CHECK is org-scoped; 048 does not loosen it. `rbac_same_org` (048) also ANDs access allowed, but the live allowing policy is the 030 org equality, not `rbac_same_org`.

# Recommended remediation

**Do not implement here.** Minimal future migration (new file only; do not edit 030/036/041/048):

1. Recreate the missing 036 helpers if absent: `current_user_role()`, `rbac_is(...)`, `rbac_quality()`.
2. Recreate `_rbac_drop_all_policies` if absent.
3. Drop the nine 030 leftovers **by name** (defense in depth):
   - `"haccp_plans_all"`, `"haccp_teams_all"`, `"haccp_plan_products_all"`, `"haccp_diagrams_all"`, `"haccp_validations_all"`, `"haccp_plan_hazards_all"`, `"haccp_ccp_decisions_all"`, `"haccp_step_data_all"`, `"haccp_monitoring_records_all"`
4. Invoke the **already-live 048** generators (they re-apply `org_access_gate`):
   - `_rbac_quality_crud('haccp_plans')`
   - `_rbac_quality_crud('haccp_step_data')`
   - `_rbac_quality_crud('haccp_monitoring_records')`
   - `_rbac_quality_via_plan(...)` for the six `plan_id` children
5. **Do not** only DROP `*_all` without creating `*_rbac`, or quality/admin writes die with the leftovers.
6. Re-run the live role matrix (operator deny; admin/QM allow; A↛B; suspend still `org_access_gate`).
7. Optionally dump `pg_policies` once `DATABASE_URL` exists, to close the catalog gap.

Do not call those generators from the app. Do not touch 048’s RESTRICTIVE semantics.

# Risk classification

**Within-tenant privilege escalation / integrity — High.**  
Any operator JWT in an **active** org can create, rewrite, or delete HACCP plans and child HACCP rows.

**Cross-tenant confidentiality — not broken** on this test.

**Not caused by 047/048/049.** 048 correctly blocks suspended orgs.

**Hosted drift vs repo:** yes. Same family as the former missing 043.

---

1. **¿Qué policy exacta permite a operator INSERT en `haccp_plans`?**  
   La PERMISSIVE de **030 `haccp_plans_all`** (FOR ALL, misma org, sin rol). `org_access_gate` no concede el INSERT; solo exige org activa. El nombre `haccp_plans_all` no se pudo leer de `pg_policies` (catálogo no expuesto); el comportamiento live es el de esa policy y es la única del repo que lo produce.

2. **¿Por qué sigue existiendo si las migraciones actuales pretenden quality-only?**  
   036/041 nunca se aplicaron en este hosted (`rbac_quality` / `current_user_role` no existen). 048 no borra `*_all` ni regenera HACCP.

3. **¿Es drift del Supabase hosted respecto al repo?**  
   **Sí.**

4. **¿Qué otras tablas HACCP están afectadas?**  
   Las nueve listadas: todas **DRIFT** (operator write y/o SELECT).

5. **¿Existe alguna ruptura cross-tenant?**  
   **No** en `haccp_plans` (0 filas / RLS).

6. **¿Cuál sería la migración mínima para corregirlo?**  
   Helpers 036 si faltan + `DROP POLICY` de los nueve `*_all` + llamar los generadores 048 `_rbac_quality_crud` / `_rbac_quality_via_plan` (reponen `org_access_gate`). No implementada.

No se modificó schema, policies ni P2/P3.
