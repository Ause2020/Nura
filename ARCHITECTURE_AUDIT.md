# Auditoría arquitectónica — Nura

Fecha: 2026-09-11  
Alcance: repositorio completo (app, components, lib, types, supabase, scripts, middleware).  
Modo: solo lectura. Este documento **no cambia código, Supabase ni comportamiento**.  
Revisión: contrastada con inventario SQL (39 migraciones), 333 `.from()` en app y barrido de residuos legacy.

## Objetivo de producto (criterio de la auditoría)

Nura es exclusivamente una plataforma de **HACCP / Food Safety / Inocuidad Alimentaria**.

Superficie funcional objetivo:

- Dashboard
- HACCP (plan de 12 pasos)
- Monitoreo de inocuidad / PCC
- Desviaciones de inocuidad
- CAPA relacionadas con inocuidad
- Auditorías de inocuidad
- Documentos de inocuidad
- Análisis e indicadores
- Usuarios, organizaciones y RBAC
- Configuración

Fuera de alcance: QMS generalista, LIMS, laboratorio, reclamos de cliente, ERP, CRM, QC genérico, proveedores, trazabilidad FSMA, LMS de capacitación, PRPs como módulo.

## Categorías

| Código | Significado |
| --- | --- |
| **A** | Usado actualmente por una ruta, API o job vivo |
| **B** | Usado indirectamente (helper, KPI, export, linking, cron) |
| **C** | Legacy pero posiblemente necesario (histórico, redirects, FKs, RLS defensivo) |
| **D** | Legacy y eliminable con evidencia de cero consumidores de runtime |
| **E** | Desconocido / requiere verificación en el proyecto Supabase real |

**Riesgo de eliminar:** Bajo / Medio / Alto / Nulo (ya no existe si 029 corrió).

---

## Hallazgo principal

Hay **dos arquitecturas HACCP en paralelo**:

1. **Plan HACCP actual (A)** — `lib/haccp-plan/*` + `components/haccp-plan/*` + tablas `haccp_plans` / `haccp_teams` / `haccp_plan_*` / `haccp_diagrams` / `haccp_validations` / `haccp_ccp_decisions` / `haccp_step_data` / `haccp_monitoring_records`. Ruta viva: `/haccp`.
2. **HACCP por producto (C/D)** — `components/haccp/*` + tablas `haccp_products` / `haccp_process_steps` / `haccp_hazards` / `haccp_ccps` / `haccp_plan_versions`. Las rutas `/haccp/[id]`, `/haccp/nuevo`, `/haccp/resumen` **solo redirigen** a `/haccp`. La UI vieja no tiene importers fuera de su carpeta. Las **tablas** siguen vivas en dashboard, export y `lib/haccp/ccp-linking.ts` (enlace PCC ↔ campo de monitoreo).

Los módulos de proveedores, reclamos, capacitación y trazabilidad **ya no tienen rutas ni `lib/` de producto**. Sus tablas **no fueron dropeadas** (029 solo quitó PRP, lab y QC). RLS 036 todavía las cubre si existen.

---

## Diagnóstico de calidad (sin correcciones)

| Check | Resultado |
| --- | --- |
| `npm run typecheck` | OK (`tsc --noEmit`) |
| `npm run lint` | OK con **warnings** (imports/vars no usados; `next lint` deprecado) |
| `npm test` | **59 pass**, **0 fail**, **2 skip** (tests live de storage/signed URLs) |

Warnings de lint relevantes para dead code: `register-form.tsx` (`Link` no usado), `lib/hazards-library.ts` (tipos no usados), varios imports huérfanos en UI viva. Ver sección 14.

---

## 1. Rutas de aplicación

### 1.1 Páginas (App Router)

