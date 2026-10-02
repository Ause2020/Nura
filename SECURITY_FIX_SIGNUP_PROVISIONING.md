# SECURITY FIX — Signup / Provisioning (SP-01, SP-02)

Fecha: 2026-10-02 · Rama: `main` (sin commit, sin push, sin deploy)
Alcance: solo SP-01 y SP-02 de `SECURITY_AUDIT_SIGNUP_PROVISIONING.md`.
Fuera de alcance (sin cambios): SP-03, SP-04 / `ensureProfileWithAdmin`, SP-05, SP-06, HACCP RBAC, migraciones 016 y 036.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `supabase/migrations/053_require_provisioned_onboarding.sql` | **Nueva** migración incremental (SP-01) |
| `supabase/verify_signup_provisioning.sql` | **Nuevo** checklist + probes con ROLLBACK para hosted |
| `app/onboarding/page.tsx` | Usuario sin `organization_id` → `/acceso-pendiente` (no ve el wizard) |
| `lib/auth/session.ts` | Mensaje estable para `organization_not_provisioned` / `organization_access_denied` |
| `lib/access/platform-admin.ts` | `isPlatformAdmin(user)` centralizado y fail-closed (SP-02) |
| `lib/auth/require-permission.ts` | `assertOrganizationAccess({ user })` en vez de `{ email }` |
| `lib/supabase/middleware.ts`, `components/layout/dashboard-sidebar.tsx`, `app/(dashboard)/admin/acceso/page.tsx` | Pasan el `User` de `auth.getUser()` |
| `app/api/notifications/audit-completed/route.ts`, `app/api/notifications/cron/route.ts`, `app/api/storage/download/route.ts` | Pasan `user` a `assertOrganizationAccess` |
| `scripts/verify-signup-provisioning.mjs` | **Nuevos** tests (24) |
| `package.json` / `package-lock.json` | `test:signup-provisioning`, incluido en `npm test`; devDependency `@electric-sql/pglite` (Postgres embebido, solo tests) |

# Root cause

**SP-01.** `complete_user_onboarding` (015 → 016 → 036) es `SECURITY DEFINER`, ejecutable por cualquier `authenticated`, y en la rama "perfil sin organización" insertaba una organización con `access_status = 'active'` y elevaba al llamador a `role = 'admin'`. La única barrera era que no existiera forma de obtener una cuenta: si signup público estaba habilitado en Supabase (o cualquier otra vía creaba un `auth.users`), el usuario se auto-provisionaba un tenant activo.

**SP-02.** `isPlatformAdmin(email)` decidía con un único factor: el email estuviera en `NURA_ADMIN_EMAILS`. No verificaba que el email estuviera confirmado; con signup abierto y "Confirm email" desactivado, registrar el email de un admin (antes que el admin real, o en un proyecto donde no existiera) bastaba para obtener privilegios de plataforma (provisión de clientes, cambio de `access_status`, bypass del gate de acceso de organización).

# Trust model before

- Existencia de una sesión autenticada ⇒ derecho a crear y administrar una organización activa.
- Email (string) en una allowlist ⇒ platform admin. El email puede no estar verificado.
- Seguridad dependiente de configuración externa: signup deshabilitado y "Confirm email" activado en Supabase Auth.
- Defensa de BD para INSERT en `organizations`: solo la ausencia de policy (016 eliminó `authenticated_insert_organizations`, pero el RPC DEFINER la esquivaba).

# Trust model after

- **Una organización solo nace por una acción de servidor confiable**: `service_role` (provisión de platform admin) o el owner de la BD (SQL editor / migraciones). Ninguna sesión de usuario puede crearla, ni directamente ni a través de un `SECURITY DEFINER` invocado con su JWT (trigger `protect_org_insert` evalúa `auth.role()`).
- **`organization_id`, `role` y `access_status` nunca provienen del cliente** en el onboarding; el RPC ignora todos los `p_*`.
- **Platform admin = 4 señales**, todas obligatorias: email presente, email confirmado (`email_confirmed_at` válido), email en `NURA_ADMIN_EMAILS`, y `app_metadata.nura_platform_admin === true` (escribible solo por `service_role` / Auth Admin API). `user_metadata` nunca se consulta.
- El objeto `User` se obtiene siempre de `supabase.auth.getUser()` (validado por el servidor de Auth), no de claims locales.
- La app verifica la confirmación de email por sí misma; no depende del toggle "Confirm email".

# complete_user_onboarding

