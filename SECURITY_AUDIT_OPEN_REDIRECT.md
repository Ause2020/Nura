# SEC-P2-01 — Open Redirect en login / autenticación

Auditoría de código. Sin cambios de código, sin migraciones, sin payloads contra ningún entorno hosted. La matriz de payloads se evaluó offline con `URLSearchParams` + `new URL()` (mismas primitivas que usan el navegador y Next.js).

Fecha: 2026-10-02. Next.js `15.5.24`.

## Estado del repositorio al auditar

Hay **dos versiones** del código de auth y el veredicto depende de cuál está desplegada:

| Versión | `login-form.tsx` | `auth/callback/route.ts` |
| --- | --- | --- |
| `HEAD` / `main` (commit `e97c777`, pusheado a GitHub) | `router.push(redirectTo)` **crudo** | `safeNextPath` local |
| Working tree (sin commit) | `router.push(sanitizeInternalRedirect(redirectTo, "/dashboard"))` | `sanitizeInternalRedirect(next, "/login")` |

`lib/auth/internal-redirect.ts` y `scripts/verify-internal-redirect.mjs` existen solo en el working tree (`git status`: untracked). Todo lo que se despliegue desde `main` hoy lleva la versión vulnerable.

---

# Data flow

## Flujo 1 — `/login?redirect=` (único flujo explotable en HEAD)

```
URL del atacante:  https://<nura>/login?redirect=<payload>
→ app/(auth)/login/login-form.tsx  LoginForm
    useSearchParams().get("redirect")          [1 decodificación, URLSearchParams]
→ POST /api/auth/login                          [no lee redirect; solo setea cookie]
→ ensureUserProfile() / repairStuckOnboarding()
→ ready = profile.onboarding_completed === true
→ if (redirectTo && ready) router.push(...)     ← SINK
```

HEAD:

```ts
if (redirectTo && ready) {
  router.push(redirectTo);
```

Working tree:

```68:72:app/(auth)/login/login-form.tsx
    const ready = profile?.onboarding_completed === true;

    if (redirectTo && ready) {
      router.push(sanitizeInternalRedirect(redirectTo, "/dashboard"));
    } else if (ready) {
```

Cómo trata Next 15.5.24 un `router.push` con URL externa (`node_modules/next/dist/client/components/`):

1. `app-router-instance.js` `dispatchNavigateAction`: `new URL(href, location.href)`; `isExternalUrl = url.origin !== window.location.origin`.
2. `router-reducer/reducers/navigate-reducer.js` `navigateReducer` → `handleExternalUrl(state, mutable, url.toString(), …)` → `mpaNavigation = true`.
3. `app-router.js` → `window.location.assign(canonicalUrl)` (push) o `location.replace` (replace).

No hay allowlist de origen ni guard de `javascript:` en esta versión de Next (`rg "javascript:"` sin coincidencias en `dist/client/components`). Por lo tanto, en HEAD:

- `https://…`, `//host`, `/\host`, `\\host`: `location.assign` a dominio externo → **open redirect**.
- `javascript:alert(1)`: `new URL("javascript:alert(1)")` tiene origin `"null"` → se trata como externo → `location.assign("javascript:alert(1)")` → **ejecución de script en el origen de Nura** con la sesión recién creada. Es más grave que un open redirect: es DOM XSS post-login.
- `data:text/html,…`: `location.assign` a `data:` top-level; Chrome, Firefox y Safari bloquean la navegación top-level a `data:`. No es explotable en navegadores modernos.

## Flujo 2 — `/auth/callback?next=` (reset password)

```
Email de Supabase → https://<supabase>/auth/v1/verify?…&redirect_to=<APP>/auth/callback?next=/recuperar/nueva
→ app/auth/callback/route.ts GET
    searchParams.get("code"), searchParams.get("next")
→ exchangeCodeForSession(code)
→ NextResponse.redirect(`${origin}${next}`)      ← SINK (server-side)
```

```5:18:app/auth/callback/route.ts
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeInternalRedirect(searchParams.get("next"), "/login");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?info=reset-expired`);
}
```

Incluso con el `safeNextPath` de HEAD no es explotable: el destino siempre lleva el prefijo `${origin}`. `/\evil.example` produce `https://<nura>//evil.example` (mismo origen, path con doble barra, 404). Además requiere un `code` PKCE válido, emitido para el navegador de la víctima.

## Flujo 3 — middleware (productor del parámetro, no sink)

```77:81:middleware.ts
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
```