| Ruta | Archivo | Función | Dependencia | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | Landing | `components/landing/*` | A | Alto | Conservar |
| `/login` | `app/(auth)/login/page.tsx` | Login | `login-form`, `/api/auth/login` | A | Alto | Conservar |
| `/register` | `app/(auth)/register/page.tsx` | Mensaje “acceso por invitación”; middleware redirige a login | — | A | Medio | Conservar; el form asociado está muerto |
| `/recuperar` | `app/(auth)/recuperar/page.tsx` | Forgot password | `/api/auth/forgot-password` | A | Alto | Conservar |
| `/recuperar/nueva` | `app/(auth)/recuperar/nueva/page.tsx` | Reset password | Supabase Auth | A | Alto | Conservar |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth/magic-link callback | Supabase Auth | A | Alto | Conservar |
| `/acceso-pendiente` | `app/acceso-pendiente/page.tsx` | Org sin acceso | `profiles`, `organizations` | A | Alto | Conservar |
| `/onboarding` | `app/onboarding/page.tsx` | Onboarding org | RPC `finalize_user_onboarding` | A | Alto | Conservar |
| `/invitacion/[token]` | `app/invitacion/[token]/page.tsx` | Aceptar invitación | `invitations`, `/api/team/accept` | A | Alto | Conservar |
| `/m/[token]` | `app/m/[token]/page.tsx` | Formulario de terreno (QR) | `monitoring_qr_links` | A | Alto | Conservar |
| `/planta` | `app/(kiosk)/planta/page.tsx` | Kiosko de planta | `organizations`, dashboard kiosk | A | Medio | Conservar (inocuidad operacional) |
| `/` (dashboard index) | `app/(dashboard)/page.tsx` | Redirect → `/dashboard` | — | A | Bajo | Conservar |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Dashboard | `lib/dashboard/data` | A | Alto | Conservar |
| `/analisis` | `app/(dashboard)/analisis/page.tsx` | Indicadores / insight IA | `ai_daily_insights` | A | Alto | Conservar |
| `/haccp` | `app/(dashboard)/haccp/page.tsx` | Wizard 12 pasos | `haccp_plans` + step data | A | Alto | Conservar — **HACCP canónico** |
| `/haccp/[id]` | `app/(dashboard)/haccp/[id]/page.tsx` | Redirect → `/haccp` | — | C | Bajo | Conservar temporalmente por bookmarks |
| `/haccp/nuevo` | `app/(dashboard)/haccp/nuevo/page.tsx` | Redirect → `/haccp` | — | C | Bajo | Igual |
| `/haccp/resumen` | `app/(dashboard)/haccp/resumen/page.tsx` | Redirect → `/haccp` | — | C | Bajo | Igual |
| `/registros` | `app/(dashboard)/registros/page.tsx` | Hub de monitoreo | production forms + QR | A | Alto | Conservar (nombre “registros” = monitoreo) |
| `/registros/plantillas` | `.../registros/plantillas/page.tsx` | Listado plantillas | `production_form_templates` | A | Alto | Conservar |
| `/registros/plantillas/nuevo` | `.../nuevo/page.tsx` | Crear plantilla | builder | A | Alto | Conservar |
| `/registros/plantillas/[id]` | `.../[id]/page.tsx` | Editar plantilla | builder | A | Alto | Conservar |
| `/registros/ejecutar/[id]` | `.../ejecutar/[id]/page.tsx` | Ejecutar monitoreo | executor | A | Alto | Conservar |
| `/registros/[id]` | `.../registros/[id]/page.tsx` | Detalle submission | submissions | A | Alto | Conservar |
| `/registros/historico` | `.../historico/page.tsx` | Histórico + PCC panel | submissions + `haccp_monitoring_records` | A | Alto | Conservar |
| `/registros/generar` | `.../generar/page.tsx` | Generar QR | `monitoring_qr_links` | A | Alto | Conservar |
| `/registros/digitalizar` | `.../digitalizar/page.tsx` | OCR de registro | `/api/monitoreo/ocr` | A | Alto | Conservar |
| `/auditorias` | `app/(dashboard)/auditorias/page.tsx` | Dashboard auditorías | `audits` | A | Alto | Conservar |
| `/auditorias/calendario` | `.../calendario/page.tsx` | Calendario | `audits` | A | Alto | Conservar |
| `/auditorias/tendencias` | `.../tendencias/page.tsx` | Tendencias | `audits`, templates | A | Alto | Conservar |
| `/auditorias/[id]/ejecutar` | `.../ejecutar/page.tsx` | Ejecutar | checklist items | A | Alto | Conservar |
| `/auditorias/[id]/informe` | `.../informe/page.tsx` | Informe | findings + PDF | A | Alto | Conservar |
| `/auditorias/plantillas` | `.../plantillas/page.tsx` | Plantillas | `audit_templates` | A | Alto | Conservar |
| `/auditorias/plantillas/nuevo` | `.../nuevo/page.tsx` | Nueva plantilla | builder | A | Alto | Conservar |
| `/auditorias/plantillas/[id]` | `.../[id]/page.tsx` | Editar plantilla | builder | A | Alto | Conservar |
| `/capa` | `app/(dashboard)/capa/page.tsx` | NCs / CAPA | `nonconformities` | A | Alto | Conservar |
| `/capa/nueva` | `.../nueva/page.tsx` | Crear NC | create form | A | Alto | Conservar |
| `/capa/[id]` | `.../[id]/page.tsx` | Detalle NC | workflow + 5whys + fishbone | A | Alto | Conservar |
| `/documentos` | `app/(dashboard)/documentos/page.tsx` | Documentos | `controlled_documents` | A | Alto | Conservar |
| `/documentos/nuevo` | `.../nuevo/page.tsx` | Nuevo documento | form | A | Alto | Conservar |
| `/documentos/[id]` | `.../[id]/page.tsx` | Detalle | versions + acks | A | Alto | Conservar |
| `/configuracion` | `app/(dashboard)/configuracion/page.tsx` | Settings home / export | export API | A | Alto | Conservar |
| `/configuracion/empresa` | `.../empresa/page.tsx` | Org | `organizations` | A | Alto | Conservar |
| `/configuracion/usuarios` | `.../usuarios/page.tsx` | Equipo | profiles / invitations | A | Alto | Conservar |
| `/configuracion/notificaciones` | `.../notificaciones/page.tsx` | Prefs | `notification_preferences` | A | Alto | Conservar |
| `/configuracion/acceso` | `.../acceso/page.tsx` | Estado de acceso | org access | A | Alto | Conservar |
| `/admin/acceso` | `app/(dashboard)/admin/acceso/page.tsx` | Provisioning platform admin | `/api/admin/*` | A | Alto | Conservar |

