# SEC-P2-01 — Open Redirect en login / autenticación

**SEC-P2-01 CODE FIX = PASS**

El hallazgo **no está CLOSED**: el código corregido sigue sin commit y sin deploy. `main` (`e97c777`) todavía tiene la versión vulnerable. Detalle en `SECURITY_AUDIT_OPEN_REDIRECT.md`.

# Root cause

`app/(auth)/login/login-form.tsx` leía `?redirect=` con `useSearchParams().get("redirect")` y, después de un login exitoso con `onboarding_completed = true`, llamaba a `router.push(redirectTo)` sin validar.

Next.js 15.5.24 trata un destino de otro origen como navegación MPA: `navigate-reducer.js` `handleExternalUrl` → `app-router.js` → `window.location.assign(url)`. No hay allowlist ni guard para `javascript:`. Por eso:

- `https://evil.example`, `//evil.example`, `/\evil.example`, `%2F%2Fevil.example` → redirect a un dominio externo con el link inicial en el dominio real de Nura.
- `javascript:alert(1)` → script ejecutado en el origen de Nura con la sesión recién creada (XSS post-login).

`app/auth/callback/route.ts` ya era mismo-origen (`${origin}${next}`), pero tenía su propio `safeNextPath`. No había una política central.

# Fix

Sin cambios de diseño respecto al fix auditado.

| Archivo | Cambio |
| --- | --- |
| `lib/auth/internal-redirect.ts` (nuevo) | `sanitizeInternalRedirect(value, fallback = "/dashboard")` |
| `app/(auth)/login/login-form.tsx` | `router.push(sanitizeInternalRedirect(redirectTo, "/dashboard"))` |
| `app/auth/callback/route.ts` | `sanitizeInternalRedirect(searchParams.get("next"), "/login")`; se eliminó `safeNextPath` |
| `scripts/verify-internal-redirect.mjs` (nuevo) | Tests del helper, matriz vía `URLSearchParams` y regresión estática |
| `package.json` | `test:internal-redirect` y el script agregado a `npm test` |

Contrato del helper (política positiva, sin `decodeURIComponent`, nunca lanza):

1. Si no es string, o queda vacío tras `trim`, devuelve el fallback.
2. Debe empezar por `/` y no por `//`.
3. Rechaza `\`, `://` y caracteres de control `U+0000`–`U+001F` y `U+007F`.
4. Rechaza un scheme justo después de la `/` inicial (`/javascript:…`).
5. Conserva `?query` y `#hash`.

Login mantiene la lógica de `onboarding_completed`: sin `redirect` va a `/dashboard`; si no está listo, a `/onboarding`.

# Test matrix

`scripts/verify-internal-redirect.mjs`: **6/6 pass**. El test 5 parte del query string crudo, lo pasa por `URLSearchParams.get()` (la misma decodificación única que usa la app) y verifica ambos fallbacks (`/dashboard` y `/login`).

Caen al fallback:

| Entrada (query cruda) | Valor tras `get()` |
| --- | --- |
| `https://evil.example` | igual |
| `http://evil.example` | igual |
| `//evil.example` | igual |
| `/%5Cevil.example` | `/\evil.example` |
| `%5C%5Cevil.example` | `\\evil.example` |
| `javascript:alert(1)` | igual |
| `data:text/html,test` | igual |
| `%2F%2Fevil.example` | `//evil.example` |
| `/%2F%2Fevil.example` | `///evil.example` |
| `%252F%252Fevil.example` | `%2F%2Fevil.example` |
| `%2F%5Cevil.example` | `/\evil.example` |
| `/%09/evil.example` | `/<TAB>/evil.example` |
| `%09//evil.example` | `<TAB>//evil.example` |
| `%20//evil.example` | ` //evil.example` |
| `/%0A/evil.example`, `/%0D/…`, `/%00/…` | control char |
| `https:evil.example` | igual |
| `/https://evil.example`, `/javascript:alert(1)` | igual |
| `""`, `"   "`, `null`, `undefined` | — |

Se conservan sin cambios y resuelven al mismo origen (cliente con `new URL(out, origin)` y servidor con `new URL(origin + out)`):

`/dashboard`, `/haccp`, `/onboarding`, `/invitacion/abc123`, `/registros/historico?q=test`, `/dashboard#section`.

Sin segunda decodificación: el valor literal `/%2F%2Fevil.example` (después de `get()`) se queda como path interno; en Nura es un 404, no otro host.

# Regression

Ejecutado el 2026-10-02 sobre el working tree:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (solo warnings preexistentes: `<img>`, unused vars en `ai-insights/store.ts`, alt en `audit-pdf-document.tsx`) |
| `npm test` | 171 tests: 163 pass, 8 skip (live sin `DATABASE_URL`), **0 fail** |
| `npm run test:internal-redirect` | 6/6 pass |
| `npm run test:rbac` | 10/10 pass |
| `npm run test:ssrf-logo` | 6 pass, 1 skip live, 0 fail |
| `npm run test:notification-tenant` | 5 pass, 1 skip live, 0 fail |
| `npm run build` | exit 0 |

Regresión estática (test 6):

| Flujo | Productor | Resultado |
| --- | --- | --- |
| Anónimo → `/haccp` | `middleware.ts` `searchParams.set("redirect", pathname)` | `/login?redirect=/haccp` → `/haccp` |
| Onboarding | `app/onboarding/page.tsx` `redirect("/login?redirect=/onboarding")` | sin cambio |
| Invitación | `invitation-accept-form.tsx` `/login?redirect=/invitacion/${token}` | sin cambio |
| Reset | `forgot-password/route.ts` `…/auth/callback?next=/recuperar/nueva` | sin cambio |
| Login sin redirect | `login-form.tsx` | `/dashboard` |

No se tocaron RBAC, RLS, migraciones ni otros P2/P3.

# Deployment status

| Item | Estado |
| --- | --- |
| Fix en el working tree | Sí |
| Commit | **No** (pendiente de autorización) |
| Push a GitHub | **No** |
| Deploy | **No** |
| `main` / `e97c777` | **Vulnerable** |

Al commitear hay que tener en cuenta que `package.json` agrega en el mismo hunk `test:ssrf-logo` y `scripts/verify-ssrf-logo-url.mjs` en `npm test`, que pertenecen al fix SSRF (también sin commit). Opciones: commitear SSRF y Open Redirect juntos, o hacer staging parcial de `package.json` para que `npm test` no referencie un script que no está en el commit.

SEC-P2-01 pasa a **CLOSED** solo cuando el código corregido sea el que efectivamente corre en producción.

# Production configuration pending

Verificar antes de producción (no se revisó desde este entorno):

1. **`NEXT_PUBLIC_APP_URL`** = dominio HTTPS real de Nura, sin barra final. Si falta, `appOrigin()` en `app/api/auth/forgot-password/route.ts` cae a `http://localhost:3000` y el link de reset queda roto.
2. **Supabase → Authentication → URL Configuration** del proyecto de producción:
   - **Site URL** = dominio de producción correcto (HTTPS).
   - **Additional Redirect URLs**: solo las necesarias, como mínimo `https://<dominio-nura>/auth/callback`. Agregar staging o local solo si ese proyecto los usa.
   - **Sin comodines amplios** (`https://*`, `**`, `*.vercel.app` abierto). Supabase solo honra `redirect_to` si coincide con esta allowlist; un comodín amplio permitiría armar un link de `/auth/v1/verify` hacia un destino externo desde el dominio de Supabase.
3. Repetir la verificación en `fbunktfkihythsclhgnw` (dev/staging) si ese proyecto comparte usuarios reales.
