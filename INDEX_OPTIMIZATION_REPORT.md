# Informe de índices — Nura

Fecha: 2026-09-11  
Migración nueva: `supabase/migrations/042_performance_indexes.sql`  
**No se ejecutó.**

Fuentes leídas:

| Documento | Estado |
| --- | --- |
| `RLS_AUDIT.md` | Usado. FKs / `organization_id` de RLS → ya cubiertos por `041_optimize_rls.sql` |
| `DASHBOARD_PERFORMANCE_REPORT.md` | Usado. RPC + 7 listas |
| `KIOSK_PERFORMANCE_REPORT.md` | Usado (el kiosco vive en 040; el informe de dashboard no lo detalla) |
| `SUPABASE_DEPENDENCY_MAP.md` | Usado. Upserts, cron, Realtime, monitoreo |
| `QUERY_PERFORMANCE_REPORT.md` | **No existe en el repo.** Las queries se tomaron de `lib/dashboard/data.ts`, `039`/`040` SQL, `lib/production-records/submit.ts`, `lib/haccp/ccp-linking.ts`, `lib/notifications.ts`, `lib/notifications/cron.ts`, `lib/haccp-plan/*`, páginas de CAPA / registros / auditorías |

`040_performance_indexes.sql` no se creó: `040_kiosk_metrics.sql` ya ocupa ese número. Los índices de consulta van en **042**.

---

## Criterio

Se crea un índice solo si:

1. Hay una query concreta (filtro / `ORDER BY` / `ON CONFLICT`) que lo usa.
2. No hay otro índice con el mismo leading key (o un prefijo que el planner ya puede usar).
3. La tabla puede crecer por encima de unas decenas de filas por org, **o** la query corre en un camino caliente (dashboard, kiosco, submit, cron).

No se indexa “porque la columna existe”. No se re-declaran los de 006 / 021 / 023 / 030 / 039 / 041.

---

## CONCURRENTLY y el mecanismo de migraciones

Este repo aplica SQL en transacción (`supabase db push` / pegar el archivo entero).  
`CREATE INDEX CONCURRENTLY` **falla** dentro de `BEGIN`.

`042` usa `CREATE INDEX IF NOT EXISTS` (igual que 039 y 041). Es lo compatible.

