# Environment

- **Kind:** hosted Supabase (not local Postgres, not CLI-linked).
- **Host:** `fbunktfkihythsclhgnw.supabase.co`
- **Classification:** development/staging. Operator requested live checks on this project. The project had **1** existing organization besides temporary fixtures. It was not treated as production; only `nura_p1_live_*` rows were created, suspended, reactivated, and deleted.
- **How it was tested:** PostgREST + Auth + Storage via service_role and authenticated JWTs (`@supabase/supabase-js`). Local Next.js for `requirePermission` and middleware. No `DATABASE_URL` / `psql` / Supabase CLI; the existing `supabase/verify_*.sql` scripts were not executed.
- **App servers:**
  - `http://127.0.0.1:3000` — existing `next start` build (older than the P1-01 API wiring).
  - `http://127.0.0.1:3010` — current source via `next dev` (includes `assertOrganizationAccess` inside `requirePermission`).
- Temporary fixtures used prefix `nura_p1_live_`. They were removed after each run. Leftover sweep after the last run: **0** prefixed organizations.
- No secrets, keys, passwords, or customer identifiers are included here.

# Migration status

Confirmed **live in this database** by behavior, not by reading `schema_migrations` (that catalog is not exposed on PostgREST):

| Migration | Present | Evidence |
| --- | --- | --- |
| **047** | Yes | JWT UPDATE of privileged columns raises `privileged organization access fields are restricted` (`42501`). `service_role` can change `access_status`. |
| **048** | Yes | `current_organization_access_allowed()` is callable. While the test org was `suspended`, SELECT of business tables returned 0 rows and INSERT failed with RLS policy `org_access_gate`. Helper returned `false`. |
| **049** | Yes | `create_org_notifications(jsonb)` is callable. Direct PostgREST INSERT is `permission denied for table notifications`. Bad links fail RPC (`notification link must be an internal path`) and fail `CHECK notifications_link_internal` on a service_role INSERT. |
| **043** (`notifications_dedup_key`) | Yes (revalidated) | service_role INSERT with `dedup_key` succeeded. JWT `create_org_notifications` persisted a same-org row. The previous error `constraint "notifications_dedup_key" for table "notifications" does not exist` was **not** observed. |

# P1-02 results

JWT of an org admin against their own organization, PostgREST `UPDATE`:

| Column | Result |
| --- | --- |
| `access_status` → `pending` | **Denied.** Trigger error; persisted value stayed `active`. |
| `access_expires_at` | **Denied.** Trigger error; persisted `null`. |
| `access_granted_at` | **Denied.** Same trigger error. The seed timestamp was left unchanged (the harness first compared clock prefixes and flagged a false persist; service_role readback showed the original grant time, not a JWT rewrite). |
| `contract_notes` | **Denied.** Trigger error; persisted `null`. |
| `provisioned_by` | **Denied.** Trigger error; persisted `null`. |

Legitimate admin UPDATE of `name` on the same org: **allowed**.

Admin A UPDATE of org B `name`: **0 rows**.

`service_role` UPDATE `access_status` → `pending`, then back to `active`: **allowed**.

While the test org was `suspended`, the same admin JWT attempted `access_status=active` (self-reactivate). PostgREST returned **no row**. Service_role readback: still `suspended`.

# P1-01 results

## ACTIVE

Roles on fixtures were confirmed: `admin`, `quality_manager`, `operator`.

Legitimate access while `active`:

- Quality: INSERT/SELECT `haccp_plans`, INSERT `audits`, INSERT `controlled_documents`, INSERT `production_form_templates`.
- Operator: INSERT/SELECT `nonconformities`.
- Quality: upload + download of a private `haccp-evidence` object under `${orgA}/...` (`image/png`).
- `GET /api/kiosk/metrics` (`requirePermission` / `monitoring.read`): **200** on both local servers.

Unexpected (not introduced by 048; see Failures): operator JWT could INSERT `haccp_plans` on this database. 036 intends quality-only CRUD. Cross-tenant isolation still held.

## SUSPENDED

Test org A was suspended with `service_role` only. Pre-issued JWTs (sign-in before the suspend) were reused.

| Check | Result |
| --- | --- |
| `current_organization_access_allowed()` | `false` |
| SELECT `haccp_plans` | **0 rows** |
| INSERT `haccp_plans` | **Denied** — `new row violates row-level security policy "org_access_gate"` |
| UPDATE `haccp_plans` | **0 rows** |
| SELECT `nonconformities` | **0 rows** |
| Storage download of A's private object | **Denied** (`Object not found` / policy) |
| `GET /api/kiosk/metrics` with pre-issued cookie, **current source (:3010)** | **403** `{ "error": "Forbidden" }` |
| Same API on **existing `next start` (:3000)** | **200** (stale build; `assertOrganizationAccess` is not in that bundle) |
| Middleware `GET /dashboard` on :3000 and :3010 | **307** → `/acceso-pendiente` |
| Org B (still `active`) SELECT own HACCP | Unchanged, still visible |

Org A was reactivated with `service_role`. Quality JWT then saw its HACCP rows again.

The Auth session stayed technically valid (login cookies still authenticated). Business data on PostgREST/Storage was blocked. The API gate works in current source; it is missing from the already-running production build until that build is replaced.

# P1-03 results

| Check | Result |
| --- | --- |
| JWT PostgREST INSERT into `notifications` (same-org recipient, `/capa`) | **Denied** — `permission denied for table notifications` |
| RPC A → quality A (same org) | **Security checks pass; persist fails** — missing `notifications_dedup_key` (043) |
| RPC A → admin B (other org) | **Denied** — `notification recipient is not in the organization` |
| RPC `organization_id=B` + recipient A | **Denied** — `notification organization_id does not match session` |
| RPC nonexistent recipient UUID | **Denied** — `notification recipient is not in the organization` |
| service_role INSERT of a same-org row with `/capa` | **Allowed** (proves the table accepts a legitimate internal row when the writer is not JWT) |
| B inbox after A's attempts | **0 rows** |

