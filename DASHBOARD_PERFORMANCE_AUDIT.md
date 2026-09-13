# Auditoría de rendimiento — Dashboard (`/dashboard`)

Fecha: 2026-09-12  
Modo: **solo análisis**. No se modificó código, schema, RLS, índices ni diseño.

Contexto: advertencia de Supabase por agotamiento de CPU/IO. Hipótesis inicial: `lib/dashboard/data.ts` baja muchas filas y calcula KPIs en JavaScript.

**Hallazgo principal:** esa hipótesis está **parcialmente desactualizada**. Los KPIs numéricos ya salen de `get_dashboard_metrics()` (migración 039, SQL). El coste que queda es:

1. El RPC recorre **histórico de NC** (y a veces CAPA/docs/submissions) **varias veces** en un solo `SELECT jsonb_build_object`.
2. Siete queries PostgREST extra para listas (acotadas).
3. Queries del **layout** (plantillas activas sin LIMIT) y de sesión/middleware en cada carga.
4. Un cálculo SQL (`site_areas`, 90 días de submissions) **sin consumidor de UI**.

Los componentes del Dashboard **no vuelven a consultar** Supabase: solo pintan el objeto `DashboardData`.

---

## 1. Executive Summary

| Pregunta | Respuesta |
| --- | --- |
| ¿El Dashboard baja todas las NC/auditorías/registros y cuenta en JS? | **No para KPIs.** Sí existía ese patrón; hoy vive en `kpi-widgets.ts` (`computeCapaWidget`, etc.) y **`/dashboard` no lo llama**. |
| ¿Dónde se calculan los KPIs? | `get_dashboard_metrics()` → `parseDashboardMetrics` → `buildModuleKpiWidgetsFromMetrics` / `computeSystemScore`. JS solo formatea números ya agregados. |
| ¿Qué sigue siendo caro? | El RPC: `COUNT(*)` de **todas** las NC de la org (total + origen). Fallback de cierre CAPA sobre **todo** el histórico cerrado. `site_areas` barre submissions de 90 días y no se muestra. |
| ¿Las listas son unbounded? | No. Límites 5–20. JS recorta de nuevo a 5–10. |
| ¿N+1? | No en el camino de datos. `Promise.all` de 8 llamadas + 2 del layout. |
| ¿`haccp_products`? | **No se consulta.** El plan canónico es `haccp_plans` (1 fila, `LIMIT 1` dentro del RPC). |
| ¿Cambiar RLS? | No hace falta ni se recomienda. |

Carga aproximada de **una** visita a `/dashboard` (usuario autenticado, no operator):

| Fase | Llamadas Supabase | Filas típicas al cliente |
| --- | --- | --- |
| Middleware | `get_my_profile` + `organizations` (1) | 1 + 1 |
| Layout | `profiles` (cache), `organizations`, `production_form_templates` activas | 1 + N plantillas |
| Página | `get_dashboard_metrics` + 7 listas + `getInsightTeaser` | 1 JSON + ≤66 filas + 1 insight |
| Cliente (campana) | `notifications` LIMIT 50 + realtime | ≤50 |

Auth `getUser()` se reutiliza vía `cache()` de React en layout + page.

---

## 2. Query Inventory

### 2.1 RPC `get_dashboard_metrics` — 1 vez por carga

`SECURITY INVOKER`, `STABLE`. Resuelve `v_org` desde `profiles` (`auth.uid()`). RLS aplica a **cada** subconsulta.

Cada ítem del `jsonb_build_object` es un scan independiente (no es un único pass).

