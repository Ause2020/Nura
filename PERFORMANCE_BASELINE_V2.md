# Baseline de rendimiento v2 — Nura / Supabase

Fecha: 2026-09-12  
Fase: **solo diagnóstico**. No se modificó código, SQL, migraciones, RLS, índices ni RPCs.

---

## 1. Executive summary

El EXPLAIN previo de R4/R5/R6/R14 **no mide una organización real**. `auth.uid()` no resolvió `profiles.organization_id`, así que esas subqueries filtraron contra NULL y devolvieron ~0.2–1.0 ms sobre **cero filas de tenant**.

Este entorno **tampoco** puede reproducir un usuario autenticado. Hay URL + `service_role` en `.env.local`, no hay JWT de usuario ni MCP SQL. `service_role` **no** se usó como si fuera `authenticated`.

Lo que sí se midió (REST, service role, solo conteos y existencia de RPCs) en el proyecto apuntado por `.env.local`:

| Hecho | Valor |
| --- | --- |
| Organizaciones / perfiles | 1 / 1 |
| Filas de negocio | 0–2 por tabla (ver §3) |
| `get_dashboard_metrics()` | **404** — no está en el schema cache de PostgREST |
| `get_kiosk_metrics()` | **404** — igual |
| `consume_rate_limits` / `try_acquire_job_lock` | **404** — 037 y 045 no expuestas / no aplicadas |
| `get_my_profile` / `current_organization_id` | **sí existen** |

Conclusión: **en este proyecto el RPC del Dashboard no puede ser el origen actual de CPU**. No está desplegado y las tablas caben en una página. Los tiempos R4–R14 del EXPLAIN vacío no se pueden extrapolar.

Si la alerta de Supabase viene de **este** proyecto, hay que buscar frecuencia de requests (middleware, kiosco, writes HACCP, Realtime), no scans históricos de NC.

Si la alerta viene de **otro** proyecto (más datos + 039 aplicada), este baseline no lo cubre. La única forma de saberlo es Query Performance / `pg_stat_statements` en el proyecto que alertó.

---

## 2. Estado real del benchmark

### 2.1 Autenticación

| Intento | Resultado |
| --- | --- |
| MCP Postgres / Supabase | No hay namespace |
| Conexión `DATABASE_URL` | No existe en `.env.local` |
| JWT de usuario | No hay sesión reproducible |
| SQL Editor “Run as user” | No disponible desde Cursor |
| Anon + RPC dashboard | 404 función inexistente |
| Service role + RPC dashboard | 404; además `auth.uid()` sería NULL |

`get_my_profile` con service role devolvió `[]`. `current_organization_id` devolvió `null`. Eso confirma que **no hay contexto de usuario** en estas llamadas. No se inventó un `organization_id` para forzar EXPLAIN.

### 2.2 Qué significa el EXPLAIN ya corrido

Los ~0.2 ms de R4/R5/R6 y ~0.97 ms de R14 son **planning + scan de predicado vacío**, no coste de tenant.

| Qué vimos | Qué **no** vimos |
| --- | --- |
| Planning Time de subqueries sueltas | Planning del `jsonb_build_object` completo |
| Execution Time sobre 0 filas de org | Execution Time con 1 org real |
| (probablemente) shared hit de catálogo | Shared read de heap/índices de NC |

**No hay** Planning Time / Execution Time / buffers / Seq vs Index del RPC completo. No se inventan.

### 2.3 Migraciones vivas en el proyecto de `.env.local`

Aplicadas (inferido por RPC 200): helpers de perfil / org (`get_my_profile`, `current_organization_id`).

**No** en schema cache de PostgREST:

- `039_dashboard_metrics.sql` → `get_dashboard_metrics`
- `040_kiosk_metrics.sql` → `get_kiosk_metrics`
- `037_rate_limiting.sql` → `consume_rate_limits`
- `045_background_job_lock.sql` → `try_acquire_job_lock`

El código actual de `/dashboard` **exige** 039 (`throw` si falta el RPC). En este proyecto esa página no puede servir KPIs. El análisis R1–R14 de abajo es del SQL del repo, no de una función que esté ejecutándose aquí.

---

## 3. Tamaño de tablas

Fuente: `HEAD` + `Prefer: count=exact` con **service role** (bypass RLS). Sin IDs, emails ni filas.