**Rutas ocultas (middleware redirige a `/dashboard` o `/login`):** `/proveedores`, `/proveedor`, `/capacitacion`, `/reclamos`, `/trazabilidad`. Categoría **C**. No hay `page.tsx` vivos. Conservar los prefijos en `lib/product/scope.ts` y `middleware.ts` mientras existan bookmarks.

### 1.2 APIs

| Ruta | Archivo | Función | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- |
| `POST /api/auth/login` | `app/api/auth/login/route.ts` | Login + rate limit | A | Alto | Conservar |
| `POST /api/auth/forgot-password` | `app/api/auth/forgot-password/route.ts` | Recovery | A | Alto | Conservar |
| `POST /api/notifications/cron` | `app/api/notifications/cron/route.ts` | Cron notificaciones + insight | A | Alto | Conservar |
| `POST /api/notifications/audit-completed` | `app/api/notifications/audit-completed/route.ts` | Email/notif post-auditoría | A | Medio | Conservar |
| `GET /api/export/audit-pdf/[id]` | `app/api/export/audit-pdf/[id]/route.tsx` | PDF auditoría | A | Alto | Conservar |
| `POST /api/ai/daily-insight` | `app/api/ai/daily-insight/route.ts` | Briefing | A | Alto | Conservar |
| `POST /api/ai/nc-analysis` | `app/api/ai/nc-analysis/route.ts` | Análisis NC | A | Alto | Conservar |
| `POST /api/capa/escalate` | `app/api/capa/escalate/route.ts` | Escalamiento CAPA | A | Alto | Conservar |
| `POST /api/quick-capture/nc` | `app/api/quick-capture/nc/route.ts` | Captura NC | A | Alto | Conservar |
| `POST /api/quick-capture/registro` | `app/api/quick-capture/registro/route.ts` | Captura monitoreo | A | Alto | Conservar |
| `POST /api/monitoreo/ocr` | `app/api/monitoreo/ocr/route.ts` | OCR | A | Alto | Conservar |
| `POST /api/monitoreo/qr-submit` | `app/api/monitoreo/qr-submit/route.ts` | Submit QR público | A | Alto | Conservar |
| `GET /api/storage/download` | `app/api/storage/download/route.ts` | Signed download | A | Alto | Conservar |
| `GET/PATCH /api/settings/organization` | `app/api/settings/organization/route.ts` | Org settings | A | Alto | Conservar; aún acepta campos de reclamos (C) |
| `GET/PATCH /api/settings/notifications` | `app/api/settings/notifications/route.ts` | Prefs | A | Alto | Conservar |
| `GET /api/settings/export` | `app/api/settings/export/route.ts` | Export org | A | Alto | Conservar; exporta tablas HACCP viejas (B) |
| Team / admin | `app/api/team/*`, `app/api/admin/*` | RBAC, invites, provision | A | Alto | Conservar |

No hay `vercel.json` ni `pg_cron`. El único job programable es `POST /api/notifications/cron` con `Authorization: Bearer CRON_SECRET`.

---

## 2. Componentes

Inventario por carpeta. 138 archivos bajo `components/`.

### 2.1 Vivos (A)

