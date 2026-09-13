# Informe de limpieza legacy — Nura

Fecha: 2026-09-11  
Alcance: código de aplicación (páginas, componentes, hooks, libs, tipos, APIs, validadores).  
Fuera de alcance: tablas Supabase, migraciones históricas, buckets, RLS.

Criterio: Nura es exclusivamente **HACCP / Food Safety / Inocuidad**. Se eliminó código QMS/LIMS/QC/reclamos/LMS sin consumidores de runtime. No se tocó nada necesario para HACCP, CCP/PCC, hazard analysis, equipo HACCP, diagramas de flujo, validación, monitoreo, desviaciones, CAPA de inocuidad, auditorías, documentos controlados, organizaciones, usuarios, RBAC, autenticación u onboarding.

Fuente de candidatos: `ARCHITECTURE_AUDIT.md` sección SAFE_TO_DELETE y residuos tipados de laboratorio, reclamos, especificaciones, planes de muestreo, liberación de lotes, controles de proceso y QC genérico.

---

## Resultado de checks

Tras cada grupo: `npm run typecheck`, `npm run lint`, `npm test`.

| Grupo | typecheck | lint | test |
| --- | --- | --- | --- |
| 1 — componentes/páginas muertos | OK | OK (warnings de imports, corregidos en grupo 4) | 59 pass / 0 fail / 2 skip |
| 2 — emails, AI LMS, CAPA residual, settings | OK | OK | 59 pass / 0 fail / 2 skip |
| 3 — tipos/constantes QMS | OK | OK | 59 pass / 0 fail / 2 skip |
| 4 — imports muertos | OK | OK (solo warnings de `<img>` / `alt`, no dead code) | 59 pass / 0 fail / 2 skip |

Los 2 tests skipped son verificaciones live de storage / signed URLs (requieren entorno).

---

## Contexto: módulos ya retirados antes de esta pasada

El commit `0969426` ya había quitado la superficie de producto fuera de HACCP. En esta pasada **no existían** páginas, componentes ni `lib/` de laboratory, lab analyses, lab results, complaints, product specifications (módulo QMS), sampling plans, lot releases, process controls genéricos, QC controls/submissions ni Quality Control.

Archivos ya eliminados en `0969426` (se listan para que el inventario quede cerrado). Era seguro porque esas rutas ya no estaban en el nav, el middleware las redirigía, y el plan canónico vive en `/haccp` + monitoreo + CAPA + auditorías + documentos.

### Páginas

- `app/(dashboard)/capacitacion/**` (7 páginas LMS)
- `app/(dashboard)/proveedores/**` (3 páginas)
- `app/(dashboard)/reclamos/**` (4 páginas)
- `app/(dashboard)/trazabilidad/**` (7 páginas)
- `app/proveedor/[token]/page.tsx`

### API routes

- `app/api/ai/complaint-classify/route.ts`
- `app/api/notifications/complaint-critical/route.ts`
- `app/api/proveedor/upload/route.ts`
- `app/api/quick-capture/complaint/route.ts`
- `app/api/suppliers/[id]/portal-token/route.ts`

### Componentes

- `components/complaints/*` (7)
- `components/quick-capture/quick-complaint.tsx`
- `components/suppliers/*` (7)
- `components/traceability/*` (9)
- `components/training/*` (9)

### Libs / integraciones

- `lib/complaints/*` (5)
- `lib/suppliers/*` (6)
- `lib/traceability/*` (7)
- `lib/training/*` (3)
- `lib/integrations/auto-nc-from-complaint.ts`
- `lib/integrations/nc-from-complaint.ts`
- `lib/integrations/nc-from-supplier.ts`
- `lib/integrations/training-from-capa.ts`

Laboratory / QC / PRP como módulos de UI tampoco tenían consumidores: las tablas correspondientes las dropea (si se aplicó) la migración `029`; **esa migración no se modificó**.

---

## Grupo 1 — Componentes y páginas muertos

| Archivo eliminado | Por qué era seguro |
| --- | --- |
| `components/team/role-gate.tsx` | 0 imports. El RBAC vivo está en middleware, `lib/auth/permissions.ts` y `require-permission`. No es autenticación ni onboarding. |
| `components/production-records/production-records-dashboard.tsx` | 0 imports. Reemplazado por `monitoreo-hub` y el dashboard de plantillas. El módulo de monitoreo (PCC) se conservó. |
| `app/(auth)/register/register-form.tsx` | `/register` no lo importaba. Se conservó `app/(auth)/register/page.tsx` y el middleware de auth. |

No se tocó `components/haccp/*` ni `lib/haccp/*` ni `lib/hazards-library.ts` (HACCP v1 aún leído por dashboard, export y `ccp-linking`).

---

## Grupo 2 — Residuos de módulos muertos en código vivo

No se borraron archivos enteros. Se recortó código sin callers.