`pathname` es el path de la request actual en el mismo host. Todos los `NextResponse.redirect` del middleware clonan `request.nextUrl` y fijan `pathname` a constantes (`/login`, `/dashboard`, `/onboarding`, `/acceso-pendiente`). `?next=` en `/login` solo se lee como condición (`recoveryNext?.startsWith("/recuperar")` → devuelve la respuesta sin redirigir). No es un sink.

---

# Redirect sinks

Búsqueda global en `app/`, `components/`, `lib/` y `middleware.ts` de: `router.push(`, `router.replace(`, `redirect(`, `NextResponse.redirect(`, `window.location`, `location.href`, `redirectTo`, `emailRedirectTo`, `callbackUrl`, `returnTo`, `searchParams.get`.

| Sink | Archivo / función | Input de usuario | HEAD | Working tree |
| --- | --- | --- | --- | --- |
| `router.push(redirectTo)` | `app/(auth)/login/login-form.tsx` `LoginForm.handleSubmit` | `?redirect=` | **VULNERABLE** | sanitizado |
| `NextResponse.redirect(origin+next)` | `app/auth/callback/route.ts` `GET` | `?next=` | mismo origen (`safeNextPath`) | sanitizado |
| `NextResponse.redirect(clone)` ×9 | `middleware.ts` | solo `pathname` (mismo host) | seguro | seguro |
| `window.location.href = "/login"` | `components/layout/sidebar.tsx` `handleLogout` | no | seguro | seguro |
| `router.push("/login?redirect=/invitacion/${token}")` | `components/team/invitation-accept-form.tsx` | token de ruta, siempre bajo `/invitacion/` | seguro | seguro |
| `router.push("/login?info=password-updated")` | `app/(auth)/recuperar/nueva/reset-password-form.tsx` | no | seguro | seguro |
| `redirect("/login?redirect=/onboarding")`, `redirect("/dashboard")` | `app/onboarding/page.tsx` | no | seguro | seguro |
| `redirect("/login" \| "/dashboard" \| …)` | ~40 páginas `app/(dashboard)/**` | no (constantes o IDs de DB) | seguro | seguro |
| `router.push(\`/capa/${id}\`)` etc. | componentes CAPA / auditorías / registros / documentos | IDs devueltos por DB/API | seguro | seguro |
| `window.location.origin` | `lib/production-records/qr.ts` | lectura, no navegación | n/a | n/a |
| `window.location.reload()` | `components/settings/company-settings-form.tsx` | no | n/a | n/a |
| `searchParams.get("lang"\|"auditor"\|"rep")` | `app/api/export/audit-pdf/[id]/route.tsx` | texto para el PDF, no redirect | n/a | n/a |
| `searchParams.info` | `app/(auth)/login/page.tsx` `InfoNotice` | solo comparación con 3 strings constantes | n/a | n/a |

Sin coincidencias en el código: `callbackUrl`, `returnTo`, `emailRedirectTo`, `inviteUserByEmail`, `generateLink`, `signInWithOtp`, `signInWithOAuth`, `signUp(`.

---

# Auth flows

| Flujo | Resultado |
| --- | --- |
| Login | Único sink user-controlled (`?redirect=`). Ver Flujo 1. |
| Logout | `signOut()` → `window.location.href = "/login"` constante. |
| Recuperación (`/recuperar`) | `POST /api/auth/forgot-password`: el body solo trae `email`. `redirectTo` es fijo. |
| Reset password (`/recuperar/nueva`) | `updateUser` → `signOut` → `router.push("/login?info=password-updated")` constante. |
| Invitaciones | `buildInvitationUrl(token)` = `NEXT_PUBLIC_APP_URL + /invitacion/{token}` (`lib/team/urls.ts`). Tras aceptar: `/dashboard`; si falla el login: `/login?redirect=/invitacion/${token}` (path interno). |
| Onboarding | `redirect("/login?redirect=/onboarding")` constante. |
| Auth callback | Ver Flujo 2. |
| Middleware | Productor de `redirect=pathname`. Ver Flujo 3. |

## Supabase Auth

**A. Redirect interno de la aplicación:** `login-form.tsx` (`router.push`) y `auth/callback` (`NextResponse.redirect`). Cubiertos arriba.

**B. Redirect que la app le pide a Supabase:**

```33:35:app/api/auth/forgot-password/route.ts
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appOrigin()}/auth/callback?next=/recuperar/nueva`,
  });
```

`appOrigin()` = `process.env.NEXT_PUBLIC_APP_URL`, con fallback `http://localhost:3000`. No usa el header `Host` ni `X-Forwarded-Host`, ni nada que venga del body. El usuario no controla este valor y no hay host-header injection en el email de reset. Ningún otro `redirectTo` / `emailRedirectTo` existe en el código.

