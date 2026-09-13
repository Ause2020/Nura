# Plan de limpieza de schema legacy

Fecha: 2026-09-11  
Fuentes: `SUPABASE_DEPENDENCY_MAP.md`, `ARCHITECTURE_AUDIT.md`, `HACCP_ARCHITECTURE_CLEANUP.md`, `HACCP_LEGACY_DEPENDENCIES.md`, `LEGACY_CLEANUP_REPORT.md`, `RLS_AUDIT.md`, `REALTIME_AUDIT.md`, `BACKGROUND_JOBS_AUDIT.md`, migraciones 001–045, código actual en `app/`, `components/`, `lib/`.

**Esta pasada no ejecuta DROP TABLE ni toca la DB remota.**  
Migración preparada (solo columnas, no tablas): `supabase/migrations/046_drop_unused_legacy_columns.sql`.

No hay tablas `qms_*`. “QMS” en este repo = proveedores + reclamos + LMS + specs de laboratorio (011), no documentos controlados ni CAPA (esos son producto vivo).

---

## Cómo leer las categorías

| Categoría | Significado |
| --- | --- |
| **SAFE_TO_DROP** | 0 consumidores de app, 0 FK desde tablas vivas, y ya cubiertas por `029` (o buckets vacíos por `038`). Si aún existen, un `DROP IF EXISTS` no cambia el producto. **Verificar `to_regclass` antes.** |
| **REQUIRES_MIGRATION** | 0 (o casi 0) consumidores de runtime, pero hay datos posibles, FK a/desde tablas vivas, RLS/policies vigentes, o UI huérfana en el repo. Primero dump + quitar FKs/UI; **después** un DROP TABLE futuro. |
| **DO_NOT_DROP** | Producto vivo, auth/RBAC, o hueco que el código escribe. |

Regla: **0 queries ≠ 0 filas**. Ningún `DROP TABLE` de 012/013/024–028 sin conteo en el proyecto real.

---

## Discrepancia entre reportes (código actual gana)

| Documento | Dice | Código hoy |
| --- | --- | --- |
| `SUPABASE_DEPENDENCY_MAP.md` / `ARCHITECTURE_AUDIT.md` | Dashboard, export y `ccp-linking` leen HACCP v1 | Dashboard lee `haccp_plans`. Export lista el plan 12 pasos, no v1. `submit.ts` **no** llama `findLinkedCcpForSubmission` |
| `HACCP_ARCHITECTURE_CLEANUP.md` | Borró `components/haccp/*` y `lib/haccp/ccp-linking.ts` | Los archivos **siguen**. Ninguna ruta los monta (`/haccp/[id]`, `/nuevo`, `/resumen` solo `redirect("/haccp")`) |
| `HACCP_LEGACY_DEPENDENCIES.md` | `production_form_fields.haccp_ccp_id` | **No existe** en migraciones. El vínculo es al revés: `haccp_ccps.production_field_id → production_form_fields` |

---

## Resumen de clasificación

| Grupo | Tablas | Clase |
| --- | --- | --- |
| HACCP 12 pasos | `haccp_plans`, `haccp_teams`, `haccp_plan_products`, `haccp_diagrams`, `haccp_validations`, `haccp_plan_hazards`, `haccp_ccp_decisions`, `haccp_step_data`, `haccp_monitoring_records` | **DO_NOT_DROP** |
| HACCP v1 | `haccp_products`, `haccp_process_steps`, `haccp_hazards`, `haccp_ccps`, `haccp_plan_versions`, `haccp_plan_version_log` | **REQUIRES_MIGRATION** |
| Laboratory / specs / sampling / QC / PRP | `lab_*`, `product_specifications`, `sampling_plans`, `lot_releases`, `process_controls`, `qc_*`, `prp_*` | **SAFE_TO_DROP** (ya `029`; re-verificar) |
| Proveedores | `suppliers` + 7 hijas | **REQUIRES_MIGRATION** |
| Reclamos | `customer_complaints`, `complaint_photos`, `complaint_status_log` | **REQUIRES_MIGRATION** |
| LMS | `training_*` (5) | **REQUIRES_MIGRATION** |
| Trazabilidad / recall | `trace_*`, `mock_recall_*` | **REQUIRES_MIGRATION** |
| Auth, CAPA, auditorías, docs, monitoreo, notifs, rate-limit, insights, locks | resto vivo | **DO_NOT_DROP** |
| `nc_photos` | usada por quick-capture; **sin CREATE** en migraciones | **DO_NOT_DROP** (crear si falta; no dropear) |

