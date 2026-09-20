# Auditoría de seguridad pre-producción — Nura

Fecha: 2026-09-13  
Alcance: análisis estático + tests locales no destructivos ya existentes. **No se modificó código, RLS, migraciones ni secretos.**  
Pregunta principal: ¿puede un usuario leer, modificar, crear, eliminar, inferir o descargar información de **otra** organización?

---

# Executive summary

**No hay evidencia de un IDOR cross-tenant que permita a Org A leer o alterar el plan HACCP, documentos controlados, auditorías, CAPA o Storage de Org B** cuando el flujo llega a RLS con el cliente JWT (`anon` + sesión). Las policies de negocio actuales (`036` + `041`) atan `organization_id` a `current_organization_id()` / `auth.uid()`, y `protect_org_identity` impide reasignar el tenant en UPDATE.

Sí hay fallos de autorización **dentro del tenant** y un write cross-tenant **acotado** (inyectar una notificación a un `user_id` ajeno). `access_status` **no** está en RLS: un usuario de una org suspendida sigue pudiendo usar PostgREST y `/api/*` con su JWT. Un admin de org puede además **reescribir** `access_status` / `access_expires_at` en `organizations`.

Eso **no** es un bypass de autenticación ni exposición de `service_role` al browser. Tampoco es lectura de HACCP ajeno.

**¿Hay un motivo de seguridad que impida poner Nura en producción hoy?**

Si el criterio es “ninguna empresa puede ver el HACCP de otra”: **no hay P0 con evidencia de exfiltración cross-tenant**.

Si el criterio incluye “suspender una org es un corte real” o “nadie puede escribir en la bandeja de otro tenant”: **aún no**.

## Resultado

**GO WITH CONDITIONS**

Condiciones antes de tratar el acceso comercial / suspensión como control de seguridad, y antes de onboarding de clientes que no sean piloto controlado:

1. Impedir que el admin de org actualice `access_status`, `access_expires_at`, `access_granted_at`, `contract_notes`, `provisioned_by`.
2. Hacer valer `access_status` en RLS **o** en un gate de API/PostgREST que no se pueda saltar con el cliente JS.
3. Cerrar el INSERT de `notifications` para que `user_id` pertenezca a la misma organización (idealmente solo service_role / funciones internas).
4. Validar en el dashboard de Supabase Auth que el signup público esté deshabilitado (la app redirige `/register`, pero el anon key sigue existiendo).

Sin esas condiciones, un piloto con orgs `active` y usuarios provisionados/invitados es defendible. No lanzar cobro/suspensión como único kill-switch.

---

# Attack surface

| Superficie | Clasificación | Notas |
| --- | --- | --- |
| Tablas de negocio con `organization_id` (HACCP 12 pasos, auditorías, CAPA, documentos, producción, notificaciones, invitaciones, insights) | AUTHENTICATED + ROLE-RESTRICTED (RLS) | Cliente JWT. Quality vs operator en `036`/`041`. |
| Tablas hijas HACCP (`plan_id`, sin org en algunas) | AUTHENTICATED + ROLE-RESTRICTED | Policy `EXISTS` al padre `haccp_plans`. |
| Tablas legado aún en DB (`suppliers*`, `customer_complaints*`, `training_*`, `trace_*`, `haccp_products/hazards/ccps` antiguos) | AUTHENTICATED + ROLE-RESTRICTED | UI oculta (`HIDDEN_MODULE_PREFIXES`). PostgREST sigue vivo. |
| `rate_limit_windows`, `security_abuse_events`, `background_job_locks` | SERVER-ONLY | REVOKE a `anon`/`authenticated`. RPC solo `service_role`. |
| Views | — | No hay views de negocio en migraciones actuales. |
| RPC `current_organization_id`, `rbac_*`, `get_my_profile` | AUTHENTICATED | DEFINER, `search_path = public`, acotados a `auth.uid()`. |
| RPC `complete_user_onboarding`, `ensure_user_profile`, `finalize_user_onboarding` | AUTHENTICATED | DEFINER. Crean org propia o marcan onboarding. |
| RPC `get_dashboard_metrics`, `get_kiosk_metrics` | AUTHENTICATED | **INVOKER** + RLS. |
| RPC `consume_rate_limit*` | SERVER-ONLY | DEFINER, EXECUTE solo `service_role`. |
| Storage confidencial (`haccp-evidence`, `controlled-documents`, `audit-photos`, `nc-photos`, `production-record-photos`, …) | AUTHENTICATED + ROLE-RESTRICTED | Path `[org_id]/…`. Writes por `storage_can_write_bucket`. |
| Bucket `logos` | PUBLIC (branding) | Intencional. No es HACCP. |
| Route handlers `app/api/**` | AUTHENTICATED / ROLE-RESTRICTED / PUBLIC / SERVER-ONLY | Ver matriz API. Middleware **no** exige login en `/api`. |
| Server Actions | — | **No hay** `"use server"`. |
| Middleware `middleware.ts` + `updateSession` | SERVER-ONLY (Edge) | Páginas protegidas, no APIs. `getUser()`, no `getSession()`. |
| IA `/api/ai/*`, `/api/monitoreo/ocr` | ROLE-RESTRICTED | Claude server-side. Org del insight = sesión. |
| Export PDF/JSON | ROLE-RESTRICTED | Org de sesión. |
| Uploads | AUTHENTICATED + Storage RLS | Download API no acepta `path`/`bucket`. |
| Invitaciones `/api/team/*`, `/invitacion/[token]` | ROLE-RESTRICTED / PUBLIC (token) | Token 24 bytes. Accept usa service_role. |
| Auth `/api/auth/login`, `/forgot-password`, `/auth/callback` | PUBLIC | Rate limit AUTH. |
| Onboarding `/onboarding` | AUTHENTICATED | RPC founder → admin de **su** org. |
| Platform admin `/admin/*`, `/api/admin/*` | ROLE-RESTRICTED (email allowlist) | `NURA_ADMIN_EMAILS` + service_role. No es rol de org. |
| QR `/m/[token]`, `/api/monitoreo/qr-submit` | PUBLIC (token) | service_role acotado al link. |
| Cron `/api/notifications/cron` | SERVER-ONLY (Bearer) o AUTHENTICATED (manual, propia org) | |
| Webhooks | — | No hay receivers de firma de terceros. Cron es el único hook. |
| Env relevantes | SERVER-ONLY salvo `NEXT_PUBLIC_*` | Ver Secrets. |

