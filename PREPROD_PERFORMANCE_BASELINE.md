# Baseline preprod — camino crítico de navegación protegida

Fecha: 2026-09-13  
Fase: **solo instrumentación**. No se optimizó. No se cambió seguridad, RLS, SQL ni la lógica de negocio.

`middleware.ts` **no se modificó**. Los timings de middleware envuelven las llamadas que ya existían en `updateSession` (`lib/supabase/middleware.ts`).

---

## 1. Totales E2E (build de producción local, autenticado)

Fuente: medición previa a esta instrumentación, Phase 1.

| Ruta | Tiempo percibido |
| --- | ---: |
| `/dashboard` | 1.77 s |
| `/analisis` | 1.51 s |
| `/documentos` | 1.44 s |
| `/haccp` | 2.93 s |
| `/registros` | 1.35 s |
| `/auditorias` | 1.47 s |
| `/capa` | 1.35 s |
| `/configuracion` | 0.65 s |

Piso común (módulos de lista): **1.3–1.5 s**.  
`/configuracion` queda **por debajo** de ese piso. `/haccp` queda **por encima**.

---

## 2. Cómo leer los logs

Prefijo: `[nura:nav]`. Solo etiqueta + ruta + milisegundos. Sin JWT, cookies, emails ni payloads HACCP.

Se enciende en `next dev`, en `next start` sobre **localhost**, o con `NURA_PERF_TRACE=1`.

```
[nura:nav] REQUEST /documentos  GET
[nura:nav] MW      /documentos  auth.getUser()  …
[nura:nav] MW      /documentos  get_my_profile  …
[nura:nav] MW      /documentos  organizations/access  …
[nura:nav] MW      /documentos  total  …
[nura:nav] RSC     /documentos  getSessionUser  …
[nura:nav] RSC     /documentos  getSessionProfile  …
[nura:nav] RSC     /documentos  organization lookup  …
[nura:nav] RSC     /documentos  layout total  …
[nura:nav] PAGE    /documentos  query  …
[nura:nav] PAGE    /documentos  total  …
```

Cadena:

```
REQUEST  →  MW  →  shared RSC  →  PAGE  →  response
```

En un document request el layout puede loguear `(dashboard)` si Next no manda `next-url`. La ruta del `REQUEST` / `PAGE` sigue alcanzando para alinear el vuelo.

`getSessionUser` y `getSessionProfile` del layout corren en `Promise.all`.  
`getOrCreateActivePlan` y `getAllStepData` también. El total de esa fase **no** es la suma.

---

## 3. Puntos instrumentados

| Fase | Punto | Dónde |
| --- | --- | --- |
| REQUEST | método + path | `updateSession` |
| MW | `auth.getUser()` | `lib/supabase/middleware.ts` |
| MW | `get_my_profile` (incluye fallback `profiles` si el RPC no trae fila) | igual |
| MW | `organizations/access` | igual; solo si hay org y no es platform admin |
| MW | `total` | igual |
| RSC | `getSessionUser` | `app/(dashboard)/layout.tsx` |
| RSC | `getSessionProfile` | igual |
| RSC | `organization lookup` (`name`, `logo_url`) | igual |
| RSC | `layout total` | igual |
| PAGE `/documentos` | `query` (`controlled_documents`) | `app/(dashboard)/documentos/page.tsx` |
| PAGE `/documentos` | `total` | igual |
| PAGE `/capa` | `query nonconformities` / `capa_actions` / `profiles` | `app/(dashboard)/capa/page.tsx` |
| PAGE `/capa` | `queries` (wall-clock del `Promise.all`) | igual |
| PAGE `/capa` | `total` | igual |
| PAGE `/haccp` | `getOrCreateActivePlan` | `app/(dashboard)/haccp/page.tsx` |
| PAGE `/haccp` | `getAllStepData` | igual |
| PAGE `/haccp` | `total` | igual |

No se midió `enforceRateLimit` (sigue en `middleware.ts`, sin cambios; en rutas de UI no clasifica).

---

## 4. Medición en este entorno

Servidor: `next start` (Next 15.5.24), `http://localhost:3000`, `NURA_PERF_TRACE=1`.

**No hay sesión reproducible aquí.** Sin cookie de Auth, el camino crítico autenticado no corre.

### 4.1 Control sin sesión (medido)

| Ruta | REQUEST | MW `auth.getUser()` | MW `get_my_profile` | MW `organizations/access` | MW total | RSC | PAGE |
| --- | --- | ---: | --- | --- | ---: | --- | --- |
| `/documentos` | GET | 0 ms | no corre | no corre | 1 ms | no corre (307 `/login`) | no corre |
| `/capa` | GET | 0 ms | no corre | no corre | 0 ms | no corre (307 `/login`) | no corre |
| `/haccp` | GET | 0 ms | no corre | no corre | 1 ms | no corre (307 `/login`) | no corre |

`getUser()` **sin cookie no viaja a Auth**. El 0 ms confirma que el coste de esa línea, en una nav real, es el round-trip de sesión — no CPU local.

### 4.2 Breakdown autenticado

Pendiente de una pasada logueada en este mismo `next start`. Los puntos ya emiten `[nura:nav]`. Completar esta tabla con esos logs; no se inventan milisegundos.

| Punto | `/documentos` | `/capa` | `/haccp` |
| --- | ---: | ---: | ---: |
| MW `auth.getUser()` | — | — | — |
| MW `get_my_profile` | — | — | — |
| MW `organizations/access` | — | — | — |
| MW total | — | — | — |
| RSC `getSessionUser` | — | — | — |
| RSC `getSessionProfile` | — | — | — |
| RSC `organization lookup` | — | — | — |
| RSC layout total | — | — | — |
| PAGE query / queries | — | — | — |
| PAGE `getOrCreateActivePlan` | n/a | n/a | — |
| PAGE `getAllStepData` | n/a | n/a | — |
| PAGE total | — | — | — |

