# Auditoría Supabase Realtime

Fecha: 2026-09-11  
Modo: solo lectura. **No se modificó código, SQL ni la publicación.**

Búsqueda en el repo: `postgres_changes`, `channel(`, `subscribe(`, `supabase_realtime`, `realtime`, `broadcast`, `presence`.

---

## Resumen

El único consumidor Realtime **funcional** es `NotificationBell` sobre `notifications` (`INSERT` + `UPDATE`, filtro `user_id`).

`broadcast` y `presence`: **ningún uso**.

`production_form_submissions` está en `supabase_realtime` (migración 021) y **no tiene consumidor**. Candidata a sacarla de la publicación.

`notifications` **se conserva**: hay consumidor funcional. En SQL **no** se añadió a la publicación; el comentario de 007 pide habilitarla a mano en el Dashboard. Verificar en el proyecto live.

---

## Inventario de búsquedas

| Patrón | Hallazgos | ¿Realtime? |
| --- | --- | --- |
| `postgres_changes` | `components/layout/notification-bell.tsx` (2 bindings) | Sí |
| `.channel(` | mismo archivo, canal `notifications-{userId}-{uuid}` | Sí |
| `.subscribe(` | mismo archivo (canal); `reset-password-form.tsx` | Solo el de la campana. El otro es `auth.onAuthStateChange` |
| `supabase_realtime` | migraciones 018, 019, 021 | Publicación |
| `realtime` (app) | `ARCHITECTURE_AUDIT.md`, `SUPABASE_DEPENDENCY_MAP.md`, `@supabase/realtime-js` en lockfile | Docs / dependencia transitiva |
| `broadcast` | ninguno | — |
| `presence` | ninguno | — |
| `removeChannel` | `notification-bell.tsx` (cleanup) | Sí |

No hay `supabase/config.toml` en el repo. No hay REPLICA IDENTITY ni `ALTER PUBLICATION … DROP` en migraciones.

---

## Tablas

### `notifications` — conservar

| Campo | Valor |
| --- | --- |
| **En publicación (SQL)** | **No.** 007 solo comenta: *Supabase Dashboard → Database → Replication → notifications* |
| **En publicación (live)** | **E (verificar).** Si la campana recibe INSERT/UPDATE en vivo, está habilitada a mano. Si no, el canal se suscribe pero no entrega filas |
| **Consumidor** | Sí, funcional |
| **Archivo** | `components/layout/notification-bell.tsx` (montado en `components/layout/sidebar.tsx`, 2 instancias: móvil `md:hidden` y desktop `hidden md:flex`; ambas montan el efecto si hay `userId`) |
| **Finalidad** | Badge + lista sin recargar: INSERT (cron, `createNotification`) y UPDATE (marcar leída) |
| **Frecuencia** | Canal abierto mientras el dashboard está montado. Eventos: pocos (cron diario, NC/auditoría/docs, clicks de lectura). 2 sockets por sesión de dashboard por el doble mount |
| **¿Necesario?** | **Sí.** Sustituto sería polling. Conservar la tabla en Realtime. Conviene **añadirla a la publicación por migración** (hoy es un paso manual) y, si se toca después, unificar las dos campanas para no duplicar el canal |

Filtro: `user_id=eq.{id}`. RLS SELECT: `user_id = auth.uid()`. Encaja.

Emisores (no son consumidores Realtime): `lib/notifications.ts`, `lib/notifications/cron.ts`.

---

### `production_form_submissions` — candidata a eliminación de la publicación

| Campo | Valor |
| --- | --- |
| **En publicación (SQL)** | **Sí.** `021_production_records.sql`: `ALTER PUBLICATION supabase_realtime ADD TABLE production_form_submissions` |
| **En publicación (live)** | **Sí**, si 021 se aplicó (no hay DROP posterior) |
| **Consumidor** | **No.** Ningún `postgres_changes` / `.channel(` sobre esta tabla |
| **Archivo consumidor** | — |
| **Finalidad original** | No documentada en 021. El precedente 018 decía *“Realtime para actualizar dashboard al recibir registros de campo”* sobre `qc_submissions` (módulo QC **eliminado** en 029). 021 parece el reemplazo; el dashboard actual no lo usa |
| **Uso actual de la tabla** | SELECT/INSERT HTTP: `lib/dashboard/data.ts`, RPC 039/040, `lib/production-records/submit.ts`, histórico, plantillas, snapshot AI, export. Kiosco: `GET /api/kiosk/metrics` cada 30–300 s (`plant-kiosk-view.tsx`). Nada de eso es Realtime |
| **Frecuencia (WAL → Realtime)** | Cada INSERT de monitoreo (formulario, QR, OCR) replica a `supabase_realtime` **sin oyente** |
| **¿Necesario?** | **No.** Candidata a `ALTER PUBLICATION supabase_realtime DROP TABLE production_form_submissions` |

