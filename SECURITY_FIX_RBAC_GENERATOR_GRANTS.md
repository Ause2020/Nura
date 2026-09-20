# Root cause

Tras **050**, `_rbac_drop_all_policies` y `apply_org_access_gate` ya devolvían `permission denied` a un JWT `authenticated`. `_rbac_quality_crud` y `_rbac_quality_via_plan` seguían invocables.

048 hizo `CREATE OR REPLACE` de esos generadores **sin** `REVOKE FROM PUBLIC`. El default de PostgreSQL es `PUBLIC EXECUTE`. 050 revocó `authenticated` de forma explícita, pero **PUBLIC EXECUTE sigue aplicando** a `authenticated` y `anon`.

Un JWT podía resolver el RPC. Con tabla inexistente era no-op (`to_regclass` NULL). Con una tabla real el generador INVOKER llama a `_rbac_drop_all_policies` (DEFINER) y reescribe policies.

# Migration

`supabase/migrations/051_lock_down_rbac_generators.sql`

- Incremental. Idempotente.
- **No** edita 030/036/041/047/048/049/050.
- **No** CREATE/DROP/ALTER POLICY.
- **No** cambia cuerpos de funciones ni RBAC de negocio.
- **No** se aplica a producción desde este cambio.

# Inventory

## B — administrative / policy generators

| Función | Mutación | DEFINER | `search_path` | Identifiers |
| --- | --- | --- | --- | --- |
| `apply_org_access_gate(text)` | DROP/CREATE `org_access_gate` | sí | `public` | `to_regclass` + `format(%I)` |
| `_rbac_drop_all_policies(text)` | DROP todas las policies no `service_role%` | sí (050) | `public` | `to_regclass` + `format(%I)` |
| `_rbac_quality_crud(text)` | drop-all + CREATE `*_rbac` + gate | no (INVOKER 048) | no fijado | `to_regclass` + `format(%I)` |
| `_rbac_quality_via_plan(text)` | igual vía `plan_id` | no | no fijado | igual |
| `_rbac_quality_via_audit(text)` | igual vía `audit_id` | no | no fijado | igual |
| `rls_auto_enable` (hosted, no en repo) | ENABLE RLS si existe | n/d | n/d | REVOKE si `to_regprocedure` / catálogo |

El barrido de 051 también revoca cualquier otra función `public` cuyo `prosrc` haga `CREATE/DROP/ALTER POLICY` o `ENABLE/FORCE/DISABLE ROW LEVEL SECURITY`, excluyendo helpers runtime.

Triggers (`protect_org_access_fields`, `protect_profile_identity`) y RPCs de negocio (`create_org_notifications`, métricas, rate-limit, job lock) **no** son generators de policies. No se tocan.

## A — runtime / query helpers

`current_user_role`, `rbac_is`, `rbac_quality`, `rbac_admin`, `rbac_same_org`, `current_organization_id`, `current_organization_access_allowed`, `storage_is_org_object`, `storage_can_write_bucket`, `my_organization_id`.

# Grants after 051

**Generators (B):** `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`. `GRANT EXECUTE` a `service_role` si el rol existe. El owner (`postgres`) conserva EXECUTE para migraciones / SQL Editor.

**Helpers (A):** `REVOKE ALL` de `PUBLIC` y `anon`. `GRANT EXECUTE` a `authenticated` (si la función existe). Sin EXECUTE para `anon`.

# SECURITY DEFINER review

- `apply_org_access_gate` y `_rbac_drop_all_policies`: `search_path = public`; tabla validada con `to_regclass` y embebida con `%I`. No se reescribieron.
- `_rbac_quality_*`: INVOKER, sin `search_path`. Identifiers igual de acotados. Hallazgo crítico = EXECUTE público, no el cuerpo. No se rediseñaron.
- Tras 051 no son ejecutables por PUBLIC / anon / authenticated.

# Tests

- `scripts/verify-rbac-generator-grants.mjs` (`npm run test:rbac-generator-grants`)
- `supabase/verify_rbac_generator_grants.sql` (opcional `DATABASE_URL`)
- `scripts/live-rbac-generator-grants.mjs` (JWT hosted, fixtures `nura_p1_live_*`)

# Live verification

Aplicada en el hosted de **desarrollo/staging** (`fbunktfkihythsclhgnw`) vía SQL (Management API). **No** se aplicó a producción. `db push` no se usó (evitaría aplicar 036/041).

Catálogo (`verify_rbac_generator_grants.sql`): `has_function_privilege` OK — authenticated/anon sin EXECUTE en generators; authenticated conserva helpers runtime.

JWT/PostgREST (`scripts/live-rbac-generator-grants.mjs`), fixtures `nura_p1_live_*`, tabla falsa `nura_051_no_such_table` únicamente. **29/29 PASS.** Fixtures eliminados.

| RPC | authenticated (admin y operator) | anon |
| --- | --- | --- |
| `_rbac_quality_crud` | `42501 permission denied` | `42501 permission denied` |
| `_rbac_quality_via_plan` | `42501 permission denied` | `42501 permission denied` |
| `_rbac_quality_via_audit` | `42501 permission denied` | `42501 permission denied` |
| `_rbac_drop_all_policies` | `42501 permission denied` | `42501 permission denied` |
| `apply_org_access_gate` | `42501 permission denied` | `42501 permission denied` |
| `current_user_role` | `"admin"` | no |
| `rbac_is` | `true` | no |
| `rbac_quality` | `true` | no |
| `current_organization_access_allowed` | `true` | no |

Regresión HACCP 050:

| Check | Resultado |
| --- | --- |
| Admin plan INSERT | allowed |
| QM plan UPDATE | allowed |
| Operator diseño SELECT | 0 filas |
| Operator diseño INSERT | RLS denied |
| Operator monitoring INSERT | allowed |
| A → planes de B | 0 filas |
| Admin B escribe su plan | allowed |
| Org A suspendida, operator SELECT | 0 filas |
| Org A suspendida, monitoring INSERT | `org_access_gate` |

Regression (repo): `npm test` 158 (151 pass, 7 skip live `DATABASE_URL`, 0 fail), `test:rbac`, `test:haccp-rbac-drift`, `npm run build` — pass.

# Final verification

1. **¿Puede authenticated ejecutar algún generator que modifique RLS?** **NO.**
2. **¿Puede anon ejecutar esos generators?** **NO.**
3. **¿Siguen funcionando los helpers runtime usados por RLS?** **SÍ.**
4. **¿Cambió alguna policy funcional?** **NO.**
5. **¿Se mantuvo el contrato HACCP 050?** **SÍ.**