| Carpeta | Archivos representativos | Consumidor |
| --- | --- | --- |
| `landing/` | `landing-page`, hero, features, pricing, footer, carousel, cta, testimonials, nav, reveal | `/` |
| `auth/` | `auth-split-layout`, `password-strength-bar` | login / recuperar |
| `layout/` | `sidebar`, `header`, `notification-bell`, `notification-panel` | dashboard layout |
| `dashboard/` | `dashboard-view`, KPI, charts, `plant-kiosk-view`, insight teaser | `/dashboard`, `/planta` |
| `ai-insights/` | `analisis-view`, `analisis-enricher` | `/analisis` |
| `haccp-plan/` | wizard, 12 steps, diagram, PCC panel, risk modal | `/haccp`, `/registros/historico` |
| `production-records/` | hub, builder, executor, histórico, QR, digitalizar, field monitor | `/registros/*`, `/m/[token]` |
| `auditorias/` | dashboards, execute, report, calendar, trends, templates | `/auditorias/*` |
| `capa/` | dashboard, detail, workflow, 5whys, fishbone, filters, badge | `/capa/*` |
| `documents/` | dashboard, form, detail | `/documentos/*` |
| `settings/` | nav, company, notifications, export, access | `/configuracion/*` |
| `team/` | users dashboard, invite, create, accept | `/configuracion/usuarios`, `/invitacion` |
| `admin/` | access dashboard, provision forms, orgs table | `/admin/acceso` |
| `quick-capture/` | FAB, modal, NC, registro | dashboard layout |
| `storage/` | `private-file` | documentos + HACCP evidence |
| `onboarding/` | `stepper` | onboarding wizard |
| `ui/` | button, input, modal, badge, table, toast, skeleton, empty-state | transversal |

### 2.2 Componentes aparentemente muertos (D)

Evidencia: ningún `page.tsx`, layout ni componente fuera de su propio cluster los importa. `tsc` pasa porque TypeScript no elimina unexported trees.

| Archivo | Función | Dependencia | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- |
| `components/haccp/product-detail.tsx` | Detalle producto HACCP v1 | `haccp_products` + hijos | D | Bajo | Candidato a borrar **después** de migrar linking/export |
| `components/haccp/products-table.tsx` | Listado productos | `haccp_products` | D | Bajo | Igual |
| `components/haccp/new-product-form.tsx` | Alta producto | insert `haccp_products` | D | Bajo | Igual |
| `components/haccp/process-diagram.tsx` | Diagrama de proceso v1 | `haccp_process_steps` | D | Bajo | Igual |
| `components/haccp/step-modal.tsx` | Modal paso | steps | D | Bajo | Igual |
| `components/haccp/hazard-analysis.tsx` | Análisis peligros v1 | `haccp_hazards` | D | Bajo | Igual |
| `components/haccp/hazard-modal.tsx` | Modal peligro | hazards-library | D | Bajo | Igual |
| `components/haccp/ccp-table.tsx` | Tabla CCP v1 | `haccp_ccps` + linking | D | Medio | No borrar hasta decidir destino de `ccp-linking` |
| `components/haccp/ccp-tree.tsx` | Árbol CCP v1 | hazards/ccps | D | Bajo | Igual |
| `components/haccp/haccp-summary-table.tsx` | Resumen plan v1 | ccps/hazards | D | Bajo | Igual |
| `components/haccp/haccp-plan-version-panel.tsx` | Versionado v1 | `haccp_plan_versions` | D | Medio | Export todavía lee esas tablas |
| `components/haccp/completion-bar.tsx` | Barra % | constants v1 | D | Bajo | Solo usado por cluster muerto |
| `components/team/role-gate.tsx` | Gate de rol UI | `UserRole` | D | Bajo | Eliminable; RBAC real está en middleware + `require-permission` |
| `components/production-records/production-records-dashboard.tsx` | Dashboard viejo de registros | submissions | D | Bajo | Reemplazado por `monitoreo-hub` / templates dashboard |
| `app/(auth)/register/register-form.tsx` | Formulario de registro | Auth signup | D | Bajo | La página `/register` no lo importa |

`RoleGate` y `ProductionRecordsDashboard` no tienen ningún import en el repo salvo su propia definición.

---

## 3. Servicios de Supabase

| Servicio | Archivo | Función | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- |
| Auth (browser) | `lib/supabase/client.ts` | `createBrowserClient` | A | Alto | Conservar |
| Auth + DB (RSC/route) | `lib/supabase/server.ts` | `createServerClient` + cookies | A | Alto | Conservar |
| Service role | `lib/supabase/admin.ts` | Admin client | A | Alto | Conservar |
| Session middleware | `lib/supabase/middleware.ts` | Refresh + profile/org | A | Alto | Conservar |
| Postgres (PostgREST) | cientos de `.from()` | CRUD | A | Alto | Ver mapa |
| RPC | `lib/auth/session.ts`, `session-server.ts`, `lib/rate-limit/store.ts` | perfil, onboarding, rate limit | A | Alto | Conservar |
| Storage | `lib/storage/*`, settings logos | upload/signed/public | A | Alto | Conservar buckets core |
| Realtime | `components/layout/notification-bell.tsx` | `postgres_changes` en `notifications` | A | Medio | Conservar |
| Edge/cron nativo | — | no hay | — | — | El cron es HTTP |