Quitarla de la publicación no cambia RLS, queries ni el kiosco. Solo deja de emitir CDC.

---

### `qc_submissions` — muerta

| Campo | Valor |
| --- | --- |
| **En publicación (SQL)** | Añadida en 018. Tabla **DROP** en 029 → sale de la publicación |
| **Consumidor** | No (módulo QC eliminado) |
| **¿Necesario?** | No. Nada que hacer si 029 está aplicada |

---

### `qc_submission_readings` — muerta

| Campo | Valor |
| --- | --- |
| **En publicación (SQL)** | Añadida en 019. **DROP** en 029 |
| **Consumidor** | No |
| **¿Necesario?** | No |

---

### Resto de tablas de negocio

Ninguna otra aparece en `ALTER PUBLICATION supabase_realtime` ni tiene `postgres_changes`.

Incluye, entre otras: `haccp_*`, `audits` / `audit_*`, `nonconformities`, `capa_*`, `controlled_documents` / `document_*`, `production_form_templates` / sections / fields / values, `monitoring_qr_links`, `profiles`, `organizations`.

El dashboard y el kiosco leen por RPC/SELECT o HTTP poll. No hay Realtime.

---

## Falsos positivos

| Sitio | Qué es |
| --- | --- |
| `app/(auth)/recuperar/nueva/reset-password-form.tsx` | `supabase.auth.onAuthStateChange` → `.unsubscribe()`. Auth, no `postgres_changes` |
| `components/dashboard/plant-kiosk-view.tsx` | `setInterval` + `fetch("/api/kiosk/metrics")`. Poll HTTP |
| `router.refresh()` en formularios | RSC, no Realtime |
| `package-lock.json` `@supabase/realtime-js` | Traído por `@supabase/supabase-js`. No implica uso |
| Carrusel landing `setInterval` | UI |

`lib/supabase/client.ts` es `createBrowserClient` sin opciones Realtime extra (defaults del SDK).

---

## Consumidor único (detalle)

`notification-bell.tsx`:

1. Carga inicial: `SELECT * FROM notifications WHERE user_id = $id ORDER BY created_at DESC LIMIT 50`.
2. Canal `notifications-{userId}-{crypto.randomUUID()}` (uuid para Strict Mode).
3. `postgres_changes` INSERT + UPDATE, `schema: public`, `table: notifications`, `filter: user_id=eq.{userId}`.
4. Cleanup: `removeChannel`.
5. DELETE: no escuchado (tampoco hay borrado en app).

No usa `broadcast` ni `presence`.

---

## Riesgo / coste

| Ítem | Riesgo | Nota |
| --- | --- | --- |
| `production_form_submissions` en la publicación | WAL + slots Realtime por cada registro de planta | Sin beneficio. Prioridad de limpieza |
| `notifications` no está en 007 como `ADD TABLE` | La campana puede estar “sorda” en un proyecto que solo corrió migraciones | Verificar Publication en el Dashboard; si falta, añadirla en una migración futura |
| Dos `NotificationBell` montadas | 2 suscripciones por usuario | Cosmético; no justifica apagar Realtime |
| UPDATE filtrado por `user_id` (no PK) | A veces hace falta `REPLICA IDENTITY FULL` | Si los mark-read no llegan en vivo, revisar identity. No cambiar ahora |

---

## Qué no hacer todavía

- No `DROP` de la publicación.
- No añadir `notifications` a la publicación en esta pasada.
- No tocar el kiosco ni el dashboard.

Cuando se limpie: quitar `production_form_submissions` de `supabase_realtime`. Dejar `notifications` y, si aplica, formalizar su `ADD TABLE` en SQL.
