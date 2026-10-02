# Auditoría — Registro, onboarding y provisioning de organizaciones

Fecha: 2026-10-02. Solo lectura: sin cambios de código, sin migraciones, sin tocar configuración de Supabase, sin llamadas de signup contra ningún entorno.

Fuentes: `app/`, `components/`, `lib/`, `middleware.ts` y `supabase/migrations/001`–`052`, en `main` (`e62cc0e`).

**Limitación:** el único proyecto hosted de Nura (`fbunktfkihythsclhgnw`) figura como **INACTIVE** (pausado) en `supabase projects list`, y su host no resuelve DNS. No se pudo leer `GET /auth/v1/settings` ni el catálogo (`pg_proc`, `pg_policies`). Reactivarlo es un cambio de configuración, así que no se hizo. Todo lo "hosted" en este informe es **NOT VERIFIED**, salvo lo que ya constaba en auditorías previas.

---

# Current trust model

El modelo **declarado** es "acceso manual tras contrato":

- `app/(auth)/register/page.tsx` muestra "Acceso por invitación… Tu representante te entregará email y contraseña".
- `middleware.ts` redirige `/register` → `/login?info=manual-access`.

El modelo **implementado** es distinto:

> Cualquier identidad que llegue a ser `authenticated` en Supabase y no tenga `organization_id` puede crear su propia organización, con `access_status = 'active'` y él como `admin`, mediante una RPC `SECURITY DEFINER` expuesta a `authenticated`.

La única barrera entre una persona externa y un tenant activo es **no poder obtener una sesión de Supabase Auth**. El código no implementa esa barrera: depende de la configuración del proyecto Supabase.

Vías que crean `auth.users`:

| Vía | Actor | Control | Resultado |
| --- | --- | --- | --- |
| `POST /auth/v1/signup` (Supabase, público con anon key) | cualquiera | **solo configuración de Supabase** | usuario sin organización |
| OAuth / phone / magic link / anonymous sign-in (si están habilitados) | cualquiera | **solo configuración de Supabase** | usuario sin organización |
| `provisionClient` (`/api/admin/provision-client`) | admin de plataforma | `requirePlatformAdmin()` (email en `NURA_ADMIN_EMAILS`) | org `active` + usuario con rol elegido |
| `provisionUser` (`/api/admin/provision-user`) | admin de plataforma | `requirePlatformAdmin()` | usuario en org existente y `active` |
| `createTeamMember` (`/api/team/create-user`) | admin de org | `requirePermission(users.manage)` + org con acceso | usuario en **su** org |
| `acceptInvitation` (`/api/team/accept`, sin sesión) | quien tenga el token | token válido | usuario en la org de la invitación, con el rol de la invitación |
| Supabase Dashboard / Admin API | operador de Supabase | acceso a la cuenta Supabase | usuario sin organización |

---

# Public signup

| Pregunta | Respuesta | Tipo de protección |
| --- | --- | --- |
| ¿UI pública de registro? | **No.** `/register` es solo un aviso; el middleware lo redirige a login. | A (código, UI) |
| ¿API propia de signup? | **No.** No existe `/api/auth/signup`. `/api/auth/login` solo hace `signInWithPassword`. | A |
| ¿El frontend llama a `supabase.auth.signUp()`? | **No.** Sin coincidencias de `signUp(`, `signInWithOtp`, `signInWithOAuth`, `signInAnonymously` ni `verifyOtp` en `app/`, `components/` y `lib/`. | A |
| ¿Un cliente externo puede llamar al endpoint público de Supabase? | **Sí, si el proyecto lo permite.** La anon key y la URL van en el bundle (`NEXT_PUBLIC_*`). `supabase.auth.signUp({ email, password })` desde cualquier script funciona si "Allow new users to sign up" está activo. Nura no tiene UI, pero no la necesita. | — |
| ¿Nura depende de que el signup esté deshabilitado? | **Sí, exclusivamente.** No hay control en código ni en RLS que distinga una cuenta "provisionada" de una "autorregistrada". | **C** (configuración externa) |

Ningún mecanismo de RLS (B) bloquea a una cuenta autorregistrada. Ver "Organization provisioning".

---

# Profile creation

## Cadena `auth.users → profile`

