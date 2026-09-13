# Auditoría final — seguridad y rendimiento

Fecha: 2026-09-11  
Alcance: código actual + migraciones 001–046 + `041_remove_legacy_qms.sql`.  
No se aplicó SQL remoto ni se cambiaron permisos de producto.

Checks de esta pasada:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK; 3 warnings preexistentes (`<img>`, `alt`) |
| `npm test` | **100 pass / 0 fail / 2 skip** (storage live) |

Los skip son `verify-private-storage` y `verify-signed-urls` en modo live: requieren entorno. Los asserts estáticos de aislamiento de path **sí** pasan.

---

## Veredicto por objetivo

| # | Objetivo | Estado | Nota |
| --- | --- | --- | --- |
| 1 | Multi-tenancy A ↛ B | **OK** | RLS + `organization_id` + storage por prefijo. Admin/service_role es el único bypass, acotado |
| 2 | RBAC intacto | **OK** | Mismos tres roles; tests 62–70 |
| 3 | RLS en tablas sensibles | **OK** | Ningún `DISABLE ROW LEVEL SECURITY`. 041 (RLS) no promociona INVOKER→DEFINER |
| 4 | HACCP 12 pasos | **OK** | Crear/editar/pasos/hazards/PCC/límites/monitoreo/validación/docs |
| 5 | Dashboard KPIs | **OK** | RPC 039 + listas con `LIMIT` |
| 6 | Kiosco | **OK** | `fetch /api/kiosk/metrics`; **sin** `router.refresh()` |
| 7 | Autosave | **OK** | write-guard + debounce + `flush` en hide/unmount |
| 8 | Notifications dedup | **OK** | `UNIQUE (org, user, dedup_key)` + upsert `DO NOTHING` |
| 9 | AI un insight / día | **OK** | UNIQUE + Claude solo con `force: true` |
| 10 | Realtime mínimo | **OK con residuo** | Consumidor vivo: solo `notifications`. Publication residual: `production_form_submissions` |
| 11 | Legacy QMS sin consumidores | **OK con residuo** | 0 `.from()` a lab/QC/reclamos/proveedores/LMS/trace. Queda UI HACCP v1 huérfana |

---

## 1. Multi-tenancy

**A no lee B** por tres capas:

1. Sesión: `requirePermission` / `requireOrganizationId` exigen `profile.organization_id`.
2. RLS 036/041: `rbac_same_org` / `current_organization_id()` (InitPlan). Hijas HACCP: `EXISTS` al plan de la org. Auditorías/producción: pred directo por `organization_id`.
3. Storage: `GET /api/storage/download` resuelve `kind` + `resource_id`; path de org A no coincide con prefijo de B; 404 idéntico si no existe o es de otra org.

RPCs de métricas (`get_dashboard_metrics`, `get_kiosk_metrics`) son **SECURITY INVOKER**: heredan RLS del usuario. No son DEFINER.

`createAdminClient()` (service_role) salta RLS. Callers actuales y acotación:

| Caller | Acotación |
| --- | --- |
| Cron notificaciones | Bearer `CRON_SECRET` o una org de sesión; lock 045 |
| Export org | `settings.manage` + `.eq("organization_id", org)` |
| Invites / members | `requireOrgAdmin` + org del admin |
| QR submit / qr-context | token de `monitoring_qr_links` |
| Rate-limit store | ventanas hasheadas; no lee negocio |
| Onboarding `session-server` | perfil del uid |
| `audit-completed` | managers de la org del evento |

No hay query de negocio que liste filas de todas las orgs salvo el cron con secret.

**Hueco residual (no es cross-tenant de app):** `nc_photos` se inserta en quick-capture y no tiene `CREATE TABLE` en migraciones. Si la tabla no existe, falla el insert de foto; no abre B.

---

## 2. RBAC

Catálogo en `lib/auth/permissions.ts` (sin capacidades nuevas):

| Rol | Alcance |
| --- | --- |
| `admin` | todo, incluido `users.manage`, `settings.manage`, transiciones restringidas HACCP/docs |
| `quality_manager` | calidad (HACCP, CAPA, auditorías, docs, análisis, monitoreo) **sin** users/settings ni transiciones restringidas |
| `operator` | `documents.read`, `capa.create`, producción/monitoreo execute+read |

APIs sensibles usan `requirePermission` o `requireOrgAdmin`.  
Self-elevation de `role` / `organization_id` bloqueada en trigger `protect_profile_identity` y en código.  
Platform admin ≠ admin de org (allowlist de email).

Tests 62–70: operator no administra; QM no toca users/settings; roles no cruzan tenant.

---

## 3. RLS

