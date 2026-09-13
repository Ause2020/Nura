# Auditoría de velocidad de navegación — App Router

Fecha: 2026-09-12  
Modo: **solo diagnóstico**. No se cambió código, SQL, RLS ni índices.

Rutas reales (el producto no usa `/analytics` ni `/monitoring`):

| En el brief | En la app |
| --- | --- |
| Analytics | `/analisis` |
| Monitoring | `/registros` |
| Nonconformities | `/capa` |
| Audits | `/auditorias` |
| Documents | `/documentos` |
| HACCP | `/haccp` |
| Dashboard | `/dashboard` |

Las queries individuales a Postgres ya se midieron como baratas. El retraso al hacer click es **el número de idas al servidor + el trabajo que el layout/página exige antes de pintar**, no un Seq Scan.

---

## 1. Executive summary

Cada click del sidebar es una navegación **dinámica** de Next.js 15: `cookies()` en `createClient()` impide un shell estático. El vuelo RSC del destino vuelve a ejecutar **middleware + layout compartido + page**.

El layout `app/(dashboard)/layout.tsx` **espera** auth, perfil, `organizations` y **todas** las plantillas activas **antes** de pintar `children`. `production_form_templates` se carga en **Dashboard, Análisis, HACCP, Monitoreo, CAPA, Auditorías y Documentos**, aunque el FAB esté cerrado y en desktop ni se muestre (`md:hidden`).

No hay `<Suspense>` en el dashboard. El único `loading.tsx` genérico (`app/(dashboard)/loading.tsx`) es un skeleton de **Dashboard** (4 cards + tabla) y se reutiliza en HACCP/CAPA/etc. Análisis tiene el suyo.

`createClient()` **no** está envuelto en `cache()`. `getSessionUser` / `getSessionProfile` **sí**. El middleware **no comparte** ese cache: cada navegación paga `auth.getUser()` + `get_my_profile` + `organizations` otra vez.

HACCP es el peor caso de **JS**: el Server Component importa de golpe `HaccpPlanWizard`, que tira los 12 pasos y el editor de diagrama al bundle del cliente.

---

## 2. Flujo Dashboard → HACCP (`/dashboard` → `/haccp`)

```
CLICK en <Link href="/haccp">   (prefetch por defecto, ver §6)
        ↓
Next App Router (soft nav, layout no se desmonta en el cliente)
        ↓
middleware.ts  (SIEMPRE, matcher amplio)
  1. supabase.auth.getUser()                         ← query Auth
  2. rpc get_my_profile                              ← RPC
  3. fallback profiles (solo si el RPC falla)
  4. organizations (access_status, access_expires_at)
  5. rate-limit: NO (path de página → classifyPath = null)
        ↓
RSC request: app/(dashboard)/layout.tsx  +  app/(dashboard)/haccp/page.tsx
        ↓
LAYOUT (bloquea el árbol del shell)
  6. cookies() + createClient()
  7. getSessionUser → getUser          [cache() de este request]
  8. getSessionProfile → profiles      [espera 7]
  9. organizations (name, logo_url)    [paralelo con 10]
 10. production_form_templates activas  [paralelo con 9]
        ↓
PAGE /haccp
 11. requireOrganizationId → profile cache
 12. getSessionUser cache
 13. haccp_plans LIMIT 1
 14. Promise.all: teams, products, diagrams, validations, hazards
 15. (si vacío) INSERT diagrama / producto + re-select
 16. DESPUÉS: haccp_step_data pasos 7–11
        ↓
first visible render
  • Sidebar ya estaba en pantalla (estado cliente)
  • Main: loading.tsx GENÉRICO de dashboard (4 cards) mientras llega el RSC
    o, si el vuelo tarda junto, el main viejo hasta que llega /haccp
  • HTML del wizard (paso actual)
        ↓
remaining
  • Hidratar HaccpPlanWizard + 12 steps + FlowDiagramEditor
  • NotificationBell: SELECT notifications LIMIT 50 + canal Realtime
  • CapaNavBadge: SELECT NC abiertas (due_date, status)
```

**Qué bloquea la presentación de `/haccp`:** 11–16 en el servidor + parse/hydrate del wizard. 9–10 no sirven para pintar HACCP.

**SERVER LATENCY** dominante en el wait del skeleton.  
**JS/BUNDLE LATENCY** dominante después del HTML (wizard monolítico).