| # | Tabla | Qué pide | Filtros | Orden / LIMIT | Filas al cliente | Uso real | ¿Ya es SQL? | Histórico | Índice útil |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `haccp_plans` | `checklist_progress` | `organization_id` | `updated_at DESC LIMIT 1` | 1 JSON | % HACCP / score | Sí | No | `idx_haccp_plans_org_updated` |
| R2 | `production_form_templates` | `COUNT(*)` | org + `is_active` | — | escalar | `recordsTemplatesActive` | Sí | No | `idx_production_templates_org` |
| R3 | `production_form_submissions` | 6 COUNTs (mes/hoy/semana × total/ok) | org + `submitted_at >= min(week, month)` | — | 6 números | widgets + KPI monitoreo | Sí | Ventana ~1 mes | `idx_production_submissions_org` |
| R4 | `nonconformities` | `COUNT(*)` + FILTERs (open, overdue, critical, this/last month) | **solo org** | — | ~8 números | widgets CAPA, semáforo, KPI total | Sí | **Sí: toda la tabla del tenant** | `idx_nonconformities_org`; parcial open `idx_nonconformities_org_open_detected` (042, si aplicada) |
| R5 | `nonconformities` | `AVG` días cierre | org + closed + `closed_at` últimos 30 d; **si NULL, todo el histórico cerrado** | — | 1 número | KPI “Tiempo cierre CAPA” | Sí | **Sí en fallback** | `idx_nonconformities_org_closed` |
| R6 | `nonconformities` | `GROUP BY origin, COUNT` | **solo org** | — | ~8 grupos | gráfico “NCs por origen” | Sí | **Sí: todas las NC** | `idx_nonconformities_org` (seq/bitmap por org) |
| R7 | `capa_actions` | `COUNT(*)` | org + `status <> completed` + `due_date < hoy` | — | 1 | `overdueCapas` | Sí | No (abiertas vencidas) | `idx_capa_actions_org_open_due` |
| R8 | `audits` | COUNT scheduled + completed del mes | org + `scheduled_date` en el mes | — | 2 | métricas mes | Sí | 1 mes | `idx_audits_scheduled` |
| R9 | `audits` | `AVG(compliance_score)` mes y mes anterior | org + completed + `completed_date` en 2 meses | — | 2 | KPI conformidad | Sí | 2 meses | `idx_audits_org_completed` |
| R10 | `audits` | id, title, score, completed_date | org + completed | `completed_date DESC LIMIT 2` | 2 | widget “Última auditoría” | Sí | No | `idx_audits_org_completed` |
| R11 | `controlled_documents` | 2 COUNTs revisión | org + `status = published` | — | 2 | widget documentos | Sí | Published (puede crecer) | `idx_controlled_documents_org_published_review` |
| R12 | `audits` × 6 meses | `AVG(score)` por mes | org + completed + mes | 6 laterals | 6 | tendencia | Sí | 6 meses | `idx_audits_org_completed` |
| R13 | `nonconformities` × 6 meses | `COUNT` por mes | org + `created_at` en mes | 6 laterals | 6 | tendencia (si no hay audit_avg) | Sí | 6 meses | `idx_nonconformities_org_created` |
| R14 | `production_form_templates` ∪ `production_form_submissions` | `DISTINCT area` | templates activas; submissions **90 días** | — | lista áreas | `siteAreas` | Sí | 90 d | templates org; submissions org+submitted_at |

**R14 no tiene consumidor:** `siteAreas` se asigna en `fetchDashboardData` y **ningún componente** lo lee. Kiosco usa `get_kiosk_metrics`, no este campo.

`haccp_products`: no aparece.

Frecuencia RPC: **1 / carga** (no hay poll en `/dashboard`).

### 2.2 Queries PostgREST en `fetchDashboardData` — 1 vez cada una, en `Promise.all`

| # | Tabla | Columnas | Filtros | Orden | LIMIT | Filas máx. | Uso | ¿COUNT en JS? | Histórico | Índice |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | `audits` | id, title, scheduled_date, status | org; status in (scheduled, in_progress); `scheduled_date` hoy…+14 d | scheduled_date ASC | 8 | 8 | Tareas “hoy” (filtra `=== today` en JS) + card “Auditorías próximas” (slice 5) | No; recorte de lista | No | `idx_audits_scheduled` |
| Q2 | `audits` | id, title, completed_date, created_at | org; status = completed | completed_date DESC | 5 | 5 | Activity feed | No | Últimas 5 | `idx_audits_org_completed` |
| Q3 | `nonconformities` | id, nc_number, status, severity, due_date, detected_at, area | org; status ≠ closed; **OR** (due hoy–mañana **o** detected ≥ 7 d) | detected_at DESC | 15 | 15 | Tareas (due hoy/mañana) + “NC nuevas” (detected ≥ 7 d, slice 5) | Filtro JS sobre ≤15 | No | `idx_nonconformities_org_open_detected` / `idx_nonconformities_due` |
| Q4 | `nonconformities` | id, nc_number, status, detected_at, closed_at, created_at | org **sin status** | detected_at DESC | 5 | 5 | Activity (abiertas o cerradas) | No | Últimas 5 | `idx_nonconformities_org_detected` |
| Q5 | `capa_actions` | id, status, due_date, description, nc_id | org; status ≠ completed; due ≤ +7 d | due_date ASC | 20 | 20 | Parte overdue / due-soon en JS, slice 5+5 | Partición JS, no COUNT global | No | `idx_capa_actions_org_open_due` |
| Q6 | `production_form_submissions` + embed `production_form_templates(name)` | id, submitted_at, has_deviation, area, template_id, name | org | submitted_at DESC | 8 | 8 + 8 joins | Activity | No | Últimas 8 | `idx_production_submissions_org` |
| Q7 | `production_form_submissions` + embed name | id, submitted_at, area, template_id, name | org; `has_deviation`; submitted_at ≥ 7 d | submitted_at DESC | 5 | 5 | Card desviaciones | No | 7 días | `idx_production_submissions_org_deviation` (039) |