| Cambio | Por qué era seguro |
| --- | --- |
| `lib/email/templates.ts` — eliminados `prpMissedEmail`, `supplierDocExpiringEmail`, `supplierEvalOverdueEmail`, `complaintCriticalEmail` | 0 callers. El cron ya no genera esos mails. Se conservaron CAPA, auditoría y resumen semanal. |
| `app/api/settings/organization/route.ts` — quitados campos `complaint_*` | La UI de reclamos/SLA ya no existe. Settings de organización (nombre, acceso, inocuidad) se conservó. |
| `lib/integrations/nonconformity-draft.ts` — quitado `supplierId` del insert | El módulo proveedores no existe. La creación de NC de inocuidad (monitoreo/auditoría) se conservó. |
| `lib/capa/workflow.ts`, `components/capa/capa-workflow-panel.tsx`, `components/capa/nc-detail.tsx` — quitado `pendingCapaTraining` | Residuo LMS→CAPA siempre en 0. El workflow CAPA de inocuidad se conservó. |
| `lib/ai-insights/{types,snapshot,findings,generate}.ts` — quitado el bloque LMS `training` | El snapshot devolvía `[]` para cursos LMS. **No** se tocó evidencia de capacitación del equipo HACCP (`haccp.team.*.training*`). |
| `components/landing/module-carousel.tsx` — “Trazabilidad de lotes” → “Monitoreo de PCC” | Copy de landing, sin lógica. |
| Copy CAPA empty-state | Apunta a monitoreo o auditorías, no a reclamos/LMS. |
| `lib/team/invitations.ts` — import no usado de `getInvitationUrl` | La función sigue exportada desde `lib/team/urls.ts` y `buildInvitationUrl` se usa en invite/accept. |

---

## Grupo 3 — Tipos TypeScript y constantes QMS

| Cambio | Por qué era seguro |
| --- | --- |
| `types/database.ts` — eliminados typedefs `Prp*`, `Lab*`, `ProductSpecification`, `SamplingPlan`, `LotRelease`, `ProcessControl`, `Supplier*`, `Training*` (LMS), `CustomerComplaint*`, `Complaint*`, `Qc*`, `Trace*`, `MockRecall*` | Ningún `.from()` de aplicación los usaba. Limpiar el typedef **no** altera Postgres. |
| `types/database.ts` — quitadas entradas `Database.Tables` de esos módulos | Igual: nadie consultaba esas claves tipadas. |
| `Organization` — quitados `supplier_scorecard_weights` y `complaint_*` | Settings ya no los escribe (grupo 2). |
| `Nonconformity.supplier_id` quitado de la interfaz TS | El insert de NC ya no lo manda. La columna puede seguir en DB; no se migró. |
| `lib/notifications/constants.ts` + `components/layout/notification-panel.tsx` | Tipos vivos: `capa_due`, `capa_overdue`, `audit_upcoming`, `nc_new`, `document_read_required`, `daily_insight`, `system`. Filas viejas de supplier/complaint/training siguen renderizando icono genérico (`TYPE_ICONS[type] ?? Bell`). |
| `lib/ai/anthropic.ts` — comentario “Complaint classify” | Cosmético. |

**Conservado a propósito (histórico / HACCP):**

- `NcOrigin` con `prp | lab | complaint | supplier` — etiquetas de NCs antiguas en `lib/capa/constants.ts`.
- `CcpDetermination` con `prp` / `oprp` — árbol de decisión Codex, no el módulo PRP.
- `AuditType` `"supplier"` — tipo de auditoría de inocuidad, no el módulo de proveedores.
- Tipos HACCP v1: `HaccpProduct`, `HaccpProcessStep`, `HaccpHazard`, `HaccpCcp`, versionado.

---

## Grupo 4 — Imports, props y helpers muertos

Ningún archivo de producto se eliminó. Solo higiene para que lint no reporte dead imports.