Nueva definición (053), misma firma y grants (`authenticated` sí; `PUBLIC`/`anon` revocados):

1. `auth.uid()` nulo → `not_authenticated` (42501).
2. Sin fila en `profiles` → `profile_not_found` (42501). Ya **no** llama `ensure_user_profile()`, por lo que el RPC no crea perfiles `admin` (SP-04 sigue existiendo en otros caminos; no se tocó).
3. `profiles.organization_id IS NULL` → **`organization_not_provisioned`** (42501).
4. La organización referenciada no existe → `organization_not_provisioned`.
5. `access_status <> 'active'` o `access_expires_at < CURRENT_DATE` → `organization_access_denied` (42501).
6. Caso válido: `UPDATE profiles SET onboarding_completed = TRUE` (solo esa columna) y retorna el `organization_id` existente.

Garantías en el caso denegado (verificadas en tests): no se crea organización, `role` no cambia, `organization_id` sigue `NULL`, `onboarding_completed` sigue `false`. La transacción aborta, así que no hay efectos parciales.

Complementos en la misma migración:

- Trigger `protect_org_insert` (`BEFORE INSERT ON public.organizations`): si hay JWT y `auth.role() <> 'service_role'` → `organization_not_provisioned`. Sin JWT (postgres / SQL editor) se permite. Fail-closed para cualquier rol JWT desconocido.
- `DROP POLICY IF EXISTS "authenticated_insert_organizations"` (por si sobrevive en hosted desde 001/015).
- `REVOKE INSERT ON public.organizations FROM anon, authenticated`.
- Idempotente (se aplica dos veces en los tests).

App:

- `/onboarding`: si el perfil no tiene organización → `redirect("/acceso-pendiente")` ("Tu cuenta está registrada pero aún no tiene acceso activo…"). No hay loop: `/acceso-pendiente` no está bajo los gates de dashboard/onboarding.
- `completeOnboarding()` traduce `organization_not_provisioned` / `organization_access_denied` a mensajes estables para el toast del wizard.

Flujos legítimos sin cambios:

- `provisionClient` (service_role) crea org + usuario + perfil con `onboarding_completed` según `skipOnboarding`. Si queda en `false`, el usuario completa el wizard y el RPC solo marca el flag (test "usuario provisionado").
- Invitaciones (`acceptInvitation*`, service_role) crean el perfil con la org y rol de la invitación y `onboarding_completed: true`; no usan el RPC.
- `repairStuckOnboardingServer` / `finalize_user_onboarding` (016) solo actúan si ya existe `organization_id`; no crean organizaciones. Sin cambios.

# Platform admin authorization

`lib/access/platform-admin.ts`:

```ts
isPlatformAdmin(user) // user = resultado de supabase.auth.getUser()
// true solo si:
//   user.email presente (trim/lowercase)
//   user.email_confirmed_at es una fecha válida
//   user.app_metadata.nura_platform_admin === true   (booleano estricto)
//   email ∈ NURA_ADMIN_EMAILS (vacío/no definido → false)
```

- Ya no acepta un string de email (test lo verifica: `isPlatformAdmin("ops@…") === false`).
- Todos los call sites (middleware, sidebar, `/admin/acceso`, `assertOrganizationAccess`, `requirePlatformAdmin`) pasan el `User` de Auth. `requirePlatformAdmin` usa `getSessionUser()` (`auth.getUser()` cacheado por request).

### Provisionar un platform admin

Requisitos: el usuario existe en Supabase Auth, con email confirmado.

1. Añadir el email a `NURA_ADMIN_EMAILS` en el entorno del servidor (Vercel / `.env`), y redeploy.
2. Marcar `app_metadata` con service_role (cualquiera de las dos):

   ```ts
   // Server-side, con SUPABASE_SERVICE_ROLE_KEY. GoTrue mergea app_metadata.
   await admin.auth.admin.updateUserById(userId, {
     app_metadata: { nura_platform_admin: true },
   });
   ```

   ```sql
   -- SQL Editor (owner)
   UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                           || '{"nura_platform_admin": true}'::jsonb
   WHERE lower(email) = lower('ops@nura.cl')
     AND email_confirmed_at IS NOT NULL;
   ```

3. Si el email no está confirmado: confirmarlo vía flujo de email, o con `admin.auth.admin.updateUserById(userId, { email_confirm: true })` tras verificar la identidad por fuera de banda.
4. El platform admin necesita una organización propia (p. ej. organización interna Nura creada con `provisionClient`) para usar el dashboard; ya no puede auto-crearla desde onboarding.

