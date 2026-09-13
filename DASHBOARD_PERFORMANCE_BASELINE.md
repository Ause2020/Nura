# Baseline técnico — `get_dashboard_metrics()`

Fecha: 2026-09-12  
Fase: **solo diagnóstico**. No se modificó código, SQL, migraciones, RLS, índices ni RPCs.

**EXPLAIN no se ejecutó.** Este entorno no tiene conexión a Postgres (no hay `.env.local`, no hay MCP de Supabase, no hay `DATABASE_URL`). Los tiempos, buffers y tipos de scan **no se inventan**. El SQL listo para el SQL Editor está en §9.

---

## 1. Estado actual

| Ítem | Hecho |
| --- | --- |
| Definición | `supabase/migrations/039_dashboard_metrics.sql` líneas 37–299 |
| Firma | `public.get_dashboard_metrics() RETURNS jsonb` |
| Lenguaje | `plpgsql`, `STABLE`, `SECURITY INVOKER`, `search_path = public` |
| Grants | `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO authenticated` |
| Caller | `lib/dashboard/data.ts` → `supabase.rpc("get_dashboard_metrics")` (1 vez por carga de `/dashboard`) |
| Evaluación | Un solo `SELECT jsonb_build_object(...)`. **Todas** las claves se evalúan siempre (es una llamada a función). La única excepción de cortocircuito es el `COALESCE` **interno** de `avg_closure_days` (§7). |
| Org | `SELECT organization_id FROM profiles WHERE id = auth.uid()` — 1 fila. Si NULL → `{"ok":false,"reason":"no_organization"}` y **no** corre el resto. |
| Fechas | `v_today` = `timezone('utc', now())::date`. Semana = `date_trunc('week')` (lunes ISO). `v_from` = `LEAST(week_start, month_start)` ≈ 1 mes de submissions (a veces 1–2 días del mes anterior). |

Hipótesis a validar con EXPLAIN (no medida): el coste de CPU/IO del Dashboard está dominado por **accesos repetidos a `nonconformities` sin ventana de fechas** (R4 + R6 + laterals R13), no por las 7 listas PostgREST de `data.ts`.

---

## 2. RPC analizado — mapa de subqueries

Numeración alineada con `DASHBOARD_PERFORMANCE_AUDIT.md`.

| ID | Clave JSON | Tablas | Qué calcula | Ventana |
| --- | --- | --- | --- | --- |
| R0 | — | `profiles` | `v_org` | 1 fila |
| R1 | `haccp_checklist_progress` | `haccp_plans` | JSON checklist | 1 plan (`ORDER BY updated_at DESC LIMIT 1`) |
| R2 | `records_templates_active` | `production_form_templates` | `COUNT(*)` activas | todas las activas del tenant |
| R3 | `submissions` | `production_form_submissions` | 6 `COUNT FILTER` (mes/hoy/semana × total/ok) | `submitted_at >= v_from` |
| **R4** | `ncs` | `nonconformities` | 8 agregados `COUNT` / `COUNT FILTER` | **todo el tenant** |
| **R5** | `avg_closure_days` | `nonconformities` | `AVG` días cierre | 30 días; fallback **todo lo cerrado** |
| **R6** | `nc_by_origin` | `nonconformities` | `GROUP BY origin, COUNT` | **todo el tenant** |
| R7 | `overdue_capa_actions` | `capa_actions` | `COUNT(*)` | abiertas + `due_date < hoy` |
| R8 | `audits_month` | `audits` | scheduled + completed del mes | `scheduled_date` en el mes |
| R9 | `audit_compliance` | `audits` | `AVG(compliance_score)` mes / mes anterior | completed, 2 meses |
| R10 | `last_audits` | `audits` | 2 filas | completed `LIMIT 2` |
| R11 | `documents` | `controlled_documents` | 2 `COUNT FILTER` revisión | `status = published` |
| R12 | `monthly[].audit_avg` | `audits` | 6 `LATERAL AVG` | 1 mes cada uno × 6 |
| R13 | `monthly[].nc_count` | `nonconformities` | 6 `LATERAL COUNT` | 1 mes `created_at` × 6 |
| **R14** | `site_areas` | templates ∪ submissions | `DISTINCT TRIM(area)` | activas + submissions **90 días** |

