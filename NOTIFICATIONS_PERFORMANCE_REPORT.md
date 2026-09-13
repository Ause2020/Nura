# Informe de performance — Notifications

Fecha: 2026-09-11  
Archivos: `lib/notifications.ts`, `lib/notifications/cron.ts`, `lib/email/send.ts`, `components/documents/document-detail-view.tsx`, `supabase/migrations/043_notifications_dedup.sql`

No cambian: textos, `dedup_key`, RLS, multi-tenant, eventos Realtime (INSERT/UPDATE), quién recibe qué.

Hay que **aplicar 043** en Supabase para que PostgREST resuelva `ON CONFLICT (organization_id, user_id, dedup_key)`.

---

## Antes

### `createNotification()`

Con `dedupKey`:

1. `SELECT id FROM notifications WHERE org + user + dedup_key`
2. Si existe → `null`
3. Si no → `INSERT` + `SELECT *`

Dos idas a Postgres por aviso. Carrera: dos crons pueden pasar el SELECT y duplicar (el índice único aborta el segundo INSERT; el primero ya corrió).

`notifyOrgManagers`: 1 SELECT de perfiles + **N × (SELECT + INSERT)** (un admin + un QM = 4 queries).

Acuses de lectura (`document-detail-view`): un `createNotification` por usuario.

### Cron

Por organización:

| Paso | Queries |
| --- | --- |
| Managers | 1 |
| Prefs | 1 |
| **Todas** las NC abiertas (sin ventana de fecha) | 1, histórico |
| **Todas** las auditorías `scheduled` / `in_progress` | 1, histórico |
| Por cada NC con `due_date` × cada manager | SELECT + INSERT (+ `getUserById` + email) |
| Lunes: resumen × manager | igual |
| Auditorías en 7 días × manager | igual |
| Insight diario × manager | igual |

`runNotificationCronAllOrgs` leía **todas** las orgs (`pending` / `suspended` / `expired` incluidas). Orgs sin managers igual bajaban NC y auditorías.

Realtime: campana intacta. `notifications` no estaba en la publicación SQL (solo un comentario en 007).

---

## Después

### Deduplicación

Índice único de 007:

```sql
UNIQUE (organization_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL
```

PostgREST no puede usarlo como target de `ON CONFLICT` (falta el `WHERE`).  
043 lo reemplaza por un **UNIQUE constraint** en las mismas columnas. En PostgreSQL los `NULL` siguen siendo distintos: varias filas sin `dedup_key` se permiten. Misma regla que el índice parcial.

`createNotifications()` / `createNotification()`:

```
INSERT … ON CONFLICT (organization_id, user_id, dedup_key) DO NOTHING
RETURNING *
```

vía `upsert(..., { onConflict, ignoreDuplicates: true })`.

| Caso | Resultado |
| --- | --- |
| Fila nueva | 1 INSERT, Realtime INSERT, se devuelve la fila |
| Duplicado | 0 filas, sin UPDATE (no se pisa el aviso ni `read`) |
| Sin `dedup_key` | INSERT simple (como antes) |
| 043 aún no aplicada | fallback: INSERT y tratar `23505` como “ya existía” |

`notifyOrgManagers` y los acuses de lectura: **un** upsert para todos los destinatarios.

### Cron

1. Si no hay admin / quality_manager → **sale**. No toca NC, auditorías ni insight.
2. NC: `status <> closed` AND `due_date <= hoy+48h` (las que el loop ya consideraba).
3. Auditorías: `scheduled` / `in_progress` AND `scheduled_date` entre hoy y +7 días.
4. Lunes + resumen habilitado: dos `COUNT` (`head: true`) para abiertas y vencidas. No se bajan filas para el conteo.
5. Un `createNotifications` con todos los avisos de la org.
6. Emails solo si el upsert creó la fila (misma regla `if (row)`).
7. `getUserEmails`: un `getUserById` por manager, **una vez** por org (no por NC).
8. Cron global: `organizations.access_status = 'active'`. Manual (usuario) sigue siendo solo su org.

Claves de dedup **iguales**: `capa-overdue-{id}`, `capa-due-{id}-{dueIso}`, `weekly-summary-{weekKey}`, `audit-upcoming-{id}`, `daily-insight-{periodDate}`.

### Realtime

`notification-bell.tsx` no se tocó: `postgres_changes` INSERT + UPDATE, filtro `user_id`.  
043 añade `notifications` a `supabase_realtime` si faltaba (el INSERT nuevo sigue disparando el canal).

---

## Round trips (org típica: 2 managers, 20 NC abiertas, 3 en ventana, 1 auditoría próxima)

| | Antes | Después |
| --- | --- | --- |
| Dedup por aviso | 2 (SELECT+INSERT) | **1** upsert |
| Avisos del cron (≈ 8 filas) | ~16 | **1** |
| Emails Auth | 1 por aviso nuevo | **2** (los managers) |
| NC leídas | todas las abiertas | solo ventana 48 h |
| Auditorías leídas | todas abiertas | solo 7 días |
| Orgs del cron secret | todas | `active` |

---

## Seguridad (sin cambios de ACL)

| Invariante | Cómo |
| --- | --- |
| RLS | 043 no toca policies. INSERT sigue `organization_id = current_organization_id()`; SELECT/UPDATE `user_id = auth.uid()` |
| Multi-tenant | `organization_id` en el UNIQUE y en cada payload |
| Dedup | constraint + `DO NOTHING` (más seguro ante carreras que SELECT+INSERT) |
| Cron secret | igual; el modo usuario solo corre su org |
| Realtime | mismo filtro por `user_id`; RLS SELECT impide ver filas ajenas |

No hay `SECURITY DEFINER` nuevo. El cron con service role sigue siendo el que ya existía.

---

## Checks

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK (warnings `<img>` / `alt` preexistentes) |
| `npm test` | 86 pass / 0 fail / 2 skip (incluye `verify-notifications-perf.mjs`) |

---

## Cómo aplicar

En Supabase SQL Editor: `supabase/migrations/043_notifications_dedup.sql`.  
Si `notifications` ya estaba en Replication, el `ADD TABLE` se ignora (`duplicate_object`).