### Revocar

Cualquiera de las dos acciones basta (fail-closed); se recomiendan ambas:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'nura_platform_admin'
WHERE lower(email) = lower('ops@nura.cl');
```

y/o quitar el email de `NURA_ADMIN_EMAILS` + redeploy. Como la verificación usa `auth.getUser()` (consulta al servidor de Auth en cada request), el cambio de `app_metadata` aplica en la siguiente request sin esperar expiración del JWT.

**Impacto de despliegue:** los platform admins actuales pierden el privilegio hasta que se ejecute el paso 2. Es intencional (fail-closed).

# Organization creation inventory

| PATH | ACTOR | AUTHORIZED? | CREATES ACTIVE? | ASSIGNS ADMIN? |
| --- | --- | --- | --- | --- |
| `complete_user_onboarding` RPC — antes (015/016/036) | Cualquier `authenticated` sin org | **No** (solo sesión) | Sí (`active`) | Sí (036 `role='admin'`; 016 vía `ensure_user_profile`/default `admin`) |
| `complete_user_onboarding` RPC — después (053) | `authenticated` | — | **No crea** | **No** |
| PostgREST `POST /organizations` con policy `authenticated_insert_organizations` (001/015) — antes | `authenticated` | No | Sí (default `active`) | No directamente |
| PostgREST `POST /organizations` — después (053) | `authenticated` / `anon` | — | **Bloqueado** (sin policy, sin GRANT, trigger) | No |
| Cualquier `SECURITY DEFINER` futuro invocado con JWT de usuario — después (053) | `authenticated` | — | **Bloqueado** por trigger | No |
| `lib/admin/provision.ts` `provisionClient` vía `POST /api/admin/provision-client` | Platform admin (SP-02) usando `service_role` | **Sí** (`requirePlatformAdmin`) | Sí (`access_status: 'active'`, `provisioned_by`) | Sí, al usuario creado, con el rol elegido por el platform admin |
| `provisionUser` / invitaciones (`acceptInvitation*`) | Platform admin / invitado, vía `service_role` | Sí | No crea org (usa una existente) | Rol definido por admin/invitación |
| SQL Editor / migraciones / `verify_org_access_guard.sql` | Owner de la BD (sin JWT) | Sí (acceso a la BD) | Según SQL | Según SQL |

No hay inserts a `organizations` en código cliente (`app/`, `components/`) ni con la anon key en `lib/`.

# Tests

`npm run test:signup-provisioning` → `scripts/verify-signup-provisioning.mjs` — **24/24 pass**.

SP-01 corre sobre **Postgres real embebido (PGlite 0.5.8)** con roles `anon`/`authenticated`/`service_role` y `auth.uid()`/`auth.role()` leyendo `request.jwt.claim.*` (igual que PostgREST). Se ejecuta el SQL real del archivo 036 y del 053 (no copias).

| Test | Resultado |
| --- | --- |
| Baseline 036: usuario sin org → crea org `active` y queda `admin` (reproduce SP-01) | pass (vulnerabilidad reproducida) |
| 053: usuario sin `organization_id` → `organization_not_provisioned` (42501); no org nueva, `role` sin elevar, `organization_id` NULL, `onboarding_completed` false | pass |
| 053: usuario autenticado sin perfil → `profile_not_found`; no crea perfil ni org | pass |
| 053: `anon` sin EXECUTE | pass |
| 053: usuario provisionado (`supervisor`, org activa) → retorna su org, `onboarding_completed` true, `role` intacto, `p_name` ignorado, sin orgs nuevas | pass |
| 053: usuario ya onboarded → idempotente | pass |
| 053: org `suspended` / `pending` / expirada → `organization_access_denied`, sin cambios | pass |
| INSERT directo `authenticated` / `anon` → bloqueado | pass |
| Trigger bloquea aunque se re-agregue GRANT + policy permisiva | pass |
| `SECURITY DEFINER` con JWT `authenticated` no puede insertar orgs | pass |
| `service_role` y sin JWT (SQL editor) siguen insertando | pass |
| Catálogo: policy eliminada, sin INSERT para `anon`/`authenticated`, EXECUTE solo `authenticated` | pass |
| Estático: el RPC no inserta orgs, no llama `ensure_user_profile`, único UPDATE = `onboarding_completed = TRUE`, no usa `p_*` | pass |
| Estático: `/onboarding` redirige sin org; mensajes estables | pass |
| SP-02: platform admin provisionado correctamente → true (case/trim-insensitive) | pass |
| SP-02: email allowlisted **no confirmado** (`undefined`, `null`, `""`, fecha inválida) → false | pass |
| SP-02: email confirmado **no allowlisted** → false | pass |
| SP-02: `user_metadata` con `nura_platform_admin`, `role`, `is_admin`, `email_confirmed_at` → false | pass |
| SP-02: `app_metadata` flag ≠ `true` booleano (`"true"`, `1`, `false`, `{}`, null) → false | pass |
| SP-02: entrada nula / string / allowlist vacía → false | pass |
| SP-02 estático: helper no lee `user_metadata`; ningún call site pasa solo `.email`; `requirePlatformAdmin` usa `getSessionUser()` | pass |

# Regression

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; solo warnings preexistentes en archivos no tocados) |
| `npm test` | PASS — 195 tests, 187 pass, 0 fail, 8 skipped (live, sin `DATABASE_URL`) |
| `npm run test:rbac` | PASS 10/10 |
| `npm run test:haccp-rbac-drift` | PASS 6, 1 skipped (live) |
| `npm run test:rbac-generator-grants` | PASS 5, 1 skipped (live) |
| `npm run test:signup-provisioning` | PASS 24/24 |
| `npm run test:org-access-guard` / `test:org-access-enforcement` / `test:nav-phase-2a` | PASS |
| `npm run build` | PASS (exit 0) |

# Hosted verification pending

Staging (`fbunktfkihythsclhgnw`) está **INACTIVE**; no se reactivó, no se aplicó nada hosted y no se cambió Supabase Auth. Pendiente cuando se autorice:

1. Aplicar **solo** `053_require_provisioned_onboarding.sql` en SQL Editor (no `supabase db push`: aplicaría 036/041).
2. Ejecutar `supabase/verify_signup_provisioning.sql`: todas las columnas del bloque 1 en `true`; NOTICEs `PASS probe 2` (o `SKIP` si no hay perfiles sin org) y `PASS probe 3`. Usa `ROLLBACK`.
3. Confirmar que `create_default_notification_preferences` (AFTER INSERT) sigue funcionando al provisionar con `provisionClient`.
4. E2E: provisionar cliente con `skipOnboarding: false` → login → wizard → dashboard.
5. E2E: cuenta sin org → `/onboarding` redirige a `/acceso-pendiente`.
6. Tras marcar `app_metadata`, verificar acceso a `/admin/acceso` y `/api/admin/*` del platform admin; y que una cuenta allowlisted sin flag recibe 401/redirect.

# Production configuration pending

- Ejecutar el procedimiento de **Provisionar un platform admin** (sección anterior) para cada admin real **antes o junto con** el deploy de este código; si no, pierden acceso (fail-closed).
- Mantener `NURA_ADMIN_EMAILS` mínimo y revisado.
- Supabase Auth: se recomienda igualmente deshabilitar signup público y activar "Confirm email" como defensa en profundidad, aunque SP-01/SP-02 ya no dependen de ello.
- Pendientes de auditoría no tratados aquí: SP-03 (drift de 036 `protect_profile_identity` en hosted), SP-04 (fallbacks de perfil `admin`), SP-05 (tokens de invitación bearer), SP-06 (aceptación no atómica).

---

SP-01 SELF PROVISIONING: FIXED

SP-02 PLATFORM ADMIN: FIXED

PUBLIC SIGNUP DEPENDENCY: STILL SECURITY-CRITICAL

> Alcance del veredicto: SP-01 y SP-02 ya **no** dependen de que signup esté deshabilitado ni de "Confirm email" (verificado localmente; en hosted, al aplicar 053, desplegar el código y provisionar `app_metadata`). La dependencia sigue siendo crítica por **SP-03**, fuera de alcance y no verificado: si el hosted sigue en 016/017 sin la identidad de 036, la policy `017 users_insert_own_profile` (`WITH CHECK (id = auth.uid())`) permitiría a una identidad recién creada sin fila en `profiles` insertarse con un `organization_id` ajeno y `role = 'admin'`, y `016 handle_new_user` toma `role` de `raw_user_meta_data`. 053 no cubre ese camino (no toca `profiles`). Con 036 vigente (estado del repo) + 053, signup público ya no permite auto-provisión ni escalada de plataforma. Mantener signup deshabilitado hasta cerrar/verificar SP-03.
