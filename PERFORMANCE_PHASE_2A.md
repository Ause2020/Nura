# Performance Phase 2A — navegación protegida

Fecha: 2026-09-13  
Alcance: middleware waterfall, prefetch del sidebar, layout que bloqueaba `children`.  
Fuera de alcance: HACCP page, RLS, SQL nuevo, `service_role`.

`middleware.ts` **no cambia los redirects**. Siguen `getUser`, onboarding, acceso de org y `canAccessPath`.

---

## 1. Duplicación MW ↔ RSC

### A. Qué obtiene middleware

| Campo | Origen | Uso |
| --- | --- | --- |
| `user` | `auth.getUser()` | public vs authenticated |
| `platformAdmin` | email allowlist (sin DB) | `/admin` |
| `profile.role` | `profiles` / `get_my_profile` | `canAccessPath` |
| `profile.onboarding_completed` | igual | redirect `/onboarding` |
| `profile.organization_id` | igual | saber si hay tenant |
| `accessAllowed` | `organizations.access_status` + expiry | redirect `/acceso-pendiente` |

### B. Qué vuelve a obtener el RSC

`getSessionUser` → `auth.getUser()` otra vez.  
`getSessionProfile` → `profiles` (id, name, role, org).  
`getSessionOrganizationBrand` → `organizations` name/logo (solo sidebar).

No comparte cache con Edge middleware.

### C. Qué debe quedarse en middleware

- Validar/refrescar sesión (`getUser`).
- Gate de org (`access_status`). **RLS de negocio no mira access_status**; un tenant suspendido seguiría leyendo NC/docs si solo redirigimos en RSC.
- Onboarding y RBAC de path. Si se mueven al RSC, un prefetch o el primer render ya trae payload.

Por eso middleware **no** se redujo a “solo sesión”.

### D. Qué no hace falta en middleware

Nombre/logo de empresa, listas de la page, `full_name`. Eso es UI de RSC.

---

## 2. Waterfall del middleware

Antes (serial, medido):

| Paso | ms |
| --- | ---: |
| `auth.getUser()` | 190–290 |
| `get_my_profile` | 185–320 |
| `organizations/access` | 190–260 |
| **total** | **580–835** |

Ahora: `getUser` (obligatorio) y después **`get_my_profile` // `organizations` en paralelo** (RLS de “mi org”, sin id del cliente). Fallback `profiles` si el RPC no trae fila, igual que antes.

No se usó embed PostgREST: un join vacío podría negar acceso a un tenant válido. Sin RPC nueva.

Ahorro esperado por request real: **~190–260 ms** de wall-clock (el org deja de esperar al profile).  
Log: `MW session gates` (una línea para el par).

---

## 3. Duplicar `getUser` (MW + RSC)

No hay forma soportada y segura de reutilizar el `User` de Edge en el RSC:

- Header `x-user-id` sería un atajo; si algo bypasea middleware, impersonación.
- Cookie propia con profile/org: falsificable / stale / no es validación de JWT.
- `getSession()` en RSC: Supabase dice que no se use en servidor.
- `service_role`: prohibido.

Middleware **debe** llamar `getUser` (refresh de cookies). RSC **debe** volver a validar. Se documenta y no se fuerza.

`React.cache` sí comparte `getSessionUser` **dentro** del mismo request RSC (layout sidebar + page).

---

## 4. Prefetch del sidebar

Medición autenticada previa: al cargar el shell, Next prefetch-eaba todas las rutas visibles. Cada una corría MW completo.

### Escenario A (antes)

Admin en `/dashboard`: 1 document + 7 prefetches ≈ **8 × MW**.

| | Valor |
| --- | ---: |
| MW por ruta | 580–835 ms |
| Round trips Supabase | 8 × 3 = **24** |
| Carga agregada (si se suman) | ~4.6–6.7 s de Auth+SQL |
| RSC extra | 7 árboles layout+page (datos de tenant en prefetch) |

### Escenario B (ahora)

`AppNavLink`: `prefetch={false}` + `router.prefetch` en hover/focus.

| | Valor |
| --- | ---: |
| Al cargar dashboard | **1** MW (2 RTTs: getUser + gates) |
| Por hover de un módulo | +1 MW completo (gates intactos) |
| Click sin hover | igual que un document request de antes, sin payload precargado |

No se midió click-latency autenticada en este entorno (sin JWT). Hipótesis: el click en frío puede ser ~igual al E2E previo de esa ruta; el hover previo puede dejar RSC en cache.

No se desactivó prefetch global. Solo chrome del sidebar.

Los logs marcan `REQUEST GET document` vs `REQUEST GET prefetch`.

---

## 5. Layout

Antes el layout **await** user + profile + org brand (**819 ms** en `/dashboard`) y después pintaba `children`.

Ahora el layout es sync: `Suspense` alrededor de `DashboardSidebar` y del FAB. La page arranca en paralelo. User/profile/role siguen resolviéndose en el sidebar (sin flash de `/configuracion`: el fallback no tiene links).

Org name/logo sigue autenticado por RLS; solo deja de bloquear el main.

---

## 6. Seguridad (no tocada)

- RLS igual.
- Tenant id no viene del browser.
- Sin `service_role` en el request.
- `canAccessPath` y acceso de org siguen en middleware en **todo** request, incluido hover-prefetch.
- Sin cache compartido entre usuarios.
- Sin relajar auth.

---

## 7. Cómo verificar

```powershell
npm run test:nav-phase-2a
$env:NURA_PERF_TRACE="1"; npm run start
```

Logueado: abrir `/dashboard` (debe haber **un** `MW total` de document, no 8). Hover `/documentos` (un prefetch). Click. Comparar `session gates` vs la suma vieja profile+org.