| Tabla | Filas globales | Orgs con filas | min / p50 / max por org |
| --- | ---: | ---: | --- |
| `nonconformities` | 1 | 1 | 1 / 1 / 1 |
| `production_form_submissions` | 1 | 1 | 1 / 1 / 1 |
| `production_form_templates` | 1 | 1 | 1 / 1 / 1 |
| `audits` | 1 | 1 | 1 / 1 / 1 |
| `capa_actions` | 0 | 0 | 0 |
| `controlled_documents` | 0 | 0 | 0 |
| `haccp_plans` | 1 | 1 | 1 / 1 / 1 |
| `profiles` | 1 | 1 | 1 / 1 / 1 |
| `organizations` | 1 (1 `active`) | — | — |
| `notifications` | 1 | 1 | 1 / 1 / 1 |
| `haccp_diagrams` | 2 | — | — |
| `haccp_step_data` | 2 | — | — |
| `production_form_submission_values` | 1 | — | — |
| `ai_daily_insights` | 1 | — | — |
| `haccp_plan_hazards` | 1 | — | — |
| `haccp_ccp_decisions` | 1 | — | — |
| `profiles` con `organization_id` | 1 | — | — |

Volumen: **demo / un solo tenant mínimo**. Un `COUNT(*)` de todas las NC del tenant procesa **1 fila**. R4+R6+R5+R13 juntos no pueden saturar CPU en este estado.

`rate_limit_windows` no está en el schema cache (REVOKE de API / 037 no aplicada). Un HEAD inicial dio 504; el GET siguiente fue 404 PGRST205. **No** se interpreta como tabla grande.

---

## 4. Benchmark del RPC

### 4.1 `EXPLAIN` de `get_dashboard_metrics()` — no ejecutado

Motivos, en orden:

1. La función **no existe** en el schema cache de este proyecto.
2. Aunque existiera, service role / anon no aportan `auth.uid()` de un perfil. El cuerpo sale en `no_organization` y **no corre R1–R14**.
3. No hay SQL wire (`EXPLAIN` directo).

Un `EXPLAIN ANALYZE SELECT public.get_dashboard_metrics();` en plpgsql, cuando la función exista, suele mostrar **un** `Function Scan` con tiempo total. No desglosa R4/R6. Para el interior hace falta `auto_explain` o el paquete C de subqueries **con un usuario real**.

### 4.2 Métricas pedidas — estado

| Métrica | Observada aquí |
| --- | --- |
| Planning Time (RPC) | No |
| Execution Time (RPC) | No |
| Shared hit / read / temp | No |
| Seq / Index / Index Only Scan | No |
| Rows Removed by Filter | No |
| Loops | No |
| Consulta que concentra el coste | **No medida.** En este proyecto la función no corre. |

SQL listo para el Editor (usuario autenticado **de la org con datos**, rol `authenticated` o “Run as user”): ver §15.

---

## 5. Análisis R1–R14

Definición en repo: `supabase/migrations/039_dashboard_metrics.sql`. `SECURITY INVOKER`, `STABLE`. Org = `profiles.organization_id` donde `id = auth.uid()`.

Índice en la tabla = **candidato definido en migraciones**. **Uso no confirmado** (sin plan autenticado).

| Sección | Tabla(s) | Scans | Filtro temporal | Índice candidato | Riesgo |
| --- | --- | ---: | --- | --- | --- |
| R0 | `profiles` | 1 | no | PK `id` | Bajo. 1 fila. |
| R1 | `haccp_plans` | 1 | no | `idx_haccp_plans_org_updated` | Bajo. `ORDER BY updated_at DESC LIMIT 1`. Crece con planes/org, no con histórico NC. |
| R2 | `production_form_templates` | 1 | no (`is_active`) | `idx_production_templates_org` | Lineal con plantillas activas. Hoy 1. |
| R3 | `production_form_submissions` | 1 | `submitted_at >= LEAST(week, month)` | `idx_production_submissions_org` | Lineal con submissions del ~mes. |
| **R4** | `nonconformities` | 1 | **ninguno** | `idx_nonconformities_org` / `(org, created_at)` | **Lineal con todas las NC del tenant.** Un pass, 8 `FILTER`. |
| R5a | `nonconformities` | 1 | cerradas, `closed_at` 30 d | `idx_nonconformities_org_closed` | Acotado. |
| R5b | `nonconformities` | 0 o 1 | cerradas, **sin tope** | mismo parcial | Solo si R5a es NULL. Histórico cerrado. |
| **R6** | `nonconformities` | 1 | **ninguno** | `idx_nonconformities_org` | **Segundo pass del mismo conjunto que R4.** |
| R7 | `capa_actions` | 1 | abiertas + `due_date < hoy` | `idx_capa_actions_org_open_due` | Lineal con acciones abiertas vencidas. |
| R8 | `audits` | 1 | `scheduled_date` mes actual | `idx_audits_scheduled` | 1 mes. |
| R9 | `audits` | 1 | completed, 2 meses | `idx_audits_org_completed` | 2 meses. |
| R10 | `audits` | 1 | completed `LIMIT 2` | `idx_audits_org_completed` | Acotado. |
| R11 | `controlled_documents` | 1 | published (todas) | `idx_controlled_documents_org_published_review` | Lineal con docs published. |
| R12 | `audits` | **6** laterals | 1 mes completed c/u | `idx_audits_org_completed` | 6 planes. Crece con auditorías completed / mes. |
| R13 | `nonconformities` | **6** laterals | 1 mes `created_at` c/u | `idx_nonconformities_org_created` | 6 accesos extra a NC. |
| **R14** | templates ∪ submissions | 2 | templates: activas; submissions: **90 d** | templates org; submissions org+`submitted_at` | Siempre on. **UI no lo consume.** UNION + DISTINCT. |