| Paso | Repo (036 aplicada) | Si el hosted quedó en 016 (ver SP-03) |
| --- | --- | --- |
| Trigger `on_auth_user_created` → `handle_new_user()` | `role = 'operator'`, `organization_id = NULL`. Ignora `raw_user_meta_data.role` (`036` 90–108). | `role = COALESCE(raw_user_meta_data->>'role', 'admin')` (`016` 15–32, igual en `001` y `014`). |
| RPC `ensure_user_profile()` (DEFINER, `authenticated`) | INSERT `role = 'operator'` si no hay fila (`036` 110–142). | INSERT `role = 'admin'` (`016` 46–78). |
| Cliente `ensureUserProfile()` (`lib/auth/session.ts` 15–69) | Último recurso: `profiles.insert({ id, full_name, role: "admin" })` con JWT. El trigger `protect_profile_identity` (036) fuerza `role = 'operator'` y `organization_id = NULL`; además la policy `users_insert_own_profile` exige `role = 'operator'`. | Policy `017` `users_insert_own_profile`: `WITH CHECK (id = auth.uid())`, sin restricción de `role` ni `organization_id`. |
| Servidor `ensureProfileWithAdmin()` (`lib/auth/session-server.ts` 66–98), llamado desde `/onboarding` | **service_role** inserta `role: "admin"`, `organization_id = NULL`. `protect_profile_identity` hace `RETURN NEW` para `service_role`, así que el `admin` persiste. | igual |

## Respuestas

| Pregunta | Respuesta |
| --- | --- |
| ¿Se crea profile automáticamente? | Sí. El trigger de Auth lo crea; si falla, `/onboarding` y `/login` lo reparan con `ensure_user_profile` y luego `ensureProfileWithAdmin`. |
| ¿Con qué role? | Trigger/RPC del repo: `operator`. Fallback con service_role: **`admin`**. Hosted en 016: **`admin`** o el valor de la metadata. |
| ¿Con qué `organization_id`? | Siempre `NULL` en estos caminos. |
| ¿Usa service_role? | Sí: `ensureProfileWithAdmin`, cuando el JWT no logra ver un perfil. |
| ¿Puede fallar abierto? | Para identidad, falla cerrado: sin perfil, `requirePermission` → 403 y el middleware manda a `/onboarding`. Para rol, el fallback falla **hacia `admin`** (SP-04). |
| ¿Un usuario nuevo puede quedar `admin`? | **Sí.** Vía onboarding (SP-01), siempre. Vía fallback service_role (SP-04) si no tenía fila de perfil. |
| ¿Metadata influye en role/org? | Repo: no. El código solo lee `user_metadata.full_name`; `app_metadata` no se usa y el usuario no puede escribirla. Hosted en 016: `raw_user_meta_data.role` define el rol al registrarse (`signUp({ options: { data: { role: "admin" } } })`). Ver SP-03. |

---

# Organization provisioning

| Actor | Endpoint / función | Permiso | Resultado |
| --- | --- | --- | --- |
| **Cualquier `authenticated` sin org** | RPC `complete_user_onboarding(p_name, p_industry, p_country, …)` (`036` 144–216 / `016` 84–166), vía `/onboarding` o directo por PostgREST | `GRANT EXECUTE … TO authenticated`; SECURITY DEFINER; solo exige `auth.uid()` y campos no vacíos | **INSERT org `access_status = 'active'`, `access_granted_at = NOW()`, `access_expires_at = NULL`, `provisioned_by = NULL`; UPDATE profile `organization_id`, `onboarding_completed = TRUE`, `role = 'admin'`** |
| `authenticated` con org | misma RPC | rama `v_existing_org IS NOT NULL` | solo marca `onboarding_completed`; **no** crea otra org |
| `authenticated` con org | RPC `finalize_user_onboarding()` | DEFINER, `authenticated` | solo `onboarding_completed = TRUE` |
| Admin de plataforma | `provisionClient` (service_role) | `requirePlatformAdmin()` | INSERT org `active` + `auth.admin.createUser` + profile con `body.role` (default `admin`) |
| Admin de plataforma | `updateOrganizationAccess` (`/api/admin/organizations`) | `requirePlatformAdmin()` | UPDATE `access_status` / `access_expires_at` |
| Admin de plataforma | `provisionUser` | `requirePlatformAdmin()` | usuario en org existente y `active` |
| Admin de org | `createTeamMember` → `provisionUser` (service_role) | `requirePermission(users.manage)` + `assertOrganizationAccess` | usuario en su org con un rol de `isOrgRole` |
| Admin de org | `updateMemberRole` (service_role) | idem; no puede cambiar su propio rol; mismo `organization_id` | cambia el rol de un compañero |
| Invitado | `acceptInvitation*` (service_role) | token válido, no aceptado, no expirado | profile `organization_id` y `role` de la invitación |
| `authenticated` | `UPDATE organizations` por PostgREST | RLS `admins_update_own_organization` + trigger 047 | **no** puede tocar `access_status`, fechas, `contract_notes` ni `provisioned_by` (verificado live en P1) |
| `authenticated` | `INSERT organizations` por PostgREST | Repo: sin policy de INSERT (016 elimina `authenticated_insert_organizations`). Si el hosted conserva la de `015` (`WITH CHECK (true)`): INSERT directo con cualquier `access_status`, porque 047 solo cubre UPDATE. | ver SP-03 |

