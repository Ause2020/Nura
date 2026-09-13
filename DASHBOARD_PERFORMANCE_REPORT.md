# Informe de performance — Dashboard

Fecha: 2026-09-11  
Archivo principal: `lib/dashboard/data.ts`  
RPC: `public.get_dashboard_metrics()` en `supabase/migrations/039_dashboard_metrics.sql`

La UI (`DashboardView`, kiosko `/planta`) no cambió. No se añadió polling: el refresh del kiosko ya existía.

Hay que **aplicar la migración 039** en el proyecto Supabase. Sin ella el dashboard falla al llamar el RPC (no hay fallback que vuelva a bajar históricos).

---

## Antes

Una sola función mezclaba KPIs, actividad, charts y listas. Descargaba históricos y agregaba en JavaScript.

| # | Query | Columnas | Filtro temporal | Límite | Filas típicas / peor caso |
| --- | --- | --- | --- | --- | --- |
| 1 | `haccp_plans` | `checklist_progress` | no | 1 | 1 |
| 2 | `audits` | 7 | **ninguno** | **ninguno** | 50–500 / todas |
| 3 | `nonconformities` | 10 | **ninguno** | **ninguno** | 100–5 000 / todas |
| 4 | `capa_actions` | 5 | **ninguno** | **ninguno** | 200–10 000 / todas |
| 5 | `controlled_documents` | 3 | **ninguno** | **ninguno** | 50–2 000 / todas |
| 6 | `production_form_submissions` | 6 | **ninguno** | 500 | 500 |
| 7 | `production_form_templates` | 3 | activas | **ninguno** | 5–80 / todas activas |

**Round trips:** 7 (en paralelo).  
**Filas transferidas (org mediana):** ~1 000–2 000.  
**Peor caso:** ilimitado en 4 tablas + 500 monitoreos.  
**Payload estimado:** 200 KB–2 MB JSON.  
**CPU/memoria app:** `filter`/`reduce` sobre todos los NCs, auditorías y CAPA para KPIs, widgets, tendencia 6 meses y “esta semana”.  
**CPU Postgres:** seq scan / index scan ancho + envío de filas por la red.

Queries eliminadas (como lectura de histórico):

- `SELECT … FROM audits` sin límite
- `SELECT … FROM nonconformities` sin límite
- `SELECT … FROM capa_actions` sin límite
- `SELECT … FROM controlled_documents` sin límite
- `SELECT … FROM production_form_submissions LIMIT 500`
- `SELECT id, name, area FROM production_form_templates` (todas las activas)

---

## Después

Separación:

| Grupo | Qué | Cómo |
| --- | --- | --- |
| **A. KPIs** | Conteos, tasas, score, widgets | `get_dashboard_metrics()` — `COUNT` / `COUNT FILTER` / `AVG` / `GROUP BY` |
| **B. Actividad** | Últimos monitoreos, auditorías cerradas, NCs | 3 `SELECT` con columnas explícitas y `LIMIT` 8/5/5 |
| **C. Charts** | Tendencia 6 meses + NCs por origen | Dentro del RPC (`generate_series` + `GROUP BY origin`) |
| **D. Listas** | Hoy, esta semana | `SELECT` acotados por fecha + `LIMIT` 8–20 |

### Round trips

| | Antes | Después |
| --- | --- | --- |
| Llamadas PostgREST | 7 | **8** (1 RPC + 7 listas) |
| Filas al cliente | ~1 000–ilimitado | **≤ 66** |
| Payload estimado | 200 KB–2 MB | **~8–25 KB** |

Hay **una llamada más**, pero deja de mover el histórico. El RPC sustituye 5 lecturas pesadas + el plan HACCP.

### Queries actuales

**A + C — `rpc get_dashboard_metrics()` (1 jsonb)**

Resuelto con `auth.uid()` → `profiles.organization_id`. Sin parámetro de org (un cliente no puede pedir otro tenant). `SECURITY INVOKER` + RLS. Un scan agregado por tabla, no `SELECT *`.