PostgREST: **sin OFFSET**. Embed de plantilla = join por `template_id` (FK), no N+1.

JS posterior (sobre esas filas, no sobre la tabla):

- Merge activity (8+5+5) → sort por timestamp → `slice(0, 10)`.
- `countCompletedSteps(checklist_progress)`: recorre JSON de 12 pasos en memoria (bytes, no IO).

### 2.3 Página `/dashboard` (además de `fetchDashboardData`)

| # | Origen | Tabla | Detalle | Frecuencia |
| --- | --- | --- | --- | --- |
| S1 | `requireOrganizationId` → `getSessionProfile` | `profiles` | `id, full_name, role, organization_id` WHERE `id = user` | 1 (cache compartido con layout) |
| S2 | `getSessionUser` | Auth | `auth.getUser()` | 1 (cache) |
| S3 | `getInsightTeaser` (no operator) | `ai_daily_insights` | headline, summary, overall_risk, generated_at, period_date; org; `period_date DESC LIMIT 1` | 0–1 |

No hay Server Action ni API route propia del Dashboard. No se llama Claude.

### 2.4 Layout `(dashboard)/layout.tsx` — corre en `/dashboard`

| # | Tabla | Columnas | Filtros | LIMIT | Filas | Uso |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | `organizations` | name, logo_url | `id = org` | 1 | 1 | Sidebar |
| L2 | `production_form_templates` | id, name, area | org + `is_active` | **ninguno** | todas las activas | `QuickCaptureFab` |

L2 no es KPI, pero **sí se ejecuta al cargar `/dashboard`**. Orgs con muchas plantillas = más filas e IO extra en cada navegación del shell.

### 2.5 Middleware (toda ruta autenticada, incluido `/dashboard`)

| # | Qué | Coste |
| --- | --- | --- |
| M1 | `get_my_profile` (DEFINER, 1 fila) | Bajo |
| M2 | Fallback `profiles` si falla RPC | 1 fila |
| M3 | `organizations` access_status / expires | 1 fila |

No toca tablas de negocio del Dashboard.

### 2.6 Cliente montado con el shell (no bloquea SSR, sí suma IO)

| # | Tabla | Detalle |
| --- | --- | --- |
| C1 | `notifications` | `select("*")` WHERE `user_id` ORDER created_at DESC **LIMIT 50** |
| C2 | Realtime `notifications` | INSERT/UPDATE del usuario |

Índice: `idx_notifications_user (user_id, read, created_at DESC)`.

### 2.7 Consumidores de `DashboardData` (0 queries)

| Componente | Props | ¿Supabase? |
| --- | --- | --- |
| `dashboard-view.tsx` | orquesta | No |
| `module-kpi-grid.tsx` | `moduleWidgets` (del RPC) | No |
| `metric-cards.tsx` | `metrics` (RPC) | No |
| `kpi-grid.tsx` | `kpis` (RPC formateado) | No |
| `system-score-ring.tsx` | `globalScore` | No |
| `trend-chart.tsx` | `monthlyTrend` (6 puntos RPC) | No |
| `nc-origin-chart.tsx` | `ncByOrigin` (RPC) | No |
| `today-tasks.tsx` | `tasks` (Q1+Q3 filtrados) | No |
| `this-week-section.tsx` | `thisWeek` (Q1, Q3, Q5, Q7 + `ncs.open`) | No |
| `activity-feed.tsx` | `activities` (Q2+Q4+Q6, máx. 10) | No |
| `daily-insight-teaser.tsx` | teaser S3 | No |

`plant-kiosk-view.tsx` **no** usa `fetchDashboardData`.

### 2.8 `kpi-widgets.ts`

| Función | ¿La usa `/dashboard`? |
| --- | --- |
| `buildModuleKpiWidgetsFromMetrics` | **Sí** — solo números del RPC |
| `computeProductionMonitoringWidget` / `computeCapaWidget` / `computeDocumentsWidget` / `computeAuditWidget` / `computeModuleKpiWidgets` | **No** — patrón clásico “array completo → COUNT en JS”. Código muerto en este route |