---

## Verificación obligatoria en el SQL Editor (no ejecutada aquí)

```sql
SELECT c.relname AS table_name, c.reltuples::bigint AS est_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname ~ '^(haccp_products|haccp_process_steps|haccp_hazards|haccp_ccps|haccp_plan_versions|haccp_plan_version_log|prp_|qc_|lab_|product_spec|sampling_|lot_release|process_control|supplier|customer_complaint|complaint_|training_|trace_|mock_recall|nc_photos)'
ORDER BY 1;

SELECT conrelid::regclass AS from_table, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f'
  AND (confrelid::regclass::text ~ 'haccp_ccps|haccp_products|suppliers|lab_analyses|customer_complaints'
       OR conrelid::regclass::text IN (
         'nonconformities',
         'production_form_submissions',
         'organizations'
       ))
ORDER BY 1;
```

---

## 1. HACCP v1 — REQUIRES_MIGRATION

Ninguna es SAFE_TO_DROP: hay FK desde tablas vivas y UI huérfana que todavía hace `.from()`.

### 1.1 `haccp_products`

| Superficie | Detalle |
| --- | --- |
| Consumidores app **vivos** | Ninguno (dashboard/export ya no) |
| Consumidores **huérfanos** | `products-table`, `new-product-form`, `process-diagram`, `haccp-plan-version-panel` |
| FK salientes | `organization_id → organizations`; `approved_by → profiles` (024) |
| FK entrantes | `haccp_process_steps.product_id` CASCADE; `haccp_plan_versions.product_id` CASCADE; `haccp_plan_version_log.product_id` CASCADE; `customer_complaints.product_id` SET NULL; si 029 no corrió: `product_specifications`, `sampling_plans`, `lab_analyses`, `lot_releases`, `process_controls` |
| RLS | ON. Policies 002 reemplazadas por `_rbac_quality_crud` (036/041) |
| Triggers / functions | `update_haccp_product_timestamp` (DEFINER) + trigger `haccp_steps_update_product` en `haccp_process_steps` |
| Views / cron / RPC / realtime | No |
| Índices | `idx_haccp_products_org` (002) |
| Referencias en otras tablas | Columna `customer_complaints.product_id` |

### 1.2 `haccp_process_steps`

| Superficie | Detalle |
| --- | --- |
| Consumidores vivos | Ninguno |
| Huérfanos | `process-diagram` S/I/U/D; `ccp-tree` S |
| FK salientes | `product_id → haccp_products` CASCADE; `organization_id → organizations` |
| FK entrantes | `haccp_hazards.process_step_id` CASCADE; `haccp_ccps.process_step_id` (**sin CASCADE** — bloquea DELETE de step si hay CCP) |
| RLS | quality CRUD (036/041) |
| Triggers | dispara `update_haccp_product_timestamp` |
| Índices | `idx_haccp_process_steps_product`, `_position` (002); `idx_haccp_process_steps_org` (041) |
| Cron / RPC / views / realtime | No |

### 1.3 `haccp_hazards`

| Superficie | Detalle |
| --- | --- |
| Consumidores vivos | Ninguno |
| Huérfanos | `hazard-analysis` S/I/U; `ccp-tree` S |
| FK salientes | `process_step_id → haccp_process_steps` CASCADE; `organization_id → organizations` |
| FK entrantes | `haccp_ccps.hazard_id` CASCADE |
| RLS | quality CRUD |
| Índices | `idx_haccp_hazards_step` (003); `idx_haccp_hazards_org` (041) |
| Cron / RPC / views / realtime | No |