Incluye: progreso HACCP (1 plan), templates activos, monitoreos del mes/semana/hoy, NCs abiertas/vencidas/críticas/mes, cierre CAPA, origen, CAPA actions vencidas, auditorías del mes, conformidad mes vs anterior, 2 últimas auditorías, documentos a revisar, 6 meses, áreas.

**B — actividad (máx. 18 filas)**

| Query | Columnas | Ventana | Límite |
| --- | --- | --- | --- |
| submissions recientes | id, submitted_at, has_deviation, area, template_id + nombre | las últimas | 8 |
| audits completed | id, title, completed_date, created_at | las últimas | 5 |
| NCs recientes | id, nc_number, status, detected_at, closed_at, created_at | las últimas | 5 |

**D — listas (máx. 48 filas)**

| Query | Filtro | Límite |
| --- | --- | --- |
| audits próximas | status scheduled/in_progress, `scheduled_date` hoy→+14 d | 8 (sirve Hoy + Esta semana) |
| NCs abiertas | no cerradas AND (vence hoy/mañana OR detectada ≤7 d) | 15 |
| capa_actions abiertas | no completed AND `due_date` ≤ +7 d | 20 |
| desviaciones | `has_deviation` AND `submitted_at` ≥ 7 d | 5 |

Todas: columnas explícitas + `organization_id` + orden + límite.  
Nombre de plantilla: embed `production_form_templates(name)` (sin query extra de catálogo).

### Queries combinadas

- Todos los KPIs de `nonconformities` en **un** `COUNT FILTER` (no 8 queries).
- Monitoreos mes/semana/hoy en **un** scan con `submitted_at >= LEAST(week, month)`.
- Conformidad de auditorías mes actual + anterior en **un** `AVG FILTER`.
- Auditorías “hoy” y “próximos 14 días” en **una** lista.
- CAPA vencidas y por vencer en **una** lista (`due_date ≤ +7`).

---

## Multi-tenancy y RLS

- El RPC **no** es `SECURITY DEFINER`. Corre como el usuario: RLS aplica.
- Org desde `profiles` donde `id = auth.uid()` (el usuario ya lee su perfil).
- Cada lista repite `.eq("organization_id", orgId)` de la sesión.
- `GRANT EXECUTE … TO authenticated`. `REVOKE` de `PUBLIC`. Anónimos no ejecutan.
- No se acepta `organization_id` por argumento (evita pedir otro tenant).

No hace falta DEFINER: no hay cruce de tenants ni bypass de policies.

---

## Índices (039)

Ya existían: `audits(organization_id, scheduled_date|status)`, `nonconformities(organization_id, status|due_date)`, `capa_actions(organization_id, status)`, `production_form_submissions(organization_id, submitted_at DESC)`, `controlled_documents(organization_id, status|next_review_date)`, `haccp_plans(organization_id, updated_at DESC)`.

Nuevos:

| Índice | Para |
| --- | --- |
| `idx_nonconformities_org_detected` | actividad + “esta semana” |
| `idx_nonconformities_org_created` | conteo mensual / tendencia |
| `idx_nonconformities_org_closed` (parcial) | promedio de cierre |
| `idx_audits_org_completed` (parcial) | última auditoría + AVG conformidad |
| `idx_capa_actions_org_open_due` (parcial) | CAPA abiertas por vencimiento |
| `idx_production_submissions_org_deviation` (parcial) | desviaciones 7 d |
| `idx_controlled_documents_org_published_review` (parcial) | revisión publicada |

---

## Checks

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK (warnings `<img>` / `alt` preexistentes) |
| `npm test` | 62 pass / 0 fail / 2 skip (incluye `verify-dashboard-perf.mjs`) |

---

## Cómo aplicar

En Supabase SQL Editor: ejecutar `supabase/migrations/039_dashboard_metrics.sql`.  
Luego recargar el schema cache (Settings → API) si el RPC no aparece al primer request.