**¿Un usuario recién registrado puede terminar con organización + profile admin + `access_status = active` sin intervención administrativa?**
**Sí**, con una sola llamada RPC. No requiere UI ni aprobación:

```ts
await supabase.auth.signUp({ email, password });          // si el proyecto lo permite
await supabase.auth.signInWithPassword({ email, password }); // si no exige confirmación, o tras confirmar
await supabase.rpc("complete_user_onboarding", {
  p_name: "X", p_industry: "otro", p_country: "CL",
});
// → org active, profile admin, onboarding_completed = true
```

Evidencia (`036`, igual en `016`):

```188:205:supabase/migrations/036_rbac_org_roles.sql
  INSERT INTO public.organizations (
    name, industry, country, city, employees_range, certifications,
    access_status, access_granted_at
  )
  VALUES (
    trim(p_name), p_industry, p_country,
    NULLIF(trim(p_city), ''), p_employees_range,
    COALESCE(p_certifications, '{}'), 'active', NOW()
  )
  RETURNING id INTO v_org_id;

  -- El fundador de la organización es admin. No se acepta rol del cliente.
  UPDATE public.profiles
  SET
    organization_id = v_org_id,
    onboarding_completed = TRUE,
    role = 'admin'
  WHERE id = v_user_id;
```

`protect_profile_identity` (036 244–253) permite **explícitamente** el salto `operator → admin` cuando `organization_id` pasa de `NULL` a un valor.

---

# Invitations

| Aspecto | Comportamiento | Evidencia |
| --- | --- | --- |
| Quién crea | Admin de org activa. API: `requireOrgAdmin()` → `requirePermission(users.manage)` + `assertOrganizationAccess`. RLS: `invitations_insert_rbac` (041: `current_organization_id()` + `rbac_admin()`) o `invitations_insert` (009: `role = 'admin'`). | `app/api/team/invite/route.ts` 16, 60–70 |
| Org de la invitación | `profile.organization_id` de la sesión, no del body | `invite/route.ts` 63 |
| Rol | Del body, validado con `isOrgRole` (`admin` / `quality_manager` / `operator`). Un admin puede invitar admins (por diseño). | `invite/route.ts` 21, 27 |
| Token | `randomBytes(24).toString("hex")` (192 bits), único en DB | `lib/team/invitations.ts` 6–8 |
| Expiración | 7 días; `isInvitationValid` verifica `accepted` y `expires_at` | `invitations.ts` 78–81 |
| Quién acepta (sin sesión) | **Quien tenga el token.** `acceptInvitation` crea el usuario con `invitation.email`, la contraseña que elige quien acepta y `email_confirm: true` | `invitations.ts` 96–160 |
| Quién acepta (con sesión) | Solo si `user.email == invitation.email`; si no, error | `invitations.ts` 175–178 |
| Rol / org controlados por el invitado | **No.** `role` y `organization_id` salen de la fila de la invitación (service_role). El body solo aporta `token`, `fullName` y `password`. | `invitations.ts` 133–138, 205–211 |
| Usuario ya en otra org | Rechazado: "Tu cuenta ya pertenece a otra organización" | `invitations.ts` 188–193 |
| Usuario ya en la misma org | Marca la invitación aceptada; **no** cambia su rol | `invitations.ts` 195–201 |
| Reutilización | Después de `accepted = true`, inválida. La marca se escribe **después** del alta (no atómico; SP-06). | `invitations.ts` 154–157, 216–219 |
| Enumeración | 192 bits + rate limit `AUTH` por dimensión `token` en `/api/team/accept`. `/invitacion/:token` clasificado `PUBLIC_PAGE`. | `lib/rate-limit/core.mjs` 188, 233 |
| Entrega del link | El admin lo copia desde el modal (`invite-user-modal.tsx`); Nura **no** lo envía por email | `components/team/invite-user-modal.tsx` 57–63 |