### Totales lógicos (si la función existiera y `v_org` no es NULL)

| | Siempre | Si R5a es NULL |
| --- | ---: | ---: |
| Accesos a tablas | **26** | **27** |
| `nonconformities` | 9 | 10 |
| `audits` | 9 | 9 |
| `production_form_submissions` | 2 | 2 |
| `production_form_templates` | 2 | 2 |

`jsonb_build_object` evalúa **todas** las claves. R14 no se salta. R5b sí (COALESCE).

### Clasificación estructural (no cronometrada)

| Tipo | Secciones |
| --- | --- |
| Escaneos repetidos de la misma tabla | NC: R4 + R6 + R5a + R13×6; audits: R8/R9/R10 + R12×6; templates/submissions: R2/R3 + R14 |
| Full-tenant (sin fecha) | R4, R6; R5b si aplica; R2; R11 published |
| Seq Scan posible | Cualquier `WHERE organization_id = v_org` si el planner estima pocas filas. **Hoy 1 fila: Seq Scan sería barato.** No afirmar Seq Scan en producción. |
| Beneficio de índice (cuando haya volumen) | R4/R6 `(organization_id)`; R5 `(org, closed_at) WHERE closed`; R3/R14 submissions `(org, submitted_at)`; R12/R13 rangos de mes |
| Crece lineal con el **tenant** | R4, R6, R5b, R2, R11, CapaNavBadge, layout templates, kiosco NC |
| Podría crecer **global** | Cron all-orgs; Realtime WAL de `production_form_submissions`; `consume_rate_limits` si 037 está aplicada en otro proyecto |

R4 **no** recorre la tabla una vez por métrica (total/open/overdue/…). Es un `FROM` con `FILTER`. El duplicado caro es **R4 vs R6**, más R13.

---

## 6. Kiosk

Código actual: **no usa `router.refresh()`**.

| Pieza | Comportamiento |
| --- | --- |
| Reloj | `setInterval` 1 s — **solo estado local**, 0 queries |
| Poll | `setInterval` → `GET /api/kiosk/metrics` (`cache: no-store`) |
| Intervalo | default **60 s**; UI 30 / 60 / 120 / 300 (`localStorage`) |
| SSR inicial | `organizations.name` + `get_kiosk_metrics()` |
| Cada tick | `requirePermission` + **1 RPC** kiosco |

`get_kiosk_metrics` (040, no desplegada aquí) toca:

- `haccp_plans` LIMIT 1
- `production_form_submissions` ventana ~1 mes
- `nonconformities` **todo el tenant** (open/overdue/48h/critical/urgent)
- `audits` del mes

Más liviano que el dashboard (sin R5/R6/R11/R12/R13/R14 ni 7 listas). Sigue siendo **1 scan de todas las NC por tick**.

Frecuencia si hay pantallas encendidas:

| Intervalo | RPC/hora / pantalla | RPC/día / pantalla |
| ---: | ---: | ---: |
| 30 s | 120 | 2 880 |
| 60 s | 60 | 1 440 |
| 5 min | 12 | 288 |

