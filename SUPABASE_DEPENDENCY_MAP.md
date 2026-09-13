# Mapa de dependencias Supabase — Nura

Fecha: 2026-09-11  
Complemento de `ARCHITECTURE_AUDIT.md`.  
Modo: solo lectura. No cambia schema, RLS ni datos.

Leyenda de categoría: **A** usado / **B** indirecto / **C** legacy necesario / **D** eliminable / **E** verificar en DB real.

Operaciones: S = SELECT, I = INSERT, U = UPDATE, D = DELETE, UPS = UPSERT.

---

## Clientes

| Cliente | Archivo | Quién lo usa |
| --- | --- | --- |
| Browser | `lib/supabase/client.ts` | Componentes client, login, notificaciones |
| Server (RLS del usuario) | `lib/supabase/server.ts` | RSC, route handlers autenticados |
| Admin (service role) | `lib/supabase/admin.ts` | Cron, export, provision, invites, rate-limit store, storage firmado |
| Middleware | `lib/supabase/middleware.ts` | Session + `profiles` + `organizations` |

---

## RPC

| RPC | Archivos | Operación | RLS / grants | Cron / Realtime | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_my_profile` | `lib/auth/session.ts`, `lib/auth/session-server.ts`, `lib/supabase/middleware.ts` | S (perfil propio) | SECURITY DEFINER (017/036) | cada request | A | Alto | Conservar |
| `ensure_user_profile` | `lib/auth/session.ts`, `lib/auth/session-server.ts` | I perfil si falta | DEFINER | — | A | Alto | Conservar |
| `finalize_user_onboarding` | `lib/auth/session.ts`, `lib/auth/session-server.ts` | U onboarding | DEFINER (016/036) | — | A | Alto | Conservar |
| `complete_user_onboarding` | `lib/auth/session.ts` (`completeOnboarding`) | I/U org+perfil | DEFINER 015/016/036 | onboarding | A | Alto | Conservar |
| `consume_rate_limits` | `lib/rate-limit/store.ts` | U `rate_limit_windows` | solo service_role (037) | middleware en cada request | A | Alto | Conservar |
| `consume_rate_limit` | 037 (singular); app usa el plural | — | service_role | — | B | Medio | Conservar (helper SQL) |
| `record_rate_limit_abuse` | `lib/rate-limit/store.ts` | I `security_abuse_events` | service_role | middleware 429 | A | Alto | Conservar |
| `cleanup_rate_limit_windows` | solo SQL 037 | D ventanas viejas | service_role | **no hay job** que la llame | C | Bajo | Programar o dejar manual |
| `current_organization_id` | SQL 035; usada por policies | — | DEFINER | — | A | Alto | Conservar |
| `storage_is_org_object` | SQL 035 | — | DEFINER | — | A | Alto | Conservar |
| `storage_can_write_bucket` | SQL 036 | — | DEFINER | — | A | Alto | Conservar; aún nombra buckets legacy |
| `current_user_role`, `rbac_is`, `rbac_same_org`, `rbac_quality`, `rbac_admin` | SQL 036 | — | DEFINER | — | A | Alto | Conservar |
| `handle_new_user` | trigger Auth (001/014/016/036) | I profile | trigger | Auth signup | A | Alto | Conservar |
| `protect_profile_identity`, `protect_org_identity` | triggers 036 | bloquean self-elevation | trigger | — | A | Alto | Conservar |
| `create_default_notification_preferences` | trigger 010/016 | I prefs | trigger | — | A | Medio | Conservar |
| `update_haccp_product_timestamp` | trigger 002 | U timestamp | trigger | — | B | Bajo | Vive con tablas v1 |
| `my_organization_id` | 017 (posible alias) | — | DEFINER | — | C | Bajo | Verificar si 036 la reemplazó |
| `submit_qc_field_form` | 018/019; **DROP** en 029 | — | — | — | D | Nulo si 029 | No reintroducir |

---

## Cron / background

| Job | Trigger | Tablas | Cat. |
| --- | --- | --- | --- |
| `POST /api/notifications/cron` | Bearer `CRON_SECRET` **o** usuario autenticado (modo manual de su org) | `profiles`, `nonconformities`, `audits`, `organizations`, `notifications`, `notification_preferences`, `ai_daily_insights` (vía generate) | A |
| Emails CAPA due/overdue, audit upcoming, weekly summary | mismo cron | lee NCs/auditorías; escribe email externo | A |
| Daily insight | mismo cron llama `generateDailyInsight` | snapshot HACCP + NC + monitoreo | A |
| `cleanup_rate_limit_windows` | **nadie** | `rate_limit_windows` | C |
| `pg_cron` / Vercel cron config | no existe en el repo | — | E (si está configurado solo en el dashboard de Vercel) |

---

## Realtime

| Listener | Archivo | Tabla / evento | Cat. |
| --- | --- | --- | --- |
| Canal `notifications-{userId}-{uuid}` | `components/layout/notification-bell.tsx` | `notifications` INSERT + UPDATE, filtro `user_id=eq.{id}` | A |

No hay otros `.channel(` / `postgres_changes` en el repo.

---

## Storage

| Bucket | Código | SQL | Cat. | Recomendación |
| --- | --- | --- | --- | --- |
| `logos` | `company-settings-form` upload + `getPublicUrl` | 010; **público** a propósito (035 no lo privatiza) | A | Conservar |
| `controlled-documents` | documentos + snapshots HACCP | 020, 035, 036 | A | Conservar |
| `production-record-photos` | monitoreo / digitalizar | 021, 035, 036 | A | Conservar |
| `haccp-evidence` | wizard equipo/validación | 030/031, 035, 036 | A | Conservar |
| `audit-photos` | finding drawer | 035 (creación tardía), 036 | A | Conservar |
| `nc-photos` | quick-capture NC | 035, 036 | A | Conservar |
| `lab-reports` | ningún upload en app | 011; 035 lo privatiza; 038 intenta DROP | C | 038 si está vacío |
| `supplier-docs` | ningún upload | 012; 035/036; 038 DROP | C | 038 si está vacío |
| `complaint-photos` | ningún upload | 013; 035/036; 038 DROP | C | 038 si está vacío |
| `prp-photos` | mencionado en comentario 029 | no hay CREATE en migraciones listadas | E | Verificar Storage UI |

Descargas privadas: `GET /api/storage/download` + `lib/storage/download.ts` resuelve path por `kind` (documento, foto monitoreo, hallazgo, evidencia HACCP, foto NC). No acepta `bucket`/`path` arbitrarios.

---

## Tablas → consumidores

### Auth, org, equipo

| Tabla | Archivos | Ops | RLS (036 salvo nota) | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `organizations` | middleware; layout; kiosk; settings org/empresa/acceso/usuarios; admin provision; export; cron all-orgs; qr-context; acceso-pendiente | S I U D (admin delete rollback) | org identity protected; admin/QM scoped | `protect_org_identity` | cron lista orgs | A |
| `profiles` | session, cached-session, middleware, team/*, invitations, almost all pages (role), cron managers, notifications, export, verify-private-storage | S I U | own + admin team update; no self-role | `get_my_profile`, `ensure_user_profile`, `handle_new_user`, `protect_profile_identity` | cron | A |
| `invitations` | `lib/team/invitations.ts`, `lib/team/list.ts`, `api/team/invite`, `api/team/invitations/[id]` | S I U D | quality/admin | — | — | A |
| `notification_preferences` | `lib/settings/preferences.ts`, settings API, export, cron | S I U | org | trigger default | cron lee prefs | A |
| `notifications` | `lib/notifications.ts`, notification-bell, cron, audit-completed | S I U | user/org | — | cron escribe; **Realtime** INSERT/UPDATE | A |

### HACCP 12 pasos (canónico)

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `haccp_plans` | `lib/haccp-plan/data-service.ts`, `lib/dashboard/data.ts`, `lib/ai-insights/snapshot.ts` | S I U | quality CRUD | — | snapshot diario | A |
| `haccp_teams` | data-service, snapshot, `lib/storage/download.ts` | S I U D | via plan_id | — | snapshot | A |
| `haccp_plan_products` | data-service, snapshot | S I U D | via plan | — | snapshot | A |
| `haccp_diagrams` | data-service | S I U D | via plan | — | — | A |
| `haccp_validations` | data-service, download.ts | S UPS | via plan | — | — | A |
| `haccp_plan_hazards` | data-service, snapshot | S I D | via plan | — | snapshot | A |
| `haccp_ccp_decisions` | data-service | UPS | via plan | — | — | A |
| `haccp_step_data` | `step-data-service.ts`, snapshot | S UPS | quality CRUD | — | snapshot | A |
| `haccp_monitoring_records` | `monitoring-records.ts`, snapshot, PCC panel | S I | quality CRUD | — | snapshot | A |

### HACCP v1 (producto)

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `haccp_products` | `lib/dashboard/data.ts` (S), `lib/settings/export.ts` (S), `components/haccp/products-table` (S U), `new-product-form` (I), `process-diagram` (S), `haccp-plan-version-panel` (S U) | S I U | quality CRUD | timestamp trigger | — | B |
| `haccp_process_steps` | export (S); `process-diagram` S I U D; `ccp-tree` S | S I U D | quality | — | — | B |
| `haccp_hazards` | export; `hazard-analysis` S I U; `ccp-tree` S | S I U | quality | — | — | B |
| `haccp_ccps` | **`lib/haccp/ccp-linking.ts` S U** (submit monitoreo); export; `ccp-table` S U; `ccp-tree` I | S I U | quality | — | — | B |
| `haccp_plan_versions` | export; version-panel S I | S I | quality | — | — | B |
| `haccp_plan_version_log` | export; version-panel I | S I | (036 no la lista explícita — **E**) | — | — | B |

### Monitoreo

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `production_form_templates` | registros pages, builder, templates dashboard, layout, qr-context, quick-capture API, dashboard data | S I U D | todos leen org; quality escribe | — | — | A |
| `production_form_sections` | builder, execute pages, qr-context, quick-capture | S I U D | via template | — | — | A |
| `production_form_fields` | builder, execute, qr-context, **ccp-linking** | S I U D | via template | — | — | A |
| `production_form_submissions` | submit.ts, registros pages, histórico, dashboard, snapshot | S I U | org + operator insert | — | snapshot | A |
| `production_form_submission_values` | submit.ts, detalle | S I | via submission | — | — | A |
| `monitoring_qr_links` | generar-monitoreo, qr-context, registros hub/generar | S I U | org | — | — | A |

### Auditorías

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `audits` | create-audit, auditorias pages, dashboard, cron, audit-completed, export PDF, escalate flows | S I U | quality CRUD | — | cron upcoming | A |
| `audit_checklist_items` | create-audit, execute page, execute-audit, templates.apply, PDF | S I U | via audit | — | — | A |
| `audit_findings` | execute-audit, finding-drawer, informe, PDF | S I U | via audit | — | — | A |
| `audit_templates` | templates.ts, builder, pages plantillas, tendencias | S I U D | quality | — | — | A |
| `audit_template_sections` | templates.ts, builder, pages | S I U D | quality / via template | — | — | A |
| `audit_template_items` | templates.ts, builder, pages | S I U D | quality / via section | — | — | A |

### CAPA

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `nonconformities` | capa pages/components, utils, escalate, quick-capture, integrations, dashboard, snapshot, cron | S I U | quality R/U; insert también operator | — | cron due/overdue | A |
| `capa_actions` | capa pages, actions-panel, escalate, dashboard | S I U | quality CRUD | — | cron (vía NC due) | A |
| `capa_stage_log` | create-nc, workflow-panel, draft, detalle | S I | quality; insert operator | — | — | A |
| `nc_5whys` | five-whys-form, detalle | S I U | quality | — | — | A |
| `nc_fishbone_causes` | fishbone-form, detalle | S I D | quality | — | — | A |

Columna `nonconformities.supplier_id`: se setea en `nonconformity-draft.ts` si alguien pasa `supplierId`. Ningún flujo vivo lo pasa. **C**.

### Documentos

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `controlled_documents` | documentos pages, detail, form, snapshots HACCP, dashboard | S I U | quality write; operator lee published | — | — | A |
| `document_versions` | detail, form, snapshots | S I U | quality write; operator lee | — | — | A |
| `document_state_log` | detail, snapshots | S I | quality | — | — | A |
| `document_read_acknowledgments` | detail | S I | org select; insert self | — | — | A |

### Insights y seguridad

| Tabla | Archivos | Ops | RLS | RPC | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- | --- |
| `ai_daily_insights` | `lib/ai-insights/store.ts` | S I U | quality CRUD | — | cron generate | A |
| `rate_limit_windows` | no `.from()` | vía `consume_rate_limits` | revoke anon/auth; service_role | consume_* | cada request middleware | A |
| `security_abuse_events` | no `.from()` | vía `record_rate_limit_abuse` | igual | record_* | 429 | A |

### Fuera de alcance — sin consumidores de app

`_rbac_quality_crud` / policies 036 se aplican **solo si** `to_regclass` encuentra la tabla.

| Tabla | Migración | App `.from()` | RLS 036 | Cron / RT | Cat. |
| --- | --- | --- | --- | --- | --- |
| `prp_*` (4) | 004 / DROP 029 | no | no (ya drop) | no | D/E |
| `qc_*` (5) | 018/019 / DROP 029 | no | no | no | D/E |
| `lab_*` + specs + sampling + lot_releases + process_controls | 011 / DROP 029 | no | buckets sí | no | D/E |
| `suppliers` | 012 | no | quality CRUD | no | C |
| `supplier_documents` | 012 | no | quality | no | C |
| `supplier_evaluations` | 012 | no | quality | no | C |
| `supplier_incidents` | 012 | no | quality | no | C |
| `supplier_approval_checklist` | 026 | no | quality | no | C |
| `supplier_approval_responses` | 026 | no | quality | no | C |
| `supplier_approval_log` | 026 | no | quality | no | C |
| `supplier_portal_tokens` | 026 | no | quality | no | C |
| `customer_complaints` | 013 | no | quality + insert operator | no | C |
| `complaint_photos` | 013 | no | quality + insert operator | no | C |
| `complaint_status_log` | 028 | no | quality | no | C |
| `training_courses` | 027 | no | org select; quality write | no | C |
| `training_quiz_questions` | 027 | no | quality | no | C |
| `training_role_requirements` | 027 | no | quality | no | C |
| `training_assignments` | 027 | no | org + quality manage | no | C |
| `training_completions` | 027 | no | org insert self | no | C |
| `trace_lots` | 025 + FSMA cols 001 | no | quality | no | C |
| `trace_lot_compositions` | 025 | no | quality | no | C |
| `trace_events` | 025 + FSMA | no | quality | no | C |
| `mock_recall_simulations` | 025 | no | quality | no | C |
| `mock_recall_simulation_lots` | 025 | no | quality | no | C |
| `nc_photos` (tabla SQL) | `app/api/quick-capture/nc/route.ts` (I), `lib/storage/download.ts` (S) | **sin CREATE TABLE en migraciones** | 036 solo si `to_regclass` | no | E | Hueco: código A, schema E. No está en `types/database.ts` |

---

## Queries por archivo (app viva, no tests)

Agrupado para no repetir cada línea. Detalle de tablas arriba.

| Archivo | Tablas | Ops |
| --- | --- | --- |
| `lib/supabase/middleware.ts` | profiles, organizations | S |
| `lib/auth/session.ts` / `session-server.ts` / `cached-session.ts` | profiles + RPC | S |
| `lib/admin/provision.ts` | organizations, profiles | S I U D |
| `lib/team/invitations.ts` | profiles, invitations | S I U |
| `lib/team/list.ts` / `members.ts` | profiles, invitations | S U |
| `lib/notifications.ts` | notifications, profiles | S I U |
| `lib/notifications/cron.ts` | profiles, nonconformities, audits, organizations | S (+ escribe notifications) |
| `lib/settings/preferences.ts` | notification_preferences | S I U |
| `lib/settings/export.ts` | organizations, profiles, prefs + ORG_TABLES (HACCP v1, audits, capa, docs, production) | S |
| `lib/dashboard/data.ts` | haccp_products, haccp_plans, audits, nonconformities, capa_actions, controlled_documents, production_form_submissions, production_form_templates | S |
| `lib/ai-insights/snapshot.ts` | haccp_plans, nonconformities, haccp_monitoring_records, production_form_submissions, haccp_step_data, haccp_teams, haccp_plan_products, haccp_plan_hazards | S |
| `lib/ai-insights/store.ts` | ai_daily_insights | S I U |
| `lib/haccp-plan/data-service.ts` | haccp_plans + 7 hijas + haccp_ccp_decisions | S I U D UPS |
| `lib/haccp-plan/step-data-service.ts` | haccp_step_data | S UPS |
| `lib/haccp-plan/monitoring-records.ts` | haccp_monitoring_records | S I |
| `lib/haccp-plan/snapshots.ts` | controlled_documents, document_versions, document_state_log | S I U |
| `lib/haccp/ccp-linking.ts` | production_form_fields, haccp_ccps | S U |
| `lib/production-records/submit.ts` | production_form_submissions, values | S I U |
| `lib/production-records/qr-context.ts` | monitoring_qr_links, templates, orgs, sections, fields | S |
| `lib/audit/create-audit.ts` | audits, audit_checklist_items | S I |
| `lib/audit/templates.ts` | audit_templates, sections, items, checklist_items | S I U D |
| `lib/integrations/nonconformity-draft.ts` | nonconformities, capa_stage_log | I |
| `lib/integrations/nc-from-audit.ts` | (usa draft) | I |
| `lib/capa/utils.ts` | nonconformities | S |
| `lib/storage/download.ts` | haccp_teams, haccp_validations (+ lookups por kind) | S |
| `lib/rate-limit/store.ts` | rate_limit_windows, security_abuse_events | RPC |
| Páginas `app/(dashboard)/**` | ver sección 1 del audit | S principalmente |
| Componentes capa / auditorías / documentos / production / haccp-plan | CRUD de su dominio | S I U D |
| `components/haccp/*` (muertos) | haccp_products/steps/hazards/ccps/versions | S I U D — **no hay ruta que los monte** |
| `scripts/verify-private-storage.mjs` | profiles | S (test) |

`app/api/settings/organization/route.ts` hace U de `organizations` e **incluye** `complaint_response_sla_hours` y `complaint_auto_nc_severity` si vienen en el body. Ningún form vivo de settings de reclamos existe. **C**.

---

## RLS — patrón vigente (036)

Si la tabla existe:

- **quality CRUD** (`admin` + `quality_manager`, misma org): planes HACCP, auditorías (padres), templates, documentos write, CAPA hijas, insights, y **también** suppliers/complaints/trace si siguen en DB.
- **via plan_id**: equipos, productos del plan, diagramas, validaciones, hazards del plan, CCP decisions.
- **via audit_id**: checklist items, findings.
- **operator**:
  - insert NC + stage_log + fotos NC
  - leer templates/secciones/campos de monitoreo y crear submissions
  - leer documentos published
  - acuse de lectura propio
  - (si existen) insert complaints
- **profiles**: el usuario no puede cambiarse `role` ni `organization_id` (trigger).
- **rate_limit_***: sin grants a `anon`/`authenticated`.
- `_rbac_*` **no falla** si la tabla no existe (`to_regclass` IS NULL → return).

Policies de storage 036 todavía listan `complaint-photos`, `supplier-docs`, `lab-reports`. Inofensivo si el bucket ya no está; **C**.

---

## Export vs producto

`lib/settings/export.ts` `ORG_TABLES` **exporta HACCP v1** y **no exporta** el plan 12 pasos (`haccp_plans` y hijas) ni `monitoring_qr_links` ni `ai_daily_insights` ni `haccp_monitoring_records`.

| Grupo | ¿En export? | Cat. |
| --- | --- | --- |
| HACCP v1 (products/steps/hazards/ccps/versions) | sí | B — sesgo a arquitectura vieja |
| HACCP 12 pasos | no | C — hueco; no es dead, es omisión |
| Monitoreo submissions | sí (templates + submissions + values) | A |
| QR links | no | C |
| Auditorías / CAPA / docs | sí | A |
| Suppliers / complaints / training / trace | no | coherente con recorte |

---

## `check_state.sql` / `APPLY_ALL.sql`

Ambos siguen midiendo o listando **011 laboratorio, 012 proveedores, 013 reclamos, 018/019 QC, 025–028** como migraciones “base” o “si faltan”.

| Archivo | Cat. | Riesgo | Recomendación |
| --- | --- | --- | --- |
| `supabase/APPLY_ALL.sql` | C | Bajo (es guía, no se ejecuta como schema) | Actualizar copy en un pase de docs; no borrar historia 001–013 |
| `supabase/check_state.sql` | C | Medio (puede inducir a **re-crear** lab/QC) | El check 011/018 dice “ejecuta si falta”; eso **reintroduce** módulos 029. No cubre 030–032, 038 ni `001_fsma204_kdes`. No ejecutar 011/018 en prod limpio. |

**Huecos de schema confirmados (no corregidos):**

| Hecho | Evidencia | Cat. |
| --- | --- | --- |
| `APPLY_ALL.sql` no lista 017–032 ni FSMA 204 | runbook de 45 líneas; un apply “literal” deja el plan 12 pasos fuera | C |
| `customer_complaints.lot_analysis_id` → `lab_analyses` | 013 crea el FK; 029 dropea el target | C si 013+029 corrieron |
| Realtime publication histórica en `qc_submissions` | 018/019; tablas drop 029 | D |
| `verify_private_storage.sql` aún espera buckets lab/supplier/complaint | 038 los borra si están vacíos | C |
| Landing carousel menciona “Trazabilidad de lotes” | copy demo, no ruta | C |

---

## SAFE_TO_DELETE

Misma regla que el audit: solo evidencia de cero consumidores de **runtime de producto**.  
**Prohibido** interpretar esto como “DROP TABLE”.

### App (evidencia suficiente)

| Elemento | Evidencia | Riesgo |
| --- | --- | --- |
| `components/team/role-gate.tsx` | 0 imports | Bajo |
| `components/production-records/production-records-dashboard.tsx` | 0 imports | Bajo |
| `app/(auth)/register/register-form.tsx` | página `/register` no lo usa | Bajo |
| `lib/haccp/constants.ts` | solo cluster `components/haccp` | Bajo (después de UI v1) |
| `lib/haccp/risk-matrix.ts` | solo cluster `components/haccp` | Bajo |
| `lib/hazards-library.ts` | solo `hazard-modal` | Bajo |
| `prpMissedEmail` / `supplierDocExpiringEmail` / `supplierEvalOverdueEmail` / `complaintCriticalEmail` | 0 callers en app | Bajo |

### Explicitamente NO SAFE_TO_DELETE

| Elemento | Por qué |
| --- | --- |
| Cualquier `supabase/migrations/*.sql` | Historia de apply; dropear archivo no dropea DB y rompe onboarding de entornos |
| `haccp_products` / `haccp_ccps` / hijas v1 | Dashboard, export, `ccp-linking` → submit de monitoreo |
| `haccp_plan_versions` | Export |
| `suppliers*`, `customer_complaints*`, `training_*`, `trace_*`, `mock_recall_*` | Pueden existir con datos; 0 queries ≠ 0 filas |
| `prp_*` / `qc_*` / `lab_*` | Ya son DROP 029; re-verificar, no “borrar de nuevo” a ciegas |
| `rate_limit_windows`, `security_abuse_events` | RPC del middleware |
| Buckets core | uploads vivos |
| RPC de auth / RBAC / rate-limit | login, onboarding, 429 |
| Realtime de `notifications` | campana |
| `lib/haccp/ccp-linking.ts` | `lib/production-records/submit.ts` |
| `lib/haccp/versioning.ts` | acoplado a export + panel v1 |
| `types/database.ts` bloques legacy | `NcOrigin` / notifs / `Database` usados por tsc |
| Policies 036 sobre tablas legacy | no-op si la tabla no existe; tocarlas es cambio de Supabase |

### Verificación requerida antes de cualquier DROP (E)

Ejecutar en el SQL Editor del proyecto (no hecho en esta auditoría):

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename ~ '^(prp_|qc_|lab_|product_spec|sampling_|lot_release|process_control|supplier|customer_complaint|complaint_|training_|trace_|mock_recall|nc_photos)'
ORDER BY 1;
```

Y conteos por org. Sin eso, **ninguna tabla legacy es SAFE_TO_DELETE**.

---

## Diagnóstico de repo (sin fixes)

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK + warnings de unused |
| `npm test` | 59 pass / 2 skip live / 0 fail |
