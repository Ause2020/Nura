# Vulnerability

**SEC-P1-01** — `access_status` no se aplicaba fuera del middleware de páginas.

Un JWT válido de una organización `pending`, `suspended` o `expired` (o `active` con `access_expires_at` vencido) podía usar PostgREST, Storage privado y `/api/*`. El middleware solo redirigía la UI a `/acceso-pendiente`.

# Previous behavior

- `middleware.ts` + `resolveSessionGates` consultaban `access_status` / `access_expires_at` y bloqueaban rutas de dashboard.
- RLS (`036`/`041`) aislaba el tenant y el rol, **sin** mirar el estado comercial.
- `requirePermission` exigía sesión + permiso de rol, **sin** `isAccessAllowed`.
- SEC-P1-02 (047) ya impide que un org admin reescriba esos campos. No cortaba el uso de datos.

# Access semantics

Fuente de verdad de aplicación: `lib/access/constants.ts`.

| `access_status` | Significado | ¿Acceso de negocio? |
| --- | --- | --- |
| `active` | Contrato vigente | Sí, salvo fecha vencida |
| `pending` | Registrada, aún no activada | No |
| `suspended` | Corte comercial / plataforma | No |
| `expired` | Estado guardado como vencido | No |

`access_expires_at` (DATE): si está set y es **anterior a hoy**, un `active` se trata como `expired` (`resolveAccessStatus`) y `isAccessAllowed` es false. Si es null, no hay tope de fecha.

`access_granted_at` **no** participa en la decisión (tampoco lo hacía la app).

Sin perfil → denegado. Perfil sin `organization_id` → permitido en la capa de acceso (onboarding; RLS de negocio sigue exigiendo org). Org id set pero fila ausente → denegado. Platform admin (allowlist de email) salta el gate de UI/API, no el de JWT PostgREST (usa la org de su perfil si la tiene).

La función SQL replica el mismo predicado: `access_status = 'active'` y (`access_expires_at` IS NULL o `>= CURRENT_DATE`).

# Database helper

`public.current_organization_access_allowed()` en `048_org_access_enforcement.sql`:

- `STABLE` `SECURITY DEFINER` `search_path = public`
- Org solo desde `auth.uid()` → `profiles` → `organizations`
- Sin argumentos (nada que el cliente pueda falsificar)
- `GRANT EXECUTE` solo a `authenticated`
- `service_role` no la necesita: **BYPASSRLS**

`apply_org_access_gate(table)` crea una policy **RESTRICTIVE** `org_access_gate` (AND con el ACL permisivo existente: tenant + RBAC). No ensancha SELECT/INSERT/UPDATE/DELETE.

# RLS enforcement

Se aplica el gate a **todas** las tablas `public` con RLS excepto:

- `organizations` (SELECT sigue para `/acceso-pendiente` y middleware). UPDATE sí lleva gate.
- `profiles` (self SELECT/UPDATE para sesión). Compañeros y team write solo con acceso.
- `rate_limit_windows`, `security_abuse_events`, `background_job_locks` (server-only, no tocadas)

Incluye HACCP (padres e hijas), CAPA/NC, auditorías, documentos, producción, insights, notificaciones, invitaciones JWT, y tablas legado tenant-scoped que sigan con RLS.

Los generadores `_rbac_quality_*` de 041 se redefinen para **reponer** el gate si alguien regenera policies. No se re-ejecutaron aquí.

# Storage enforcement

`storage_is_org_object` ahora exige `current_organization_access_allowed()`. Todas las policies de buckets privados (035/036) que ya usaban ese helper quedan cortadas para SELECT/INSERT/UPDATE/DELETE.

`logos` no se modifica (público por diseño).

**Signed URLs ya emitidas:** siguen válidas hasta su TTL (`PRIVATE_DOWNLOAD_TTL_SECONDS` = **5 minutos**). Después de suspender, no se pueden emitir nuevas por API ni listar/descargar por Storage JWT.

# API enforcement

`assertOrganizationAccess` vive junto a `requirePermission`. Casi todas las rutas de negocio pasan por `requirePermission` / `requireOrgAdmin` (que lo llama).

Además se llama explícitamente en:

- `/api/storage/download`
- `/api/notifications/cron` (modo manual; el cron Bearer + service_role no)
- `/api/notifications/audit-completed`

