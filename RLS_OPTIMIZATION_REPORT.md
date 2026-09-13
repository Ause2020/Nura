# Informe — Optimización RLS (InitPlan)

Fecha: 2026-09-11  
Migración: `supabase/migrations/041_optimize_rls.sql`  
Auditoría de origen: `RLS_AUDIT.md`

039 y 040 ya existen (`039_dashboard_metrics.sql`, `040_kiosk_metrics.sql`). La optimización RLS es **041**. No se modificó ninguna migración histórica.

Hay que **aplicar 041** en el proyecto Supabase. Sin ella el código de app no cambia: solo cambian las policies en Postgres.

---

## Qué no cambió (invariantes)

| Invariante | Cómo se preservó |
| --- | --- |
| RLS sigue ON | Ningún `DISABLE ROW LEVEL SECURITY` |
| Roles `admin` / `quality_manager` / `operator` | Mismos `rbac_quality()`, `rbac_admin()`, `rbac_is(...)` |
| Aislamiento multi-tenant | Sigue filtrando por `current_organization_id()` |
| Sin cross-tenant | Org A no ve filas de org B; operator no gana write de quality |
| INVOKER no pasó a DEFINER | `get_dashboard_metrics` / `get_kiosk_metrics` no se tocan |
| Policies sin equivalente | Se drop+create **en la misma transacción** con el mismo nombre y el mismo ACL |
| Helpers de sesión | `current_organization_id`, `current_user_role`, `rbac_*` siguen `SECURITY DEFINER` |

---

## Qué cambió (CPU)

| Antes | Después |
| --- | --- |
| `rbac_same_org(organization_id)` por fila | `organization_id = (SELECT current_organization_id())` (InitPlan) |
| `rbac_quality()` suelto junto al pred de fila | `(SELECT rbac_quality())` (InitPlan) |
| `plan_id IN (SELECT id FROM haccp_plans WHERE rbac_same_org(...))` | `EXISTS (SELECT 1 FROM haccp_plans p WHERE p.id = plan_id AND p.organization_id = (SELECT current_organization_id()))` + `(SELECT rbac_quality())` |
| `audit_checklist_items` / `audit_findings` vía padre | Pred directo sobre su `organization_id` (la columna ya existía) |
| `production_form_sections/fields/values` vía JOIN al padre | Pred directo sobre su `organization_id` |
| `notifications` INSERT: subquery cruda a `profiles` | `(SELECT current_organization_id())` |
| `my_organization_id()` | Delega en `current_organization_id()` |

Índices nuevos (si faltaban) sobre `organization_id` y FKs que usa RLS (`plan_id` ya estaba; se añade `haccp_ccp_decisions.hazard_id` y FKs de hallazgos / acks / QR).

---

## Tablas priorizadas

`haccp_*`, `production_form_*`, `nonconformities`, `capa_*` / `nc_*`, `audits` / `audit_*`, `controlled_documents` / `document_*`, `notifications`.

El resto de tablas de 036 se reescribieron con el mismo generador InitPlan para no dejar un mix de preds caros.

Hijas **sin** `organization_id` (`haccp_teams`, `haccp_plan_products`, `haccp_diagrams`, `haccp_validations`, `haccp_plan_hazards`, `haccp_ccp_decisions`): siguen yendo al padre por `plan_id` con `EXISTS` + índice `plan_id`.

---

## Pruebas de aislamiento (obligatorias en staging)

Script listo para pegar: `supabase/verify_rls_isolation.sql`.

Preparar **dos orgs** (A, B), un usuario por rol en A (`admin_A`, `qm_A`, `op_A`) y un `admin_B`. Sembrar al menos: 1 `haccp_plans` + hija (diagrama o team) por org, 1 NC, 1 auditoría + finding, 1 documento published + 1 draft, 1 submission de producción, 1 notification por user.

Ejecutar cada caso **con el JWT de ese usuario** (`SET request.jwt.claim.sub` o sesión Supabase). Esperado:

### Cross-tenant

| # | Actor | Acción | Esperado |
| --- | --- | --- | --- |
| T1 | `admin_A` | `SELECT` `haccp_plans` | solo org A |
| T2 | `admin_A` | `SELECT` `haccp_diagrams` / `haccp_teams` | solo planes de A |
| T3 | `admin_A` | `SELECT` `nonconformities` / `capa_actions` | solo A |
| T4 | `admin_A` | `SELECT` `audits` / `audit_findings` | solo A |
| T5 | `admin_A` | `SELECT` `production_form_submissions` / `_values` | solo A |
| T6 | `admin_A` | `SELECT` `controlled_documents` | solo A |
| T7 | `admin_B` | las mismas lecturas | 0 filas de A |
| T8 | `admin_A` | `UPDATE` / `INSERT` con `organization_id = B` | **0 rows / CHECK fail** |
| T9 | `admin_A` | insertar `haccp_diagrams` con `plan_id` de B | **CHECK fail** |

### Roles (misma org A)

| # | Actor | Acción | Esperado |
| --- | --- | --- | --- |
| R1 | `qm_A` | SELECT/INSERT HACCP, auditorías, NC, docs draft | permitido |
| R2 | `op_A` | SELECT `haccp_plans` / `audits` / NC | **0 filas** (sigue exigiendo quality) |
| R3 | `op_A` | INSERT `nonconformities` en org A | permitido |
| R4 | `op_A` | UPDATE / DELETE `nonconformities` | **denegado** |
| R5 | `op_A` | SELECT `controlled_documents` `published`/`obsolete` | visible |
| R6 | `op_A` | SELECT `controlled_documents` `draft` | **oculto** |
| R7 | `op_A` | INSERT/UPDATE documentos | **denegado** |
| R8 | `op_A` | SELECT templates/sections/fields/submissions de A | permitido |
| R9 | `op_A` | DELETE `production_form_submissions` | **denegado** |
| R10 | `op_A` | INSERT submission + values en A | permitido |
| R11 | `op_A` | DELETE `capa_stage_log` | **denegado** (solo admin) |
| R12 | `admin_A` | DELETE `capa_stage_log` / `controlled_documents` | permitido |

### Notifications

| # | Actor | Acción | Esperado |
| --- | --- | --- | --- |
| N1 | `op_A` | SELECT notifications | solo `user_id = op_A` |
| N2 | `admin_A` | SELECT notifications de `op_A` | **0** (no es inbox ajeno) |
| N3 | `admin_A` | INSERT notification `organization_id = A` | permitido |
| N4 | `admin_A` | INSERT notification `organization_id = B` | **CHECK fail** |

### Identidad

| # | Actor | Acción | Esperado |
| --- | --- | --- | --- |
| I1 | `op_A` | UPDATE propio `role` → admin | **fail** (trigger + CHECK) |
| I2 | `op_A` | UPDATE `organization_id` | **fail** |
| I3 | `admin_A` | UPDATE rol de `op_A` en org A | permitido |
| I4 | `admin_A` | UPDATE perfil de org B | **0 rows** |

Si alguno falla, **no mergear 041** hasta corregir. Un fail de T8/T9/R2 es regresión de aislamiento.

---

## Verificación en repo

```
npm run test:rls
npm test
```

`scripts/verify-rls-optimization.mjs` comprueba el SQL de 041 (InitPlan, EXISTS en hijas HACCP, sin `DISABLE ROW LEVEL SECURITY`, sin promover INVOKER a DEFINER).
