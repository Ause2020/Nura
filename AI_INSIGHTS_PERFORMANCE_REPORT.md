# Informe de performance — `ai_daily_insights`

Fecha: 2026-09-11  
Migración: `supabase/migrations/044_ai_daily_insights_telemetry.sql` (aplicar en Supabase)

Un insight por organización y día calendario (Santiago). Claude **no** corre al abrir el Dashboard. Regenerar es una acción explícita.

---

## Antes

| Camino | Qué hacía |
| --- | --- |
| Dashboard | `getLatestInsight` (`SELECT *`, incluye snapshot JSONB). No Claude. |
| `/analisis` | `loadOrCreate` con `skipAi` + `AnalisisEnricher` hacía `POST` al montar → **Claude automático** |
| Cron | `generateDailyInsight` sin force: si el de hoy era `rules` y había API key, **llamaba Claude y pisaba** |
| Validez | Ventana de 24 h desde `generated_at`, no el día |
| Snapshot | Hasta 200 NC (abiertas + cerradas), 400 PCC (30 d), 400 submissions (14 d); agregaba en JS |
| Prompt | `compactForAi` ya recortaba, pero el fetch previo era histórico |
| Carrera | Dos procesos podían armar snapshot + Claude; el UNIQUE evitaba 2 filas pero no 2 llamadas |
| Telemetría | `model` sí; sin tokens, duración ni resultado |

UNIQUE `(organization_id, period_date)` ya existía en 033.

---

## Después

### 1. Dashboard no ejecuta Claude

`app/(dashboard)/dashboard/page.tsx` solo lee `getInsightTeaser`: `headline, summary, overall_risk, period_date, generated_at`.  
No genera, no enriquece, no llama `/api/ai/daily-insight`.

### 2–4. Un insight por org + fecha

`getOrCreateDailyInsight`:

1. `SELECT` por `organization_id` + `period_date` de hoy (Santiago).
2. Si existe → lo devuelve. No Claude. No recálculo.
3. Si no existe → agregados + reglas → `INSERT … ON CONFLICT DO NOTHING`.
4. Si otro ganó el UNIQUE → `SELECT` del ganador.

`/analisis` y el cron usan esto. El enricher automático se eliminó.

### 5–6. UNIQUE + ON CONFLICT

033 ya tenía `UNIQUE (organization_id, period_date)`.  
044 lo reafirma y agrega columnas de telemetría.

| Escritura | SQL |
| --- | --- |
| Primera del día | `upsert(..., { onConflict, ignoreDuplicates: true })` |
| Regenerar (`force: true`) | `upsert` que pisa la fila del día |

### 7–9. Contexto = agregados

El snapshot ya no baja históricos abiertos:

| Antes | Después |
| --- | --- |
| 200 NC de cualquier estado | `COUNT` abiertas / vencidas / críticas / 48 h / cerradas 30 d + listas de 6–8 |
| 400 PCC / 30 días | `COUNT` por ventana 7 d / previa / 30 d + 5 desviaciones + ids PCC de 7 d |
| 400 submissions / 14 d | `COUNT` 7 d y previa + 5 desviaciones |
| Productos `select id` | `COUNT` head |
| Equipo completo | Solo integrantes con capacitación pendiente/vencida |

`compactForAi` manda conteos, tendencia, PCC silenciosos y hasta 4–5 ítems. Cap del prompt: 4000 caracteres (antes 7000).

### 10. Registro

Por fila: `period_date`, `organization_id`, `model`, `input_tokens`, `output_tokens`, `duration_ms`, `generation_result` (`rules` \| `ai` \| `ai_error`).

Claude (Anthropic) ya devolvía `usage`; ahora se persiste.

### Regeneración explícita

Botón **Regenerar** en `/analisis` → `POST /api/ai/daily-insight` `{ force: true }`.  
Ahí sí: snapshot + Claude (si hay clave) + upsert del día.

---

## RLS y aislamiento

Sin cambios de policies. Sigue el CRUD quality de 036/041 (`organization_id = current_organization_id()` + `rbac_quality()`).  
El cron usa service role como antes. Un tenant no lee ni escribe el insight de otro: UNIQUE y RLS van por `organization_id`.

---

## Round trips / coste

| | Antes | Después |
| --- | --- | --- |
| Abrir Dashboard | `SELECT *` insight | `SELECT` 5 columnas |
| Abrir `/analisis` (ya hay fila hoy) | 1 SELECT + POST Claude | 1 SELECT |
| Primer insight del día | snapshot ancho + posible Claude | conteos + INSERT |
| Cron / org | posible Claude | get-or-create, sin Claude |
| Claude / día / org | Dashboard no; `/analisis` y cron sí | Solo **Regenerar** |

---

## Checks

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK (warnings `<img>` / `alt` preexistentes) |
| `npm test` | 95 pass / 0 fail / 2 skip (incluye `verify-ai-insights-perf.mjs`) |

---

## Cómo aplicar

SQL Editor: `044_ai_daily_insights_telemetry.sql`.  
Si el UNIQUE de 033 ya está, el `ADD CONSTRAINT` se ignora.