`jsonb_build_object` **siempre** ejecuta R1–R14 (más R0). No hay `IF` que salte `site_areas` ni `nc_by_origin`.

---

## 3. Scans por tabla (accesos lógicos dentro del RPC)

“Acceso” = subquery / `FROM` distinto. No es un EXPLAIN: un acceso puede ser Index Scan o Seq Scan.

| Tabla | Nº de accesos | Tipo lógico | Filtro |
| --- | --- | --- | --- |
| `nonconformities` | **9 siempre**, **10 si R5 cae al fallback** | ver desglose abajo | org; a veces status/fecha |
| `production_form_submissions` | **2** | R3 agregado; R14 DISTINCT | R3: org + `submitted_at >= v_from`; R14: org + 90 d + area no vacía |
| `production_form_templates` | **2** | R2 `COUNT`; R14 `SELECT area` | org + `is_active` (+ area no vacía en R14) |
| `audits` | **9** | R8, R9, R10, R12 × 6 | org; R8 mes calendar; R9/R10/R12 completed + fechas |
| `capa_actions` | **1** | `COUNT` | org + `status <> completed` + `due_date < hoy` |
| `controlled_documents` | **1** | 2 `COUNT FILTER` | org + `status = published` |
| `haccp_plans` | **1** | `LIMIT 1` | org |
| `profiles` | **1** | lookup | `id = auth.uid()` |

### `nonconformities` — ¿se recorre varias veces?

**Sí, varias veces la tabla. No, no una vez por métrica de R4.**

| Métrica | ¿Scan propio? | Dónde |
| --- | --- | --- |
| `total` | No — mismo `FROM` que el resto de R4 | R4 `COUNT(*)` |
| `open` | No — `COUNT(*) FILTER (status <> 'closed')` | R4 |
| `overdue` | No — `FILTER` due_date / status | R4 |
| `critical` / `critical_or_overdue` / `due_soon_48h` | No — `FILTER` | R4 |
| `this_month` | No — `FILTER` `created_at` | R4 |
| `last_month` | No — `FILTER` `created_at` | R4 |
| `avg_closure_days` | **Sí, scan(s) aparte** | R5a siempre (cerradas 30 d); R5b solo si R5a es NULL |
| `origin` (`nc_by_origin`) | **Sí, scan aparte de todo el tenant** | R6 `GROUP BY origin` |
| tendencia 6 meses | **Sí, 6 scans acotados** | R13 `LATERAL` por mes |

Conclusión estructural:

- R4 = **un** pass sobre **todas** las NC del tenant; de ahí salen total/open/overdue/critical/meses.
- R6 = **otro** pass sobre **las mismas filas** solo para agrupar origen.
- R5 = pass(es) sobre **cerradas** (30 d, y a veces todas).
- R13 = 6 passes chicos (1 mes de `created_at` cada uno).

Unificar R4+R6 sería el mismo resultado con un acceso menos a la tabla completa. Eso no está medido en buffers todavía.

---

## 4. Costos observados

**Ninguno.** No hay `EXPLAIN` real en esta sesión.

Lo que **no** se debe concluir todavía:

- Que R4 es “caro” solo porque lee “muchas filas”. Si el tenant tiene 80 NC y el índice cabe en cache, `shared read` puede ser 0 y el tiempo irrelevante frente a 9 `LATERAL` de auditorías.
- Que R14 es el peor solo porque mira 90 días. Puede ser barato si hay pocas submissions.

Lo que **sí** se puede afirmar sin runtime:

- Hay **duplicación de trabajo** (R4 y R6 leen el mismo conjunto).
- R14 corre **siempre** y su resultado **no se pinta** (§6).
- R5b puede ser el único scan verdaderamente unbounded de cerradas, y **solo si** no hay cierres en 30 días.

---

## 5. R4 / R5 / R6 / R14

### R4 — `ncs` (líneas 117–154)

```sql
FROM public.nonconformities n
WHERE n.organization_id = v_org
-- sin status, sin fecha
```

Un `Aggregate` con 8 `FILTER`. Postgres **tiene** que ver cada fila del tenant (o cada fila del índice que cubra org) para `COUNT(*)` = total acumulado.

Índices candidatos (existen; el plan real lo dirá el EXPLAIN): `idx_nonconformities_org`, `idx_nonconformities_status`, `idx_nonconformities_org_created`. Un parcial “solo abiertas” **no** basta para `total` ni `this_month` (incluye cerradas).

### R5 — `avg_closure_days` (líneas 155–176)

Ver §7.

### R6 — `nc_by_origin` (líneas 177–185)

```sql
SELECT n.origin, COUNT(*)::int
FROM public.nonconformities n
WHERE n.organization_id = v_org
GROUP BY n.origin
```

Mismo conjunto que R4. Esperable: `HashAggregate` o `GroupAggregate` tras Index/Seq Scan por org. **No hay** `LIMIT`.

### R14 — `site_areas` (líneas 273–293)

Ver §6.

---

## 6. `site_areas`

| Pregunta | Respuesta |
| --- | --- |
| Dónde se calcula | RPC 039, clave `'site_areas'` (R14) |
| Tablas | `production_form_templates` (activas, `area` no vacía) **UNION** `production_form_submissions` (`submitted_at >= now() - 90 days`, `area` no vacía) → `DISTINCT TRIM(area)` → `jsonb_agg` |
| Volumen | Todas las plantillas activas con área + **todas** las submissions del tenant con área en 90 días. No hay LIMIT. `UNION` implica sort/hash de dedup. |
| Quién lo consume | `parseDashboardMetrics` → `aggregates.site_areas` → `fetchDashboardData` asigna `siteAreas`. **Cero** lecturas en `components/dashboard/*`. Kiosco usa `get_kiosk_metrics` (040), **sin** `site_areas`. `collectSiteAreas` en `kpi-widgets.ts` no se llama desde `/dashboard`. |

**Candidato P0 confirmado:** calcular R14 en cada carga del Dashboard no cambia un pixel. Quitar o no calcularlo no altera funcionalidad visible. No se implementa en esta fase.

---

## 7. `avg_closure_days`

Implementación (simplificada):

```text
COALESCE(
  AVG(días) WHERE status='closed' AND closed_at >= now() - 30 days,
  AVG(días) WHERE status='closed' AND closed_at IS NOT NULL   -- sin tope
)
```

`COALESCE` en PostgreSQL **no evalúa** el segundo argumento si el primero no es NULL.

| Caso | Qué corre | Filas máximas |
| --- | --- | --- |
| ≥1 NC cerrada en 30 días | Solo R5a | Cerradas de 30 días |
| 0 cerradas en 30 días (AVG vacío = NULL) | R5a **y** R5b | R5b = **todas** las NC cerradas del tenant, de cualquier año |
| Ninguna NC cerrada nunca | R5a + R5b, ambos NULL → KPI `"—"` | 0 filas útiles |

Rango actual “reciente”: **30 días** (`closed_at`).  
Fallback: **histórico completo**.  
UI: `kpis` → “Tiempo cierre CAPA” = `"N días"` o `"—"`.

Tope razonable **sin cambiar el producto en el caso común** (hay cierres en 30 días): no tocar R5a. El único cambio de número sería orgs **sin** cierres en 30 días que hoy ven un promedio de hace años; pasarían a `"—"` o a un tope (p. ej. 365 días). **No se cambia ahora.**

Índice: `idx_nonconformities_org_closed` (parcial `status = 'closed' AND closed_at IS NOT NULL`).