Relación esperada (no es medición):  
`E2E percibido ≥ MW total + layout total + PAGE total` + hidratación / JS del cliente.

---

## 5. First Load JS (build de esta sesión)

Hecho de `next build`. No es tiempo de servidor; sí explica parte del tramo post-HTML.

| Ruta | Route JS | First Load JS |
| --- | ---: | ---: |
| `/configuracion` | 1.85 kB | 114 kB |
| `/documentos` | 4.62 kB | 117 kB |
| `/capa` | 3.93 kB | 120 kB |
| `/dashboard` | 6.71 kB | 119 kB |
| `/haccp` | **32.9 kB** | **215 kB** |

`/haccp` arrastra el wizard + diagrama. El resto de módulos de lista está en ~114–120 kB.

---

## 6. Principales fuentes de latencia

Ordenadas por el camino instrumentado. Sin proponer cambios.

### 6.1 Piso común (1.3–1.5 s)

Casi todos los módulos de lista caen en la misma banda. Eso no encaja con “la query de la page es cara”: `/documentos` es **una** query, `/capa` son **tres** en paralelo, y ambos miden ~1.4 s.

El piso es el trabajo **compartido de cada click**:

1. **Middleware, waterfall de 3 RTT** — `auth.getUser()` → `get_my_profile` → `organizations` access. Serial. Corre en **toda** nav protegida (y en prefetch del sidebar). `React.cache` del RSC **no** existe en Edge.
2. **Auth otra vez en el layout** — `getSessionUser()` vuelve a llamar `auth.getUser()`. El cache de React es por request RSC, no cruza el middleware. Dos idas a Auth por click.
3. **Layout bloquea `children`** — no hay `<Suspense>` alrededor del main. `getSessionUser` + `getSessionProfile` + `organizations` (nombre/logo) terminan **antes** de componer la page.
4. **`cookies()` / `createClient()`** — el árbol del dashboard es dinámico. No hay shell estático. Cada click reejecuta MW + layout + page.

`production_form_templates` **ya no** está en el layout (la auditoría de navegación anterior está desactualizada en ese punto). El FAB no añade esa query al critical path del servidor.

### 6.2 Por qué `/configuracion` es 0.65 s

Misma MW y mismo layout padre. Si 0.65 s es una nav fría comparable, entonces **MW + layout pueden ser ≤ 0.65 s** y el piso 1.3–1.5 s incluye trabajo de page + JS.

Otras lecturas posibles (no medidas aquí):

- Nav interna ya dentro de `/configuracion` (solo el segmento anidado).
- Prefetch / RSC más caliente que en el resto.
- Page de settings casi vacía frente a listas.

Hasta no tener el breakdown autenticado, no se atribuye el piso entero al middleware.

### 6.3 `/documentos` (1.44 s)

Page: una `select` a `controlled_documents` (columnas de lista, filtro de org; `published` si no puede gestionar).  
Eso no explica 1.44 s por sí solo. La hipótesis de trabajo: **MW + layout dominan**; la query es el delta sobre el piso.

### 6.4 `/capa` (1.35 s)

Page: `nonconformities` + `capa_actions` + `profiles` en paralelo. Wall-clock ≈ la más lenta de las tres.  
Mismo orden de magnitud que documentos → otra vez el compartido, no el fan-out de CAPA.

### 6.5 `/haccp` (2.93 s)

Único outlier claro. Tres capas, las tres más pesadas que en el resto:

| Capa | Qué hay hoy |
| --- | --- |
| PAGE servidor | `getOrCreateActivePlan` (plan + detalles; puede insertar/seed si no hay plan) **en paralelo** con `getAllStepData` (pasos 7–11). |
| Bundle | First Load 215 kB vs ~117 kB de documentos. |
| Cliente | `HaccpPlanWizard` + 12 pasos + editor de diagrama hidratan después del HTML. |

El +1.5 s vs el piso (2.93 − 1.4) es **page + JS**, no un middleware distinto.

### 6.6 Qué no es el piso

- Seq scan de tablas grandes: el tenant de este proyecto es chico (`PERFORMANCE_BASELINE_V2.md`).
- Rate limit: no clasifica paths de UI.
- RPC `get_dashboard_metrics`: solo `/dashboard`, no el piso de documentos/capa/registros.

---

## 7. Mapa del vuelo (código actual)

```
CLICK <Link>  (prefetch por defecto)
  → middleware.ts                    [sin cambios]
      updateSession
        auth.getUser()               [MW]
        rpc get_my_profile           [MW]
        organizations access         [MW]
      redirects / rate-limit
  → app/(dashboard)/layout.tsx
        getSessionUser               [RSC]  ← Auth otra vez
        getSessionProfile            [RSC]  ← profiles (cache con user)
        organizations name, logo     [RSC]
  → page
        /documentos  1 query
        /capa        3 queries //
        /haccp       getOrCreateActivePlan // getAllStepData
  → HTML + First Load JS
  → hidrata sidebar / page client
```

---

## 8. Límites de este baseline

- El breakdown autenticado **no** está relleno: este entorno no tiene JWT de usuario.
- Los totales E2E del §1 sí son de producción local autenticada.
- Los 0 ms del §4.1 solo sirven como control (sin cookie).
- Prefetch del sidebar dispara el mismo MW; puede mezclarse en la consola si hay varios links a la vista.
- `performance.now()` es wall-clock del proceso, no TTFB del browser.

Para completar el §4.2: `npm run start`, entrar logueado, navegar `/documentos`, `/capa`, `/haccp` y copiar las líneas `[nura:nav]`.