Escaladas evaluadas:

| Intento | Resultado |
| --- | --- |
| operator → admin vía invitación | No. Un operator no puede crear invitaciones (API 403, RLS admin-only). |
| Org A → Org B | No. La invitación siempre usa la org de la sesión del admin. |
| Invitación de Org A → membership en Org B | No. `organization_id` sale de la fila. |
| Replay | No después de `accepted = true`. Hay ventana de carrera en aceptaciones concurrentes (SP-06), sin escalada. |
| Enumeración de token | No práctica. |
| Usuario de Org A acepta invitación de Org B | Rechazado. |
| Invitación para A usada por B | Con sesión: rechazado por email. Sin sesión: **sí**. Cualquiera con el link crea la cuenta del email invitado, con su propia contraseña (SP-05). No hay escalada: recibe el rol que el admin asignó. |

---

# Onboarding

| Pregunta | Respuesta |
| --- | --- |
| ¿Quién accede a `/onboarding`? | Cualquier usuario autenticado (`protectedPaths` incluye `/onboarding`; solo exige sesión). Si no tiene org, `accessAllowed = true` (`resolveSessionGates`: el gate solo se evalúa si hay `organization_id`). |
| ¿Requiere profile? | No: lo crea (`ensureUserProfileServer`, con fallback service_role). |
| ¿Permite crear organización? | **Sí.** `OnboardingWizard.handleComplete` → `completeOnboarding` → RPC `complete_user_onboarding`. |
| ¿Asigna admin? | **Sí**, siempre, al fundador. |
| ¿`access_status` resultante? | **`active`**, sin `access_expires_at`. |
| ¿Se completa sin aprobación? | **Sí.** No existe estado `pending` ni revisión en este camino. |
| ¿Desbloquea middleware y dashboard? | **Sí.** `onboarding_completed = TRUE`, org `active` ⇒ el middleware deja pasar a `/dashboard`; `requirePermission` ve org + rol `admin` + acceso permitido; RLS ve `current_organization_id()` y `current_organization_access_allowed() = true`. |
| ¿Es solo UI? | **No.** La RPC es invocable directo por PostgREST con la anon key y un JWT; la UI es opcional. |

---

# Access status enforcement

| Capa | Comportamiento con una org autoprovisionada |
| --- | --- |
| `current_organization_access_allowed()` (048) | `true` (org `active`, sin vencimiento) |
| `org_access_gate` RESTRICTIVE (048) | deja pasar |
| `middleware.ts` | `accessAllowed = true` → dashboard |
| `requirePermission` / `assertOrganizationAccess` | permite todo lo que permite el rol `admin` |
| Trigger 047 `protect_org_access_fields` | impide que **cambie** su estado después (no puede volver de `suspended`), pero **no** interviene en el INSERT de la RPC |

Respuestas:

- **Estado inicial:** `active`.
- **Acceso a business data:** sí, a la de **su propia** org (vacía al inicio). Puede usar todos los módulos: HACCP, auditorías, CAPA, documentos, registros, Storage privado, `/analisis` (costo de Claude), notificaciones e invitaciones de hasta `MAX_TEAM_USERS`.
- **Datos de otros tenants:** no. Las policies de tenant siguen ancladas a `current_organization_id()` (verificado live en P1 y en 050).
- **¿Puede autoactivarse?** Nace activa: no necesita autoactivarse. Una org suspendida por Nura **no** puede reactivarse sola (047, verificado live).

---

# Supabase configuration dependencies