No hay API route ni `router.push` en este click.

---

## 3. Flujo Dashboard → Análisis (`/dashboard` → `/analisis`)

```
CLICK en <Link href="/analisis">
        ↓
middleware  (igual que §2: getUser + get_my_profile + organizations)
        ↓
LAYOUT  (igual: user, profile, org name/logo, templates)
        ↓
PAGE /analisis
  1. requireOrganizationId + getUser + profile (cache del request)
  2. hasPermission(analysis.read) — si operator → redirect /dashboard
  3. getInsightForDate (ai_daily_insights, org + día Santiago)
  4a. Si hay fila de hoy → listo
  4b. Si no → collectQualitySnapshot (~25–30 queries en Promise.all)
      + insert/upsert insight
        ↓
first visible render
  • loading.tsx de /analisis (skeleton propio)
  • Luego AnalisisView (Server Component: HTML)
        ↓
remaining
  • AnalisisRegenerate ("use client", pequeño)
  • Bell + CapaNavBadge (igual que siempre)
```

No hay RPC de dashboard. Claude **no** corre en esta carga (solo reglas, o fila existente).

Si el insight de hoy ya existe: la page es **1 query**. El costo percibido sigue siendo middleware + layout (templates).

Si hay que crear el de hoy: fan-out grande **antes** del primer HTML de Análisis.

---

## 4. Shared layout — critical path

`app/(dashboard)/layout.tsx` no envuelve `children` en Suspense. Todo lo de abajo corre **antes** de componer el main.

| Dependencia | Dónde | Clasificación | Notas |
| --- | --- | --- | --- |
| `getSessionUser` / `auth.getUser()` | layout | **CRITICAL** | Rol y FAB. Ya `cache()`. |
| `profiles` (nombre, rol, org) | layout | **CRITICAL** | Sidebar. Ya `cache()`. |
| `organizations` name, logo | layout | **DEFERABLE** | Texto/logo del rail. Puede skeleton. |
| `production_form_templates` id,name,area activas, sin LIMIT | layout | **ON_DEMAND** / **REMOVE_FROM_LAYOUT** | Solo `QuickRegistro` al elegir “Monitoreo”. Se pide **en todas** las navs. Desktop: FAB `md:hidden`, query igual. |
| `QuickCaptureFab` | layout | **ON_DEMAND** | Hidrata en todas las páginas del shell. |
| `Sidebar` | layout | **CRITICAL** | Cliente. Estado de colapso se conserva si no remonta. |
| `CapaNavBadge` | sidebar cliente | **DEFERABLE** | Fetch **después** del paint; no bloquea SSR del layout, sí añade query y puede remontar. |
| `NotificationBell` | sidebar cliente | **DEFERABLE** | LIMIT 50 + Realtime al montar. |
| `ToastProvider` | layout | **CRITICAL** | Local, barato. |
| `children` (page) | — | **CRITICAL** | Hoy espera a que el layout termine sus awaits. |

**`production_form_templates` se carga en todas las navegaciones del shell aunque QuickCapture no se abra. Sí.**

---

## 5. Middleware

Archivo: `middleware.ts` → `updateSession`.

Matcher: casi todo excepto estáticos. **Cada** click de módulo (y cada prefetch) lo ejecuta.

| Paso | Paralelo | ¿Hace falta para cambiar de módulo? |
| --- | --- | --- |
| `auth.getUser()` | no | Sí (sesión). |
| `get_my_profile` | **después** de getUser | Onboarding/rol. Redundante con RSC `profiles`. |
| `profiles` fallback | si RPC falla | — |
| `organizations` access | **después** del perfil | Gate de acceso. En nav internas ya se validó al entrar. |
| `enforceRateLimit` | después de updateSession | No escribe: paths de UI no clasifican. |

Waterfall middleware: **getUser → profile → org** (3 RTT en serie).

Este cache **no** es `React.cache`. No se reutiliza en el layout.

---

## 6. Prefetch

Sidebar: `next/link` `<Link href={href}>`. **No** hay `prefetch={false}`. **No** hay `router.push` en el menú.

Rutas del rail (todas dinámicas por `cookies()`):

`/dashboard` `/analisis` `/documentos` `/haccp` `/registros` `/auditorias` `/capa`