Más 1 write de rate-limit por tick **si** 037 está aplicada (ruta `/api/` → política `AUTHENTICATED`). Aquí 037 no está en cache.

Número de pantallas: **no medido**. 1 perfil en este proyecto. N pantallas × intervalo es el multiplicador, no el tamaño de R4.

---

## 7. Dashboard SSR

Cada navegación a una ruta del shell `app/(dashboard)/layout.tsx` (incluye `/dashboard`, `/capa`, `/haccp`, etc.):

| # | Query | ¿Hace falta para pintar el layout? |
| --- | --- | --- |
| M1 | `auth.getUser()` (cache React) | Sí |
| M2 | `profiles` 4 columnas (cache) | Sí |
| M3 | `organizations` name, logo | Sí (sidebar) |
| L1 | `production_form_templates` `id, name, area` activas, **sin LIMIT** | Solo FAB móvil (`md:hidden`). En desktop se consulta igual |
| P1 | `get_dashboard_metrics` | Solo `/dashboard` |
| P2–P8 | 7 listas LIMIT 5–20 | Solo `/dashboard` |
| P9 | `ai_daily_insights` LIMIT 1 (no operator) | Solo `/dashboard` |
| S1 | `CapaNavBadge`: **todas** las NC abiertas (`due_date, status`) | Badge del sidebar, **todas** las páginas del shell |
| S2 | `notifications` LIMIT 50 + canal Realtime | Campana, todas las páginas del shell |

Middleware (cada request protegido, **además**):

1. `auth.getUser()`
2. `get_my_profile`
3. Fallback `profiles` si el RPC falla
4. `organizations` (`access_status`, `access_expires_at`)
5. Rate-limit **solo** si el path es `/api/…` o páginas públicas clasificadas. `/dashboard` **no** escribe rate-limit.

SSR innecesario confirmado:

- Plantillas del FAB en desktop y en páginas que no abren QuickCapture.
- `site_areas` dentro del RPC (cuando 039 exista): calculado, no pintado.

---

## 8. Autosave HACCP

No hay write por keystroke ni por frame de drag.

| Persist | Delay | Qué escribe | Guard |
| --- | ---: | --- | --- |
| Plan (paso/status/checklist) | 800 ms | `haccp_plans` patch | merge de patches |
| Team / product | 1500 ms | 1 fila | `shouldSkipWrite` |
| Diagramas | 800 ms debounce **después** de `commitWorking` | `haccp_diagrams` upsert de **todos** los diagramas | fingerprint sin `updated_at` |
| Validación | 2000 ms | upsert 1 fila | skip idéntico |
| Hazard | 800 ms | 1 fila | skip idéntico |
| Pasos 7–11 | 1000 ms | `haccp_step_data` upsert 1 fila/paso; paso 7 también `haccp_ccp_decisions` bulk | skip idéntico |

Diagrama: pan/drag actualizan estado local (`persist=false`). `commitWorking` en **pointerup** (fin de interacción) o rueda + 280 ms. Luego debounce 800 ms + skip si el payload no cambió.

Requests por edición “típica” (mover un nodo y soltar): **1 upsert** de N diagramas (hoy N=2), no uno por mousemove.

Riesgo actual: bajo con 2 diagramas. Riesgo P1: diagramas grandes (JSON nodes/edges) × upsert completo × varios editores.

Al cambiar de paso 4: `flush` + `syncDiagrams` extra (posible doble write si el debounce no había corrido; el guard debería saltar el segundo si el fingerprint coincide).

---

## 9. Notifications

| Camino | Qué hace |
| --- | --- |
| Cliente | 1 `SELECT` LIMIT 50 al montar. **No hay poll.** |
| Realtime | INSERT + UPDATE en `notifications` filtrado `user_id`. 1 canal por montaje (nombre con UUID; Strict Mode puede abrir 2). |
| Escritura app | `upsert` `ON CONFLICT (organization_id, user_id, dedup_key) DO NOTHING`. Ya no es SELECT+INSERT. |
| Cron | `POST /api/notifications/cron`. Sin `vercel.json`. Frecuencia: **la que ponga el host** (Vercel Cron / externo). No medido. |

Cron (código): prefiltra orgs `active` con managers; lunes todas; resto solo orgs con NC due/overdue, auditorías en 7 d, o insight ≠ ok. Por org: 2–4 SELECTs + `getOrCreateDailyInsight` + 1 upsert batch. Multiplica por **managers × eventos**, no por todos los usuarios.