| Item | Por qué importa | Estado |
| --- | --- | --- |
| Authentication → Sign In / Providers → **Allow new users to sign up** = OFF | Única barrera contra SP-01 | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| **Email provider:** "Confirm email" = ON | Si el signup quedara abierto, impide sesión sin probar el email. Clave para SP-02. | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| **Anonymous sign-ins** = OFF | Un anónimo es `authenticated` sin email → SP-01 | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| **Phone** / **OAuth** (Google, etc.) / **SAML** deshabilitados si no se usan | Cada uno crea `auth.users` sin org | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| Magic link / OTP signup | `signInWithOtp` crea usuario si el signup está abierto (`shouldCreateUser` por defecto) | **NOT VERIFIED** (queda cubierto por "Allow new users to sign up" = OFF) |
| Invite behavior (`inviteUserByEmail` del Dashboard) | Nura no lo usa; un invite desde el Dashboard crea un usuario sin org → puede autoprovisionarse | **NOT VERIFIED** · operar solo vía `provisionClient` |
| URL Configuration → **Site URL** = dominio HTTPS de producción | Links de email (reset) | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| URL Configuration → **Additional Redirect URLs** = solo `https://<dominio>/auth/callback` (y staging si aplica), **sin** `https://*` ni `**` | `redirect_to` de `/auth/v1/verify` | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| `NEXT_PUBLIC_APP_URL` = dominio HTTPS real | `redirectTo` del reset (`forgot-password/route.ts`) e invitaciones (`lib/team/urls.ts`) | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| `NURA_ADMIN_EMAILS` = emails ya registrados y controlados por Nura | SP-02 | **NOT VERIFIED** · REQUIRED BEFORE PRODUCTION |
| Catálogo hosted: versión viva de `handle_new_user`, `ensure_user_profile`, `protect_profile_identity`, policies de `profiles` / `organizations` | SP-03 | **NOT VERIFIED** (proyecto pausado) · REQUIRED BEFORE PRODUCTION |

Verificable por código (**VERIFIED**): no hay UI ni API de signup; ningún código llama `signUp` ni proveedores; `complete_user_onboarding` crea orgs `active` + admin; las invitaciones no permiten escalar; 047 bloquea autorreactivación (además verificado live en P1); 048 bloquea orgs no activas (además verificado live).

Lectura sugerida, sin efectos (cuando el proyecto esté activo): `GET https://<ref>.supabase.co/auth/v1/settings` con la anon key devuelve `disable_signup`, `mailer_autoconfirm`, `phone_autoconfirm` y el mapa `external` (proveedores y `anonymous_users`).

---

# Attack scenarios

**A — Persona externa registra `attacker@example.com`.**
- Signup OFF: Supabase responde `Signups not allowed`. Se detiene.
- Signup ON y confirmación ON: necesita confirmar el email (lo controla, así que puede). Luego `/onboarding` o la RPC directa ⇒ **org `active` + admin + dashboard completo**. Sin acceso a otros tenants.
- Signup ON y confirmación OFF: igual, sin paso de email. Si además usa un email de `NURA_ADMIN_EMAILS` que todavía no existe en Auth ⇒ **admin de plataforma** (SP-02).

**B — `auth.users` existe sin profile.**
`/login` llama `ensureUserProfile()` y `/onboarding` llama `ensureUserProfileServer()`. Primero `ensure_user_profile` (repo: `operator`); si el JWT sigue sin ver fila, `ensureProfileWithAdmin` con service_role inserta **`admin`** con `organization_id = NULL`. El resultado final es el mismo que en A: el usuario termina en `/onboarding` y puede autoprovisionarse. En hosted con `017` sin `protect_profile_identity`, el insert de cliente acepta cualquier `organization_id` y `role` (SP-03).

**C — Manipular `user_metadata` / `app_metadata`.**
`app_metadata` no la puede escribir el usuario y Nura no la lee. `user_metadata` (vía `updateUser({ data })` o `signUp({ options: { data } })`) solo se usa para `full_name`. Repo: sin efecto en rol ni org. Hosted en 016: `raw_user_meta_data.role` fija el rol al crear el perfil (SP-03); igual queda sin org.

**D — Operator autenticado intenta crear otra organización.**
`complete_user_onboarding` toma la rama `v_existing_org IS NOT NULL`: solo marca onboarding y devuelve su org actual. `protect_profile_identity` impide cambiar `organization_id` una vez asignado. No hay policy de INSERT en `organizations` (repo). **No puede.** Salvo SP-03: si el hosted conserva `authenticated_insert_organizations` (015), puede insertar filas en `organizations` (huérfanas, sin membresía).

**E — Usuario de Org A acepta invitación de Org B.**
Rechazado ("Tu cuenta ya pertenece a otra organización").

**F — Invitación para A usada por B.**
Con sesión de B: rechazado por mismatch de email. Sin sesión: B crea la cuenta **con el email de A** y su propia contraseña; entra a la org con el rol asignado (SP-05). A ya no puede aceptar ("ya tiene cuenta").

**G — Usuario sin organización accede a APIs o dashboard.**
- Middleware: dashboard → `/onboarding`.
- `requirePermission`: sin `organization_id` → 403.
- RLS: `current_organization_id()` es NULL → 0 filas.
- Storage: `storage_is_org_object` exige org.

