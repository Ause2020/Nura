# Auditoría preprod — coste propio de `/haccp`

Fecha: 2026-09-13  
Fase: **solo diagnóstico**. No se cambió modelo, schema, RLS, autosave, seeds, CCP ni reglas de negocio.

Se instrumentó el breakdown interno (labels + ms, sin payloads HACCP). Logs `[nura:nav] PAGE /haccp …`. En `next start`: `NURA_PERF_TRACE=1`.

---

## Measurements

### Contexto de red (post-2A, autenticado)

El mismo middleware corre en todas estas rutas. La dispersión es **red**, no código HACCP.

| Ruta | MW total | Page / notas |
| --- | ---: | --- |
| `/capa` | 560 ms | page 593 ms |
| `/configuracion` | 558 ms | — |
| `/registros` | 989 ms | — |
| `/auditorias` | 923 ms | — |
| `/haccp` | **1891 ms** | plan 915 · steps 704 · page 2157 |

MW de `/haccp` es **3.4×** el de `/capa` con el mismo `updateSession`. No se atribuye a `getOrCreateActivePlan`.

### Muestras warm de `/haccp`

Este entorno no tiene sesión autenticada reproducible (sin JWT, browser MCP caído). **No se inventan** 3 vuelos internos.

La única muestra autenticada disponible es la de arriba (N=1). No hay mediana de 3.

| # | Warm | MW total | getOrCreateActivePlan | getAllStepData | PAGE total | RSC browser |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | sí (usuario) | 1891 | 915 | 704 | 2157 | no medido aquí |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| **Mediana** | | **n/d (N=1)** | **n/d** | **n/d** | **n/d** | **n/d** |

Para completar: `NURA_PERF_TRACE=1`, `npm run start`, 3 clicks warm a `/haccp` (descartar el primero si el plan se crea/seedea). En DevTools → Network, el documento RSC (`?_rsc=`) es “RSC duration”.

Breakdown que ya emite el código (rellenar con esos logs):

`haccp_plans select` · `haccp_plans insert` (solo cold) · `loadPlanDetails` · `haccp_teams` · `haccp_plan_products` · `haccp_diagrams` · `haccp_validations` · `haccp_plan_hazards` · `seed diagram` / `seed product` / `reselect` (solo si vacío) · `haccp_step_data steps 7-11`

### NETWORK VARIANCE vs CODE COST

| Señal | Lectura |
| --- | --- |
| MW 558–1891 ms en el mismo código | Varianza de Auth/Supabase. Una muestra de 1891 ms **no** es el coste de `/haccp`. |
| `/capa` page 593 ms vs `/haccp` page 2157 ms | Hay coste extra de page, pero parte viaja en la misma red lenta (MW 1891). |
| Relación en la muestra #1 | `page 2157 ≥ max(915, 704) + sesión RSC`. Los dos loaders ya van en `Promise.all`. |

**CODE COST (estructura, independiente de una muestra):**

```
getOrCreateActivePlan  =  haccp_plans SELECT  +  loadPlanDetails
loadPlanDetails        =  max(teams, products, diagrams, validations, hazards)   [warm, ya seedado]
getAllStepData         =  1 × haccp_step_data
PAGE data              =  max(getOrCreateActivePlan, getAllStepData)
```

Si cada RTT PostgREST ≈ 200–300 ms (banda de `/capa`/`config`):

| Tramo | Queries | Wall-clock esperado |
| --- | ---: | --- |
| `haccp_plans` | 1 serial | 200–300 ms |
| 5 details | 5 // | 200–300 ms |
| `getOrCreateActivePlan` | 6 | **400–600 ms** |
| `getAllStepData` | 1 // al plan | 200–300 ms (tapado por el plan) |
| PAGE data | | **400–600 ms** |

La muestra 915 / 704 / 2157 encaja con **la misma red lenta** que puso el MW en 1891, no con un 6-query serial.

---

## getOrCreateActivePlan breakdown

`lib/haccp-plan/data-service.ts`. Warm = ya hay plan + diagrama + producto (el seed **no** corre).