Todas las tablas de producto tienen `ENABLE ROW LEVEL SECURITY` en su migración de alta. No hay `DISABLE` en 039–046 ni en `041_optimize_rls.sql`.

`041_optimize_rls.sql` reescribe policies con InitPlan; ACL de 036 se conserva (NC, documentos, notifications, operator insert).  
`_rbac_quality_crud` es no-op si `to_regclass` es NULL (tablas 029/041_remove).

Tablas de seguridad (`rate_limit_windows`, `security_abuse_events`, `background_job_locks`): RLS on; grants solo `service_role`.

---

## 4. HACCP (plan 12 pasos)

Superficie viva: `/haccp` → `HaccpPlanWizard` + `lib/haccp-plan/*`.

| Flujo | Cómo |
| --- | --- |
| Crear plan | `getOrCreateActivePlan`: 1 SELECT org + INSERT si no hay |
| Editar plan | `updatePlan` consolidado (step + checklist + status) |
| Pasos 7–12 | `saveStepData` upsert; localStorage siempre; remoto si cambió |
| Hazards | `haccp_plan_hazards` insert/update/delete + write-guard |
| Determinar PCC | paso 7: un `saveStepData` + **bulk upsert** `haccp_ccp_decisions` |
| Límites críticos | paso 8 → `haccp_step_data` |
| Monitoreo | `haccp_monitoring_records` + formularios de producción; NC por `origin_ref_id` = submission (sin `haccp_ccps`) |
| Validación | `haccp_validations` upsert |
| Documentos | snapshots a `controlled_documents` / `document_versions` |

Hijas se leen por `plan_id` (el plan ya está filtrado por org). RLS: `EXISTS` al padre.

UI v1 (`components/haccp/*`) **no está montada** (`/haccp/[id]` solo redirige). No forma parte del producto.

---

## 5. Dashboard

- KPIs: `get_dashboard_metrics` (039, INVOKER). No baja históricos para agregar.
- Listas: `LIMIT` 5–20 (`todayAudits` 8, `openNcs` 15, `capaActions` 20, activity 5–8).
- Filtros de fecha/estado en NC, auditorías, CAPA, desviaciones de la semana.
- Insight: solo `getInsightTeaser` (sin Claude, sin generate).
- `Promise.all` de 8 queries en paralelo (métricas + listas). No es N+1.

---

## 6. Kiosco

- `PlantKioskView`: `setInterval` → `GET /api/kiosk/metrics` → `setSnapshot`. **Cero** `router.refresh()`.
- API: `requirePermission(monitoring.read)` + `get_kiosk_metrics` INVOKER.
- `/planta` no carga `getDashboardData`.
- Reloj 1 s es estado local; métricas 30/60/120/300 s.

---

## 7. Autosave

- `shouldSkipWrite` / `rememberWrite`: no reescribe el mismo payload (ignora `updated_at`).
- Debounce con `.flush()`.
- Wizard: `visibilitychange` + unmount hacen flush de plan, equipo, producto, diagramas, validación, hazards, pasos 7–11.
- Diagrama: persistir al terminar interacción, no por frame de pan/drag.
- `saveStepData`: localStorage inmediato; upsert remoto solo si cambió.

---

## 8. Notifications

- `createNotifications`: upsert `ON CONFLICT (organization_id, user_id, dedup_key) DO NOTHING`. Sin SELECT previo.
- Fallback `insert` solo si falta el constraint (043 no aplicada).
- Cron: prefiltro de orgs, preload managers/prefs, ventanas de fecha, lock 8 min.
- Emails: `getUserEmails` una vez por org (N llamadas Auth = nº de managers, no de NC).

---

## 9. AI

| Superficie | Claude | Escritura |
| --- | --- | --- |
| Dashboard | no | no |
| GET `/analisis` / cron | no | `getOrCreateDailyInsight` |
| POST `{ force: true }` Regenerar | sí | pisa el día |

UNIQUE `(organization_id, period_date)` + `ON CONFLICT DO NOTHING`.  
Snapshot: COUNTs + límites (p. ej. 5 desviaciones, 80 refs PCC / 7 días, 150 NC abiertas para findings — no el histórico cerrado).

---

## 10. Realtime

| Tabla en publication | Consumidor app |
| --- | --- |
| `notifications` (043) | `notification-bell.tsx` INSERT+UPDATE, filtro `user_id` |
| `production_form_submissions` (021) | **ninguno** |
| `qc_submissions` / readings (018/019) | muertas; 029 / `041_remove_legacy_qms` las sacan si existen |

Único `.channel(` / `postgres_changes` en el repo: la campana.

---

## 11. Legacy QMS