No ve datos de nadie. Su única salida es crear su propia org (SP-01).

---

# Findings

### SP-01 — Autoprovisionamiento de tenant activo con rol admin

- **SEVERITY:** HIGH si el proyecto permite crear identidades (signup, OAuth, anónimos). MEDIUM como defensa en profundidad si todo está cerrado.
- **PREREQUISITE:** cualquier sesión `authenticated` sin `organization_id`.
- **ATTACK PATH:** `signUp` (o cualquier proveedor) → `rpc("complete_user_onboarding", …)` o `/onboarding` → `/dashboard`.
- **IMPACT:** se rompe el modelo comercial "acceso manual tras contrato". Uso gratuito e ilimitado del producto, con costo de Claude (`/analisis`), Storage y emails. Permite crear hasta `MAX_TEAM_USERS` cuentas confirmadas con `createTeamMember` (service_role, `email_confirm: true`) para cualquier email, incluidos emails de terceros. Sin acceso cross-tenant.
- **EVIDENCE:**
  - `supabase/migrations/036_rbac_org_roles.sql` 144–216 (`'active', NOW()`, `role = 'admin'`); igual en `016_production_bootstrap.sql` 84–168 con `GRANT EXECUTE … TO authenticated`.
  - `036` 244–253: excepción explícita `operator → admin` para el fundador.
  - `app/onboarding/onboarding-wizard.tsx` 88–111.
  - `lib/auth/session.ts` 71–96.
  - `lib/access/session-gates.ts` 34–36: un usuario sin org siempre tiene `accessAllowed = true`.
- **RECOMMENDED FIX:** ver Remediation 1.

### SP-02 — Admin de plataforma determinado solo por email

- **SEVERITY:** CRITICAL si se dan las tres condiciones de abajo; si no, no es explotable.
- **PREREQUISITE:** signup abierto **y** sin confirmación de email (o proveedor que confíe en un email no verificado), **y** que un email de `NURA_ADMIN_EMAILS` no exista todavía en `auth.users`.
- **ATTACK PATH:** registrar ese email → `isPlatformAdmin(user.email)` = true → `/admin/acceso`, `/api/admin/provision-client`, `/api/admin/organizations` (cambiar `access_status` de cualquier org, crear clientes). El middleware y `assertOrganizationAccess` además saltan el gate de acceso.
- **IMPACT:** control comercial de todos los tenants: activar, suspender, provisionar.
- **EVIDENCE:** `lib/access/platform-admin.ts` 1–28 (comparación de string, sin `email_confirmed_at` ni flag en `app_metadata`); `lib/supabase/middleware.ts` 98; `lib/auth/require-permission.ts` 33.
- **RECOMMENDED FIX:** ver Remediation 3.

### SP-03 — Endurecimiento de identidad (036 §3–4) probablemente ausente en el hosted

- **SEVERITY:** HIGH si se confirma (escalada `operator → admin` dentro del tenant). **NOT VERIFIED.**
- **PREREQUISITE:** que el hosted siga sin 036/041. `HACCP_RBAC_LIVE_AUDIT.md` lo constató (`current_user_role` / `rbac_quality` ausentes). 050 restauró solo `current_user_role`, `rbac_is`, `rbac_quality` y `_rbac_drop_all_policies`; **no** restauró `handle_new_user`, `ensure_user_profile`, `protect_profile_identity`, `protect_org_identity`, `profiles_role_check` ni las policies de `profiles`.
- **ATTACK PATH (si se confirma):**
  1. Operator: `from("profiles").update({ role: "admin" }).eq("id", uid)`. La policy `016` `users_update_own_profile` solo fija `organization_id` y `onboarding_completed`, no `role`. 048 `org_access_gate_profiles_update` permite `id = auth.uid()`.
  2. Signup con `options.data.role` → `handle_new_user` (016) lo copia; por defecto `admin`.
  3. Si falta la fila de perfil: INSERT de cliente con cualquier `organization_id` y `role` (policy `017`) → unirse a otra org como admin.
  4. Si persiste `authenticated_insert_organizations` (015, `WITH CHECK (true)`): INSERT directo en `organizations` con `access_status` arbitrario.
- **IMPACT:** escalada de privilegios dentro del tenant. En el caso 3, cross-tenant.
- **EVIDENCE:** `016` 15–32, 46–78, 257–269; `017` 35–38; `015` 67–71; `001` 22, 91–100; `050` (sin `profiles`); `HACCP_RBAC_LIVE_AUDIT.md` 73, 81, 102.
- **RECOMMENDED FIX:** ver Remediation 4.