No hay que borrarlas en esta fase; no corren al cargar el Dashboard.

---

## 3. Queries de mayor riesgo

| Rank | Query | Por qué |
| --- | --- | --- |
| 1 | **R4 + R6** NC sin ventana de fechas | Dos (o más) seq/index scans de **todas** las NC del tenant. Crece lineal con el histórico. Es el patrón “recorrer todo para COUNT/GROUP BY”, aunque ya esté en Postgres. |
| 2 | **R5 fallback** | Si no hay cierres en 30 días, `AVG` sobre **todas** las NC cerradas. |
| 3 | **R14 `site_areas`** | DISTINCT sobre submissions de 90 días + templates. **Resultado no se pinta.** |
| 4 | **RPC como un solo jsonb** | ~12–18 subplanes por request. Cada uno re-evalúa RLS (`current_organization_id()`, `rbac_quality()`). Multiplica CPU aunque las listas estén acotadas. |
| 5 | **L2 plantillas sin LIMIT** | En cada hit al layout, no solo al Dashboard. |

R3 (submissions del mes) y R11 (docs published) son acotadas o de cardinalidad baja; no son el primer sospechoso salvo orgs enormes.

---

## 4. Datos históricos cargados innecesariamente

| Dato | ¿Hace falta para la UI actual? | Transferido a Next? |
| --- | --- | --- |
| Todas las NC (R4 `total`, R6 orígenes) | Sí para KPI “NCs registradas” = total acumulado y el gráfico por origen | No: solo agregados. El coste es **scan en Postgres**, no payload. |
| NC cerradas de toda la vida (R5 fallback) | Solo si no hay cierres en 30 días (mismo número de KPI) | 1 entero |
| Áreas 90 días (R14) | **No** — `siteAreas` sin UI | JSON de áreas |
| Filas Q3 que no son ni “due hoy/mañana” ni “nuevas 7 d” | El OR + LIMIT 15 puede traer filas que luego JS descarta para una de las dos listas | Hasta 15 filas pequeñas |
| Q5: 20 acciones para mostrar 10 | Extra 10 filas | 20 |
| Activity: 18 filas → se muestran 10 | Extra 8 | 18 |

**No** se bajan históricos de submissions/auditorías abiertas para KPIs (eso ya se corrigió en 039).

`haccp_products`: no se carga.

---

## 5. Cálculos que deberían (o ya) hacerse en PostgreSQL

| Cálculo | Hoy | ¿Migrar a PG? |
| --- | --- | --- |
| COUNTs monitoreo hoy/semana/mes | RPC R3 | Ya está |
| COUNTs NC open/overdue/critical/mes | RPC R4 | Ya está; **restringir** open a `status <> closed` y unificar con R6 |
| NC por origen | RPC R6 | Ya está; fusionar con R4 |
| Docs revisión overdue / 30 d | RPC R11 | Ya está |
| Últimas 2 auditorías + scores | RPC R10 | Ya está |
| Tendencia 6 meses | RPC R12–R13 | Ya está |
| Score / umbrales de color | JS sobre escalares | Dejar en JS (barato) |
| Tareas de hoy | JS filtra Q1/Q3 | Opcional: SQL `scheduled_date = today` y `due_date in (today, tomorrow)` — menos filas, misma UI |
| Cards “esta semana” | JS slice de Q3/Q5/Q7 | Opcional: 4 queries `LIMIT 5` específicas (nuevas, overdue, due-soon, desviaciones) |
| Activity feed | merge+sort JS | Opcional: `UNION ALL` + `ORDER BY ts LIMIT 10` en SQL |
| `site_areas` | RPC | **Dejar de calcularlo** en este RPC (sin consumidor) |
| `computeCapaWidget(ncs[])` | JS sobre arrays | No corre en `/dashboard` |

Candidato prioritario (el que pediste): **R4/R6/R5** — “recorrer muchas filas (en el servidor) → COUNT/GROUP/AVG”. Ya no cruzan a Next.js, pero **sí** agotan CPU/IO de Supabase.

---

## 6. Consultas que requieren LIMIT (o ya lo tienen)

