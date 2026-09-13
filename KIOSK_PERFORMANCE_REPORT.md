# Informe de performance — Kiosco de planta

Fecha: 2026-09-11  
Pantalla: `/planta` · `components/dashboard/plant-kiosk-view.tsx`  
API: `GET /api/kiosk/metrics`  
RPC: `public.get_kiosk_metrics()` en `supabase/migrations/040_kiosk_metrics.sql`

El layout, los intervalos (30s / 60s / 2 min / 5 min) y los números en pantalla no cambian. El reloj sigue siendo local (1 s). No hay Realtime.

Hay que **aplicar 040** (y 039 si aún no está) en Supabase.

---

## Qué muestra el kiosco

Solo esto:

- 2 widgets: Monitoreo (hoy/semana) y CAPA/NC (abiertas, vencidas, 48 h, críticas)
- Score del sistema
- Tareas urgentes hoy (NC que vence hoy, o mañana si es crítica)
- % monitoreos conformes del mes

No usa actividad reciente, charts, documentos, origen de NCs ni el resto del dashboard.

---

## Antes

Cada tick hacía `router.refresh()`.

Eso **re-ejecutaba el Server Component** de `/planta`:

1. Sesión + `requireOrganizationId`
2. `organizations.name`
3. **`fetchDashboardData`** — 1 RPC de dashboard + **7 listas** (actividad, auditorías, NCs, CAPA, desviaciones)

| Frecuencia | Round trips por tick | Datos |
| --- | --- | --- |
| 30 s | 1 HTML RSC + 8 queries de dashboard | HTML + snapshot completo (~8–25 KB de datos + markup) |
| 60 s | igual | igual |
| 2 min | igual | igual |
| 5 min | igual | igual |

A 30 s: **~240 refrescos/hora × 8 queries = ~1 920 idas a Postgres/hora**, más render RSC, cookies y el payload del dashboard (charts, actividad, documentos).

`lastRefresh` se actualizaba aunque el refresh no hubiera terminado.

---

## Después

- **Carga inicial:** `organizations.name` + `get_kiosk_metrics()` (2 queries). Sin `fetchDashboardData`.
- **Polling:** `GET /api/kiosk/metrics` → 1 RPC. Sin `router.refresh()`, sin RSC, sin listas.

| | Antes (cada tick) | Después (cada tick) |
| --- | --- | --- |
| Mecanismo | `router.refresh()` | `fetch("/api/kiosk/metrics")` |
| Queries | 8 (dashboard) + org | **1 RPC** |
| Filas al cliente | ≤ 66 + HTML | **1 JSON** (~0.5–1.5 KB) |
| Tablas tocadas | plans, submissions, NCs, CAPA, audits, documents, templates | **plans (1 fila), submissions (agregado), NCs (agregado), audits del mes (agregado)** |
| Históricos | no (ya optimizado el dashboard) pero sí 7 listas | **ninguno** |
| Charts / actividad / docs | sí, se calculaban y descartaban | **no se consultan** |

### Tráfico estimado (org típica, intervalo 30 s)

| | Antes | Después |
| --- | --- | --- |
| Requests/hora | 120 RSC | 120 GET JSON |
| Queries Postgres/hora | ~1 920 | **120** |
| Transferencia/hora | 1–4 MB (HTML+datos) | **~60–180 KB** |

A 60 s: la mitad. A 5 min: 12 ticks/hora, ~12 RPCs.

### RPC `get_kiosk_metrics`

`SECURITY INVOKER` + RLS. Org desde `profiles` (`auth.uid()`). Sin argumento de tenant.

Un `COUNT FILTER` por tabla:

- `production_form_submissions` donde `submitted_at >= LEAST(lunes, inicio de mes)`
- `nonconformities` (abiertas / vencidas / 48 h / críticas / urgentes)
- `audits` del mes calendario
- `haccp_plans` `LIMIT 1` (checklist para el score)

No hay N+1. No hay `SELECT *`. Índices: los de 039 (`submitted_at`, `due_date`, `scheduled_date`, `haccp_plans.updated_at`).

### API

- Auth: `requirePermission(monitoring.read)` (admin, quality_manager, operator)
- `Cache-Control: no-store`
- Rate limit: familia `AUTHENTICATED` (120/min). A 30 s = 2/min.

---

## Frecuencia

Sigue configurable en el select. Solo esos cuatro valores (30 / 60 / 120 / 300). Se guardan en `localStorage` (`nura-kiosk-refresh-seconds`).

El reloj no pega a la red.

---

## Checks

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK (warnings `<img>` / `alt` preexistentes) |
| `npm test` | 65 pass / 0 fail / 2 skip (incluye `verify-kiosk-perf.mjs`) |