### SP-04 — Fallbacks de perfil insertan `role = 'admin'`

- **SEVERITY:** LOW (repo). Sube a MEDIUM combinado con SP-03.
- **PREREQUISITE:** `auth.users` sin fila en `profiles`.
- **ATTACK PATH:** `/onboarding` → `ensureProfileWithAdmin` (service_role, se salta `protect_profile_identity`) → perfil `admin` sin org.
- **IMPACT:** hoy, sin org, `admin` no da permisos (sin tenant). Es inconsistente con el trigger (`operator`) y queda como precondición peligrosa si alguna vía futura asigna org sin resetear el rol.
- **EVIDENCE:** `lib/auth/session-server.ts` 82–90; `lib/auth/session.ts` 53–61.
- **RECOMMENDED FIX:** insertar `operator` en ambos fallbacks.

### SP-05 — La invitación es un bearer token que reclama el email invitado

- **SEVERITY:** LOW.
- **PREREQUISITE:** filtración o reenvío del link `/invitacion/{token}` antes de que el destinatario lo use (7 días).
- **ATTACK PATH:** abrir el link sin sesión → `acceptInvitation` → `admin.auth.admin.createUser({ email: invitation.email, password: <del atacante>, email_confirm: true })`.
- **IMPACT:** el poseedor del link controla la cuenta del email invitado, con el rol asignado (posiblemente `admin`). No hay escalada sobre lo que el admin otorgó.
- **EVIDENCE:** `lib/team/invitations.ts` 96–160.
- **RECOMMENDED FIX:** exigir prueba de control del email. Por ejemplo, enviar el link por email desde el servidor y crear la cuenta vía magic link o `inviteUserByEmail` con redirect al flujo de aceptación. Alternativa: no marcar `email_confirm: true` y aceptar solo tras confirmar.

### SP-06 — Aceptación de invitación no atómica

- **SEVERITY:** LOW.
- **PREREQUISITE:** solicitudes concurrentes o fallo parcial.
- **ATTACK PATH:** `createUser` OK y luego falla el `insert`/`update` del perfil → cuenta confirmada **sin org**, con contraseña conocida por quien aceptó → SP-01. Las carreras en `assertTeamCapacity` permiten superar `MAX_TEAM_USERS`.
- **IMPACT:** bajo por sí solo; alimenta SP-01.
- **EVIDENCE:** `lib/team/invitations.ts` 104–157, 203–219.
- **RECOMMENDED FIX:** RPC `SECURITY DEFINER` (solo service_role) que valide y consuma el token con `UPDATE … WHERE accepted = false AND expires_at > now() RETURNING` y asigne el perfil en la misma transacción. Si el perfil falla, borrar el usuario recién creado.

### SP-07 — Proveedores alternativos también producen usuarios sin org

- **SEVERITY:** INFO. Es la misma raíz que SP-01.
- **PREREQUISITE:** anónimos, OAuth, phone o SAML habilitados.
- **IMPACT y FIX:** como SP-01. Checklist de configuración.

---

# Recommended remediation

No implementado. Orden sugerido:

1. **SP-01, en código y SQL (no depender solo de la configuración).** Migración incremental nueva que redefina `complete_user_onboarding`:
   - Si el perfil **ya tiene** `organization_id` (caso `provisionClient` con `skipOnboarding = false`): conservar el comportamiento actual (marcar onboarding y devolver la org).
   - Si **no** tiene org: `RAISE EXCEPTION 'organization must be provisioned by Nura'` (fail closed). Alternativa, si se quiere self-serve con aprobación: crear la org con `access_status = 'pending'` y `role = 'admin'`; 048 la bloquea hasta que service_role la active.
   - `REVOKE EXECUTE … FROM PUBLIC, anon` explícito.

   En la app: `OnboardingWizard` solo para perfiles con org; sin org, mostrar `/acceso-pendiente`.