| # | Query | Tabla | Cols | Orden | ¿Se repite? | ¿Seed cada request? | Necesaria para Step 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `select * … limit 1` | `haccp_plans` | `*` (incl. `risk_matrix`, `checklist_progress` JSON) | **SERIAL** (antes de details) | no | no | id, `current_step`, status, checklist |
| 2 | `insert … select *` | `haccp_plans` | `*` | solo si no hay plan | no | una vez | n/a en warm |
| 3 | `select *` | `haccp_teams` | `*` | **PARALLEL** en `loadPlanDetails` | no | no | **sí** (paso 1) |
| 4 | `select *` | `haccp_plan_products` | `*` + JSON specs/uso | **PARALLEL** | no; reselect solo si seed | no si ya hay filas | no (paso 2–3) |
| 5 | `select *` | `haccp_diagrams` | `*` + JSON `nodes`/`edges` | **PARALLEL** | no | no si ya hay filas | no (paso 4); sí para saber si seedear |
| 6 | `select * maybeSingle` | `haccp_validations` | `*` + `evidence_files` | **PARALLEL** | no | no | no (paso 5) |
| 7 | `select *` | `haccp_plan_hazards` | `*` | **PARALLEL** | no | no | no (paso 6–7) |
| 8 | insert diagrama seed | `haccp_diagrams` | — | **SERIAL** tras el `Promise.all` si 0 filas | no | **solo si 0 diagramas** | n/a warm |
| 9 | insert producto + `select *` | `haccp_plan_products` | `*` | **SERIAL** si 0 productos | reselect sí | **solo si 0 productos** | n/a warm |
| — | — | `haccp_ccp_decisions` | — | **no se lee** en GET | — | — | no (vive en step_data 7) |
| — | — | `haccp_step_data` | — | no está aquí | — | — | ver abajo |

Hallazgos:

- Details **ya son paralelas**. No hay waterfall 3→7.
- Lo único serial obligatorio: plan **antes** de details (`plan_id`).
- Warm **no** re-ejecuta seed. `if (diagrams.length === 0)` / `if (products.length === 0)`.
- `select *` sobra para el primer paint: `risk_matrix` (paso 6), JSON de diagrama (paso 4), hazards (6+), validation (5), producto (2–3).
- Nada se consulta dos veces en el camino warm.
- `createDiagram` / `createProduct` en el editor (cliente) no forman parte de este GET.

Tiempos por query: pendientes de los logs nuevos. En warm, `loadPlanDetails` ≈ la más lenta de las 5.

---

## getAllStepData breakdown

`lib/haccp-plan/step-data-service.ts`.

| Query | Tabla | Filtro | Cols | Orden | Writes |
| --- | --- | --- | --- | --- | --- |
| 1 | `haccp_step_data` | `organization_id` + `step_id IN (7,8,9,10,11)` | `step_id, data` | **una** query | no. `primeStepDataWrites` es memoria |

No hay 5 queries seriales. No hay `Promise.all` que ganar: ya es un solo round trip.

El wizard hidrata `step7`…`step11` al montar, pero **solo renderiza** `currentStep`. Entrar en paso 1 no usa 7–11.

`getStepData` (por paso) existe y no se usa en `/haccp`.

---

## Critical path

```
REQUEST
  → MW (getUser + gates //)          [compartido; no es coste HACCP]
  → RSC layout (Suspense, 2A)        [paralelo a la page]
  → PAGE /haccp
        requireOrganizationId
        getSessionUser                 [cache RSC]
        createClient
        ┌─────────────────────────────┐
        │ //                          │
        │ getOrCreateActivePlan       │
        │   SERIAL haccp_plans        │
        │   SERIAL loadPlanDetails    │
        │     // teams                │
        │     // products             │  DEFERABLE si step>1 no es 2–3
        │     // diagrams             │  DEFERABLE (step 4; existencia p/ seed)
        │     // validations          │  DEFERABLE (step 5)
        │     // hazards              │  DEFERABLE (step 6+)
        │     SERIAL seed?            │  solo vacío
        │ getAllStepData              │  DEFERABLE hasta step ≥ 7
        └─────────────────────────────┘
  → render HaccpPlanWizard (todo el JS de 12 pasos)
```

| Operación | Clase |
| --- | --- |
| `haccp_plans` → `loadPlanDetails` | **SERIAL** |
| 5 tablas de details | **PARALLEL** |
| `getOrCreateActivePlan` // `getAllStepData` | **PARALLEL** |
| Seed diagrama / producto | **SERIAL**, solo cold/vacío |
| Step data 7–11 | **DEFERABLE** |
| products / diagrams JSON / validations / hazards | **DEFERABLE** respecto del paso 1 |
| First Load JS 12 steps + editor | **SERIAL** en el browser (parse/hydrate) |

Wall-clock **de código** (warm, red “capa” ~250 ms):

`plans (250) + max(details) (250) = 500 ms`  
`step_data (250)` en paralelo → **~500 ms** de data  
+ sesión RSC si no está cacheada.

Wall-clock **muestra #1** (red lenta): data `max(915, 704)=915` · page 2157 (sesión + data + compose).

---

## Deferred data opportunities

No implementar. Qué puede esperar sin borrar datos:

| Dato | Primer render (step 1 típico) | On-demand |
| --- | --- | --- |
| `haccp_teams` | sí | — |
| plan id / `current_step` / checklist | sí | — |
| `haccp_plan_products` | no | al entrar a 2–3 |
| `haccp_diagrams` (nodes/edges) | no | al entrar a 4; para seed basta `count`/`limit 1` |
| `haccp_validations` | no | paso 5 |
| `haccp_plan_hazards` | no | paso 6–7 |
| `haccp_step_data` 7–11 | no | al entrar a 7+ (`getStepData`) |
| `haccp_ccp_decisions` | no se lee hoy | sigue en step 7 payload |
| Seed | no en warm | intacto |

