# Auditoría de cron y background jobs

Fecha: 2026-09-11  
Alcance: repo + migraciones. **No hay `vercel.json`, `pg_cron` ni Edge Functions.**

El único job de servidor programable es `POST /api/notifications/cron`. El resto son on-demand, polling de cliente, o SQL sin llamador.

---

## Inventario

| Job | Tipo | ¿Existe? | Frecuencia | Conservar |
| --- | --- | --- | --- | --- |
| `POST /api/notifications/cron` | HTTP cron (Bearer `CRON_SECRET`) o manual (usuario → su org) | Sí | **No definida en repo.** Quien hostea debe pegarle (Vercel Cron / GitHub / externo). Pensado diario | Sí |
| Daily insight (dentro del cron) | Mismo request | Sí | Con el cron | Sí (ya no llama Claude) |
| `POST /api/capa/escalate` | On-demand, `capa.manage` | Sí (sin caller UI) | Al invocarlo | Sí |
| `POST /api/notifications/audit-completed` | On-demand al cerrar auditoría | Sí | Por evento | Sí |
| `cleanup_rate_limit_windows()` | RPC 037, **sin job** hasta 045 | SQL listo | Ahora: al final del cron all-orgs | Sí |
| `pg_cron` | — | No | — | — |
| Vercel Cron | — | No hay `vercel.json` | — | Propuesta |
| Edge Functions | — | No hay `supabase/functions` | — | — |
| Document expiration / review reminders | — | No | UI + KPI dashboard | Propuesta |
| Invitaciones vencidas | — | No (filtro al leer) | — | Propuesta |
| QR / access expiry | — | No (check en request) | — | No hace falta job |
| Kiosco 30–300 s | Poll HTTP cliente | Sí | UI | No es cron |
| Realtime notifications | Push | Sí | Eventos | No es cron |

---

## Job 1 — `notifications` cron

**Archivos:** `app/api/notifications/cron/route.ts`, `lib/notifications/cron.ts`  
**Auth:** `Authorization: Bearer CRON_SECRET` + service role → todas las orgs elegibles. Sin secret: sesión → **una** org.

### Frecuencia

No hay schedule en el repo. Rate limit familia `CRON`: 5/min.

### Tablas

`organizations`, `profiles`, `notification_preferences`, `nonconformities`, `audits`, `notifications`, `ai_daily_insights` (+ hijas HACCP/monitoreo si hay que **crear** el insight del día), `rate_limit_windows` (cleanup).

### Queries (después de esta pasada)

1. Lock `try_acquire_job_lock('notifications-cron')`.
2. Orgs `access_status = active`.
3. Profiles admin/QM de esas orgs (una query).
4. Si no es lunes: NC con `due_date ≤ +48h` (solo `organization_id`), auditorías en 7 días (solo `organization_id`), insights de hoy (`organization_id, overall_risk`).
5. Managers + prefs **solo** de orgs que pasan el filtro (2 queries).
6. Por org restante: NC/auditorías de la ventana, `COUNT` semanal (lunes), `getOrCreateDailyInsight` (1 SELECT si ya existe), 1 upsert de notifications.

### Organizaciones

| Antes | Después |
| --- | --- |
| Todas las `active` (aunque no tengan managers ni vencimientos) | `active` ∩ con admin/QM ∩ (lunes **o** NC/auditoría en ventana **o** insight ausente / riesgo ≠ ok) |

### N+1

| Antes | Después |
| --- | --- |
| 1 managers + 1 prefs **por org** | Precarga de managers/prefs de las orgs elegidas |
| `getUserById` por aviso | Sigue 1 vez por manager de la org (emails) |
| SELECT+INSERT por aviso | Bulk `ON CONFLICT DO NOTHING` (ya) |

### Incremental

Sí: solo orgs con trabajo del día. Dentro de la org, solo NC `due_date ≤ +48h` y auditorías de 7 días. No se bajan NC/auditorías históricas.

### Duplicación

- Avisos: UNIQUE `(org, user, dedup_key)` + `DO NOTHING`.
- Emails: solo si el upsert creó la fila.
- Dos HTTP a la vez: lock 8 min (`045`). Si 045 no está, el cron corre igual (fail-open).

### Índices

Ya: `(nonconformities.organization_id, due_date|status)`, `(audits.organization_id, scheduled_date|status)`, UNIQUE insights `(org, period_date)`, `organizations(access_status)`, `profiles(organization_id)`.

Nuevos en 045 (prefiltro multi-org):

- `idx_nonconformities_open_due_global` `(due_date) WHERE status <> closed AND due_date IS NOT NULL`
- `idx_audits_open_scheduled_global` `(scheduled_date) WHERE status IN (scheduled, in_progress)`

---

## Job 2 — escalate CAPA

**Archivo:** `app/api/capa/escalate/route.ts`  
**Frecuencia:** on-demand.  
**Tablas:** `capa_actions`, `nonconformities`, `profiles`, `notifications`.

Queries: acciones vencidas + NC vencidas + managers (paralelo) → 2 `UPDATE … IN` → **un** `createNotifications`.

Antes: `notifyOrgManagers` por cada NC y cada acción (N+1).  
Incremental: `due_date < hoy` y no cerradas/completadas.  
Duplicación: `dedup_key` `capa-overdue-nc|mgr|action-{id}`.  
Índices: `(capa_actions.organization_id, status)` + parcial open due (039); `(nonconformities.organization_id, due_date)`.

---

## Job 3 — `cleanup_rate_limit_windows`

**SQL:** 037. **Caller:** ahora el cron all-orgs (final).  
**Frecuencia:** cada corrida global del cron.  
**Tabla:** `rate_limit_windows` (`updated_at < now() - 2 days`).  
N+1: no. Duplicación: DELETE idempotente. Índice: PK `bucket_key`; un índice por `updated_at` ayudaría si la tabla crece (propuesta).

---

## Job 4 — audit-completed email

**Archivo:** `app/api/notifications/audit-completed/route.ts`  
Evento, no schedule. Managers + `getUserById` en loop (2–5). No tocar: no es cron.

---

## Lo que no es un job

| Superficie | Por qué no |
| --- | --- |
| Revisión de documentos | `next_review_date` se mira en dashboard/RPC/UI. Nadie notifica |
| Expiración de invitaciones / QR / access | Se filtra al usar el recurso |
| Kiosco | `setInterval` + `GET /api/kiosk/metrics` |
| Landing carousel | UI |
| `pg_cron` / Edge | No existen en el repo |

---

## Cambios aplicados (sin borrar jobs)

1. Prefiltro de orgs (active + managers + trabajo del día).
2. Precarga managers/prefs (sin SELECT en el loop de orgs).
3. Lock anti-solape (045).
4. Escalate en bulk.
5. Cleanup de rate-limit enganchado al cron global.

La propuesta de schedule Vercel, recordatorios de documentos e índice `updated_at` está en `BACKGROUND_JOBS_PROPOSAL.md`.