**C. Allowlist de Supabase:** `GET /auth/v1/verify?…&redirect_to=` vive en el dominio `*.supabase.co`, no en el de Nura. Supabase solo respeta `redirect_to` si coincide con Site URL o Additional Redirect URLs del proyecto; si no coincide, usa Site URL. **No se verificó** la configuración del dashboard (Auth → URL Configuration) de `fbunktfkihythsclhgnw` ni de producción. Si la allowlist tuviera comodines amplios (`https://*`, `**`), alguien podría armar un link de verify en el dominio de Supabase hacia un destino externo. Eso no sería un open redirect de Nura y se corrige en la configuración, no en el código.

Riesgo de producción: si `NEXT_PUBLIC_APP_URL` no está seteada, el email de reset apunta a `http://localhost:3000`. Es un problema de configuración, no un redirect explotable.

---

# Exploitability

| # | Pregunta | HEAD (`main`) | Working tree |
| --- | --- | --- | --- |
| 1 | ¿Existe un Open Redirect? | **Sí**, en `/login?redirect=` | No |
| 2 | ¿Requiere autenticación? | La víctima debe tener credenciales válidas y `onboarding_completed = true`. El atacante no necesita cuenta. | n/a |
| 3 | ¿Explotable después de un login exitoso? | **Sí.** Solo se dispara después de un login exitoso. | No |
| 4 | ¿Phishing con dominio legítimo de Nura? | **Sí.** La víctima ve la página real de Nura, se loguea y aterriza en `evil.example` (por ejemplo, un falso "sesión expirada, vuelve a ingresar" que roba la contraseña). | No |
| 5 | ¿Acepta URLs absolutas? | **Sí** (`https:`, `http:`). Además `javascript:` ejecuta script en el origen de Nura. | No |
| 6 | ¿Acepta `//host`? | **Sí**, también `/\host`, `\\host`, `%09//host`, ` //host`. | No |
| 7 | ¿Bypass por encoding? | En HEAD no hace falta, no hay filtro. `%2F%2Fevil.example` y `/%2F%2Fevil.example` también salen. | No. Ver matriz: una sola decodificación (la de `URLSearchParams`) y todas las variantes se rechazan. |
| 8 | ¿Afecta invitaciones / reset? | No de forma directa. Reset: el callback ya era mismo-origen. Invitaciones: el atacante puede construir `/login?redirect=…` por su cuenta, sin el flujo de invitación. | No |
| 9 | ¿Validación central? | **No.** Solo `safeNextPath` local en el callback. | **Sí**: `lib/auth/internal-redirect.ts`, usado por login y callback. |

Severidad en HEAD: P2 como open redirect. La variante `javascript:` lo eleva a XSS post-login en el origen de Nura (lectura de datos del tenant, acciones con la sesión). Requiere interacción (que la víctima se loguee desde el link) y que no haya una CSP que bloquee `javascript:`; no se revisó la CSP en esta auditoría.

---

# Test matrix

Evaluación offline (`%TEMP%\nura-redirect-matrix.mjs`): `new URLSearchParams("redirect=<raw>").get("redirect")`, y luego `new URL(valor, "https://nura.example/login")`.

"HEAD login" = destino de `router.push(valor crudo)`. "Fix login" = `sanitizeInternalRedirect(valor, "/dashboard")`. "HEAD callback" = `${origin}${safeNextPath(valor)}`.

| Query raw | `get()` | HEAD login | Fix login | HEAD callback | Fix callback |
| --- | --- | --- | --- | --- | --- |
| `https://evil.example` | igual | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `//evil.example` | igual | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `http://evil.example` | igual | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `javascript:alert(1)` | igual | **`location.assign(javascript:)`** | `/dashboard` | `/login` | `/login` |
| `data:text/html,x` | igual | `data:` (bloqueado por el navegador) | `/dashboard` | `/login` | `/login` |
| `/dashboard` | igual | `/dashboard` | `/dashboard` | `/dashboard` | `/dashboard` |
| `/haccp` | igual | `/haccp` | `/haccp` | `/haccp` | `/haccp` |
| `/%2F%2Fevil.example` | `///evil.example` | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `%2F%2Fevil.example` | `//evil.example` | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `%252F%252Fevil.example` | `%2F%2Fevil.example` | interno (path relativo) | `/dashboard` | `/login` | `/login` |
| `/%252F%252Fevil.example` | `/%2F%2Fevil.example` | interno | `/%2F%2Fevil.example` (path literal, 404) | interno | interno |
| `/%5Cevil.example` | `/\evil.example` | **EXTERNO** | `/dashboard` | `//evil.example` mismo origen | `/login` |
| `%5C%5Cevil.example` | `\\evil.example` | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `/%09/evil.example` | `/\t/evil.example` | **EXTERNO** | `/dashboard` | `//evil.example` mismo origen | `/login` |
| `%09//evil.example` | `\t//evil.example` | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `%20//evil.example` | ` //evil.example` | **EXTERNO** | `/dashboard` | `/login` | `/login` |
| `https:evil.example` | igual | interno `/evil.example` | `/dashboard` | `/login` | `/login` |
| `/javascript:alert(1)` | igual | interno (path) | `/dashboard` | interno (path) | `/login` |
| `/registros/historico?q=test` | igual | igual | igual | igual | igual |
| `/dashboard#section` | igual | igual | igual | igual | igual |
| `/invitacion/abc123` | igual | igual | igual | igual | igual |