| Archivo | Qué se quitó | Por qué era seguro |
| --- | --- | --- |
| `app/(dashboard)/admin/acceso/page.tsx` | `createClient` / `supabase` no usados | La página sigue listando orgs vía `listOrganizationsForAdmin`. |
| `app/onboarding/onboarding-wizard.tsx` + `page.tsx` | prop `userId` no usada | Onboarding sigue igual; `completeOnboarding` usa la sesión. |
| `components/auditorias/audit-template-builder.tsx` | tipo `DragEvent` | Builder de plantillas de auditoría intacto. |
| `components/auditorias/finding-drawer.tsx` | iconos, `Badge`, `ComplianceRing`, helpers y tipos no usados | El drawer de hallazgos de inocuidad sigue funcionando. |
| `components/capa/capa-actions-panel.tsx` | `Input` | Sigue `Textarea`. |
| `components/capa/capa-workflow-panel.tsx` | tipo `CapaStage` | El workflow usa `CapaStageLog` y helpers. |
| `components/capa/create-nc-form.tsx` | `generateNcNumber` | La función sigue usada por API quick-capture, página `/capa/nueva` e integración de NC. |
| `components/capa/five-whys-form.tsx` | `Input`, `CapaActionType` | 5 Whys de inocuidad intacto. |
| `components/documents/document-detail-view.tsx` | `Input`, `DOCUMENT_STATUS_LABELS` | Detalle de documentos controlados intacto (`getStatusLabel` sigue). |
| `components/documents/documents-dashboard.tsx` | tipo `UserRole` | Dashboard de documentos intacto. |
| `components/haccp-plan/steps/step-1-team.tsx` | tipo `EvidenceFile` | Solo el import; `lib/haccp-plan/types.ts` y evidencia del equipo HACCP se conservaron. |
| `components/landing/landing-footer.tsx` | `Link` de Next no usado | El footer usa `<a>`. |
| `components/quick-capture/quick-capture-modal.tsx` | `useState` | Captura rápida NC/registro intacta. |
| `components/team/invite-user-modal.tsx` | tipo `UserRole` | Invitaciones siguen usando `INVITABLE_ROLES`. |
| `components/ui/badge.tsx` | `LucideIcon`, `ButtonHTMLAttributes` | `ReactNode` se conserva. |
| `components/ui/input.tsx` | `ReactNode` | Props de input intactas. |
| `lib/ai-insights/snapshot.ts` | `emptyWindow`, `iso7` | `d7` sigue usándose para ventanas de PCC. |
| `lib/audit/create-audit.ts` | binding `_result` | El omit de `result` en fallback de checklist se conservó. |
| `lib/hazards-library.ts` | tipos `Probability`, `Severity` no usados | Biblioteca HACCP conservada. |
| `lib/settings/constants.ts` | icono `Download` | Tabs de settings intactos. |

---

## Archivos eliminados en esta pasada (lista cerrada)

1. `app/(auth)/register/register-form.tsx`
2. `components/team/role-gate.tsx`
3. `components/production-records/production-records-dashboard.tsx`

El resto son recortes dentro de archivos vivos (tipos, emails, imports, copy).

---

## Qué no se eliminó (y por qué)

| Elemento | Motivo |
| --- | --- |
| `components/haccp/*` (12 archivos) | HACCP v1. Las rutas redirigen a `/haccp`, pero dashboard, export y linking de PCC aún dependen de las tablas v1. |
| `lib/haccp/constants.ts`, `risk-matrix.ts`, `versioning.ts`, `ccp-linking.ts`, `auth.ts` | Consumidos por monitoreo (`submit` → `ccp-linking`), export y componentes HACCP. |
| `lib/hazards-library.ts` | Biblioteca de peligros HACCP. |
| Redirects `/haccp/[id]`, `/haccp/nuevo`, `/haccp/resumen` | Bookmarks; no son QMS. |
| Prefijos ocultos en middleware (`/proveedores`, `/reclamos`, `/capacitacion`, `/trazabilidad`) | Evitan 404 rotos; tests de rate-limit clasifican paths legacy. |
| `lib/rate-limit` normalización de `/api/suppliers/:id/portal-token` y complaint-critical | Defensa + tests. No es UI. |
| Valores históricos `NcOrigin` / `AuditType "supplier"` / `CcpDetermination prp\|oprp` | Filas y árbol Codex. |
| `haccp_teams.training_evidence` y campos de capacitación del equipo HACCP | Codex team, no LMS. |
| Especificaciones de producto en `lib/haccp-plan` (`ProductSpec`, `INITIAL_PRODUCT_SPECS`) | Descripción de producto Codex (paso 2), no el módulo QMS de product specifications. |
| Todas las migraciones `supabase/migrations/*.sql` | Pedido explícito: no modificar SQL histórico. |
| Tablas / columnas en Postgres | Pedido explícito: no tocar schema todavía. |
| Auth, onboarding, orgs, users, RBAC, rate-limit, storage privado | Núcleo de plataforma. |

No había hooks dedicados (`hooks/`) ni validadores Zod sueltos de lab/QC/reclamos. Las API routes restantes tienen consumidores (auth, team, settings, CAPA, monitoreo, AI, storage, admin, cron).

---

## Inventario residual (no es dead code de aplicación)

Sigue existiendo en **base de datos / SQL** (no modificado):

- Migraciones 011 (lab), 012 (suppliers), 013 (complaints), 018–019 (QC), 025 (trace), 026 (supplier approval), 027 (LMS), 028 (complaint SLA).
- `029` dropea PRP/lab/QC **si se aplicó** en el proyecto; no se reescribió.
- Tablas de suppliers / complaints / training / trace **pueden seguir en prod**. RLS 036 aún las menciona.

Eso es deuda de schema, no de runtime de la app. Siguiente paso (fuera de esta pasada): verificar filas en Supabase y, si procede, una migración **nueva** de DROP — nunca editar 011–028.

---

## Superficie de producto que queda

- Dashboard / kiosko planta
- Plan HACCP 12 pasos (`/haccp`)
- HACCP v1 (código + tablas, sin rutas de edición)
- Monitoreo PCC / registros / QR / OCR
- Desviaciones → NC
- CAPA de inocuidad (5 Whys, Ishikawa, workflow)
- Auditorías de inocuidad
- Documentos controlados
- Análisis / insight diario
- Equipo, invitaciones, RBAC
- Onboarding y autenticación
- Configuración de organización