Next 15: prefetch automático al entrar en viewport; en rutas dinámicas suele adelantar el **loading UI**, no siempre el page completo. Hover puede completar el vuelo.

No hay que forzar prefetch masivo: 7 links visibles pueden disparar **7 middleware** de fondo al cargar el shell. Eso no acelera el primer paint del destino si el layout+page siguen siendo pesados.

`router.push` aparece en formularios (login, crear NC, etc.), no en el sidebar.

---

## 7. `loading.tsx`

| Ruta | ¿`loading.tsx` propio? | Feedback inmediato al navegar |
| --- | --- | --- |
| `/dashboard` | Usa `app/(dashboard)/loading.tsx` | Sí: skeleton de dashboard (el correcto aquí). |
| `/analisis` | `app/(dashboard)/analisis/loading.tsx` | Sí: skeleton de análisis. |
| `/haccp` | **No.** Cae al genérico del grupo. | Hay boundary, pero el UI es de **dashboard** (4 KPI + tabla). |
| `/registros` | **No.** Genérico. | Igual: feedback “de otro módulo”. |
| `/capa` | **No.** Genérico. | Igual. |
| `/auditorias` | **No.** Genérico. | Igual. |
| `/documentos` | **No.** Genérico. | Igual. |

No hay `loading.tsx` en `app/(dashboard)/haccp/`, `capa/`, `registros/`, `auditorias/`, `documentos/`.

`<Suspense>` en product UI: **solo login**. Cero boundaries dentro del dashboard.

---

## 8. Oportunidades de Suspense

| Pieza | ¿Bloquea la page hoy? | ¿Suspense sin cambiar negocio? |
| --- | --- | --- |
| NotificationBell | No el HTML de la page; sí hidrata el layout | Sí. Badge “…” hasta el fetch. |
| CapaNavBadge | No SSR | Sí. Número después. |
| AI teaser dashboard | **Sí** — va **después** de `fetchDashboardData` | Sí. Dashboard sin teaser, teaser al resolver. |
| Actividad / charts / widgets dashboard | Sí — todo en un `DashboardView` cliente que espera el objeto completo | Parcial: listas Q1–Q7 y RPC podrían partirse; el JS ya es un solo island. |
| QuickCapture / templates | **Sí en el layout** (await templates) | Sí: FAB vacío, fetch al abrir “Monitoreo”. |
| Insight Análisis | **Sí** — page espera get-or-create | Header + “generando…”; insight en Suspense. Negocio igual. |
| Listas CAPA/auditorías (tabla completa) | **Sí** — page espera SELECT * del tenant | Cabecera + skeleton de tabla. |
| Editor HACCP | Page espera plan+pasos; JS espera wizard entero | Shell del stepper ya; canvas on-demand. |

---

## 9. Waterfalls (archivo + función + dependencia)

| # | Archivo | Función | Dependencia |
| --- | --- | --- | --- |
| W1 | `lib/supabase/middleware.ts` | `updateSession` | `getUser` → `get_my_profile` → `organizations` |
| W2 | `lib/auth/cached-session.ts` | `getSessionProfile` | `getSessionUser` → `profiles` |
| W3 | `app/(dashboard)/layout.tsx` | `DashboardLayout` | (user+profile) → luego org+templates |
| W4 | `app/(dashboard)/dashboard/page.tsx` | `DashboardPage` | `requireOrganizationId` → `fetchDashboardData` → **luego** `getInsightTeaser` |
| W5 | `app/(dashboard)/haccp/page.tsx` | `HaccpPlanPage` | org/user → `getOrCreateActivePlan` (plan → 5 tablas; seed extra) → **luego** `getAllStepData` |
| W6 | `app/(dashboard)/analisis/page.tsx` | `AnalisisPage` | org/user → `getInsightForDate` → (si falta) snapshot+insert |
| W7 | `lib/haccp-plan/data-service.ts` | `getOrCreateActivePlan` | `haccp_plans` **luego** `loadPlanDetails` |
| W8 | `lib/haccp-plan/data-service.ts` | `loadPlanDetails` | si no hay producto/diagrama: insert **luego** re-select |
| W9 | Layout → Page | App Router | Page no empieza a “mostrar” útil hasta que el layout await termina (mismo árbol, sin Suspense en children) |
| W10 | `notification-bell.tsx` / `capa-nav-badge.tsx` | `useEffect` | Post-paint: SELECT (y Realtime) |