Double-encoding: el helper no llama a `decodeURIComponent`. `%252F…` llega como `%2F…` literal. Si no empieza con `/`, se rechaza; si empieza con `/`, queda como un path interno que el navegador no reinterpreta como host. No aparece una segunda decodificación.

---

# Recommended remediation

El fix mínimo ya está escrito en el working tree y cumple el contrato pedido:

```6:28:lib/auth/internal-redirect.ts
export function sanitizeInternalRedirect(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (!path) return fallback;

  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  if (path.includes("://")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(path)) return fallback;

  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const afterSlash = pathname.slice(1);
  if (!afterSlash && pathname !== "/") {
    return fallback;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(afterSlash)) return fallback;

  return path;
}
```

- Solo paths que empiezan por `/`; rechaza `//`, `\`, `://`, caracteres de control y un scheme justo después de `/`.
- Conserva `?query` y `#hash` internos.
- Fallback `/dashboard` en login y `/login` en el callback.
- No decodifica de nuevo y no lanza excepciones.
- Tests: `scripts/verify-internal-redirect.mjs` (5 tests, pasan; incluidos en `npm test`).

Pendiente para cerrar el hallazgo:

1. Commitear y desplegar `lib/auth/internal-redirect.ts`, `login-form.tsx`, `auth/callback/route.ts`, `scripts/verify-internal-redirect.mjs` y `package.json`.
2. Revisar en Supabase (Auth → URL Configuration) que Additional Redirect URLs liste solo `${APP_URL}/auth/callback` exacto, sin comodines amplios.
3. Confirmar `NEXT_PUBLIC_APP_URL` en el entorno de producción.
4. Opcional (defensa en profundidad, otro hallazgo): una CSP sin `unsafe-inline` reduce el impacto de cualquier `javascript:` futuro.

---

# Regression risk

Bajo. Todos los productores legítimos generan paths internos que el helper acepta sin cambios:

| Productor | Valor | Resultado |
| --- | --- | --- |
| `middleware.ts` | `redirect=/haccp`, `/dashboard`, `/capa/…` | igual |
| `app/onboarding/page.tsx` | `redirect=/onboarding` | igual. El login sigue mandando a `/onboarding` si no está `ready`, sin mirar `redirect`. |
| `invitation-accept-form.tsx` | `redirect=/invitacion/{token}` | igual |
| `forgot-password/route.ts` | `next=/recuperar/nueva` | igual. El middleware sigue dejando pasar `/login?next=/recuperar…`. |
| Login sin `redirect` | — | `/dashboard` |

Único cambio de comportamiento: un `redirect` con query codificada de forma rara que antes funcionaba por casualidad (por ejemplo `https:` sin barras) ahora cae a `/dashboard`. Ningún productor de la app genera esos valores.

---

OPEN REDIRECT:
- **CONFIRMED** en el código commiteado y pusheado (`main` / `e97c777`): `app/(auth)/login/login-form.tsx` `LoginForm.handleSubmit` → `router.push(searchParams.get("redirect"))`, sin validación. Next 15.5.24 lo convierte en `window.location.assign(...)` para cualquier origen distinto (`navigate-reducer.js` `handleExternalUrl` → `app-router.js`). Acepta `https://`, `//host`, `/\host`, `%2F%2F` y `javascript:` (XSS post-login).
- **NOT EXPLOITABLE** en el working tree actual: `sanitizeInternalRedirect` (`lib/auth/internal-redirect.ts`) se aplica en `login-form.tsx:71` y `app/auth/callback/route.ts:8`. Todas las variantes de la matriz caen al fallback.
- El hallazgo queda **abierto hasta que esos cambios se commiteen y desplieguen**.
