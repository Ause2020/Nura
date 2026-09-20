# Root cause

El hosted aplicó **030** (policies PERMISSIVE `*_all`: cualquier `authenticated` de la misma org) y **048** (`org_access_gate` RESTRICTIVE), pero **no** 036/041. Faltaban `current_user_role()` / `rbac_quality()` y las policies quality-only.

Un JWT `operator` podía hacer CRUD de diseño HACCP en su org **activa**. El aislamiento A↔B y el bloqueo de org suspendida ya funcionaban. 048 no concedía el write: solo ANDaba “org activa” con el ACL demasiado ancho de 030.

# Migration

`supabase/migrations/050_reconcile_haccp_rbac.sql`

- Incremental. No edita 030/036/041/047/048/049.
- Falla si faltan los generadores de 048.
- **Aplicada** al hosted de desarrollo/staging. Ver `# Live verification`.

# Helpers restored

| Helper | Rol |
| --- | --- |
| `current_user_role()` | `SECURITY DEFINER`, `search_path = public`, lee `profiles.role` de `auth.uid()`. `GRANT EXECUTE` a `authenticated`. |
| `rbac_is(VARIADIC text[])` | Compara el rol de sesión. Grant a `authenticated`. |
| `rbac_quality()` | `rbac_is('admin', 'quality_manager')`. Grant a `authenticated`. |
| `_rbac_drop_all_policies(text)` | Usado por los generadores 048. **REVOKE** de `anon` / `authenticated`. |

No se reescribió `rbac_same_org` (048 ya ANDa `current_organization_access_allowed()`).

# Policies removed

`DROP POLICY IF EXISTS` de las nueve leftovers 030:

`haccp_plans_all`, `haccp_teams_all`, `haccp_plan_products_all`, `haccp_diagrams_all`, `haccp_validations_all`, `haccp_plan_hazards_all`, `haccp_ccp_decisions_all`, `haccp_step_data_all`, `haccp_monitoring_records_all`.

En la misma transacción se crean las policies nuevas (no hay ventana sin ACL).

# Policies created

Vía **`_rbac_quality_crud` / `_rbac_quality_via_plan` de 048** (PERMISSIVE tenant + `rbac_quality()`, más `org_access_gate` RESTRICTIVE):

- `haccp_plans`
- `haccp_teams`, `haccp_plan_products`, `haccp_diagrams`, `haccp_validations`, `haccp_plan_hazards`, `haccp_ccp_decisions`
- `haccp_step_data` (writes quality-only)

Extra:

- `haccp_step_data_select_operator` — SELECT same-org para **operator** (contrato PCC en `/registros/historico` lee pasos 7–9). No es write.

**`haccp_monitoring_records` no es quality-only.** Motivo: `PccMonitoringPanel` vive en `/registros/historico`, ruta que el operator puede abrir (`canAccessPath` + `monitoring.execute`). `createMonitoringRecord` / `listMonitoringRecords` son el flujo operativo. Quality-only habría roto esa captura.

ACL de monitoreo:

| Policy | Cmd | Quién |
| --- | --- | --- |
| `haccp_monitoring_records_select_org` | SELECT | misma org |
| `haccp_monitoring_records_insert_org` | INSERT | misma org |
| `haccp_monitoring_records_update_rbac` | UPDATE | `rbac_quality()` |
| `haccp_monitoring_records_delete_rbac` | DELETE | `rbac_quality()` |
| `org_access_gate` | ALL RESTRICTIVE | org activa |

# Role matrix

| Tabla | Admin / QM | Operator |
| --- | --- | --- |
| `haccp_plans` + 6 hijas de diseño | CRUD misma org | denegado (0 filas / RLS) |
| `haccp_step_data` | CRUD | SELECT only |
| `haccp_monitoring_records` | CRUD | SELECT + INSERT; no UPDATE/DELETE |

Org activa. `service_role` sigue con BYPASSRLS.

# Operator behavior

- **No** puede crear, ver, editar ni borrar un plan HACCP ni sus hijas de diseño.
- **Sí** puede listar e insertar registros PCC en `/registros/historico`.
- **Sí** puede leer `haccp_step_data` para armar el formulario PCC.
- `/haccp` sigue fuera de `OPERATOR_ALLOWED_PREFIXES`.

# Tenant isolation

Sin cambio de semántica: las policies 048/050 exigen `current_organization_id()`. A no ve/escribe filas de B. INSERT con `organization_id` de B falla el WITH CHECK.

# Suspension behavior

`org_access_gate` se vuelve a aplicar en cada tabla regenerada y en monitoreo. Org `suspended` ⇒ SELECT 0 / INSERT nombrando `org_access_gate`.

# Functional compatibility

- Wizard `/haccp`: admin y quality_manager, sin cambio de código.
- Histórico / PCC: operator conserva captura. No se inventó un write nuevo; se acotó el FOR ALL de 030.
- Export / AI insights: admin o service_role, sin cambio.

# Regression

Añadidos:

- `scripts/verify-haccp-rbac-drift.mjs` (`npm run test:haccp-rbac-drift`, incluido en `npm test`)
- `supabase/verify_haccp_rbac_drift.sql` (live opcional con `DATABASE_URL`)
- `scripts/verify-rbac.mjs`: operator no tiene `haccp.read`/`haccp.manage`; sí `monitoring.*`