Respuesta: **403** `{ error: "Forbidden" }`, no 500.

QR público (`getFieldMonitorContext`) no entrega contexto si la org del token no tiene acceso; `/api/monitoreo/qr-submit` responde **410** (mismo contrato de token inválido; no filtra estado comercial).

# Exceptions

| Flujo | ¿Gate? | Motivo |
| --- | --- | --- |
| Login / logout / password reset | No | Auth |
| `/acceso-pendiente` | No (lee org) | Mostrar estado |
| SELECT `organizations` / self `profiles` | No | Sesión y página de acceso |
| Onboarding sin org | Helper = true | Crear empresa; INSERT org es DEFINER |
| `/api/team/accept` | No | Provisioning por token; service_role |
| `/api/admin/*` | `requirePlatformAdmin` | Platform |
| Cron `Authorization: Bearer CRON_SECRET` | No | service_role; ya filtra `access_status=active` |
| Páginas de auth | No | |

# Platform/service_role behavior

- JWT `service_role` bypasea RLS (provision, suspender, listar, signed URL server-side).
- 047 sigue: solo `service_role` puede cambiar `access_status` y campos comerciales.
- `requirePermission` salta el gate de API si el email está en `NURA_ADMIN_EMAILS`.
- Un org admin **no** puede reactivarse (P1-02).

# Tests

`scripts/verify-org-access-enforcement.mjs` + `supabase/verify_org_access_enforcement.sql`:

- Semántica active/pending/suspended/expired + fecha
- Helper sin input de cliente, fail closed
- RESTRICTIVE en inventario de negocio; exclusiones server-only
- Storage + TTL 5 min
- APIs sensibles → gate → 403
- Excepciones listadas
- P1-02 intacto
- Live: helper sin JWT = false + policies presentes (`DATABASE_URL` + `psql`; si no, skip)

Un ejercicio RLS con usuarios reales (admin A suspended vs quality A vs admin B) requiere JWT `authenticated` y no se corrió contra producción. El contrato SQL está en 048 (`org_access_gate` RESTRICTIVE + `storage_is_org_object`).

# Performance impact

Cada statement de negocio añade **una** InitPlan: `(SELECT public.current_organization_access_allowed())`.

Dentro: PK `profiles.id = auth.uid()` + PK/FK `organizations.id`. No es por fila. No hay cache compartido entre tenants. `STABLE` permite que PostgreSQL lo evalúe una vez por statement.

# Regression

- `npx tsc --noEmit`
- `npm run lint` (warnings preexistentes, exit 0)
- `npm test` — 134 pass / 4 skip
- `npm run test:rbac` — 9 pass
- `npm run test:storage` — 17 pass / 2 skip
- `npm run test:org-access-enforcement` — 9 pass / 1 skip (live)
- `npm run test:org-access-guard` — 9 pass / 1 skip
- `npm run build`

048 **no** se aplicó a producción (sin CLI/psql local). Hay que pushearla al proyecto Supabase.

# Remaining risks

- **SEC-P1-03** sigue: INSERT de `notifications` a un `user_id` de otra org (si la org del atacante está *active*).
- Signed URL emitida **antes** de suspender: válida ≤ 5 min.
- Un usuario suspendido aún ve su perfil y el nombre/estado de **su** org (necesario para `/acceso-pendiente`).
- Platform admin con org suspendida en su perfil puede usar APIs de negocio (allowlist). PostgREST con su JWT de usuario **sí** queda sujeto al helper.
- `CURRENT_DATE` (Postgres, TZ del proyecto) vs medianoche local en JS: mismo modelo que el middleware; en Vercel suele ser UTC.

# Final verification

1. ¿Puede una org `suspended` leer HACCP mediante PostgREST directo? **NO.**
2. ¿Puede escribir/modificar HACCP mediante PostgREST directo? **NO.**
3. ¿Puede descargar un archivo privado directamente por Storage? **NO** (salvo signed URL previa, TTL 5 min).
4. ¿Puede consumir una API de negocio evitando middleware? **NO** (403).
5. ¿Puede un org admin volver a activar su org? **NO**, por SEC-P1-02.
6. ¿Platform admin/service_role puede reactivarla? **SÍ.**
7. ¿Sigue existiendo aislamiento Org A ↔ Org B? **SÍ** (policies 041 + gate; no se aflojó el tenant).