En producción con tablas grandes, **fuera de transacción** (SQL Editor, un statement por vez):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nonconformities_org_nc_number
  ON public.nonconformities (organization_id, nc_number DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nonconformities_org_open_detected
  ON public.nonconformities (organization_id, detected_at DESC)
  WHERE status <> 'closed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_haccp_ccps_org_template
  ON public.haccp_ccps (organization_id, production_template_id)
  WHERE production_template_id IS NOT NULL;
```

---

## Ya existen (no se recrean)

### 1–2. `organization_id` y FK de RLS

Cubiertos por migraciones históricas + **041**. No se duplican.

| Índice | Tabla | Para |
| --- | --- | --- |
| `idx_profiles_organization_id` (041) | `profiles` | teammates, cron managers, `users_read_teammates` |
| `idx_*_org` en hijas HACCP / audit / production / docs / CAPA / suppliers / trace (041) | varias | pred RLS `organization_id = (SELECT current_organization_id())` |
| `idx_haccp_ccp_decisions_hazard` (041) | `haccp_ccp_decisions` | FK `hazard_id` (CASCADE + EXISTS) |
| `idx_audit_findings_checklist_item` (041) | `audit_findings` | FK |
| `idx_monitoring_qr_links_template` (041) | `monitoring_qr_links` | FK plantilla |
| `idx_document_read_acks_document` (041) | `document_read_acknowledgments` | FK documento |
| `plan_id` / `audit_id` / `submission_id` / `nc_id` / `template_id` / `section_id` | hijas | EXISTS RLS + carga por padre |

`invitations.invited_by` y `*_created_by` no se indexan: ninguna policy ni lista filtra por esas FKs.

### 3–4. Filtros y `ORDER BY` frecuentes

| Índice | Query |
| --- | --- |
| `idx_haccp_plans_org_updated` | dashboard / kiosco / editor: org + `ORDER updated_at DESC LIMIT 1` |
| `idx_production_submissions_org` `(org, submitted_at DESC)` | actividad, histórico LIMIT 500, RPC mes/semana/hoy, snapshot |
| `idx_haccp_monitoring_records_org` `(org, recorded_at DESC)` | panel PCC LIMIT 100 |
| `idx_haccp_monitoring_records_pcc` | filtro por PCC |
| `idx_audits_scheduled` `(org, scheduled_date)` | calendario, listado, `audits_month` |
| `idx_audits_status` `(org, status)` | cron auditorías abiertas |
| `idx_nonconformities_status` `(org, status)` | CAPA / filtros |
| `idx_nonconformities_due` `(org, due_date)` | vencimientos |
| `idx_capa_actions_status` `(org, status)` | CAPA |
| `idx_notifications_user` `(user_id, read, created_at DESC)` | campana + mark unread + Realtime |
| `idx_controlled_documents_org` `(org, status)` | listado documentos |
| `idx_audit_templates_org` | plantillas |
| `idx_production_templates_org` `(org, is_active)` | hub monitoreo, RPC `COUNT` activas |

### 5–6. `organization_id` + status / fecha (039)

| Índice | Query |
| --- | --- |
| `idx_nonconformities_org_detected` | actividad NC; CAPA `ORDER detected_at` |
| `idx_nonconformities_org_created` | tendencia 6 meses + conteo mensual (RPC) |
| `idx_nonconformities_org_closed` **parcial** `status = closed` | promedio de cierre |
| `idx_audits_org_completed` **parcial** `status = completed` | últimas 2 + AVG conformidad + tendencias |
| `idx_capa_actions_org_open_due` **parcial** `status <> completed` | dashboard CAPA `due_date ≤ +7` + RPC vencidas |
| `idx_production_submissions_org_deviation` **parcial** `has_deviation` | “esta semana” desviaciones |
| `idx_controlled_documents_org_published_review` **parcial** `published` | docs a revisar (RPC) |

Kiosco (`get_kiosk_metrics`): mismos índices de submissions / NC / audits / `haccp_plans`. No hace falta otro.

### 7. Claves de upsert / conflicto

Ya hay UNIQUE o PK. Un segundo índice sería redundante.

| Conflicto | Índice que ya sirve |
| --- | --- |
| `haccp_diagrams` `id` | PK |
| `haccp_validations` `plan_id` | `UNIQUE (plan_id)` |
| `haccp_ccp_decisions` `plan_id,hazard_id` | `UNIQUE (plan_id, hazard_id)` |
| `haccp_step_data` `organization_id,step_id` | `UNIQUE (organization_id, step_id)` |
| `ai_daily_insights` `organization_id,period_date` | `UNIQUE` |
| `notifications` dedup | `idx_notifications_dedup` parcial |
| `production_form_submissions` `org,client_submission_id` | `idx_production_submissions_client` |
| `monitoring_qr_links.token` | UNIQUE |
| `controlled_documents (org, code)` | UNIQUE (también ordena el listado por `code`) |
| `notification_preferences.organization_id` | PK |
| `rate_limit_windows.bucket_key` | PK |

### 8–10. Dashboard, kiosco, monitoreo

Cubiertos por la tabla de 039 + `idx_production_submissions_org` + `idx_haccp_plans_org_updated`.  
QR: `idx_monitoring_qr_links_org`, `idx_monitoring_qr_links_token`, `idx_production_submissions_qr`.

---

## Índices nuevos (042)

### 1. `idx_nonconformities_org_nc_number`

| | |
| --- | --- |
| **Query** | `nextNcNumber()` en `lib/capa/utils.ts`: `WHERE organization_id = $org AND nc_number LIKE 'NC-YYYY-%' ORDER BY nc_number DESC LIMIT 1`. Corre en cada alta (quick-capture, draft, monitoreo→NC). |
| **Tabla** | `nonconformities` |
| **Columnas** | `(organization_id, nc_number DESC)` |
| **Selectividad** | Alta. Prefijo por año + org; `LIMIT 1` es seek, no sort de toda la org. |
| **INSERT/UPDATE** | Bajo. Las NC no se insertan en ráfaga; `nc_number` no se reescribe. |
| **Por qué** | Ningún índice existente termina en `nc_number`. `(org, status)` y `(org, detected_at)` no sirven para el `LIKE` + `ORDER BY`. |

### 2. `idx_nonconformities_org_open_detected`

| | |
| --- | --- |
| **Query** | Cron (`lib/notifications/cron.ts`): todas las NC `status <> closed`. Dashboard: abiertas con `due_date` hoy/mañana **o** `detected_at` últimos 7 días, `ORDER detected_at DESC`. |
| **Tabla** | `nonconformities` |
| **Columnas** | `(organization_id, detected_at DESC) WHERE status <> 'closed'` |
| **Selectividad** | Media-alta y **mejora con el tiempo**: las cerradas (mayoría histórica) quedan fuera. El índice 039 `idx_nonconformities_org_detected` sigue haciendo falta para la actividad (incluye cerradas). |
| **INSERT/UPDATE** | Medio-bajo. Entra al cambiar `status` / `detected_at`. Las NC no son el camino de escritura más caliente. |
| **Por qué** | Prioridad 5 (org + status) + 4 (`ORDER BY`). El índice completo de `detected_at` mezcla abiertas y cerradas. El cron y las listas operativas solo quieren abiertas. No sustituye a 039. |

El RPC de dashboard/kiosco hace `WHERE organization_id = $org` y agrega con `COUNT FILTER`. Ese scan usa `idx_nonconformities_org` / `(org, status)`. Este parcial **no** está pensado para el RPC; está pensado para las listas y el cron.

### 3. `idx_haccp_ccps_org_template`

| | |
| --- | --- |
| **Query** | `lib/haccp/ccp-linking.ts` en el submit de monitoreo: `organization_id` + `production_template_id` (+ a veces `production_field_id IN …`). |
| **Tabla** | `haccp_ccps` |
| **Columnas** | `(organization_id, production_template_id) WHERE production_template_id IS NOT NULL` |
| **Selectividad** | Alta. Pocas filas por plantilla; el parcial ignora CCP sin vínculo a formulario. |
| **INSERT/UPDATE** | Bajo. Tabla chica; el vínculo se edita poco. |
| **Por qué** | Prioridad 10 (monitoreo). `idx_haccp_ccps_template` (024) no lleva `organization_id`. `idx_haccp_ccps_org` (041) no lleva plantilla. El submit es el camino de escritura más frecuente del producto. |

---

## Rechazados (no crear)

| Candidato | Por qué no |
| --- | --- |
| Cualquier `organization_id` ya listado en 041 | Redundante. RLS ya tiene el índice. |
| `(audits.organization_id, status, scheduled_date)` | `idx_audits_status` + `idx_audits_scheduled` cubren cron, calendario y “próximas”. Un tercero solo afina el `IN (scheduled, in_progress)` del dashboard. |
| Parcial audits `status IN (scheduled, in_progress)` | Igual: `(org, scheduled_date)` basta a 50–500 filas/org. |
| `(nonconformities.organization_id, due_date) WHERE status <> 'closed'` | Ya existe `idx_nonconformities_due`. El RPC no filtra `due_date` en el `WHERE` (usa `COUNT FILTER`). |
| `(nonconformities.organization_id, status, detected_at)` | Prefijo cubierto por `(org, status)` + 039 `detected_at`. |
| `(profiles.organization_id, role)` | 041 indexa `organization_id`. 5–50 perfiles/org; cron 1 vez/día. |
| `(profiles.organization_id, full_name)` | Sort en memoria. Tabla chica. |
| `(controlled_documents.organization_id, code)` | `UNIQUE (organization_id, code)` ya ordena el listado. |
| `(capa_actions.organization_id)` extra | `idx_capa_actions_org` existe. |
| `(production_form_submissions.organization_id, template_id)` | Ya hay `(template_id, submitted_at)` y `(org, submitted_at)`. La página de plantillas baja **todas** las filas para contar: eso se arregla con `GROUP BY`, no con otro índice. |
| `(production_form_submissions.organization_id, status, submitted_at)` | El RPC filtra por fecha y aplica `status` en `FILTER`. `(org, submitted_at)` es el índice correcto. |
| `(production_form_submission_values.field_id)` | Nadie filtra por `field_id`. Carga por `submission_id` (ya indexado). |
| `(haccp_ccp_decisions.plan_id)` suelto | El UNIQUE `(plan_id, hazard_id)` cubre upsert y lookup. |
| Índices en suppliers / quejas / training / lab / PRP / QC v1 | Mapa: categoría B–D o sin query caliente. 041 ya puso `organization_id` donde RLS lo necesita. |
| `invitations (organization_id, accepted)` | Tabla chica; `idx_invitations_org` basta. |
| `notifications (organization_id, user_id, dedup_key)` extra | UNIQUE parcial `idx_notifications_dedup`. |
| Covering / `INCLUDE` en listas del dashboard | `LIMIT` 5–20. El I/O extra de mantener INCLUDE no se justifica. |

---

## Impacto esperado

| Superficie | Antes de 042 | Después |
| --- | --- | --- |
| Dashboard RPC + listas | Índices 021/023/006/039 | Sin cambio (ya cubierto) |
| Kiosco 30 s | Igual | Sin cambio |
| Alta de NC | Posible sort/`LIKE` sobre `(org, status)` | Seek por `nc_number` |
| Cron CAPA | Scan de NC de la org (incluye cerradas) | Scan parcial de abiertas |
| Submit monitoreo + CCP | Bitmap `org` ∪ `template_id` o seq en tabla chica | Un índice |

Tres índices btree. Coste de escritura despreciable frente a `production_form_submissions` / `submission_values` (esos ya están indexados y no se tocan).

---

## Cómo aplicar (cuando se pida)

1. Staging: `042_performance_indexes.sql` completo (transacción OK).
2. Producción con tablas grandes: los tres `CONCURRENTLY` de arriba, uno por uno, sin `BEGIN`.
3. `ANALYZE nonconformities; ANALYZE haccp_ccps;`
4. No hace falta recargar el schema cache de PostgREST (no hay RPC nuevo).