0 `.from()` a `suppliers*`, `customer_complaints*`, `training_*`, `trace_*`, `lab_*`, `qc_*`, `prp_*`, `product_specifications`, `sampling_*`, `lot_releases`, `process_controls`.

Residuos que **no** son consumidores de producto:

- `components/haccp/*` + `lib/haccp/ccp-linking.ts` (HACCP v1, sin ruta).
- Tablas v1 y QMS pueden seguir en Postgres hasta aplicar 029 / `041_remove_legacy_qms` / fases REQUIRES_MIGRATION.
- `NcOrigin` `lab|complaint|supplier|prp`: etiquetas de filas viejas.

---

## Búsqueda de anti-patrones

### `select("*")`

Sigue en detalle de docs, CAPA, plantillas, HACCP load, export, prefs, cron prefs.  
Casi siempre **después** de `.eq("organization_id")` / `.eq("plan_id")` / `.eq("id")` + RLS.  
No es fuga cross-tenant. Es over-fetch de columnas (deuda menor, no bloquea).

### `router.refresh()`

**No** está en dashboard ni kiosco.

Sí en mutaciones puntuales (login, onboarding, docs, auditorías, captura rápida, builder de plantillas). Eso refresca el árbol RSC de **esa** página, no el polling del kiosco.

También en `components/haccp/*` (muerto) y `analisis-enricher` tras Regenerar (esperado).

### `Promise.all` sobre Supabase

Uso correcto (paralelo, no N+1): dashboard, snapshot AI, carga HACCP, cron preload, qr-context.  
`getUserEmails` hace `getUserById` en paralelo por manager (2–5). Aceptable.

### Queries en loops

- Cron: loop de orgs **después** de prefiltro; NC/auditorías por org (necesario). Managers no se re-seleccionan.
- Export: loop de tablas, no de filas.
- Escalate: updates `IN` + un `createNotifications`.

### SELECT antes de INSERT/UPDATE

| Sitio | Patrón |
| --- | --- |
| Notifications | upsert; no SELECT |
| Insights | upsert ON CONFLICT |
| `getOrCreateActivePlan` | SELECT + INSERT si vacío (carrera rara; no cruza orgs) |
| HACCP writes | upsert / write-guard; diagramas sin SELECT previo |

### RPC costosas

| RPC | Coste | Riesgo |
| --- | --- | --- |
| `get_my_profile` / `ensure_user_profile` | 1 fila, cada request | Bajo; necesario |
| `get_dashboard_metrics` / `get_kiosk_metrics` | agregados INVOKER | Bajo si 039/040 aplicados |
| `consume_rate_limits` | service_role, una ventana | Bajo |
| `try_acquire_job_lock` | 1 fila | Bajo |
| `submit_qc_field_form` | legacy | DROP 029 / 041_remove |

### Consultas sin `organization_id`

Intencional: hijas por `plan_id` / `audit_id` / `nc_id` / `user_id`. El padre ya está scoped; RLS cubre el resto.  
Export y cron admin **sí** filtran `organization_id` (o la allow-list prefiltrada).

### Sin LIMIT

Apropiado en: load de un plan (equipo/hazards de **un** plan), detalle de un NC, export (dump de org, no de lista UI), prefs (`maybeSingle`).  
Dashboard, kiosco, cron de vencimientos y snapshot AI **sí** limitan o cuentan.

---

## Residuos / riesgos abiertos (no fallan los 11 objetivos)

1. `production_form_submissions` sigue en `supabase_realtime` sin listener.
2. Dos archivos `041_*`: `041_optimize_rls.sql` (histórico) y `041_remove_legacy_qms.sql` (SAFE_TO_DROP, no aplicada).
3. `046_drop_unused_legacy_columns.sql` no aplicada (columnas FK residuales).
4. `nc_photos` usada sin CREATE.
5. Tests live de storage skip.
6. `select("*")` en pantallas de detalle (rendimiento, no ACL).
7. UI HACCP v1 aún en el repo.
8. Tablas REQUIRES_MIGRATION pueden existir en prod con datos; la app no las lee.

---

## Conclusión

Tras las oleadas de RLS, índices, dashboard/kiosco, HACCP writes, notificaciones, AI, jobs y plan legacy, **los 11 objetivos se cumplen en runtime**. El aislamiento A/B y los roles no se relajaron. El rendimiento de lecturas calientes ya no recorre históricos ni orgs ociosas.

Lo que queda es higiene de schema (aplicar 041_remove / 046 cuando haya dump, quitar publication de submissions, CREATE de `nc_photos`) y borrar código v1 huérfano — no bugs de tenancy, RBAC ni de los flujos HACCP/dashboard/kiosco.