---

## 8. Plantillas en `/dashboard`

Hay **tres** caminos distintos. No confundirlos.

### A. RPC R2 — critical path SSR del Dashboard

- `COUNT(*)` de `production_form_templates` activas.
- 1 número → `metrics.recordsTemplatesActive`.
- No envía filas de plantilla al cliente.

### B. RPC R14 — critical path SSR, resultado no usado

- Vuelve a leer plantillas activas (solo `area`).
- Ver §6.

### C. Layout `app/(dashboard)/layout.tsx` — critical path SSR del **shell**

```ts
.from("production_form_templates")
.select("id, name, area")
.eq("organization_id", orgId)
.eq("is_active", true)
.order("name")
// sin LIMIT
```

| Pregunta | Respuesta |
| --- | --- |
| ¿Critical path de `/dashboard`? | **Sí.** El layout envuelve la page. Esta query corre **antes/en paralelo** al RPC, también en desktop. |
| ¿Cuántas filas? | Todas las activas. No hay tope. Típico: pocas (un dígito / decenas). Peor caso: cientos si la org crea una plantilla por línea/turno. |
| ¿Quién las usa? | Solo `QuickCaptureFab` → `QuickRegistro` (select de plantilla). El FAB es **`md:hidden`**: en desktop se **consulta igual** y no se muestra. |
| ¿On-demand? | El FAB abre el modal al tap. `QuickRegistro` no fetch: recibe props. Se podría fetch al elegir “Monitoreo” **sin cambiar la UI** (misma lista completa). No implementado. |
| ¿LIMIT que preserve función? | Un `LIMIT` arbitrario **ocultaría** plantillas en el selector (`templates.map`). Para no cambiar producto: o todas, o paginar/buscar (eso sí cambia diseño). `LIMIT` solo es fiel si se garantiza que nunca hay más de N activas. |

Además, Q6/Q7 de `data.ts` hacen embed `production_form_templates(name)` para **8+5** submissions (join, no lista de plantillas).

---

## 9. EXPLAIN — no corrido + SQL para el Editor

### Por qué `EXPLAIN` de la función sola suele ser insuficiente

`EXPLAIN ANALYZE SELECT public.get_dashboard_metrics();` en plpgsql suele mostrar **un nodo `Function Scan` / `Result`** con el tiempo **total**, sin desglosar R4/R5/R6. Los buffers internos a veces no aparecen.

Hace falta: o `auto_explain` de statements anidados (puede estar deshabilitado en Supabase), o **EXPLAIN de cada subquery** con el `organization_id` de la sesión.

### 9.1 Paquete A — función completa (tiempo total)

Ejecutar **autenticado como un usuario de una org representativa** (SQL Editor con rol authenticated, o “Run as user”). Con `service_role`, `auth.uid()` es NULL y el RPC sale en `no_organization` (baseline inútil).

```sql
-- A1. Confirmar sesión
SELECT auth.uid() AS uid, organization_id
FROM public.profiles
WHERE id = auth.uid();

-- A2. Tiempo y buffers del RPC entero (puede NO expandir subqueries)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT public.get_dashboard_metrics();
```

### 9.2 Paquete B — `auto_explain` (si el proyecto lo permite)

```sql
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 0;
SET auto_explain.log_analyze = true;
SET auto_explain.log_buffers = true;
SET auto_explain.log_nested_statements = true;
SET auto_explain.log_timing = true;

SELECT public.get_dashboard_metrics();
```

Luego leer **Logs** de Postgres (no solo el result set). Si `LOAD` falla: ignorar B, usar C.

### 9.3 Paquete C — cada acceso (el que sirve para R4/R5/R6/R14)

Sustituye nada: usa `auth.uid()` igual que el RPC.

