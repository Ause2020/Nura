# Propuesta — schedule y jobs que aún no existen

Complemento de `BACKGROUND_JOBS_AUDIT.md`. **No aplicada** salvo lo ya metido en `045_background_job_lock.sql` y el cron/escalate actuales.

---

## 1. Schedule del cron (recomendado)

Hoy nadie llama a `/api/notifications/cron` desde el repo.

`vercel.json` (cuando el proyecto esté en Vercel):

```json
{
  "crons": [
    {
      "path": "/api/notifications/cron",
      "schedule": "0 11 * * *"
    }
  ]
}
```

`0 11 * * *` = 11:00 UTC ≈ 08:00 Chile (invierno). Ajustar a `America/Santiago`.

Vercel Cron manda `Authorization: Bearer $CRON_SECRET` si `CRON_SECRET` está en el proyecto.

Alternativa: GitHub Action `schedule` o un ping externo. No usar `pg_cron` para esto: el job necesita Auth admin + Resend + `getOrCreateDailyInsight` en Node.

---

## 2. Recordatorio de documentos por vencer

No hay job. El dashboard ya cuenta `next_review_date` (RPC 039).

Si se quiere aviso in-app:

```
SELECT id, code, title, next_review_date, organization_id
FROM controlled_documents
WHERE status = 'published'
  AND next_review_date IS NOT NULL
  AND next_review_date <= CURRENT_DATE + 30
```

Índice ya existe: `idx_controlled_documents_org_published_review`.

Dedup: `doc-review-{document_id}-{next_review_date}`.  
Meterlo **dentro** del cron de notificaciones (mismo lock, mismas orgs), no un segundo HTTP.

No implementado: cambia producto (nuevos avisos). Hacerlo cuando se pida el copy.

---

## 3. Invitaciones vencidas

No hace falta cron. Al listar ya se filtra `expires_at > now()`.  
Limpieza opcional (mensual, mismo cron all-orgs):

```sql
DELETE FROM invitations
WHERE accepted = false AND expires_at < now() - interval '30 days';
```

---

## 4. `rate_limit_windows.updated_at`

El cleanup ya corre al final del cron. Si la tabla crece:

```sql
CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_updated_at
  ON public.rate_limit_windows (updated_at);
```

UNLOGGED: el índice es barato. Añadir solo si `cleanup` empieza a seq-scan.

`pg_cron` para el cleanup **solo** tiene sentido si el HTTP cron deja de existir. Mientras el cron de notificaciones viva, no duplicar.

---

## 5. Insights en el cron

Ya no llama Claude. Si en el futuro se quiere briefing IA de noche:

- Un org a la vez, `force: false` (no pisar).
- Solo orgs **sin** fila de hoy.
- No en el mismo request que 50 orgs: cola o `max 3` por corrida.

No hace falta ahora.

---

## 6. Escalamiento CAPA

Sigue on-demand. Si se quiere automático: invocarlo **una vez** al final del cron por org (mismo `due_date < hoy`). Dedup keys ya son distintos del cron (`capa-overdue-nc-*` vs `capa-overdue-{id}`).  
No unirlo todavía: marcaría NC `overdue` sin que calidad lo pida.

---

## Migración ya creada (sí aplicar)

`supabase/migrations/045_background_job_lock.sql`

- `background_job_locks` + `try_acquire_job_lock` (solo `service_role`)
- índices globales de prefiltro NC/auditorías

Sin esto el cron funciona; el lock y los índices del prefiltro no.