---

# Multi-tenant isolation matrix

`FORCE RLS` **no** está aplicado en ninguna migración. En Supabase hosted, `authenticated` no es owner de las tablas; el bypass relevante es `service_role` (BYPASSRLS), no el usuario de app. Resultado: P3 defensa en profundidad, no IDOR.

`access_status` **no** forma parte de ninguna policy de negocio. Membership = `profiles.organization_id` del JWT.

| Resource | RLS | SELECT | INSERT | UPDATE | DELETE | Tenant source | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `organizations` | sí | propia `id = current_org` | no (cliente); DEFINER onboarding / service_role | admin org, **todas las columnas** | no (cliente) | fila `id` | **P1**: admin puede setear `access_status`. No cruza de org. |
| `profiles` | sí | yo + compañeros misma org | yo, trigger fuerza `operator` + org NULL | yo (sin role/org) o admin (otros, misma org, no self) | no | `organization_id` + trigger | No self-role. No hop de org. |
| `haccp_plans`, `haccp_step_data`, `haccp_monitoring_records` | sí | quality + misma org | quality + org sesión | quality + org sesión | quality + org sesión | `organization_id` = `current_organization_id()` | IDOR UUID B → 0 filas |
| `haccp_teams`, `diagrams`, `hazards`, `ccp_decisions`, `validations`, `plan_products` | sí | quality vía `EXISTS` plan | idem | idem | idem | padre `haccp_plans.organization_id` | Hija sin org propia: parent check correcto |
| `audits`, `audit_*`, `audit_templates*` | sí | quality + org / EXISTS padre | quality | quality | quality | `organization_id` o padre | Aislado |
| `nonconformities` | sí | quality | admin/QM/**operator** misma org | quality | no | `organization_id` | Operator crea NC; no lee HACCP ajeno |
| `capa_actions`, `nc_5whys`, `nc_fishbone`, `nc_photos` | sí | quality | quality o operator (fotos/log) | quality | admin (algunas) | org | Aislado |
| `controlled_documents` | sí | quality **o** operator si `published`/`obsolete` | quality | quality | admin | org | Operator no ve borradores |
| `document_versions` | sí | quality o operator | quality | quality | admin | org | Path Storage aún exige prefijo org |
| `production_form_*`, submissions, values | sí | misma org (todos los roles) | misma org | misma org | quality | org | Operator puede **sobrescribir** submissions del tenant (P2 integridad) |
| `monitoring_qr_links` | sí | misma org | **cualquier** rol autenticado misma org | cualquier rol | quality | org | Token 192 bit. service_role en submit no verifica `template.organization_id` (fail-closed si fields no cruzan) |
| `invitations` | sí | **solo admin** misma org | admin | admin | admin | org | Token no visible a operator/QM |
| `notification_preferences` | sí | misma org | admin | admin | — | org | |
| `notifications` | sí | `user_id = auth.uid()` | org sesión, **cualquier `user_id`** | dueño (read) | — | org en INSERT; SELECT por user | **P1** inyección a UUID ajeno |
| `ai_daily_insights` | sí | quality + org | quality | quality | quality | org | API usa org de sesión |
| `rate_limit_*`, `security_abuse_events`, `background_job_locks` | sí + REVOKE | no authenticated | — | — | — | n/a | |
| Legado suppliers/complaints/training/trace/haccp clásico | sí (si la tabla existe) | quality + org (036/041) | quality | quality | quality | org | Superficie residual; no UI |

**IDOR conceptual (Org A conoce UUID de Org B):**

| Acción | Resultado según código + RLS |
| --- | --- |
| SELECT / UPDATE / DELETE fila de negocio | 0 filas. `organization_id` ≠ sesión. |
| UPSERT con `organization_id` de B | INSERT WITH CHECK falla. UPDATE no puede cambiar org (`protect_org_identity`). |
| RPC `get_dashboard_metrics` / `get_kiosk_metrics` | INVOKER; solo agrega la org de `auth.uid()`. |
| RPC `rbac_same_org(id_de_B)` | Devuelve false; no filtra datos. |
| Download `/api/storage/download?id=<uuid B>` | Lookup `.eq(organization_id, sesión)` → 404. |
| Storage `download(B/…)` | `storage_is_org_object` exige primer folder = org A. |
| Export `/api/settings/export` | `organizationId` de perfil, no del body. |

---

# Role authorization matrix

Roles reales de organización: `admin`, `quality_manager`, `operator`.  
Platform admin: allowlist de email (`NURA_ADMIN_EMAILS`), **no** es fila en `profiles.role`.

| Acción | Quién debería | UI | Servidor | DB/RLS |
| --- | --- | --- | --- | --- |
| Gestionar usuarios / invitaciones | admin | nav + `/configuracion/usuarios` | `requireOrgAdmin` = `users.manage` | invitations + `profiles_admin_update_team`; trigger bloquea self-role |
| Settings empresa / export | admin | layout `settings.manage` | `PERMISSIONS.settings.manage` | `admins_update_own_organization` (**columnas no restringidas**) |
| HACCP / auditorías / docs manage | admin, QM | sidebar; operator no ve `/haccp` | páginas + RLS quality | `rbac_quality()` |
| Transiciones restringidas docs/HACCP | admin | permiso `transitionRestricted` | catálogo TS | RLS no distingue transition vs edit quality |
| Crear NC / captura | operator+ | quick capture | `capa.create` | INSERT NC permitido a operator |
| Ejecutar registros / kiosco | operator+ | `/registros`, `/planta` | `production.execute` / `monitoring.*` | submissions org-wide |
| `/configuracion` por URL | solo admin | layout redirige QM/operator | layout + APIs | QM pasa middleware (`canAccessPath` true) pero layout corta |
| `/admin` | platform admin | middleware | `requirePlatformAdmin` | service_role en provision |
| Cambiar su role | nadie | — | `updateMemberRole` rechaza self | trigger + WITH CHECK |
| Cambiar su `organization_id` | nadie (salvo invite service_role) | — | accept invite email-match | `organization_id is immutable` si ya tenía org |
| operator → admin | admin de la misma org | UI team | PATCH members | admin only |
| member → “owner” | no existe owner | — | — | founder = admin en onboarding |
| org admin → platform admin | no | — | email allowlist | no hay columna |

**Escalada conceptual**

- **operator → admin:** no por self-update. Sí si un admin de su org lo promociona (intencional).
- **QM → admin:** igual, solo otro admin.
- **org admin → platform admin:** no. Hace falta estar en `NURA_ADMIN_EMAILS` (secreto de deploy).
- **Usuario sin perfil → admin:** `ensureProfileWithAdmin` (`lib/auth/session-server.ts` ~82–88) inserta `role: "admin"` con service_role (el trigger **no** reescribe service_role). El cliente (`session.ts` ~53–59) también **intenta** insertar `admin`, pero el trigger + policy lo bajan a `operator`. El fallback server sí queda admin sin org; el onboarding lo convierte en founder. No cruza tenants.

---

# Storage audit

| Bucket | Público | SELECT | INSERT/UPDATE | DELETE | Path | Resultado Org A vs path/UUID B |
| --- | --- | --- | --- | --- | --- | --- |
| `haccp-evidence` | privado | org folder | quality + folder org | quality | `[org]/…` | No download/replace/delete B |
| `controlled-documents` | privado | org folder | quality | quality | `[org]/…` | No |
| `audit-photos` | privado | org folder | quality | quality | `[org]/…` | No |
| `nc-photos` | privado | org folder | admin/QM/operator | quality | `[org]/…` | No |
| `production-record-photos` | privado | org folder | admin/QM/operator | quality | `[org]/…` | No |
| `lab-reports`, `supplier-docs`, `complaint-photos` | privados si existen | org folder | quality / según 036 | quality | — | 038 los borra si vacíos. Residuales. |
| `logos` | **público** | abierto | policies 010 (org) | org | branding | Enumeración de logos, no HACCP |

Signed URLs: `createSignedUrl` 5 minutos (`PRIVATE_DOWNLOAD_TTL_SECONDS`). El API **rechaza** `path`/`bucket`/`file_url` en query o body. Resuelve `kind` + UUID vía SELECT RLS y exige `storagePathBelongsToOrg`. UUID de B → 404 (no 403).

MIME/tamaño: límites en buckets (p.ej. fotos 5 MB, jpeg/png/webp). JSON permitido en `controlled-documents` (snapshots HACCP).

Overwrite: UPDATE de objeto exige write de bucket + folder org. No hay path traversal: el helper usa `storage.foldername(name)[1]`.

---

# RPC audit

| Función | Security | EXECUTE | User/org | ¿Confía org del cliente? | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `current_organization_id` / `my_organization_id` | DEFINER | authenticated | `profiles` donde `id = auth.uid()` | no | bajo |
| `current_user_role`, `rbac_is`, `rbac_same_org`, `rbac_quality`, `rbac_admin` | DEFINER | authenticated | uid | `rbac_same_org(p_org)` compara con **sesión**, no abre B | bajo |
| `storage_is_org_object`, `storage_can_write_bucket` | DEFINER | authenticated | uid + path | no | bajo |
| `get_my_profile` | DEFINER | authenticated | solo fila propia | no | bajo |
| `handle_new_user` | DEFINER trigger | n/a | ignora `raw_user_meta_data.role` → operator | no | positivo |
| `ensure_user_profile` | DEFINER | authenticated | inserta operator | no | bajo |
| `complete_user_onboarding` | DEFINER | authenticated | crea org `active` si no tiene org; si ya tiene, solo marca onboarding | no acepta role/org del cliente | self-serve tenant (P2 si Auth signup está on) |
| `finalize_user_onboarding` | DEFINER | authenticated | solo su `organization_id` | no | no roba org |
| `protect_profile_identity` / `protect_org_identity` | DEFINER trigger | n/a | bloquea hop de org / self-role | service_role bypass intencional | no cubre `access_status` en `organizations` |
| `get_dashboard_metrics` | **INVOKER** | authenticated | org de perfil + RLS | no | correcto |
| `get_kiosk_metrics` | **INVOKER** | authenticated | igual | no | correcto |
| `consume_rate_limit*` / `record_rate_limit_abuse` / `cleanup_*` | DEFINER | **service_role only** | n/a | n/a | correcto |
| `_rbac_*` helpers | INVOKER (migración) | REVOKE PUBLIC | n/a | CREATE POLICY fallaría como user | no escalada |
| `create_default_notification_preferences` | DEFINER trigger | n/a | org nueva | n/a | bajo |

`search_path` fijado a `public` (y `public, storage` en helper de Storage) en los DEFINER revisados. No hay SQL dinámico con input de usuario en RPCs de runtime (el dinámico `_rbac_*` es de migración y está revocado).

---

# API / Server Action audit

No hay Server Actions.

| Ruta | AuthZ | Org | Body org? | Rate limit | service_role | Clase |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/auth/login` | credenciales | — | no | AUTH | no | PUBLIC |
| `POST /api/auth/forgot-password` | email (siempre 200) | — | no | AUTH | no | PUBLIC |
| `GET /auth/callback` | code PKCE | `next` sanitizado (`/` y no `//`) | no | AUTH | no | PUBLIC |
| `POST /api/team/accept` | token o sesión+email | invite | no | AUTH | sí, por token | PUBLIC / AUTH |
| `POST /api/team/invite` | admin | perfil | no | EMAIL | no (insert RLS) | ROLE |
| `POST /api/team/create-user` | admin | perfil (ignora org del body) | no | EMAIL | sí, org sesión | ROLE |
| `PATCH/DELETE /api/team/members/[id]` | admin | perfil + check org del miembro | no | AUTHENTICATED | sí | ROLE |
| `GET /api/team/members` | admin | perfil | no | AUTHENTICATED | sí (list) | ROLE |
| `PATCH /api/settings/organization` | `settings.manage` | perfil; whitelist de campos | no `access_*` | AUTHENTICATED | no | ROLE — **PostgREST directo sí puede** |
| `GET /api/settings/export` | `settings.manage` | perfil | no | HEAVY | sí, filtrado por org sesión | ROLE |
| `GET/PATCH /api/settings/notifications` | settings | perfil | no | AUTHENTICATED | no | ROLE |
| `GET/POST /api/storage/download` | sesión + org | perfil | path prohibido | AUTHENTICATED | no | AUTH |
| `GET/POST /api/ai/daily-insight` | `analysis.read` | perfil | `force` solo | AI | no | ROLE |
| `POST /api/ai/nc-analysis` | `capa.manage` | no lee DB ajena | texto NC | AI | no | ROLE |
| `POST /api/monitoreo/ocr` | `monitoring.execute` | no lee DB | imagen | AI | no | ROLE |
| `POST /api/monitoreo/qr-submit` | token | link.organization_id | no | PUBLIC_FORM | sí | PUBLIC |
| `GET /api/kiosk/metrics` | `monitoring.read` | perfil | no | AUTHENTICATED | no | ROLE |
| `POST /api/quick-capture/*` | create/execute | perfil | no | WRITE | no | ROLE |
| `POST /api/capa/escalate` | `capa.manage` | perfil | no | HEAVY | no | ROLE |
| `GET /api/export/audit-pdf/[id]` | `audits.read` | perfil + id | no | HEAVY | no | ROLE |
| `POST /api/notifications/cron` | Bearer `CRON_SECRET` **exacto** o usuario | all-orgs vs propia | no | CRON/HEAVY | sí | SERVER / AUTH |
| `POST /api/notifications/audit-completed` | sesión (sin permiso de módulo) | perfil + audit org | auditId | EMAIL | sí emails | AUTH — operator no ve audit (404) |
| `GET/PATCH /api/admin/organizations` | platform email | body.organizationId **solo platform** | sí, admin | ADMIN | sí | ROLE |
| `POST /api/admin/provision-*` | platform | body | sí | ADMIN | sí | ROLE |

**Patrón `body.organizationId`:** solo rutas platform-admin. Team/create y export usan `profile.organization_id`.

**Middleware:** `protectedPaths` es de páginas. `/api/*` no exige sesión, onboarding ni `accessAllowed`. Cada ruta autentica por su cuenta; **ninguna** llama `isAccessAllowed`.

Errores: varios devuelven `error.message` de Supabase (P3). Login unifica “Credenciales incorrectas”.

---

# Auth/session audit

| Flujo | Hallazgo |
| --- | --- |
| Signup app | `/register` → `/login?info=manual-access`. No hay `signUp` en el código de app. **Supabase Auth signup por anon key no está denegado en este repo** (configuración del proyecto). |
| Login | `/api/auth/login` + cookies SSR. Rate limit 5/60s email+IP. |
| Logout / refresh | cliente Supabase estándar (`@supabase/ssr`). |
| Password reset | `resetPasswordForEmail` → `/auth/callback?next=/recuperar/nueva` (fijo). No open redirect en reset. |
| Callback `next` | `safeNextPath`: debe empezar por `/` y no por `//`. |
| Login `?redirect=` | **`router.push(redirectTo)` sin allowlist** (`login-form.tsx` ~69–70). Open redirect post-login. |
| Invitations | token `randomBytes(24)`. Accept exige email. Bloquea hop si ya hay otra org. `email_confirm: true` en createUser (el token es el factor). |
| Session | middleware usa `getUser()`. |
| Rol/org stale | JWT no lleva role; cada request lee `profiles` / `get_my_profile`. Cambio de rol aplica en el siguiente request. |
| Org suspendida | UI → `/acceso-pendiente`. **API + PostgREST + Storage RLS siguen** si el JWT es válido. |
| Platform admin | fail-closed si `NURA_ADMIN_EMAILS` vacío. |

---

# AI security

## APPLICATION SECURITY

- Clave `ANTHROPIC_API_KEY` solo servidor. No hay `NEXT_PUBLIC` de IA.
- Daily insight: snapshot y persistencia con `organizationId` de sesión (`requirePermission` + store). No hay `organizationId` de cliente.
- NC analysis / OCR: no cargan filas de otra org; el modelo solo ve el body.
- Sin tools/function-calling que escriban la DB. El JSON se parsea y se acota (5 whys, fieldIds allowlist en OCR).
- Rate limit policy AI (10/min user + tope IP). `force: true` en daily-insight permite a admin/QM gastar tokens (abuso de coste, misma org).
- OCR limita ~4 MB base64.

## AI SAFETY (no es P0 de app)

- Prompt injection en descripción NC u OCR puede torcer el **texto** del JSON. No cambia RLS ni org.
- No render `dangerouslySetInnerHTML` de salidas IA.

---

# Secrets

| Nombre | Destino | ¿Browser? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | público | sí (diseño) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público, RLS | sí (diseño) |
| `NEXT_PUBLIC_APP_URL` | links | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient` server | **no** (`lib/supabase/admin.ts`, sin `NEXT_PUBLIC_`) |
| `NURA_ADMIN_EMAILS` | platform admin | no |
| `CRON_SECRET` | cron | no; comparación constante-time |
| `ANTHROPIC_API_KEY` | Claude | no |
| `RESEND_API_KEY` | email | no |
| `RATE_LIMIT_PEPPER` | hashes de subject | no |

No se listan valores. `createAdminClient` no se importa desde componentes cliente. Logs de perf no incluyen JWT/payloads HACCP.

**service_role en requests de usuario:** invitaciones, members, export, preferencias admin, QR submit, cron, fallback de perfil, rate-limit store. En los caminos de producto el filtro es org de **sesión** o **token**. Eso **sí** bypasea RLS, por eso el scoping en código es obligatorio (y está, salvo el fallback de perfil `role: admin`).

---

# Abuse/rate limiting

- Store: Postgres `consume_rate_limit` vía service_role. Compartido entre instancias.
- Login / reset / accept: AUTH fail-closed.
- QR submit: PUBLIC_FORM ip+token.
- AI/OCR: AI + UNAUTH_PROBE.
- IP: `x-vercel-forwarded-for` gana; si no hay Vercel, `x-forwarded-for` es spoofable en self-host (P3/P2 según hosting).
- `RATE_LIMIT_DISABLED` explícito.
- Middleware swallow de errores de rate limit: no tumba la app (fail-open en el catch).
- Cron manual autenticado: cualquier usuario con org dispara notificaciones/emails de **su** org (P2 abuso).

---

# Dependency/config audit

- Next 15.5.24, React 19, `exceljs` (no `xlsx`). Tests locales bloquean parseo de spreadsheets de usuario y formula injection.
- `next.config.mjs`: **sin** `headers()` (CSP, HSTS, X-Frame-Options, Referrer-Policy). Sin CORS custom (mismo origin).
- Source maps: no se habilitan extra en config.
- Node: warning de Supabase hacia Node 22; repo en Node 20.
- `npm audit` local (no se actualizó nada): **0 critical**, 1 high (`postcss` XSS en stringify CSS — toolchain de build, no runtime de usuario), 3 moderate.

---

# Findings

## P0 CRITICAL

_Ninguno con evidencia de lectura/escritura HACCP o Storage cross-tenant, auth bypass, o secretos en el bundle._

## P1 HIGH

### SEC-P1-01 — `access_status` no se aplica fuera del middleware de páginas

- **Severity:** P1  
- **Confidence:** alta  
- **Component:** `middleware.ts`, `lib/access/session-gates.ts`, RLS de negocio, `lib/auth/require-permission.ts`  
- **Prerequisite:** usuario con JWT de una org `suspended` / `expired` / `pending`  
- **Attack path:** llamar PostgREST (`/rest/v1/haccp_plans`, etc.) o `/api/*` que solo usa `requirePermission`. RLS permite la org. Middleware no corre el gate en APIs.  
- **Impact:** la suspensión comercial **no corta** lectura/escritura de datos de **su** org (HACCP, NC, documentos publicados, Storage de su prefijo). No da acceso a otra org.  
- **Evidence:** policies `041_optimize_rls.sql` (preds solo `organization_id` + role). `require-permission.ts` 26–44 (sesión + role, sin `isAccessAllowed`). `middleware.ts` 7–23 vs matcher: `/api` no está en `protectedPaths` para el redirect de acceso.  
- **Remediation:** pred RLS `EXISTS (organizations … access_status = 'active' …)` **o** middleware/gate en todas las APIs + bloqueo del cliente JS no basta.

### SEC-P1-02 — Admin de organización puede reactivar su propia org

- **Severity:** P1  
- **Confidence:** alta  
- **Component:** `organizations` UPDATE policy  
- **Prerequisite:** `role = admin` de la org suspendida + JWT  
- **Attack path:** `supabase.from('organizations').update({ access_status: 'active', access_expires_at: null }).eq('id', myOrgId)`  
- **Impact:** anula el control de platform admin. Luego la UI vuelve a funcionar.  
- **Evidence:** `041_optimize_rls.sql` 1052–1062: USING/WITH CHECK solo `id = current_org AND rbac_admin()`, sin lista de columnas. `protect_org_identity` no corre en `organizations` (no tiene columna `organization_id`). `settings/organization/route.ts` no manda `access_*`, pero no es la única vía.  
- **Remediation:** trigger que restaure `access_*` / `contract_notes` / `provisioned_by` si `auth.role() <> 'service_role'`, o columnas privilegiadas solo service_role.

### SEC-P1-03 — INSERT de notificaciones a cualquier `user_id`

- **Severity:** P1  
- **Confidence:** alta (política); media (UUID de víctima)  
- **Component:** `notifications` INSERT + `notification-panel.tsx`  
- **Prerequisite:** autenticado con org; UUID de un usuario de otra org  
- **Attack path:** INSERT `{ organization_id: orgA, user_id: victimB, title, message, link: 'https://phish' }`. SELECT de B es `user_id = auth.uid()` → la ve. `Link href={notification.link}` puede ser URL externa.  
- **Impact:** write cross-tenant en la bandeja (phishing/spam). **No** lee HACCP de B.  
- **Evidence:** `041_optimize_rls.sql` 823–825; `007_notifications.sql` 27–30 (mismo hueco histórico). UI `components/layout/notification-panel.tsx` 136–138.  
- **Remediation:** WITH CHECK `user_id = auth.uid()` **o** `EXISTS (profiles p WHERE p.id = user_id AND p.organization_id = current_org)` y, mejor, INSERT solo service_role. Sanitizar `link` a paths internos.

## P2 MEDIUM

### SEC-P2-01 — Open redirect post-login

- **Confidence:** alta  
- **Component:** `app/(auth)/login/login-form.tsx` 17, 69–70  
- **Path:** `/login?redirect=https://evil.example` o `//evil.example` → `router.push`.  
- **Impact:** phishing después de credenciales válidas. El callback de reset **sí** está saneado.  
- **Remediation:** misma regla que `safeNextPath`.

### SEC-P2-02 — Signup / onboarding self-serve vs “acceso manual”

- **Confidence:** media (depende del dashboard Auth)  
- **Component:** `complete_user_onboarding` (`036` 144–216) crea org `access_status = 'active'`. App oculta `/register`.  
- **Impact:** si `signUp` está habilitado en Supabase, cualquiera crea tenant activo y es admin.  
- **Remediation:** deshabilitar signups en Auth; opcionalmente crear orgs como `pending`.

### SEC-P2-03 — Fallback service_role crea perfil `admin`

- **Confidence:** alta  
- **Component:** `lib/auth/session-server.ts` 82–88  
- **Impact:** inconsistente con `handle_new_user` (operator). No cruza org; facilita founder si el trigger falló.  
- **Remediation:** insertar `operator`, igual que el RPC.

### SEC-P2-04 — Integridad intra-tenant en submissions / QR links

- **Confidence:** alta  
- **Component:** `041_optimize_rls.sql` 760–804  
- **Impact:** cualquier miembro de la org puede UPDATE submissions y QR links ajenos del mismo tenant. No es Bola cross-org.  
- **Remediation:** UPDATE de submissions al autor o quality; INSERT/UPDATE de QR solo quality.

### SEC-P2-05 — Cron y emails disparables por cualquier autenticado de la org

- **Confidence:** alta  
- **Component:** `app/api/notifications/cron/route.ts` 30–57; `audit-completed/route.ts` 13–22  
- **Impact:** spam/coste Resend + jobs. Misma org.  
- **Remediation:** `requirePermission` quality/admin; no cron manual o rate más estricto.

### SEC-P2-06 — `force: true` en daily insight

- **Confidence:** alta  
- **Component:** `app/api/ai/daily-insight/route.ts` 38–44  
- **Impact:** abuso de tokens Anthropic (admin/QM).  
- **Remediation:** reservar force a cron/platform o cupo diario duro.

### SEC-P2-07 — SSRF vía `logo_url` en el PDF de auditoría

- **Confidence:** alta  
- **Component:** `app/api/settings/organization/route.ts` 36–38; `lib/export/audit-pdf-document.tsx` 325–326; `app/api/export/audit-pdf/[id]/route.tsx` 60–79  
- **Prerequisite:** `settings.manage` (admin de org)  
- **Attack path:** PATCH `logo_url` a `http://169.254.169.254/…` u otro host interno. Un usuario con `audits.read` genera el PDF; `@react-pdf` `Image src` resuelve la URL en el servidor.  
- **Impact:** fetch server-side arbitrario (SSRF). No lee HACCP de otra org. En Vercel el metadata IP a menudo no es alcanzable; en self-host sí.  
- **Remediation:** aceptar solo paths del bucket `logos` o URLs del propio proyecto Storage; denegar IPs privadas.

### SEC-P2-08 — Rate limit `failClosed` no se aplica si el store falla

- **Confidence:** alta  
- **Component:** `lib/rate-limit/enforce.ts` 101–103; policies AUTH/AI declaran `failClosed: true` en `core.mjs`  
- **Attack path:** Postgres/`consume_rate_limit` no disponible → `unavailable` → `{ allowed: true }` siempre. El catch de `middleware.ts` 62–64 también traga errores.  
- **Impact:** login, reset e IA quedan sin cupo justo cuando el control de abuso está caído.  
- **Remediation:** si `spec.failClosed` y `unavailable`, denegar 429.

## P3 LOW

### SEC-P3-01 — Sin security headers / CSP

- `next.config.mjs` no define headers. Defense in depth.

### SEC-P3-02 — Sin FORCE RLS

- Owner/postgres podría saltarse RLS. Irrelevante para `authenticated` en hosted.

### SEC-P3-03 — Tablas legado aún consultables por PostgREST

- UI redirige `/proveedores` etc. Quality de la **misma** org aún podría SELECT si las tablas existen. No es cross-tenant.

### SEC-P3-04 — Bucket `logos` público

- Branding enumerable. No HACCP.

### SEC-P3-05 — Mensajes `error.message` de PostgREST en APIs

- Fuga menor de esquema/SQLSTATE.

### SEC-P3-06 — QR `template_id` no se revalida contra `link.organization_id` en service_role

- `lib/production-records/qr-context.ts` 35–40. Fields de otra org no pasan el filtro → `null`. Fail-closed hoy; conviene igualar IDs.

### SEC-P3-07 — `npm audit` high en `postcss` (build)

- No es runtime de datos de cliente.

### SEC-P3-08 — IP rate-limit spoofable fuera de Vercel

- `getClientIp` en `lib/rate-limit/core.mjs` 127–135.

### SEC-P3-09 — Cliente intenta `profiles.insert({ role: 'admin' })`

- Neutralizado por trigger/policy (`session.ts` 53–59). Ruido; alinear a `operator`.

### SEC-P3-10 — `nc_photos` no tiene `CREATE TABLE` en migraciones

- Policies en `036`/`041` son `IF to_regclass('public.nc_photos')`. El código inserta en `app/api/quick-capture/nc/route.ts`. En un apply limpio la tabla no existe (feature rota). En prod, si se creó a mano, hay que confirmar `ENABLE RLS`. No es IDOR por sí solo.

### SEC-P3-11 — Verificar que 035 reemplazó el SELECT global de `haccp-evidence`

- `031_haccp_evidence_bucket_policies.sql` tenía `SELECT` a todo el bucket para `authenticated`. `035` lo sustituye por `storage_is_org_object`. **No es un P0 del repo actual** si las migraciones se aplicaron en orden. Confirmar en prod con `supabase/verify_private_storage.sql` (0 filas en queries de fallo).

---

# Positive controls

- RLS habilitado en tablas de negocio; quality atado a `current_organization_id()`.
- Hijas HACCP/auditoría con `EXISTS` al padre de la org (041), no solo join ciego.
- `protect_profile_identity` / `protect_org_identity`: no self-role, org inmutable en UPDATE.
- `handle_new_user` ignora `user_metadata.role`.
- Platform admin fail-closed; provision usa service_role solo tras allowlist.
- `get_dashboard_metrics` / `get_kiosk_metrics` INVOKER (no DEFINER innecesario).
- Rate-limit RPCs solo `service_role`; keys hasheadas; cron Bearer comparado en tiempo constante.
- Storage privado + primer segmento = org UUID; download API no acepta path libre; TTL 5 min; 404 cruzado.
- Invitaciones: token 192-bit, email match, no hop de org, RLS solo admin.
- QR/monitor tokens 24 bytes CSPRNG.
- Export/PDF/team create: org de sesión, no del cliente.
- Sin `dangerouslySetInnerHTML`. Excel/CSV sanitizan fórmulas (`lib/export/spreadsheet-sanitize.mjs`).
- IA sin tools; clave no pública; insight acotado a org.
- Tests locales: `verify-rbac`, `verify-private-storage`, `verify-signed-urls`, `verify-rate-limit`, `verify-spreadsheet-export` (116 pass en la última corrida de suite).
- `/register` cerrado en app; middleware oculta módulos retirados.

---

# Remediation order

1. **SEC-P1-02** — congelar columnas de acceso en `organizations` (trigger o revoke de update de esas cols).  
2. **SEC-P1-01** — `access_status` en RLS (y/o gate API único). Sin (2), (1) solo evita auto-reactivación; el JWT sigue viendo datos.  
3. **SEC-P1-03** — INSERT de `notifications` same-org + `user_id` válido; links internos.  
4. **SEC-P2-01** — allowlist de redirect de login.  
5. Confirmar en Supabase Dashboard: disable public signup; revisar Auth redirect URLs.  
6. **SEC-P2-03** — fallback de perfil `operator`.  
7. **SEC-P2-07 / P2-08** — allowlist de `logo_url`; honrar `failClosed` si el store de rate limit cae.  
8. **SEC-P2-04 / P2-05 / P2-06** — integridad submissions/QR, cron/emails, force insight.  
9. Headers CSP/HSTS; FORCE RLS opcional; `CREATE TABLE nc_photos` + RLS; confirmar 035 en Storage; check `template.organization_id` en QR.

No implementar esas correcciones en esta fase.

---

# Final recommendation

**GO WITH CONDITIONS.**

Respuesta a la pregunta principal: **un usuario de Org A, con el cliente JWT y las policies actuales, no puede SELECT/UPDATE/DELETE/descargar el HACCP, documentos, auditorías, CAPA o archivos de Org B** aunque conozca UUIDs. El aislamiento multi-tenant de datos de inocuidad **sí está en la DB**, no solo en la UI.

Respuesta secundaria: **no puede auto-ascenderse a admin ni a platform admin**. Un admin de org **sí** puede anular la suspensión y **sí** puede inyectar notificaciones a un UUID de otra org.

Para producción de clientes reales: aplicar P1-01, P1-02 y P1-03 (o aceptar por escrito que la suspensión es solo cosmética de UI y que las notificaciones no son un canal de confianza). Después de eso, el residual es hardening P2/P3, no un agujero de tenant en el plan HACCP.