```sql
-- C0. Constantes (mismas que el RPC)
WITH ctx AS (
  SELECT
    p.organization_id AS org,
    (timezone('utc', now()))::date AS today,
    date_trunc('month', (timezone('utc', now()))::date)::date AS month_start,
    (date_trunc('month', (timezone('utc', now()))::date) + interval '1 month' - interval '1 day')::date AS month_end,
    (date_trunc('month', (timezone('utc', now()))::date) - interval '1 month')::date AS last_month_start,
    date_trunc('week', (timezone('utc', now()))::date)::date AS week_start
  FROM public.profiles p
  WHERE p.id = auth.uid()
)
SELECT * FROM ctx;

-- C-R4  (todas las NC del tenant, 8 FILTER)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE n.status <> 'closed')::int AS open,
  COUNT(*) FILTER (
    WHERE n.status <> 'closed' AND n.due_date IS NOT NULL
      AND n.due_date < (timezone('utc', now()))::date
  )::int AS overdue,
  COUNT(*) FILTER (WHERE n.status <> 'closed' AND n.severity = 'critical')::int AS critical_open,
  COUNT(*) FILTER (
    WHERE n.created_at >= date_trunc('month', timezone('utc', now()))
      AND n.created_at < date_trunc('month', timezone('utc', now())) + interval '1 month'
  )::int AS this_month,
  COUNT(*) FILTER (
    WHERE n.created_at >= date_trunc('month', timezone('utc', now())) - interval '1 month'
      AND n.created_at < date_trunc('month', timezone('utc', now()))
  )::int AS last_month
FROM public.nonconformities n
WHERE n.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid());

-- C-R5a  (cierres 30 días)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT AVG(GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c.closed_at - c.detected_at)) / 86400)))
FROM public.nonconformities c
WHERE c.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND c.status = 'closed'
  AND c.closed_at IS NOT NULL
  AND c.closed_at >= timezone('utc', now()) - interval '30 days';

-- C-R5b  (fallback histórico — solo relevante si R5a no tiene filas)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT AVG(GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c.closed_at - c.detected_at)) / 86400)))
FROM public.nonconformities c
WHERE c.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND c.status = 'closed'
  AND c.closed_at IS NOT NULL;

-- C-R6
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT n.origin, COUNT(*)::int AS cnt
FROM public.nonconformities n
WHERE n.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
GROUP BY n.origin;

-- C-R14
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT TRIM(u.area) AS area
FROM (
  SELECT t.area
  FROM public.production_form_templates t
  WHERE t.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND t.is_active AND t.area IS NOT NULL AND TRIM(t.area) <> ''
  UNION
  SELECT s.area
  FROM public.production_form_submissions s
  WHERE s.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND s.submitted_at >= timezone('utc', now()) - interval '90 days'
    AND s.area IS NOT NULL AND TRIM(s.area) <> ''
) u;

-- C-R3 (control: submissions del mes)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT COUNT(*)
FROM public.production_form_submissions s
WHERE s.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND s.submitted_at >= LEAST(
    date_trunc('week', (timezone('utc', now()))::date),
    date_trunc('month', (timezone('utc', now()))::date)
  );
```

### Qué mirar en cada plan (sin adivinar)

| Campo en el plan | Significado |
| --- | --- |
| `Execution Time` | Tiempo real de esa subquery (ms). Comparar R4 vs R6 vs R14 vs R5b. |
| `Planning Time` | Si es alto × 14 subqueries, el fan-out del `jsonb_build_object` importa. |
| `actual rows` vs `Plan Rows` | Estimación mala → seq scan o hash equivocado. |
| `Shared Hit Blocks` | Lecturas que **no** tocaron disco (cache). Alto hit + poco read = “muchas filas” baratas. |
| `Shared Read Blocks` | Lecturas a almacenamiento. Esto es lo que correlaciona con la advertencia de compute/IO. |
| `Temp Read/Written` | Sort/hash que no cupo en `work_mem` (UNION de R14, agregados grandes). |
| `Seq Scan` | Lectura completa de la relación (o por RLS). Malo si `actual rows` y `shared read` son altos. |
| `Index Scan` / `Index Only Scan` | Acceso por índice. Ver `Rows Removed by Filter`. |
| `Bitmap Heap Scan` | OR / rangos; mirar recheck. |
| `HashAggregate` / `GroupAggregate` | R6 y COUNTs. Hash usa memoria; Group necesita sort. |
| `Sort` | `ORDER BY` de R1/R10 o `UNION` de R14. |