2. **Configuración de Supabase (producción):** signup OFF, confirmación de email ON, anónimos OFF, proveedores no usados OFF, Site URL y Redirect URLs exactas. Ver checklist.
3. **SP-02:** `isPlatformAdmin` debe exigir además `user.email_confirmed_at` y, preferiblemente, un flag server-only (`app_metadata.nura_platform_admin = true`, que solo service_role puede fijar). Precrear en Auth las cuentas de `NURA_ADMIN_EMAILS`.
4. **SP-03:** con el proyecto activo, leer el catálogo (`pg_proc.prosrc` de `handle_new_user`, `ensure_user_profile`, `complete_user_onboarding`; existencia de `protect_profile_identity`; `pg_policies` de `profiles` y `organizations`; `profiles_role_check`). Si falta, migración incremental que reponga solo la parte de identidad de 036 §2–4 (constraint, default `operator`, `handle_new_user`, `ensure_user_profile`, `protect_profile_identity`, `protect_org_identity`, policies de `profiles`), sin re-ejecutar 036/041 completas. Agregar `DROP POLICY IF EXISTS "authenticated_insert_organizations"`.
5. **SP-04:** fallbacks a `operator`.
6. **SP-05 / SP-06:** aceptación atómica vía RPC service_role y prueba de email.

Riesgo de regresión del punto 1: `provisionClient` siempre asigna org antes del onboarding, así que no se ve afectado. Las invitaciones asignan org vía service_role, tampoco. Solo se rompe el camino "usuario sin org crea su empresa", que contradice el modelo declarado.

---

# Production checklist

- [ ] Supabase → Authentication → Sign In / Providers → **Allow new users to sign up: OFF**
- [ ] Email provider → **Confirm email: ON**
- [ ] **Anonymous sign-ins: OFF**
- [ ] Phone, OAuth (Google, GitHub, …), SAML: **OFF** salvo uso explícito
- [ ] URL Configuration → **Site URL** = `https://<dominio-nura>`
- [ ] URL Configuration → **Additional Redirect URLs** = solo `https://<dominio-nura>/auth/callback` (más staging o local si corresponde), **sin** `https://*`, `**` ni comodines de preview abiertos
- [ ] `NEXT_PUBLIC_APP_URL` = `https://<dominio-nura>` (sin barra final)
- [ ] `NURA_ADMIN_EMAILS`: cuentas ya creadas en Auth, con email confirmado y controladas por Nura
- [ ] `GET /auth/v1/settings`: `disable_signup: true`, `mailer_autoconfirm: false`, `external.anonymous_users: false`
- [ ] Catálogo de producción: `handle_new_user` → `operator`; `protect_profile_identity` presente; sin `authenticated_insert_organizations`; `users_update_own_profile` fija `role`
- [ ] Decidir e implementar la remediación de SP-01 antes de abrir producción
- [ ] Repetir esta checklist en `fbunktfkihythsclhgnw` (dev/staging) al reactivarlo

---

PUBLIC SIGNUP:
- **POSSIBLE ONLY IF SUPABASE ALLOWS IT.** El código no tiene UI, API ni llamadas a `signUp`; el endpoint público de Supabase es la única vía. La configuración no está verificada.

SELF-PROVISIONED ORGANIZATION:
- **POSSIBLE.** Cualquier sesión `authenticated` sin org crea una org vía `complete_user_onboarding` (`036` 144–216 / `016` 84–168, `GRANT … TO authenticated`). Conseguir esa sesión depende de la configuración.

SELF-ASSIGNED ADMIN:
- **POSSIBLE.** La misma RPC fija `role = 'admin'` al fundador; `protect_profile_identity` lo permite explícitamente. El fallback service_role `ensureProfileWithAdmin` también inserta `admin`.

SELF-ACTIVATION:
- **POSSIBLE.** La org nace con `access_status = 'active'` y `access_granted_at = NOW()`. Una org suspendida por Nura **no** puede reactivarse sola (047).

INVITATION PRIVILEGE ESCALATION:
- **NOT FOUND.** Rol y org salen de la fila de la invitación vía service_role; solo un admin de org activa crea invitaciones de su propia org; se rechaza cambiar de org y el mismatch de email con sesión. Quedan SP-05 y SP-06 (bajo).

PRODUCTION AUTH CONFIG:
- **NOT VERIFIED.** El proyecto hosted está INACTIVE y no hay acceso al proyecto de producción desde este entorno.

P2 SIGNUP / PROVISIONING:
- **CONFIGURATION DEPENDENT.** La debilidad en código y SQL está confirmada (SP-01: cualquier identidad autenticada se convierte en admin de un tenant activo). Su explotabilidad externa depende solo de que Supabase permita crear identidades (signup, anónimos, OAuth). SP-02 y SP-03 deben cerrarse o verificarse antes de producción.