No hay listeners Realtime fuera de `NotificationBell`.

---

## 4–9. Tablas, RPC, RLS, cron, Realtime, queries

El inventario fila-a-fila está en `SUPABASE_DEPENDENCY_MAP.md`.

Resumen:

| Grupo | Estado en código de app | Estado en SQL |
| --- | --- | --- |
| Auth / org / team | A | Vivas |
| HACCP 12 pasos | A | 030–032 |
| HACCP producto (v1) | B (dashboard, export, linking) + UI D | 002–003, 024 |
| Monitoreo / production forms | A | 021, 034 |
| Auditorías | A | 005, 023 |
| CAPA | A | 004 (NC), 006, 022 |
| Documentos | A | 020 |
| Insights | A | 033 |
| Rate limit | A vía RPC | 037 |
| PRP / lab / QC | sin `.from()` | **DROP en 029** |
| Suppliers / complaints / training / trace | sin `.from()` | **siguen creadas** por 012/013/025–028 |

---

## 10. Archivos relacionados con HACCP

### 10.1 Canónicos — plan 12 pasos (A)

| Archivo | Función | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `app/(dashboard)/haccp/page.tsx` | Entrada del plan | A | Alto | Conservar |
| `components/haccp-plan/**` | Wizard + 12 steps + diagrama | A | Alto | Conservar |
| `lib/haccp-plan/data-service.ts` | CRUD plan | A | Alto | Conservar |
| `lib/haccp-plan/step-data-service.ts` | `haccp_step_data` | A | Alto | Conservar |
| `lib/haccp-plan/snapshots.ts` | Snapshot → documento controlado | A | Alto | Conservar |
| `lib/haccp-plan/monitoring-records.ts` | PCC records | A | Alto | Conservar |
| `lib/haccp-plan/ccp-tree.ts` | Árbol de decisión Codex | A | Alto | Conservar |
| `lib/haccp-plan/risk.ts` | Matriz de riesgo del wizard | A | Alto | Conservar |
| `lib/haccp-plan/{types,constants,checklists,mappers,db,monitoring-contract}.ts` | Dominio | A | Alto | Conservar |
| `supabase/migrations/030_haccp_plan_12_steps.sql` | Schema | A | Alto | Conservar |
| `supabase/migrations/031_haccp_evidence_bucket_policies.sql` | Storage evidencia | A | Alto | Conservar |
| `supabase/migrations/032_haccp_team_training_evidence.sql` | Evidencia de equipo HACCP (no LMS) | A | Medio | Conservar; el nombre “training” es del **equipo HACCP**, no del módulo LMS |

### 10.2 Compartidos vivos (A/B)

| Archivo | Función | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `lib/haccp/auth.ts` | `requireOrganizationId` | A | Alto | Conservar (nombre engañoso: es auth de org, no de plan) |
| `lib/haccp/ccp-linking.ts` | Liga CCP v1 ↔ campo de monitoreo | B | Alto | Conservar hasta migrar linking al plan 12 pasos |

### 10.3 Solo UI/tablas v1 (C/D)

| Archivo | Función | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `components/haccp/*` | UI producto/CCP v1 | D | Bajo–Medio | Ver SAFE_TO_DELETE |
| `lib/haccp/constants.ts` | Labels v1 | D | Bajo | Solo lo importan componentes muertos |
| `lib/haccp/versioning.ts` | Versionado v1 | D | Medio | Export y panel muerto; no borrar tablas aún |
| `lib/haccp/risk-matrix.ts` | Matriz v1 | D | Bajo | Reemplazada por `lib/haccp-plan/risk.ts` |
| `lib/hazards-library.ts` | Biblioteca peligros v1 | D | Bajo | Solo `hazard-modal` muerto |
| `supabase/migrations/002_haccp_products.sql` | Schema v1 | C | Alto | No borrar migración; tablas aún consultadas |
| `supabase/migrations/003_haccp_hazards_ccps.sql` | Schema v1 | C | Alto | Igual |
| `supabase/migrations/024_haccp_plan_versioning.sql` | Versionado v1 | C | Alto | Igual |

---

## 11. Archivos de dominios fuera de alcance

No quedan páginas ni `lib/complaints|suppliers|training|traceability`. Lo que queda es **residuo de tipos, RLS, migraciones, labels y columnas**.