### 1.4 `haccp_ccps` — crítica para un DROP futuro

| Superficie | Detalle |
| --- | --- |
| Consumidores vivos | **Ninguno.** `lib/production-records/submit.ts` no escribe `haccp_ccp_id` ni llama linking |
| Huérfanos | `lib/haccp/ccp-linking.ts` (S/U); `ccp-table` S/U; `ccp-tree` I |
| FK salientes | `hazard_id → haccp_hazards` CASCADE; `process_step_id → haccp_process_steps`; `organization_id → organizations`; `production_template_id → production_form_templates` SET NULL; `production_field_id → production_form_fields` SET NULL |
| FK entrantes **desde tablas vivas** | `nonconformities.haccp_ccp_id` SET NULL; `production_form_submissions.haccp_ccp_id` SET NULL |
| FK entrantes legacy | `process_controls.ccp_id` si 029 no corrió |
| RLS | quality CRUD |
| Índices | `idx_haccp_ccps_hazard`, `_step` (003); `idx_haccp_ccps_template` (024); `idx_haccp_ccps_org` (041); `idx_haccp_ccps_org_template` (042) |
| Cron / RPC / views / realtime | No |

**No dropear esta tabla mientras existan las dos columnas FK vivas.** Esas columnas son las que 046 puede quitar.

### 1.5 `haccp_plan_versions`

| Superficie | Detalle |
| --- | --- |
| Consumidores vivos | Ninguno (export ya no) |
| Huérfanos | `haccp-plan-version-panel` S/I; `lib/haccp/versioning.ts` |
| FK salientes | `product_id → haccp_products` CASCADE; `organization_id`; `created_by` / `approved_by → profiles` |
| FK entrantes | `haccp_plan_version_log.version_id` SET NULL |
| RLS | quality CRUD |
| Índices | `idx_haccp_plan_versions_product` (024); `_org` (041) |
| Versionado vivo | Snapshots a `controlled_documents` / `document_versions` — **no** esta tabla |

### 1.6 `haccp_plan_version_log`

| Superficie | Detalle |
| --- | --- |
| Consumidores vivos | Ninguno |
| Huérfanos | version-panel INSERT |
| FK salientes | `product_id → haccp_products` CASCADE; `version_id → haccp_plan_versions` SET NULL; `organization_id`; `changed_by → profiles` |
| FK entrantes | Ninguna |
| RLS | select + insert quality (036/041); **sin** update/delete |
| Índices | `idx_haccp_plan_version_log_product` (024); `_org` (041) |

### Orden futuro (no crear ahora)

1. Borrar o dejar de importar `components/haccp/*`, `lib/haccp/ccp-linking.ts`, `versioning.ts`, `constants.ts`, `risk-matrix.ts`, `lib/hazards-library.ts`. Conservar `lib/haccp/auth.ts`.
2. Aplicar 046 (columnas FK en tablas vivas).
3. Nueva migración: `DROP TABLE` en orden `haccp_plan_version_log` → `haccp_plan_versions` → `haccp_ccps` → `haccp_hazards` → `haccp_process_steps` → `haccp_products` (tras SET NULL de `customer_complaints.product_id` o dropear reclamos).
4. Dropear `update_haccp_product_timestamp` y policies residuales. `_rbac_quality_crud` ya es no-op si `to_regclass` es NULL.

---

## 2. Laboratory / QC / PRP — SAFE_TO_DROP

Creadas en 004/011/018/019. **`029_remove_legacy_modules.sql` ya hace `DROP TABLE IF EXISTS … CASCADE` y `DROP FUNCTION submit_qc_field_form`.**