El wizard ya hace `currentStep === n` para el JSX. El coste es **bajar y parsear** todo antes.

---

## Bundle analysis

`next build` (sesión previa):

| Ruta | Route JS | First Load JS |
| --- | ---: | ---: |
| `/documentos` | 4.6 kB | ~117 kB |
| `/capa` | 3.9 kB | ~120 kB |
| `/haccp` | **32.9 kB** | **215 kB** |

Delta ≈ **+95 kB** First Load. No hay `next/dynamic` en el wizard. Los 12 steps se importan estáticos; solo se **monta** el step actual.

Líneas (aprox.) en el grafo que entra al chunk de `/haccp`:

| Módulo | Líneas | ¿Hace falta en step 1? |
| --- | ---: | --- |
| `flow-diagram-editor.tsx` | 944 | **no** |
| `diagram/geometry.ts` | 393 | **no** |
| `diagram-node.tsx` | 167 | **no** |
| `haccp-plan-wizard.tsx` | 703 | sí (shell) |
| `data-service.ts` | 482 | parcial (autosave equipo) |
| `step-7-ccp.tsx` | 383 | **no** |
| `step-2-product.tsx` | 260 | **no** |
| `pcc-monitoring-panel.tsx` | 224 | **no** |
| `step-6-hazards.tsx` | 218 | **no** |
| `snapshots.ts` | 204 | **no** (modal cerrado) |
| steps 8–12 + validation | ~600 | **no** |
| `create-version-modal.tsx` | 90 | **no** (`open === false`) |
| `risk-matrix-modal.tsx` | 98 | **no** |
| `step-1-team.tsx` | 169 | sí |

No hay `@xyflow` / `react-flow`. El editor es SVG propio. Igual es el **JS más grande** del módulo.

Candidatos `next/dynamic` (prioridad):

1. `FlowDiagramEditor` / `Step4Flow` (+ geometry + node)
2. Steps 5–12 (y 2–3 si se parte el chunk)
3. `CreateVersionModal` + `snapshots` / `createPlanVersionDocument`
4. `RiskMatrixModal`

Step 1 sigue necesitando el wizard + `data-service` de writes de equipo. Extraer writes del grafo de first load es más trabajo.

---

## Top 5 optimizations

No implementadas. Orden: impacto · riesgo · complejidad.

| # | Cambio | Impacto | Riesgo | Complejidad | Pri |
| --- | --- | --- | --- | --- | --- |
| 1 | `next/dynamic` de `FlowDiagramEditor` y steps ≠ 1 | Alto (−80–95 kB First Load, TTI) | Bajo si el step actual se hidrata bien | Baja | **P0** |
| 2 | No esperar `getAllStepData` si `current_step < 7`; `getStepData` al entrar | Medio-alto (−1 RTT en el `Promise.all` cuando el plan es el más lento, o −704 ms en la muestra lenta) | Medio: estado inicial 7–11 y autosave | Media | **P0** |
| 3 | Details mínimos en GET: teams + plan; resto on-demand | Medio (menos JSON, 4 queries menos en el max) | Medio: seed “¿hay diagrama/producto?” y checklist | Media | **P1** |
| 4 | `select` estrecho (no `*` en diagrams/plans) | Bajo-medio (payload, no RTT) | Bajo | Baja | **P1** |
| 5 | No atribuir MW 1.8 s a HACCP; repetir 3 warm y usar mediana | Alto para no optimizar ruido | Nulo | Nula (proceso) | **P0** (método) |

P2 (no en el top 5): partir `data-service` read/write; prefetch hover de `/haccp` sigue siendo caro (2A).

Fuera de esta fase: no tocar seeds, CCP, RLS ni autosave.

---

## Cómo leer los logs nuevos

```
[nura:nav] PAGE    /haccp  haccp_plans select  …ms
[nura:nav] PAGE    /haccp  haccp_teams  …ms
[nura:nav] PAGE    /haccp  haccp_plan_products  …ms
[nura:nav] PAGE    /haccp  haccp_diagrams  …ms
[nura:nav] PAGE    /haccp  haccp_validations  …ms
[nura:nav] PAGE    /haccp  haccp_plan_hazards  …ms
[nura:nav] PAGE    /haccp  loadPlanDetails  …ms
[nura:nav] PAGE    /haccp  getOrCreateActivePlan  …ms
[nura:nav] PAGE    /haccp  haccp_step_data steps 7-11  …ms
[nura:nav] PAGE    /haccp  getAllStepData  …ms
[nura:nav] PAGE    /haccp  total  …ms
```

`haccp_plans insert` / `seed *` no deben aparecer en warm. Si aparecen, esa muestra no es warm.