| Dominio | Archivos restantes | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| **Laboratory / LIMS** | `supabase/migrations/011_quality_lab.sql`; tipos `Lab*`, `ProductSpecification`, `SamplingPlan`, `LotRelease`, `ProcessControl` en `types/database.ts`; origen NC `"lab"`; bucket `lab-reports` (038 lo intenta borrar) | C/D | Medio | Tablas ya dropeadas por 029 **si se aplicó**. Verificar en DB. Tipos D. |
| **QC / quality control** | `018_quality_control.sql`, `019_qc_multi_parameters.sql`; tipos `Qc*`; RPC `submit_qc_field_form` droppeada en 029 | C/D | Medio | Igual: 029 las elimina. Tipos D. |
| **Complaints** | `013_customer_complaints.sql`, `028_complaint_sla.sql`; tipos `CustomerComplaint*`; `NC_ORIGIN_OPTIONS` + notif labels; `settings/organization` escribe `complaint_*`; `rate-limit` normaliza `/api/suppliers/:id/portal-token` y paths de complaint | C | Alto si hay datos | UI muerta. Tablas **no** dropeadas. No borrar SQL ni tablas sin dump. |
| **Suppliers** | `012_suppliers.sql`, `026_supplier_approval.sql`; tipos `Supplier*`; `Organization.supplier_scorecard_weights`; `nonconformities.supplier_id`; notif `supplier_*`; RLS 036 | C | Alto si hay datos | Igual. |
| **PRP** | `004_prp_programs.sql` (crea PRP **y** `nonconformities`); 029 dropea solo PRP; tipos `Prp*`; origen `"prp"`; notif `prp_missed`; `lib/audit/catalog.ts` key `prp_22002` (checklist ISO, no módulo) | C | Medio | Tablas PRP: 029. Origen NC histórico: conservar. Catálogo de auditoría: A. |
| **Traceability / FSMA / recall** | `025_traceability.sql`, `001_fsma204_kdes.sql`; tipos `Trace*`, `MockRecall*`; RLS 036 | C | Alto si hay lotes | UI muerta. Fuera de alcance de producto. No dropear sin verificar datos. |
| **Training LMS** | `027_training_lms.sql`; tipos `Training*`; notif `training_*`; **distinto** de `haccp_teams.training_evidence` (A) | C | Alto si hay cursos | No confundir con evidencia del equipo HACCP. |
| **QMS genérico** | Landing dice “sistema de gestión” en control documental; `AuditType` incluye `"supplier"`; `NcOrigin` incluye lab/complaint/supplier/prp | C | Bajo | Copy/enums históricos. Limpiar en fase de tipos, no ahora. |

`haccp_teams.training_date` / `training_evidence` **no** es el LMS. Es evidencia de capacitación del **equipo HACCP** (Codex paso 1). Categoría **A**.

---

## 12. Componentes aparentemente muertos

Ver tabla 2.2. Resumen de evidencia:

| Cluster | Importers externos | Evidencia |
| --- | --- | --- |
| `components/haccp/*` (12 archivos) | Ninguno fuera de la carpeta | Rutas v1 redirigen a `/haccp` |
| `RoleGate` | 0 | RBAC no lo usa |
| `ProductionRecordsDashboard` | 0 | Hub/templates lo reemplazan |
| `RegisterForm` | 0 | `/register` es página estática |

No se encontraron imports hacia módulos borrados (`@/lib/complaints`, `@/components/suppliers`, etc.).

---

## 13. Tipos TypeScript heredados

Archivo único: `types/database.ts` (~2190 líneas). Mezcla tipos vivos y un `Database['public']['Tables']` que **todavía declara** tablas dropeadas o sin UI.

| Tipo / bloque | ¿Importado por código vivo? | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `UserRole`, `Organization`, `Profile`, `Invitation` | Sí | A | Alto | Conservar |
| `HaccpProduct`, `HaccpProcessStep`, `HaccpHazard`, `HaccpCcp`, `HaccpPlanVersion*` | Sí (dashboard, linking, export, cluster muerto) | B | Alto | Conservar hasta migrar linking |
| `Prp*` | No (salvo definición Database) | D | Bajo | Eliminable del typedef cuando se limpie Database |
| `ProductSpecification`, `SamplingPlan`, `Lab*`, `LotRelease`, `ProcessControl` | No | D | Bajo | Igual |
| `Supplier*`, `Training*`, `CustomerComplaint*`, `Complaint*`, `Qc*`, `Trace*`, `MockRecall*` | No en queries; sí como miembros de `Database` | D | Bajo | Igual |
| `NcOrigin` con `prp\|lab\|complaint\|supplier` | Sí (filtros, charts, históricos) | C | Medio | Conservar valores por filas históricas |
| `NotificationType` con supplier/complaint/training/prp | Sí (panel de iconos) | C | Medio | Conservar para notifs viejas |
| `Organization.complaint_*`, `supplier_scorecard_weights` | Settings API escribe `complaint_*` | C | Medio | Verificar si algún cliente aún manda esos campos |
| `AuditType = "supplier"` | Sí como enum de auditorías | C | Bajo | Es tipo de auditoría, no módulo proveedores |
| `CcpDetermination` incluye `oprp` / `prp` | Plan v1 | C | Bajo | Codex válido; no es el módulo PRP |
| `Database.Tables` para tablas 029 | Nadie hace `.from()` | D | Bajo | Limpiar typedef no toca la DB |