Comandos: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:rbac`, `npm run build`.

La matriz JWT live contra el hosted **no se ejecutó**: 050 no se aplicó.

# Live deployment instructions

1. Revisar `050_reconcile_haccp_rbac.sql`.
2. Aplicarla **solo** en el proyecto de desarrollo/staging (SQL Editor o CLI). No producción hasta validar.
3. `psql $DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/verify_haccp_rbac_drift.sql`
4. Matriz JWT (fixtures temporales, limpiar al final):
   - Operator A: `haccp_plans` SELECT 0, INSERT RLS deny, UPDATE/DELETE 0.
   - Admin/QM A: INSERT/SELECT/UPDATE/DELETE propios OK.
   - A → UUID de B: 0 / deny.
   - Suspender A (`service_role`): SELECT 0, INSERT `org_access_gate`. Reactivar.
   - Operator A: INSERT `haccp_monitoring_records` propio OK; INSERT `haccp_plans` deny.
5. Confirmar en `pg_policies` que no queda ningún `*_all` en las nueve tablas.

# Live verification

Hosted `fbunktfkihythsclhgnw.supabase.co` (dev/staging). Fixtures `nura_p1_live_*` only; cleaned after the run. No schema/policy/grant changes during the test.

`pg_policies` / `pg_catalog` are **not** exposed on PostgREST. Leftover `*_all` absence is inferred from live JWT behavior (operator no longer has FOR ALL on design tables).

| Check | Result |
| --- | --- |
| Admin A `haccp_plans` CRUD | allowed |
| Quality A `haccp_plans` CRUD | allowed |
| Operator A `haccp_plans` SELECT / UPDATE / DELETE | **0 rows** |
| Operator A `haccp_plans` INSERT | **RLS denied** |
| Operator on 6 child design tables | SELECT 0, INSERT RLS denied |
| Quality on those children | INSERT + SELECT allowed |
| Operator `haccp_step_data` SELECT | **allowed** (n=1; PCC contract) |
| Operator `haccp_step_data` INSERT/UPDATE/DELETE | denied / 0 rows |
| Quality `haccp_step_data` INSERT/UPDATE | allowed |
| Operator monitoring SELECT/INSERT | allowed |
| Operator monitoring UPDATE/DELETE | **0 rows** |
| Operator monitoring INSERT `organization_id=B` | RLS denied |
| Quality monitoring INSERT/UPDATE/DELETE | allowed |
| A → plan B SELECT/UPDATE/DELETE | 0 rows |
| A INSERT plan with org B / team on plan B | RLS denied |
| B still sees own plan | yes |
| Org A suspended, pre-issued JWTs | helper `false`; HACCP SELECT 0; quality INSERT `org_access_gate`; operator monitoring INSERT `org_access_gate` |
| Org A reactivated | service_role |

**TENANT ISOLATION = PASS**

Helpers (JWT, non-destructive fake table `nura_050_no_such_table` only):

| Function | authenticated |
| --- | --- |
| `current_user_role` / `rbac_is` / `rbac_quality` | executable (needed for RLS) |
| `_rbac_drop_all_policies` | **denied** |
| `apply_org_access_gate` | **denied** |
| `_rbac_quality_crud` | **executable** (no-op on fake table) |
| `_rbac_quality_via_plan` | **executable** (no-op on fake table) |

Finding: 048 left `EXECUTE` on PUBLIC for the two generators. 050 revoked `authenticated` explicitly, but PUBLIC still applies. A JWT could call them on a **real** table and rewrite policies. Not part of the 030 drift; not patched in this verification.

Regression (repo): `tsc`, lint, `npm test` (152, 0 fail), `test:rbac`, `test:haccp-rbac-drift`, `npm run build` — pass.

# Final verification

1. **¿Puede operator crear/modificar/eliminar planes HACCP?** **No.**
2. **¿Puede operator leer configuración necesaria para PCC?** **Sí** (`haccp_step_data` SELECT).
3. **¿Puede operator crear monitoreos PCC?** **Sí** (same-org INSERT).
4. **¿Puede operator editar/eliminar monitoreos históricos?** **No.**
5. **¿Admin/QM mantienen CRUD HACCP?** **Sí.**
6. **¿Org A puede tocar datos HACCP de Org B?** **No.**
7. **¿Org suspendida queda bloqueada?** **Sí** (`org_access_gate`).
8. **¿Sobrevive alguna policy `*_all`?** **No en comportamiento.** Catálogo no visible; operator ya no tiene FOR ALL de diseño.
9. **¿Algún JWT normal puede ejecutar generators administrativos de RLS?** **`_rbac_quality_crud` y `_rbac_quality_via_plan`: sí** (PUBLIC EXECUTE). `_rbac_drop_all_policies` y `apply_org_access_gate`: no.

**HACCP RBAC DRIFT = CLOSED**

Residual (no bloquea el cierre del drift 030): revocar `EXECUTE` de PUBLIC sobre `_rbac_quality_crud` / `_rbac_quality_via_plan` en una migración posterior. No se hizo aquí.