En este proyecto: 1 notificación. El cron no tiene lock table (045 404).

---

## 10. Realtime

| Tabla en `supabase_realtime` (migraciones) | Consumidor en app |
| --- | --- |
| `notifications` (043) | `notification-bell.tsx` — sí |
| `production_form_submissions` (021) | **Ninguno** |
| `qc_submissions` / `qc_submission_readings` (018/019) | Destino SAFE_TO_DROP; 041_remove_legacy no aplicada aquí |

Eventos: INSERT/UPDATE de avisos (cron, CAPA, lecturas). Poco volumen con 1 fila.

`production_form_submissions` en la publicación genera WAL/fanout **sin listener**. Con 1 submission es irrelevante. Con monitoreo continuo en otro proyecto es P1 (I/O de réplica, no CPU de R4).

---

## 11. RLS

Helper: `current_organization_id()` = `SELECT organization_id FROM profiles WHERE id = auth.uid()`. `SECURITY DEFINER`, `STABLE`. 041 envuelve el pred en `(SELECT public.current_organization_id())` para InitPlan.

**No se verificó** si 041 está aplicada en este proyecto. El helper **sí** existe.

Cada subquery del RPC (cuando exista) reevalúa RLS. Con InitPlan: 1 lookup de org por statement, no por fila. Sin 041: el planner puede ejecutar el helper **por fila**. En 1 fila no se nota. En 10⁵ NC + 9 accesos, sí.

No se proponen cambios de RLS.

---

## 12. Cron

| Job | En repo | En este proyecto |
| --- | --- | --- |
| `POST /api/notifications/cron` | Sí | 045 lock 404; no hay schedule en git |
| `pg_cron` | No | — |
| Vercel Cron | No hay `vercel.json` | Puede existir solo en el dashboard de Vercel — **no inspeccionado** |
| Escalate CAPA | On-demand API | — |

Riesgo de multiplicación: `orgs_active × managers × (NC due + audits + insight)`. Hoy 1 org / 1 perfil. Peligroso solo si alguien pega el cron cada minuto sobre muchos tenants.

---

## 13. Top 10 queries / procesos sospechosos

Orden por **evidencia de este entorno + estructura del repo**, no por `total_time` medido (no existe).

| # | Proceso | Evidencia | ¿Puede explicar CPU *ahora* en este proyecto? |
| --- | --- | --- | --- |
| 1 | Middleware `get_my_profile` + `organizations` **por request** protegido | RPC existe; corre en cada navegación | **Único candidato frecuente confirmado aquí.** Barato por llamada; el coste es `calls`. |
| 2 | `GET /api/kiosk/metrics` cada 30–60 s | Poll real; RPC **404** aquí | No en este proyecto. P0 de frecuencia **si** 040 está en el proyecto que alerta. |
| 3 | `get_dashboard_metrics` R4+R6+R13+R14 | SQL del repo; función **404** aquí; tablas de 1 fila | No aquí. P1 de crecimiento si se aplica 039 a un tenant grande. |
| 4 | Layout `production_form_templates` sin LIMIT | Código; 1 fila hoy | No material. |
| 5 | `CapaNavBadge` SELECT todas las NC abiertas | Código; 1 fila | No material. Crece con NC abiertas × páginas del shell. |
| 6 | Campana `notifications` LIMIT 50 + Realtime | Código; 1 fila | Bajo. |
| 7 | HACCP upsert diagramas / step_data | Debounce + write-guard; 2+2 filas | Solo mientras alguien edita. |
| 8 | `consume_rate_limits` en cada `/api/*` | 037 **404** | No aquí. Write por tick de kiosco si 037 vive en producción. |
| 9 | Cron all-orgs | Sin schedule en repo | Desconocido. |
| 10 | Realtime `production_form_submissions` sin consumidor | Publicación 021 | Irrelevante con 1 fila. |

Los ~0.2 ms de R4–R6 **no** entran en este ranking como coste real.

---

## 14. P0 / P1 / P2

Sin proponer implementación. Solo clasificación.

### P0 — podría explicar CPU/DB *actual* (con matices)

| Ítem | Por qué |
| --- | --- |
| **Desalineación proyecto vs alerta** | Este DB no tiene 039/040 y tiene ~1 fila. Si la alerta es de **otro** proyecto, estamos midiendo el sitio equivocado. |
| **Volumen de `get_my_profile` / sesión** | Única lectura confirmada en caliente en este proyecto. |
| **Kiosco × N pantallas × 30 s** | Solo si 040 está aplicada en el proyecto que alerta. Multiplica un scan de NC (y rate-limit si 037). |