`Database.Functions` está vacío (`never`) aunque el código llama RPCs. Categoría **C** (typedef incompleto, no dead).

---

## 14. Imports muertos

### 14.1 Imports a módulos inexistentes

Ninguno. El recorte de UI de proveedores/reclamos/capacitación/trazabilidad quedó limpio a nivel de `import`.

### 14.2 Imports/vars no usados (lint, 2026-09-11)

| Archivo | Símbolo | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `app/(auth)/register/register-form.tsx` | `Link` | D | Nulo | El archivo entero es D |
| `app/(dashboard)/admin/acceso/page.tsx` | `supabase` | A (warning) | Nulo | Limpiar en pase de higiene |
| `app/onboarding/onboarding-wizard.tsx` | `userId` | A | Nulo | Igual |
| `components/auditorias/finding-drawer.tsx` | varios | A | Nulo | Igual |
| `components/capa/*`, `documents/*`, `landing-footer`, `quick-capture-modal`, `invite-user-modal`, `ui/badge`, `ui/input` | imports sueltos | A | Nulo | Igual |
| `lib/ai-insights/snapshot.ts` | `emptyWindow`, `iso7` | A | Nulo | Igual |
| `lib/hazards-library.ts` | `Probability`, `Severity` | D | Nulo | Archivo D |
| `lib/settings/constants.ts` | `Download` | A | Nulo | Igual |
| `lib/team/invitations.ts` | `getInvitationUrl` | B | Bajo | Verificar si se usará; hoy muerto |
| `lib/email/templates.ts` | 4 templates de PRP/proveedor/reclamo | D | Nulo | 0 callers |
| `components/capa/nc-detail.tsx` | `pendingCapaTraining={0}` | C | Nulo | Residuo LMS→CAPA; no borrar el panel |

Estos warnings **no rompen** typecheck ni tests.

---

## 15. Tablas sin consumidores de aplicación

| Tabla | Creada | ¿`.from()` en app? | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- |
| `prp_programs`, `prp_checklist_items`, `prp_records`, `prp_record_items` | 004 | No | D (si 029) / E | Nulo–Alto | 029 las dropea. Verificar `to_regclass` en prod. |
| `qc_*` | 018/019 | No | D/E | Nulo–Alto | Igual |
| `lab_analyses`, `lab_results`, `sampling_plans`, `product_specifications`, `lot_releases`, `process_controls` | 011 | No | D/E | Nulo–Alto | Igual |
| `suppliers` + 7 hijas | 012/026 | No | C | Alto | Pueden tener datos. No dropear. |
| `customer_complaints`, `complaint_photos`, `complaint_status_log` | 013/028 | No | C | Alto | Igual |
| `training_*` (5) | 027 | No | C | Alto | Igual. No confundir con evidencia HACCP. |
| `trace_lots`, `trace_lot_compositions`, `trace_events`, `mock_recall_*` | 025 + FSMA 001 | No | C | Alto | Igual |
| `nc_photos` (**tabla**, no bucket) | `app/api/quick-capture/nc/route.ts` inserta; `lib/storage/download.ts` la resuelve; 036 aplica RLS **si existe** | **No hay `CREATE TABLE` en ninguna migración** | E / hueco | Alto en runtime | El **bucket** `nc-photos` sí existe (035). La tabla se usa en código vivo. En DB fresca el insert puede fallar en silencio o romper metadata. Verificar `to_regclass('public.nc_photos')` |
| `rate_limit_windows`, `security_abuse_events` | 037 | No `.from()` directo | A | Alto | Consumidas por RPC. Conservar |

---

## 16. Tablas de arquitectura HACCP antigua