| Tabla | FK salientes (históricas) | FK entrantes (históricas) | RLS original | Realtime | App `.from()` |
| --- | --- | --- | --- | --- | --- |
| `qc_controls` | org, `created_by → profiles` | `qc_field_links`, `qc_submissions` | 018 org-all | no | no |
| `qc_field_links` | control, org | `qc_submissions.link_id` | 018 | no | no |
| `qc_submissions` | control, link, org | `qc_submission_readings` | 018 | **018 añadió a `supabase_realtime`** | no |
| `qc_control_parameters` | control, org | readings | 019 | no | no |
| `qc_submission_readings` | submission, parameter, org | — | 019 | **019 realtime** | no |
| `product_specifications` | org, `product_id → haccp_products` | sampling, lab_results | 011 | no | no |
| `sampling_plans` | org, product, spec | — | 011 | no | no |
| `lab_analyses` | org, product | `lab_results`; `lot_releases.analysis_id`; **`customer_complaints.lot_analysis_id`** | 011 | no | no |
| `lab_results` | analysis, spec, org | — | 011 | no | no |
| `lot_releases` | org, product, analysis, `nc_id → nonconformities` | — | 011 | no | no |
| `process_controls` | org, product, **`ccp_id → haccp_ccps`**, profiles | — | 011 | no | no |
| `prp_programs` / items / records / record_items | org, profiles; 004 también **creó `nonconformities`** (tabla viva — no tocar) | entre ellas | 004 | no | no |

| Otro | Estado |
| --- | --- |
| RPC `submit_qc_field_form` | DROP en 029. **SAFE_TO_DROP** / ya ausente |
| Policies 011/018 | caen con la tabla |
| Bucket `lab-reports` | 011 lo crea; 035 lo privatiza; **038 lo borra si está vacío** |
| `storage_can_write_bucket` (036) | sigue nombrando `lab-reports` — inofensivo si el bucket no existe |
| Views | ninguna |
| Cron | ninguno |

Si 013+029 corrieron: el FK `customer_complaints.lot_analysis_id → lab_analyses` se fue con CASCADE; la **columna** puede quedar. No es bloqueo para lab (ya drop). No dropear `customer_complaints` por esto.

**No re-ejecutar 011/018** (`check_state.sql` todavía dice “ejecuta si falta” — eso reintroduce el módulo).

---

## 3. Proveedores — REQUIRES_MIGRATION

0 `.from()` en app. UI/API borradas (`LEGACY_CLEANUP_REPORT.md`). Pueden tener filas.

| Tabla | FK salientes | FK entrantes | RLS (036/041) |
| --- | --- | --- | --- |
| `suppliers` | org; `approved_by → profiles` | 7 hijas; **`nonconformities.supplier_id`**; **`trace_lots.supplier_id`** | quality CRUD |
| `supplier_documents` | supplier CASCADE, org | — | quality CRUD |
| `supplier_evaluations` | supplier, org, profiles | — | quality CRUD |
| `supplier_incidents` | supplier, org, **`nc_id → nonconformities`** | — | quality CRUD |
| `supplier_approval_checklist` | org | responses | quality CRUD |
| `supplier_approval_responses` | supplier, checklist, org | — | quality CRUD |
| `supplier_approval_log` | supplier, org | — | quality CRUD |
| `supplier_portal_tokens` | supplier, org | — | quality CRUD |

Índices: 012 (`idx_suppliers_org`, docs/evals/incidents); 026 (log, token, checklist); 041 (org en hijas).  
Triggers / views / cron / RPC / realtime: no.  
Storage: bucket `supplier-docs` — 038 si vacío.  
Rate-limit: path `/api/suppliers/:id/portal-token` sigue clasificado (defensa). No implica tabla.

**Bloqueo para DROP:** `nonconformities.supplier_id` (tabla viva). 046 la quita. `trace_lots.supplier_id` sigue hasta dropear trace o esa columna.

---

## 4. Reclamos — REQUIRES_MIGRATION

0 `.from()`. Settings ya no escribe `complaint_*`.

| Tabla | FK salientes | FK entrantes | RLS |
| --- | --- | --- | --- |
| `customer_complaints` | org; **`product_id → haccp_products`**; `nc_id → nonconformities`; `lot_analysis_id → lab_analyses` (huérfano si 029); `response_responsible → profiles` | photos, status_log | quality CRUD + `complaints_insert_operator` |
| `complaint_photos` | complaint CASCADE, org | — | quality CRUD |
| `complaint_status_log` | complaint CASCADE, org, profiles | — | quality CRUD |