Independientes hoy **ya** en paralelo: org+templates del layout; 8 llamadas de `fetchDashboardData`; 3 de CAPA/auditorías/registros; ~25 del snapshot de análisis.

---

## 10. Duplicados (memo vs query real)

`React.cache()` **solo vive en un request RSC**. Middleware es otro isolate.

| Dato | Middleware | Layout RSC | Page RSC | ¿Query real extra? |
| --- | --- | --- | --- | --- |
| `auth.getUser()` | 1 | `getSessionUser` cache: 1 | mismas fn cache: **0** | **2** por navegación (MW + RSC) |
| `profiles` / org_id / rol | `get_my_profile` | `getSessionProfile` 1 | cache: **0** | **2** (RPC + SELECT) |
| `organizations` | access_* | name, logo | — | **2** (columnas distintas) |
| `organization_id` | dentro del perfil | cache | `requireOrganizationId` cache | **0** extra en page |
| `current_organization_id()` | no | no (RSC usa columna) | no | 0 (RLS en cada query) |
| `production_form_templates` | no | **todas las activas** | `/registros` hace COUNT otra vez | **2** en Monitoreo |
| `createClient()` / `cookies()` | 1 client MW | 1+ por layout | 1+ por page | No es query; **no** está en `cache()` |

No confundir: 4 llamadas a `getSessionUser` en una page = **1** `getUser`.

---

## 11. Fan-out por ruta

Cuentas = round trips Supabase/Auth **por click** (middleware + layout + page). Cliente post-paint aparte. API HTTP de Next: 0 en estas rutas.

