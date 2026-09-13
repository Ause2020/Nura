# Consolidación HACCP — una sola arquitectura

Fecha: 2026-09-11  
Objetivo: la aplicación usa **solo** el plan de 12 pasos (`haccp_plans` y tablas asociadas). El HACCP por producto (v1) deja de tener consumidores de código.

No se tocaron tablas, columnas FK ni migraciones históricas. Residuos de schema: `HACCP_LEGACY_DEPENDENCIES.md`.

---

## Modelo canónico (único en runtime)

| Tabla | Rol |
| --- | --- |
| `haccp_plans` | Plan activo por organización |
| `haccp_teams` | Equipo HACCP |
| `haccp_plan_products` | Descripción de producto / uso previsto |
| `haccp_diagrams` | Diagrama de flujo |
| `haccp_validations` | Validación del diagrama |
| `haccp_plan_hazards` | Análisis de peligros |
| `haccp_ccp_decisions` | Árbol de decisión PCC |
| `haccp_step_data` | Payload de pasos 7–12 |
| `haccp_monitoring_records` | Registros de monitoreo PCC |

Código vivo: `lib/haccp-plan/*`, `components/haccp-plan/*`, `/haccp`, dashboard, AI insights, export, storage de evidencias.

---

## Modelo legacy (sin consumidores de aplicación)

`haccp_products`, `haccp_process_steps`, `haccp_hazards`, `haccp_ccps`, `haccp_plan_versions`, `haccp_plan_version_log`.

Siguen en Postgres. La app no hace SELECT/INSERT/UPDATE/DELETE/RPC sobre ellas.

---

## Consumidores que se migraron (no se borraron)

| Antes | Ahora |
| --- | --- |
| Dashboard: KPI desde `haccp_products.plan_completion` | Solo `haccp_plans.checklist_progress` (12 pasos) |
| Export: dump de las 6 tablas v1 | `haccp_plans` + `haccp_step_data` + `haccp_monitoring_records` + hijas por `plan_id` |
| Submit de monitoreo: `findLinkedCcpForSubmission` → `haccp_ccps` y escribe `haccp_ccp_id` | NC por desviación vía `origin_ref_id` = submission. Sin lookup v1 |
| Borrador de NC: `haccpCcpId` | Campo eliminado del insert |

---

## Archivos eliminados

### UI v1 (`components/haccp/`)

Ninguna ruta los montaba (`/haccp/[id]`, `/nuevo`, `/resumen` solo redirigen).

- `product-detail.tsx`
- `products-table.tsx`
- `new-product-form.tsx`
- `process-diagram.tsx`
- `step-modal.tsx`
- `hazard-analysis.tsx`
- `hazard-modal.tsx`
- `ccp-table.tsx`
- `ccp-tree.tsx`
- `haccp-summary-table.tsx`
- `haccp-plan-version-panel.tsx`
- `completion-bar.tsx`

### Libs solo v1

- `lib/haccp/ccp-linking.ts` — único puente runtime hacia `haccp_ccps`
- `lib/haccp/constants.ts` — labels/categorías de producto v1
- `lib/haccp/risk-matrix.ts` — matriz v1; el wizard usa `lib/haccp-plan/risk.ts`
- `lib/haccp/versioning.ts` — `haccp_plan_versions`; el versionado vivo es snapshot a documentos
- `lib/hazards-library.ts` — solo lo usaba `hazard-modal`; el catálogo canónico es `lib/haccp-plan/constants.ts`

Conservado: `lib/haccp/auth.ts` (sesión / org, no tablas HACCP).

### Tipos

De `types/database.ts`:

- Tipos: `HaccpProductStatus`, `ProcessStepType`, `HazardType`, `Severity`, `Probability`, `CcpDetermination`
- Interfaces: `HaccpProduct`, `HaccpProcessStep`, `HaccpHazard`, `HaccpCcp`, `HaccpPlanVersion`, `HaccpPlanVersionLog`
- Entradas `Database.Tables` de las 6 tablas v1

`HazardType` del plan 12 pasos vive en `lib/haccp-plan/types.ts`.

Se mantienen `haccp_ccp_id` en `ProductionFormSubmission` y `Nonconformity` porque las columnas siguen en DB.

---

## Qué no se tocó (a propósito)

- `components/haccp-plan/**` y `lib/haccp-plan/**`
- Redirects `/haccp/[id]`, `/haccp/nuevo`, `/haccp/resumen`
- Auth, onboarding, RBAC, CAPA, auditorías, documentos, monitoreo de formularios
- `supabase/migrations/**`
- Tablas y FKs en Postgres

---

## Checks

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK (warnings preexistentes de `<img>` / `alt`, no dead code) |
| `npm test` | 59 pass / 0 fail / 2 skip (storage live) |

---

## Cómo verificar que no quedan queries v1

En `app/`, `components/`, `lib/` (excepto comentarios de tipos):

```
haccp_products | haccp_process_steps | haccp_hazards | haccp_ccps
haccp_plan_versions | haccp_plan_version_log
```

Cero `.from()` / inserts. Las únicas menciones restantes son comentarios en `types/database.ts` y este par de documentos.