Índices: org/status/product (013); `idx_complaints_response_due` (028); 041 org en hijas.  
Realtime / cron / RPC / views: no.  
Bucket `complaint-photos`: 038 si vacío.  
Policies storage 036 aún lo nombran.

`organizations.complaint_response_sla_hours` y `complaint_auto_nc_severity` (028): 0 consumidores. Van en 046.

---

## 5. LMS (`training_*`) — REQUIRES_MIGRATION

No confundir con evidencia Codex del equipo (`haccp_teams.training_*`) — eso es **DO_NOT_DROP**.

| Tabla | FK | RLS |
| --- | --- | --- |
| `training_courses` | org, `created_by` | select org; write quality |
| `training_quiz_questions` | course CASCADE, org | igual |
| `training_role_requirements` | course, org | quality CRUD |
| `training_assignments` | course, user, org, **`nc_id → nonconformities`** | quality o propio |
| `training_completions` | assignment SET NULL, user, course, org | insert self |

Índices 027 + 041 quiz org.  
Cron / RPC / views / realtime: no.  
Insights ya no leen LMS.

---

## 6. Trazabilidad / mock recall — REQUIRES_MIGRATION

0 `.from()`. FSMA 204 (`001_fsma204_kdes.sql`) solo añade columnas nullable a `trace_lots` / `trace_events`.

| Tabla | FK salientes | Notas |
| --- | --- | --- |
| `trace_lots` | org; **`supplier_id → suppliers`**; **`production_submission_id → production_form_submissions`**; profiles | Bloquea DROP de suppliers y no se puede CASCADE submissions (SET NULL) |
| `trace_lot_compositions` | parent/child → `trace_lots` | |
| `trace_events` | lot, related_lot, org, profiles | + columnas FSMA |
| `mock_recall_simulations` | org, profiles | |
| `mock_recall_simulation_lots` | simulation, lot, org | |

RLS: quality CRUD (036/041). Índices 025 + 041.  
Landing ya no vende “Trazabilidad de lotes” como módulo.

---

## 7. DO_NOT_DROP (producto / plataforma)

No listar fila a fila el canónico: planes 12 pasos, monitoreo (`production_form_*`, `monitoring_qr_links`), auditorías, CAPA (`nonconformities` y hijas), documentos, `organizations` / `profiles` / `invitations`, `notifications` / prefs, `ai_daily_insights`, `rate_limit_windows`, `security_abuse_events`, `background_job_locks`.

| Objeto especial | Por qué |
| --- | --- |
| `nc_photos` | `app/api/quick-capture/nc/route.ts` inserta; `lib/storage/download.ts` lee. 036/041 aplican RLS **si existe**. Falta `CREATE TABLE` — hueco E. **Crear**, no dropear |
| `nonconformities` | Viva. Solo son residuales **columnas** `haccp_ccp_id` y `supplier_id` |
| `production_form_submissions` | Viva (y en realtime 021 sin consumidor UI). Columna residual `haccp_ccp_id` |
| Valores `NcOrigin` `prp\|lab\|complaint\|supplier` | Etiquetas de filas viejas (`lib/capa/constants.ts`). No son tablas |
| `AuditType "supplier"` | Tipo de auditoría de inocuidad, no el módulo proveedores |
| `CcpDetermination prp\|oprp` | Árbol Codex del plan 12 pasos |
| Migraciones `001`–`045` como archivos | Historia de apply. No borrar SQL histórico |

Realtime vivo: solo `notifications` (`REALTIME_AUDIT.md`).  
Cron vivo: `POST /api/notifications/cron` — orgs, profiles, NC, audits, prefs, insights. No toca lab/QC/v1/suppliers.

---

## 8. Columnas en tablas vivas