| Query | LIMIT | ¿Falta? |
| --- | --- | --- |
| Q1–Q7 | 5–20 | No para no-explosión; se puede bajar a lo que la UI muestra (5 / 10) |
| R1, R10 | 1 / 2 | OK |
| S3 insight | 1 | OK |
| C1 notifications | 50 | OK para campana |
| **L2 templates** | **no** | **Sí** (o no cargarlas en `/dashboard` si el FAB las pide on-demand; eso sería cambio de cuándo se cargan, no de UI) |
| R4, R6 | n/a (COUNT/GROUP) | No es LIMIT; es **filtro** / un solo pass |
| R14 | DISTINCT 90 d | No es lista UI; eliminar del RPC |

---

## 7. N+1

No hay SELECT-en-loop en `data.ts` ni en los componentes.

| Sitio | Patrón |
| --- | --- |
| `Promise.all` 8 queries | Paralelo, no N+1. Son **8 round-trips** + 1 RPC pesado. |
| Embed `production_form_templates(name)` | Join, no N+1 |
| Layout + page `getSession*` | `cache()` — 1 perfil |
| `createClient()` repetido | Cliente, no query extra |

N+1 no es el problema. El problema es **scans repetidos de NC** dentro del RPC + **fan-out** de 8+2 HTTP a PostgREST.

---

## 8. RLS relacionado

No se propone cambiar policies. Implicación de coste: **cada** subquery del RPC re-ejecuta InitPlan (`current_organization_id()`, `rbac_quality()`). 041 ya evitó `rbac_same_org(columna)` por fila; el residual es **número de scans**, no el pred por fila.

| Tabla | SELECT en Dashboard | Policy (041) |
| --- | --- | --- |
| `haccp_plans` | RPC R1 | quality CRUD + same org |
| `production_form_templates` | RPC R2/R14, L2 | org (todos los roles leen) |
| `production_form_submissions` | RPC R3/R14, Q6/Q7 | same org |
| `nonconformities` | RPC R4–R6/R13, Q3/Q4 | SELECT: quality + same org (**operator no ve NC** → COUNTs 0, el RPC igual planifica) |
| `capa_actions` | RPC R7, Q5 | quality CRUD |
| `audits` | RPC R8–R10/R12, Q1/Q2 | quality CRUD |
| `controlled_documents` | RPC R11 | quality **o** operator si published/obsolete |
| `ai_daily_insights` | S3 | quality CRUD (operator no llama teaser) |
| `profiles` / `organizations` | sesión / layout / middleware | propias |
| `notifications` | C1 | user/org |

INVOKER es correcto: no hay bypass de tenant.

---

## 9. Índices existentes relevantes

No borrar ninguno sin `EXPLAIN` en el proyecto.

| Índice | Migración | Cubre |
| --- | --- | --- |
| `idx_haccp_plans_org_updated` | 030 | R1 |
| `idx_production_templates_org (org, is_active)` | 021 | R2, L2 |
| `idx_production_submissions_org (org, submitted_at DESC)` | 021 | R3, Q6, R14 |
| `idx_production_submissions_org_deviation` (parcial `has_deviation`) | 039 | Q7 |
| `idx_nonconformities_org` | 004 | R4/R6 fallback |
| `idx_nonconformities_status (org, status)` | 006 | open vs closed |
| `idx_nonconformities_due (org, due_date)` | 006 | overdue / Q3 due |
| `idx_nonconformities_org_detected` | 039 | Q4 |
| `idx_nonconformities_org_created` | 039 | R13, this/last month |
| `idx_nonconformities_org_closed` (parcial closed) | 039 | R5 30 d |
| `idx_nonconformities_org_open_detected` (parcial ≠ closed) | 042 | Q3 / COUNTs open — **si 042 está aplicada** |
| `idx_capa_actions_org_open_due` (parcial ≠ completed) | 039 | R7, Q5 |
| `idx_audits_scheduled (org, scheduled_date)` | 023 | Q1, R8 |
| `idx_audits_status (org, status)` | 005 | Q2 |
| `idx_audits_org_completed` (parcial completed) | 039 | R9, R10, Q2, R12 |
| `idx_controlled_documents_org_published_review` | 039 | R11 |
| `idx_ai_daily_insights_org_generated` | 033 | S3 (mejor si hay índice por `period_date`; UNIQUE org+fecha ya existe) |
| `idx_notifications_user` | 007 | C1 |

Hueco menor (no crear ahora): `nonconformities (organization_id, origin)` ayudaría a R6 si el GROUP BY duele; primero unificar R4+R6.

---

## 10. Plan priorizado (sin implementar)

### P0 — más CPU/IO/filas en Supabase, misma UI

