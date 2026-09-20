# Vulnerability

**SEC-P1-03** — INSERT de `notifications` permitía dirigir una fila a un `user_id` de otra organización.

Org A autenticada podía (PostgREST):

```js
supabase.from("notifications").insert({
  organization_id: orgA,
  user_id: userB,
  title: "...",
  message: "...",
  link: "https://phish.example",
});
```

SELECT de B es `user_id = auth.uid()`, así que B veía el mensaje. Write cross-tenant acotado (bandeja), no lectura de HACCP de B. El `link` podía ser una URL externa (`<Link href={notification.link}>`).

# Previous policy

`041` / `007`:

```sql
WITH CHECK (organization_id = current_organization_id())
```

No exigía que `profiles.id = user_id` pertenenciera a esa org. 048 añadió el gate de acceso comercial, no el check de destinatario.

# Notification writers

| Sitio | Caller | org | user_id |
| --- | --- | --- | --- |
| `lib/notifications.ts` `createNotifications` / `notifyOrgManagers` | helper compartido | argumento (sesión) | profiles de la org o lista explícita |
| `components/capa/create-nc-form.tsx` | JWT browser | org de sesión | managers vía `notifyOrgManagers` |
| `components/documents/document-detail-view.tsx` | JWT browser | org de sesión | roles destino del documento, misma org |
| `app/api/quick-capture/nc/route.ts` | JWT API (`requirePermission`) | perfil de sesión | managers |
| `app/api/capa/escalate/route.ts` | JWT API | perfil de sesión | assigned_to + managers de la org |
| `lib/integrations/nonconformity-draft.ts` | JWT o el cliente que reciba | `input.organizationId` | managers |
| `lib/notifications/cron.ts` | JWT (manual) o **service_role** (cron Bearer) | org activa / org de sesión | managers / assigned_to consultados en esa org |
| Triggers DB / RPC previos | — | no había INSERT DEFINER | — |

Ningún flujo es “el usuario redacta una notificación arbitraria”. El INSERT browser era un efecto colateral de NC/documentos.

# Authorization decision

**authenticated no puede INSERT directo** (`REVOKE INSERT` + `DROP POLICY notifications_insert`).

Toda creación de la app pasa por `public.create_org_notifications(jsonb)` (`SECURITY DEFINER`):

- JWT: org = `current_organization_id()` (se rechaza un `organization_id` distinto); cada `user_id` debe existir en `profiles` de esa org; `current_organization_access_allowed()` (048).
- `service_role`: cada fila exige `profiles.organization_id = notification.organization_id`.
- Destinatario null/desconocido → error, no insert parcial.
- SELECT/UPDATE de leído: sin cambios (`user_id = auth.uid()`).

No se ampliaron roles. Operator/quality/admin siguen pudiendo disparar notificaciones **de sistema** (NC, documentos, escalate) vía el RPC, no inventar filas por PostgREST.

# Database enforcement

Migración `049_notifications_same_org.sql`:

- `is_safe_notification_link(text)`
- `CHECK notifications_link_internal`
- `create_org_notifications(jsonb)`
- drop `notifications_insert`
- `REVOKE INSERT` a `anon` / `authenticated`

PostgREST `.from("notifications").insert(...)` con JWT falla aunque el `user_id` sea de la misma org. El canal único es el RPC.

# Link safety

Helper TS `lib/notifications/safe-link.ts` (misma regla que SQL):

**Válido:** `null`, `/capa`, `/capa/<id>`, `/haccp/...`, `/auditorias/...`, `/documentos/<id>`, `/dashboard`, `/analisis`.

**Inválido:** `https://`, `http://`, `//host`, `javascript:`, `data:`, `/` solo, esquemas `algo:`.

Aplicado en:

- CHECK de tabla (tampoco service_role crudo puede persistir un link externo)
- RPC
- `notification-panel.tsx` (no renderiza `<Link>` si el valor no es interno)

Links actuales de Nura ya eran paths `/...`. No se rompieron.

# Service role writers

Cron (`createAdminClient` → `createNotifications` → RPC):

- Recipients salen de `profiles` / NC / auditorías **de esa org**.
- El RPC vuelve a exigir `recipient.organization_id = row.organization_id`.
- No hay `user_id` tomado del body HTTP.

Escalate / quick-capture / draft usan el cliente JWT + RPC (org de sesión).

# Tests

`scripts/verify-notification-tenant.mjs` + `supabase/verify_notification_tenant.sql`:

1. Self/same-org solo por RPC (writers actuales).
2. A → B: INSERT autenticado revocado; RPC exige profile same-org.
3. `organization_id` falsificado → excepción.
4. UUID inexistente → excepción.
5. Org suspendida → gate 048 en el RPC.
6. service_role: EXECUTE + check de tenant en cada fila.
7. SELECT dueño conservado.
8. Links internos vs externos.

`verify-notifications-perf.mjs` actualizado al contrato RPC + `ON CONFLICT DO NOTHING`.

# Regression

- `npx tsc --noEmit`
- `npm run lint` (warnings preexistentes, exit 0)
- `npm test` — 139 pass / 5 skip
- `npm run test:rbac` — 9 pass
- `npm run test:notifications` — 12 pass / 1 skip
- `npm run build`

049 **no** se aplicó a producción. Hay que pushearla al proyecto Supabase.

# Remaining risks

- Filas históricas con link externo (si las hubiera) se pusieron `link = NULL` en 049.
- Un JWT active de Org A aún puede notificar a **otros usuarios de A** (managers / acuses). Es el modelo actual, no un feature de chat libre.
- P2/P3 del audit (open redirect de login, etc.) no se tocaron.
- Hasta aplicar 049, PostgREST INSERT sigue abierto en el proyecto hosted.

# Final verification

1. ¿Puede User A insertar una notificación destinada a User B de otra org? **NO.**
2. ¿Puede falsificar `organization_id` para conseguirlo? **NO.**
3. ¿Puede colocar una URL externa/phishing en `notification.link` por un camino de usuario? **NO.**
4. ¿Siguen funcionando las notificaciones internas legítimas? **SÍ** (RPC + mismos writers).
5. ¿Se mantiene el aislamiento Org A ↔ Org B? **SÍ.**