| Ruta | MW Auth/SQL | RPC MW | Layout queries | Page queries | RPCs page | API | Total aprox. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/dashboard` | 2 (getUser + org) | 1 `get_my_profile` | 4 (user, profile, org, templates) | 8 listas+métricas + 1 teaser | 1 `get_dashboard_metrics` | 0 | **~16** |
| `/analisis` | 2 | 1 | 4 | 1 si hay insight de hoy; **~26+1** si crea el día | 0 | 0 | **~8** / **~34** |
| `/haccp` | 2 | 1 | 4 | 1 plan + 5 hijos + 1 step_data (+ seeds) | 0 | 0 | **~14–17** |
| `/registros` | 2 | 1 | 4 | 3 (count templates, QR, count hoy) | 0 | 0 | **~10** |
| `/capa` | 2 | 1 | 4 | 3 (NC **sin LIMIT**, actions, members) | 0 | 0 | **~10** |
| `/auditorias` | 2 | 1 | 4 | 3 (audits **sin LIMIT**, templates, members) | 0 | 0 | **~10** |
| `/documentos` | 2 | 1 | 4 | 1 | 0 | 0 | **~8** |

Post-paint (todas): +1 notifications, +1 NC abiertas (badge), +1 canal Realtime.

**Lectura:** el piso de **cualquier** click es ~7 (MW+layout) antes de la page. Por eso módulos “livianos” (documentos, análisis con insight ya creado) siguen sintiéndose lentos.

---

## 12. Bundle / cliente

No hay `next/dynamic` en módulos del sidebar.

| Ruta | Island cliente principal | Librerías pesadas en el path | SERVER vs JS |
| --- | --- | --- | --- |
| `/dashboard` | `DashboardView` (todo el main) | SVG propio, no Recharts. lucide. | Server: 9 queries. JS: island mediano. |
| `/analisis` | solo `AnalisisRegenerate` | Claude **no** entra al bundle (API). | Server: 1 o ~30. JS: chico. |
| `/haccp` | `HaccpPlanWizard` importa steps 1–12 + `FlowDiagramEditor` + snapshots | Editor propio (no React Flow). `@react-pdf` **no** está en esta page (vive en API de auditorías). | Server: ~7. **JS: el más grande del producto.** |
| `/registros` | `MonitoreoHub` | liviano | Server 3. JS chico. |
| `/capa` | `CapaDashboard` | liviano | Server: tablas enteras. JS: filtros. |
| `/auditorias` | `AuditsDashboard` | liviano | Igual. |
| `/documentos` | `DocumentsDashboard` | liviano | Server 1. |

Candidatos a `dynamic(() => import(...))` **sin implementar**:

- `FlowDiagramEditor` / `Step4Flow` (solo paso 4)
- Steps 6–12 hasta que el stepper los pida
- `QuickCaptureFab` (md + on demand)
- Charts del dashboard (ya son SVG chicos; bajo valor)

`exceljs` / PDF / Anthropic: rutas API, no bloquean el click del sidebar.

---

## 13. Top 10 causas de latencia de navegación

1. **Layout espera `production_form_templates` en cada click** (dato del FAB).  
2. **Middleware serial getUser → profile → org** en cada click (y prefetch).  
3. **Duplicar org/perfil** (MW + RSC) sin cache compartido.  
4. **Sin Suspense en `children`**: la page no puede “aparecer” desacoplada del await del layout.  
5. **`loading.tsx` genérico** en HACCP/CAPA/…: o no se siente como la ruta, o se ignora.  
6. **HACCP: waterfall plan → detalles → step_data** + **bundle de 12 pasos**.  
7. **Dashboard: teaser AI en serie** detrás del RPC+7 listas.  
8. **Análisis: snapshot de ~30 queries** si no hay insight de hoy.  
9. **Bell + badge** vuelven a pegarle a Supabase al (re)montar el sidebar.  
10. **CAPA/Auditorías** serializan **todas** las filas del tenant antes del primer pixel de la tabla (payload RSC, no CPU SQL).

---

## 14. P0 / P1 / P2

### P0 — explica el “click → espera” ahora

| Ítem |
| --- |
| Templates (y org chrome) en el critical path del layout compartido |
| Middleware + layout dinámico en **cada** navegación interna |
| HACCP: JS monolítico + waterfall servidor |

### P1 — percepción y destinos pesados

| Ítem |
| --- |
| `loading.tsx` por módulo (no el de dashboard) |
| Suspense del teaser / insight / FAB |
| Paralelizar teaser vs `fetchDashboardData`; plan vs `getAllStepData` |
| Análisis: no bloquear la page entera si hay que crear el insight |

### P2

| Ítem |
| --- |
| `cache()` de `createClient` |
| Prefetch fino (no ampliarlo) |
| Badge CAPA on-demand / COUNT |
| Partir listas CAPA/auditorías (eso ya es producto/SQL; fuera de este plan corto) |

---

## RECOMMENDED IMPLEMENTATION PLAN

Máximo 5 cambios. Orden: **impacto / riesgo / esfuerzo**. Sin SQL, sin quitar funciones, sin cambiar reglas de negocio.

| # | Cambio | Impacto | Riesgo | Esfuerzo |
| --- | --- | --- | --- | --- |
| **1** | Sacar `production_form_templates` del layout. El FAB pide la lista **al abrir “Monitoreo”**. El layout no espera esa query. | Alto (todas las navs) | Bajo (mismo selector, un fetch después) | Bajo |
| **2** | Envolver `children` del layout en `<Suspense>` y añadir `loading.tsx` **por módulo** (`haccp`, `capa`, `registros`, `auditorias`, `documentos`) con skeleton de esa pantalla. El sidebar queda; el main cambia al instante. | Alto (percepción) | Muy bajo | Bajo |
| **3** | Cortar waterfalls de destino: en `/dashboard`, `fetchDashboardData` **en paralelo** con `getInsightTeaser`. En `/haccp`, `getAllStepData` **en paralelo** con `getOrCreateActivePlan` (step_data no depende del plan id). | Medio-alto | Bajo | Bajo |
| **4** | `/analisis`: header + estado “Generando diagnóstico…” en Suspense; `loadOrCreateDailyInsight` como hijo async. Si ya hay fila, igual de rápido; si no, no pantalla en blanco. | Medio | Bajo | Bajo-medio |
| **5** | HACCP: `dynamic()` de `Step4Flow` / `FlowDiagramEditor` (y, si es limpio, steps > 5). El paso 1–3 pintan sin bajar el canvas. | Alto **solo** en `/haccp` | Medio (estado del wizard) | Medio |

**No hacer ahora:** índices, reescribir RPC, `prefetch={true}` en todo el rail, tocar RLS, aligerar middleware de access (cambia seguridad).

Criterio de éxito: click → skeleton del **módulo correcto** en un frame; contenido crítico (título + bloque principal) sin esperar templates ni el teaser; HACCP paso 1 usable sin hidratar el diagrama.