El RPC del Dashboard **no** es P0 **en este proyecto**.

### P1 — crece con usuarios / datos

| Ítem | Por qué |
| --- | --- |
| R4 + R6 (dos pases full-tenant de NC) | Lineal con histórico. |
| R13 × 6 laterals NC | 6 planes extra. |
| R5b fallback histórico | Solo orgs sin cierres en 30 d. |
| R14 `site_areas` 90 d | Siempre on, 0 consumidores. |
| Kiosco NC full-tenant por tick | Lineal × frecuencia. |
| Layout templates + CapaNavBadge unbounded | Cada página del shell. |
| RLS sin InitPlan (si 041 no está) | Helper × fila × subquery. |
| Realtime submissions huérfano | WAL al crecer monitoreo. |
| Cron sin tope de frecuencia | Si el host lo dispara a menudo. |

### P2 — menor

| Ítem | Por qué |
| --- | --- |
| R12 × 6 laterals audits | Acotado a 6 meses; poco volumen típico. |
| R2 COUNT templates duplicado con R14 / layout | 1 fila hoy. |
| Notification Strict Mode = 2 canales | Setup, no scan. |
| Flush extra de diagramas al dejar el paso 4 | Guard suele anular. |

---

## 15. Qué debemos medir después

1. **En el proyecto que emitió la alerta** (Reports → Query Performance o `pg_stat_statements`): `calls`, `total_exec_time`, `mean_exec_time`, `rows` de las top statements. Eso decide si el culpable es el RPC, `get_my_profile`, kiosco, rate-limit o writes.
2. Si aparece `get_dashboard_metrics`: EXPLAIN del paquete de abajo **como el usuario de la org**, no como postgres.
3. Confirmar si 039/040/037/041/045 están aplicadas **ahí** (aquí no lo están).
4. Cuántas sesiones `/planta` concurrentes y qué intervalo tienen.
5. Si existe cron de Vercel pegando `/api/notifications/cron` y con qué `schedule`.

### SQL — contexto + RPC (cuando la función exista)

```sql
-- 1) Sesión: debe devolver uid + organization_id no nulos
SELECT auth.uid() AS uid, organization_id
FROM public.profiles
WHERE id = auth.uid();

-- 2) RPC completo (a menudo un solo Function Scan)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT public.get_dashboard_metrics();
```

Mirar: `Planning Time`, `Execution Time`, `Shared Hit/Read`, `temp`. Si solo hay `Function Scan`, no concluye el interior.

### SQL — subqueries con org real (paquete C)

Usar el mismo `auth.uid()` (no pegar un UUID a mano salvo que sea el de **esa** sesión). El texto está en `DASHBOARD_PERFORMANCE_BASELINE.md` §9.3.

Qué anotar por plan: `actual rows` vs `Plan Rows`, `Shared Hit` vs `Shared Read`, Seq vs Index vs Index Only, `Rows Removed by Filter`, `loops`, `HashAggregate` / `Sort`.

Regla: caro = **tiempo o shared read altos**, no “muchas filas” con todo en cache.

---

## 16. Qué NO debemos tocar todavía

- Código de `get_dashboard_metrics` / `get_kiosk_metrics`
- Migraciones 039–046
- Índices nuevos
- RLS / pasar RPCs a DEFINER
- Quitar plantillas del layout o cambiar el FAB
- Cambiar el fallback de `avg_closure_days`
- Apagar Realtime o el cron
- Aplicar 039 “para poder medir” como si fuera la causa

Optimizar R4/R6/R14 ahora sería cambiar una función que **en este proyecto ni corre**, sobre tablas de 1 fila, con un EXPLAIN que no vio tenant.

---

## RECOMMENDED NEXT ACTION

**En el proyecto de Supabase que disparó la alerta de CPU, abrir Reports → Query Performance (o consultar `pg_stat_statements`) y anotar las 10 statements con mayor `total_exec_time` y sus `calls`.**

Eso es lo único que conecta la alerta con un statement real. Este workspace no tiene JWT de usuario, el EXPLAIN previo filtró `organization_id` NULL, y el proyecto de `.env.local` no tiene `get_dashboard_metrics` y apenas tiene datos. Hasta ver esas 10 statements, cualquier P0 de implementación es una hipótesis.