| Columna | Consumidores app | ¿FK necesaria para el producto? | Clase | Acción |
| --- | --- | --- | --- | --- |
| `nonconformities.haccp_ccp_id` | No (insert omite; tipo residual) | No. Histórico opcional | REQUIRES_MIGRATION | **046 la dropea** |
| `production_form_submissions.haccp_ccp_id` | No | No | REQUIRES_MIGRATION | **046** |
| `production_form_fields.haccp_ccp_id` | No; **no está en migraciones** | — | n/a | 046 `DROP IF EXISTS` por si alguien la añadió a mano |
| `nonconformities.supplier_id` | No | No (módulo proveedores muerto) | REQUIRES_MIGRATION | **046** |
| `organizations.complaint_response_sla_hours` | No | No es FK | REQUIRES_MIGRATION | **046** |
| `organizations.complaint_auto_nc_severity` | No | No es FK | REQUIRES_MIGRATION | **046** |
| `organizations.supplier_scorecard_weights` | No | No es FK | REQUIRES_MIGRATION | **046** |
| `customer_complaints.product_id` | No | Sí **hasta** dropear `haccp_products` o reclamos | REQUIRES_MIGRATION | **No en 046** (vive en tabla que no dropeamos) |
| `customer_complaints.lot_analysis_id` | No | Target lab ya drop 029 | REQUIRES_MIGRATION | Dejar; cae con reclamos |
| `haccp_ccps.production_template_id` / `production_field_id` | Solo UI huérfana | FK **saliente** de tabla v1 | REQUIRES_MIGRATION | Cae al dropear `haccp_ccps` |
| `trace_lots.supplier_id` / `production_submission_id` | No | Sí hasta dropear trace | REQUIRES_MIGRATION | No en 046 |
| `training_assignments.nc_id` | No | SET NULL a NC viva | REQUIRES_MIGRATION | No en 046 |

046 **no** toca FKs que viven en tablas que siguen clasificadas REQUIRES_MIGRATION (reclamos, trace, training). Solo limpia columnas residuales **sobre tablas que se quedan**.

---

## 9. Storage / policies / runbooks (no son tablas)

| Objeto | Clase | Nota |
| --- | --- | --- |
| Buckets `lab-reports`, `supplier-docs`, `complaint-photos` | SAFE_TO_DROP si vacíos | Ya `038` |
| Policies storage 036 que los nombran | dejar | no-op sin bucket |
| `check_state.sql` / `APPLY_ALL.sql` listando 011–019 | docs C | No ejecutar 011/018 en prod limpio |
| `verify_private_storage.sql` espera esos buckets | C | Actualizar cuando 038 esté aplicado |

---

## 10. Fases (nada de esto es DROP TABLE salvo 029 ya existente)

| Fase | Qué | ¿Hecho? |
| --- | --- | --- |
| 0 | Verificar `to_regclass` + conteos en el proyecto | No (hace falta SQL Editor) |
| 1 | Quitar columnas residuales en tablas vivas | **046 preparada, no aplicada** |
| 2 | Borrar UI/libs HACCP v1 huérfanas | Código; no schema |
| 3 | Dump + `DROP TABLE` lab/QC/PRP si 029 no se aplicó | 029 ya existe |
| 4 | Dump + dropear suppliers / complaints / training / trace | **No crear migración todavía** |
| 5 | Dump + dropear las 6 tablas HACCP v1 | **No crear migración todavía** |
| 6 | Limpiar `check_state.sql` / nombres en `storage_can_write_bucket` | Docs / SQL no destructivo |

---

## 11. Qué no hacer

- No editar migraciones 002–029.
- No dropear `haccp_ccps` antes de 046.
- No dropear `haccp_products` mientras `customer_complaints.product_id` exista.
- No dropear `suppliers` mientras `nonconformities.supplier_id` o `trace_lots.supplier_id` existan.
- No tocar `nonconformities` como tabla.
- No interpretar `NcOrigin` / labels de notificación viejas como tablas.
- No recrear lab/QC desde `check_state.sql`.