| Tabla | Quién la usa hoy | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- |
| `haccp_products` | Dashboard KPI, export, UI muerta | B | Alto | No dropear. Decidir si el KPI debe leer `haccp_plans` |
| `haccp_process_steps` | Export, UI muerta | B | Alto | No dropear |
| `haccp_hazards` | Export, UI muerta | B | Alto | No dropear |
| `haccp_ccps` | `ccp-linking` (submit de monitoreo), export, UI muerta | B | Alto | **Crítico** para desviaciones PCC automáticas |
| `haccp_plan_versions` | Export, UI muerta | B | Medio | El versionado vivo es `haccp_plans` + snapshots a documentos |
| `haccp_plan_version_log` | Export, UI muerta | B | Medio | Igual |

Estas tablas **no** son “HACCP eliminable”. Son la v1 que todavía alimenta monitoreo y dashboard.

---

## Alineación con el producto objetivo

| Módulo objetivo | ¿Cubierto? | Superficie |
| --- | --- | --- |
| Dashboard | Sí | `/dashboard`, `/planta` |
| HACCP | Sí (wizard 12 pasos) + residuo v1 | `/haccp` |
| Monitoreo / PCC | Sí | `/registros/*`, `/m/[token]` |
| Desviaciones inocuidad | Sí | submissions `has_deviation` → NC |
| CAPA inocuidad | Sí | `/capa` |
| Auditorías inocuidad | Sí | `/auditorias` |
| Documentos inocuidad | Sí | `/documentos` |
| Análisis / indicadores | Sí | `/analisis` + cron insight |
| Usuarios / org / RBAC | Sí | team + `036` + `lib/auth/permissions` |
| Configuración | Sí | `/configuracion` |

Deuda estructural (no borrar ahora): dual HACCP, enums/notif de módulos muertos, settings de reclamos, tablas 012–028 aún en DB, `check_state.sql` / `APPLY_ALL.sql` que todavía listan lab/QC/proveedores como “base”, **tabla `nc_photos` usada sin CREATE**, FK huérfana `customer_complaints.lot_analysis_id → lab_analyses` si 013+029 corrieron, `pendingCapaTraining` siempre `0` (residuo LMS→CAPA).

---

## SAFE_TO_DELETE

Solo elementos con evidencia suficiente de **cero consumidores de runtime**. No incluye SQL histórico ni tablas de prod.

Ver también la misma sección en `SUPABASE_DEPENDENCY_MAP.md`.

| Elemento | Evidencia | Riesgo | Nota |
| --- | --- | --- | --- |
| `components/team/role-gate.tsx` | 0 imports | Bajo | RBAC no depende de él |
| `components/production-records/production-records-dashboard.tsx` | 0 imports | Bajo | Reemplazado |
| `app/(auth)/register/register-form.tsx` | `/register` no lo importa | Bajo | Conservar `/register` (página + middleware) |
| `lib/haccp/constants.ts` | Solo `components/haccp/*` | Bajo | Tras borrar UI v1 |
| `lib/haccp/risk-matrix.ts` | Solo `components/haccp/*` | Bajo | Wizard usa `lib/haccp-plan/risk.ts` |
| `lib/hazards-library.ts` | Solo `hazard-modal` | Bajo | Tras borrar UI v1 |
| `prpMissedEmail`, `supplierDocExpiringEmail`, `supplierEvalOverdueEmail`, `complaintCriticalEmail` en `lib/email/templates.ts` | Definidos, **0 callers** | Bajo | Eliminable; el cron ya no genera esos mails |
| Ramas LMS vacías en `lib/ai-insights/{snapshot,findings,generate}.ts` | Snapshot siempre devuelve `[]` para training LMS | Bajo | Limpiar copy/tipos; no tocar evidencia de equipo HACCP |

**No** está en SAFE_TO_DELETE (evidencia insuficiente o hay consumidor oculto):

- `components/haccp/ccp-table.tsx` / cluster completo — acoplado a `ccp-linking` y tablas v1 aún leídas
- `lib/haccp/versioning.ts` — export lista `haccp_plan_versions`
- `lib/haccp/ccp-linking.ts` — `lib/production-records/submit.ts` lo usa
- Cualquier migración SQL
- Tablas suppliers/complaints/training/trace
- Tipos `NcOrigin` / `NotificationType` legacy
- Redirects `/haccp/*`
- Prefijos ocultos del middleware

---

## Próximos pasos sugeridos (no ejecutados)

1. Verificar en Supabase SQL Editor qué tablas 011–013 y 025–028 existen y si tienen filas.
2. Decidir migración de `haccp_ccps` → `haccp_ccp_decisions` / campos del plan 12 pasos **antes** de tocar UI v1 de CCP.
3. Recién entonces eliminar el cluster `components/haccp` y los libs D de la tabla SAFE_TO_DELETE.
4. No aplicar DROP de suppliers/complaints/training/trace en esta fase.