# Cross-tenant tests

With a known UUID of B's `haccp_plans` row, user A (quality, org A `active`):

| Operation | Result |
| --- | --- |
| SELECT by id | **0 rows** |
| UPDATE | **0 rows** |
| DELETE | **0 rows** |

B still saw its own HACCP. 048 did not loosen prior tenant isolation on these paths.

# Storage tests

Bucket exercised: `haccp-evidence` only. Bucket `logos` was not listed, uploaded, updated, or deleted.

| Case | Result |
| --- | --- |
| Org A `active`, JWT quality, own prefix | Upload + download **allowed** |
| Org B `active`, JWT admin, own prefix | Upload **allowed** |
| Org A JWT → B object path | **Denied** |
| Org B JWT → A object path | **Denied** |
| Org A `suspended`, same pre-issued JWT, own private object | **Denied** |

# Notification link tests

Rejected by **RPC before persist** and independently by **DB CHECK** (`notifications_link_internal`) on a service_role INSERT (so TypeScript is not the only control):

- `https://evil.example`
- `http://evil.example`
- `//evil.example`
- `javascript:alert(1)`
- `data:text/html,phish`

Accepted as persistable internal paths (JWT RPC persist confirmed after 043; see addendum):

- `/capa`
- `/haccp/<uuid>`
- `/auditorias/<uuid>/informe`
- `/documentos/<uuid>`

# Failures / unexpected behavior

1. ~~**`notifications_dedup_key` (043) is not on this database.**~~ **Closed.** Revalidation after applying 043: JWT same-org RPC persist works; the missing-constraint error is gone. See `# 043 Revalidation`.
2. **Existing `next start` on :3000 does not include the P1-01 API gate.** Middleware already redirects dashboard pages. `/api/kiosk/metrics` on that stale build still returned 200 for a suspended org. Current source on :3010 returned 403. A rebuild/redeploy is required for the running production server to match source.
3. **Operator JWT inserted `haccp_plans`.** Fixture role was confirmed `operator`. 036 defines quality-only CRUD; this database likely still has a broader org-scoped INSERT (030-style). 048 adds a RESTRICTIVE `org_access_gate` and did not create that write. Cross-tenant remains denied. Out of P1 scope (no RBAC tightening was requested).
4. First harness pass had a false P1-02 fail on `access_status` (`active` → `active` no-op) and a false persist flag on `access_granted_at`. Re-run with distinct values and service_role readback: **no JWT rewrite of privileged fields**.

# Final verdict

**PASS WITH CONDITIONS**

Conditions:

1. ~~Apply **043** (or otherwise create `notifications_dedup_key`).~~ **Closed.** See `# 043 Revalidation`. **P1-03 LIVE = PASS.**
2. Rebuild/redeploy the Next.js server so `requirePermission` → `assertOrganizationAccess` is what production traffic runs. PostgREST/Storage/middleware already enforce P1-01 against this database.

Security properties requested for the three P1 controls, against this live project:

1. **¿Puede un admin reactivar su propia organización?** **No.** JWT UPDATE of `access_status` is rejected by 047; a suspend + self-reactivate left the row `suspended`. Only `service_role` changed it.
2. **¿Puede una org suspendida seguir leyendo/escribiendo vía JWT?** **No en el plano de datos.** Pre-issued JWTs got 0 rows / RLS `org_access_gate` / Storage deny. The Auth session can stay valid. **API:** denied in current source (403); the stale `:3000` build still answered 200 until rebuilt.
3. **¿Puede Org A acceder a datos de Org B?** **No.** SELECT/UPDATE/DELETE by known UUID and Storage cross-prefix were denied / 0 rows.
4. **¿Puede Org A inyectar notificaciones a User B?** **No.** RPC rejects other-org recipients and forged `organization_id`. Direct table INSERT is revoked. B's inbox stayed empty.
5. **¿Puede persistirse una URL externa en `notification.link`?** **No.** RPC and `CHECK notifications_link_internal` both reject the external / protocol-relative / `javascript:` / `data:` examples.

**P1 SECURITY GATE = PASS WITH CONDITIONS** (043 is closed. The remaining condition is the stale `:3000` `next start` build lacking the P1-01 API gate.)

# 043 Revalidation

Focused live re-run against the same hosted project after 043 was applied. Fixtures `nura_p1_live_*` only; cleaned at the end. Schema was not modified by this check.

- **migration 043 now present:** yes. service_role INSERT with `dedup_key` succeeded. The error `constraint "notifications_dedup_key" for table "notifications" does not exist` did **not** appear on any RPC or INSERT.
- **legitimate same-org RPC persist result:** JWT `create_org_notifications` A → quality A with `link=/capa` persisted. The recipient SELECT'd that row in their inbox (`title=same-org`, `link=/capa`). The row was deleted afterwards. Direct JWT PostgREST INSERT remains `permission denied for table notifications`.
- **cross-tenant result:** A → User B denied (`notification recipient is not in the organization`). Forged `organization_id` denied (`notification organization_id does not match session`). Nonexistent UUID denied (`notification recipient is not in the organization`). B inbox stayed at 0 rows.
- **link safety result:** `/capa` persisted. `https://evil.example` and `javascript:alert(1)` denied (`notification link must be an internal path`).

**P1-03 LIVE = PASS**

No schema was modified. No new migrations were created. No P2/P3 work was done. Production was not targeted.