1. **Un solo pass de NC en `get_dashboard_metrics`**  
   Hoy R4 y R6 (y a veces R5) leen la misma tabla. Un `FILTER` + `GROUP BY` en una subquery mantiene `total`, open/overdue/critical, this/last month y `nc_by_origin`. No cambia números.

2. **Sacar `site_areas` del RPC del Dashboard**  
   Ningún widget lo usa. Elimina el DISTINCT de 90 días de submissions + UNION de templates. El kiosco no depende de este campo.

3. **Acotar el fallback de `avg_closure_days`**  
   Mantener los 30 días. Si no hay filas, devolver `null` (el KPI ya muestra “—”). Evita el scan de **todas** las NC cerradas. Único matiz: orgs sin cierres recientes pasarían de un promedio histórico a “—” — mismo componente, valor distinto. Si se quiere el número histórico, poner un tope (`closed_at >= now() - interval '365 days'`) en lugar de “todas”.

4. **No cargar todas las plantillas en el layout de `/dashboard`**  
   L2 es el unbounded más claro del HTML del Dashboard. Opciones que no quitan el FAB: LIMIT razonable, o cargar plantillas al abrir el FAB (mismo diseño, distinto momento).

### P1 — menos round-trips / menos filas, misma pantalla

5. **Listas al tamaño de la UI**  
   Q3: dos queries `LIMIT 5` (nuevas 7 d / due hoy–mañana) en vez de 15 + filtros.  
   Q5: dos `LIMIT 5` (overdue / due-soon) en vez de 20.  
   Activity: un `UNION ALL … LIMIT 10` o recortar Q2/Q4/Q6 a lo mínimo.  
   Los counts de las cards “esta semana” hoy son **longitudes de esas listas** (máx. 5), no COUNTs SQL: hay que respetar eso si no se quiere cambiar el número mostrado.

6. **Mover Q1–Q7 al mismo RPC (json de listas)**  
   Una ida a Postgres en lugar de 1 RPC + 7 REST. Misma RLS INVOKER. Baja latencia y planificación repetida.

7. **`EXPLAIN (ANALYZE, BUFFERS)` en el proyecto** sobre `SELECT get_dashboard_metrics();`  
   Confirma si R4/R6 son el top de la advertencia de compute antes de tocar índices.

### P2 — menor

8. No llamar funciones muertas de `kpi-widgets.ts` desde ningún sitio nuevo.  
9. `select("*")` de la campana → columnas usadas (no es el Dashboard SSR).  
10. No añadir índices hasta ver EXPLAIN; no dropear los de 039/042.  
11. Operator: el RPC igual se ejecuta entero (RLS vacía NC/auditorías). Un early-return por rol cambiaría poco el producto y no es P0.

---

## Qué necesita filas vs COUNT

| Superficie | Necesita |
| --- | --- |
| Widgets módulo, semáforo, KPIs, score, tendencia, orígenes | **COUNT / AVG / últimos 2** (ya RPC) |
| “NC abiertas totales” | **COUNT** (`ncs.open`) |
| Tareas de hoy | **últimos N** (auditorías de hoy, NC que vencen hoy/mañana) — filas |
| Esta semana (4 cards) | **últimos 5** por categoría — filas; el número grande de NC abiertas es COUNT |
| Activity | **últimos 10** mezclados — filas |
| Insight | **1** fila liviana |
| Áreas de sitio | **nada** en esta UI |
| Plantillas FAB | lista de activas (no COUNT); no hace falta en el critical path del Dashboard |

---

## Qué no hacer

- No quitar RLS ni pasar el RPC a DEFINER.  
- No borrar índices de 039/042 sin EXPLAIN.  
- No volver a bajar `nonconformities` / `controlled_documents` / submissions del mes a Next para contar en JS (`computeModuleKpiWidgets`).  
- No consultar `haccp_products`.  
- No eliminar cards, activity ni insight.

---

## Conclusión

El Dashboard **ya no** implementa “SELECT * histórico → Next → COUNT”. Ese trabajo está en `get_dashboard_metrics`. La advertencia de compute encaja más con **ese RPC** (sobre todo **dos+ scans de todas las NC** + `site_areas` de 90 días + fallback de cierres) y con **plantillas sin LIMIT en el layout**, no con las siete listas acotadas.

P0 = unificar/acotar esas agregaciones en SQL y dejar de calcular `site_areas` para una prop que nadie renderiza.  
P1 = menos round-trips y listas del tamaño exacto de la UI.  
P2 = higiene.

No se implementó nada en esta pasada.