Regla: una operación es cara aquí si **`Execution Time` o `Shared Read Blocks`** destacan frente a las demás, no solo si `actual rows` es grande con todo en `Hit`.

Pegar los planes de A2 + C-R4 + C-R5a + C-R5b + C-R6 + C-R14 en este archivo (o en un follow-up) cuando se tengan.

---

## 10. Top 5 operaciones más costosas

**Ranking estructural (no cronometrado).** Orden a confirmar con el paquete C.

| # | Operación | Por qué está aquí | Qué decidirá el EXPLAIN |
| --- | --- | --- | --- |
| 1 | **R4** scan de **todas** las NC | `COUNT(*)` sin fecha; se ejecuta **siempre** | `shared read` vs hit; Seq vs Index |
| 2 | **R6** segundo scan de **todas** las NC | Mismo conjunto que R4 + `GROUP BY` | Si el tiempo ≈ R4, es duplicación pura |
| 3 | **R13 × 6** laterals NC por mes | 6 planes extra; cada uno acotado a 1 mes | Planning + 6 × read; puede ganar a R6 si el índice de `created_at` es malo |
| 4 | **R5b** (condicional) | Histórico cerrado sin tope | 0 ms si hay cierres en 30 d; pico si no |
| 5 | **R14** UNION 90 d + templates | Siempre on; UI no lo usa | Si `shared read` de submissions 90 d es alto → P0 fácil |

R12 (6 laterals de audits) puede colarse en el top 5 si hay muchas auditorías completed; R3 suele ser menor (≤1 mes).

Hasta no tener buffers, **no** se afirma cuál de 1–5 gasta más compute en producción.

---

## 11. Recomendación de implementación (aún no hacer)

Cuando existan los planes C:

1. Si R4 y R6 tienen `actual rows` iguales y tiempos similares → **P0: un solo pass** (FILTER + `jsonb_agg` de orígenes). Misma UI.
2. Si R14 tiene `Shared Read` material → **P0: no calcular `site_areas`** en este RPC. Confirmado sin consumidor.
3. Si R5b no aparece en el log (R5a no NULL) → no urgente. Si R5b lee años de cerradas → tope 365 d o `"—"` solo en ese caso.
4. Layout de plantillas: no es el RPC, pero **sí** está en el SSR de `/dashboard`. On-demand al abrir “Monitoreo” preserva la lista completa; `LIMIT` en el layout **no** es fiel.
5. No añadir índices hasta ver Seq Scan + `Shared Read` altos en C-R4/C-R6.
6. No tocar RLS. No pasar el RPC a DEFINER.

Siguiente paso de esta línea: pegar la salida del SQL Editor en un follow-up; **después** implementar P0.

---

## Apéndice — consumidores de cada clave del RPC

| Clave | ¿UI del Dashboard? |
| --- | --- |
| `haccp_checklist_progress` | Score / semáforo (pasos 0–12) |
| `records_templates_active` | Metric card |
| `submissions` | Widgets monitoreo + KPI mes |
| `ncs` | Widgets CAPA, semáforo, KPI total, “NC abiertas totales” |
| `avg_closure_days` | KPI “Tiempo cierre CAPA” |
| `nc_by_origin` | `NcOriginChart` |
| `overdue_capa_actions` | Metric card |
| `audits_month` | Metric cards + score |
| `audit_compliance` | KPI conformidad |
| `last_audits` | Widget “Última auditoría” |
| `documents` | Widget documentos |
| `monthly` | `TrendChart` |
| `site_areas` | **Ninguno** |
