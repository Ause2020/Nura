# HACCP P0 results

Fecha: 2026-09-13  
Alcance: solo P0 del audit (`code splitting` + step data 7–11 on-demand). Sin P1.

---

# Changes

## P0-A — code splitting del wizard

- Steps 2–12 y `RiskMatrixModal` se cargan con `next/dynamic` (`ssr: false`) en `components/haccp-plan/dynamic-steps.tsx`.
- Step 1 sigue estático (`Step1Team`).
- `FlowDiagramEditor` entra solo en el chunk de Step 4.
- `CreateVersionHost` se monta únicamente si `versionOpen`. El modal es dinámico; `snapshots` se importa en el `onSubmit`.
- `RiskMatrixModal` se monta únicamente si `matrixOpen`.
- Fallback ligero: `StepChunkFallback` (pulse, sin cambiar el layout del stepper).
- `currentStep` y el resto de estado del wizard no se extraen a otro componente: no hay remount del shell al cambiar de paso.

## P0-B — step data 7–11 on demand

- `/haccp` ya no llama `getAllStepData()`.
- Primero `getOrCreateActivePlan`, luego `requiredStepDataIds(current_step)`:
  - 1–6 y 12 → ninguna query de `haccp_step_data`
  - 7 → `[7]`
  - 8 → `[7, 8]`
  - 9 → `[7, 8, 9]`
  - 10 → `[7, 8, 10]`
  - 11 → `[11]`
- `getStepDataForSteps` hace **una** lectura `step_id IN (…)` + `primeStepDataWrites`. No escribe local→servidor.
- El wizard no monta steps 7–11 hasta `stepDataReady`. Si falla la carga, el paso no se marca hidratado (no se trata un error como “vacío real”).
- Navegación posterior pide solo ids que aún no están en `loadedSteps` / inflight.
- `getAllStepData` se conserva como wrapper de `[7,8,9,10,11]` por si otro caller lo usa.

No se tocó schema, migraciones, RLS, seeds, CCP, autosave semantics, ni `select *`.

---

# Functional safety

Comportamiento preservado por construcción:

| Caso | Cómo queda cubierto |
| --- | --- |
| A. `current_step = 1` | Sin query 7–11. Step 1 estático. |
| B. `current_step` 7–11 | Page espera los ids requeridos **antes** de pintar ese step. |
| C. 1 → 7 | `ensureStepData(7)` + fallback hasta hidratar. |
| D. 7 → 1 | Estado 7 se queda en memoria; no se re-pide. |
| E. editar 7, navegar, volver | Persistencia igual: `writeStepLocalBackup` + `saveStepData` + `upsertCcpDecisions` en el debounce de siempre. |
| F. refresh en 7 | Server carga `[7]` y el wizard monta Step 7 ya hidratado. |
| G. refresh en 4 | Sin step data. Chunk de Step 4 + editor al pintar el paso 4. |
| H. CreateVersionModal | No se carga el chunk ni `snapshots` con el modal cerrado. |
| I. RiskMatrixModal | No se carga el chunk con el modal cerrado. |
| J. diagrama | Autosave / flush al salir del 4 / `visibilitychange` sin cambios de contrato. |

Navegación 1→2→3→4, 4→3, 6→7, 7→8, 12→atrás: solo cambia el JSX `currentStep === n` (igual que antes) + carga del chunk / datos si faltan.

Verificación interactiva A–J **no se ejecutó aquí**: no hay sesión autenticada (GET `/haccp` → 307 `/login`). Browser MCP no estaba disponible. Hay que repetir A–J en el browser con sesión.

No se observaron errores de dynamic import en el build.

---

# Autosave safety

Punto crítico: no montar 7–11 con estado vacío mientras llegan datos persistidos.

- Clave ausente en `LoadedStepData` = **no cargado**. `null` = cargado y vacío de verdad.
- `stepDataReady` exige que todos los ids de `requiredStepDataIds(currentStep)` estén en `loadedSteps`.
- Mientras no está ready, se muestra `StepChunkFallback`. Los `persistStep7`…`11` solo se programan desde `onChange` del step ya montado.
- `flush()` del debounce no escribe si nunca se programó un cambio.
- Tras hidratar (y merge local solo sobre claves ya cargadas) se llama `primeStepDataWrites` para que un save idéntico haga `shouldSkipWrite`.
- Si la query falla, no se marcan ids como cargados: no hay upsert de `[]` encima de filas existentes.
- `CreateVersionHost` solo recibe payloads de pasos ya hidratados (un snapshot de 7–11 no ve arrays vacíos “de mentira”).

Semantics de debounce, fingerprints, `visibilitychange` y writes de plan/diagrama/equipo no se cambiaron.

---

# Bundle before / after

`next build` (gzip, reporte de Next 15.5.24).

| | Route JS | First Load JS |
| --- | ---: | ---: |
| **ANTES** `/haccp` | 32.9 kB | 215 kB |
| **DESPUÉS** `/haccp` | **16.9 kB** | **195 kB** |
| `/dashboard` (referencia) | 6.71 kB | 120 kB |
| `/capa` | 3.93 kB | 121 kB |
| `/documentos` | 4.62 kB | 118 kB |

Delta P0: **−16.0 kB route**, **−20 kB First Load**.

Sigue ~**+75 kB** First Load vs un módulo normal. El audit estimaba −80–95 kB; el recorte real es menor porque el wizard + `data-service` (writes de equipo/plan/hazards) siguen en el grafo inicial. Los tamaños de Next son gzip; el editor (~26 kB raw) no restaba 26 kB al First Load.

## Chunks dinámicos nuevos

Tamaños **raw** en `.next/static/chunks` (no gzip):

| Chunk | Destino | Raw |
| --- | --- | ---: |
| `5020.*.js` | Step4Flow + FlowDiagramEditor | 25.8 kB |
| `9382.*.js` | Step7Ccp | 8.9 kB |
| `4632.*.js` | Step3Use | 8.7 kB |
| `81.*.js` | Step2Product | 7.3 kB |
| `2619.*` + `5418.*` | Step12Docs | 9.5 kB |
| `6952.*.js` | Step6Hazards | 4.7 kB |
| `7290.*.js` | Step8Limits | 4.7 kB |
| `6441.*.js` | Step10Corrective | 3.1 kB |
| `3267.*.js` | Step9Monitoring | 2.8 kB |
| `1123.*.js` | Step11Verification | 2.7 kB |
| `5044.*.js` | Step5Validation | 2.3 kB |
| `7231.*.js` | CreateVersionModal | 2.1 kB |
| `2273.*.js` | RiskMatrixModal | 1.8 kB |
| `6848.*.js` | snapshots (solo al submit de versión) | 6.4 kB |

Step 1 no descarga ninguno de esos. Step 4 no carga el editor hasta `currentStep === 4`.

---

# Server before / after

## Estructura (independiente de red)

**Antes (warm, `current_step` 1):**

```
PAGE data = max(getOrCreateActivePlan, getAllStepData)
getOrCreateActivePlan = haccp_plans SELECT + max(5 details)
getAllStepData        = 1 × haccp_step_data IN (7,8,9,10,11)
```

**Después (warm, `current_step` 1–6 o 12):**

```
PAGE data = getOrCreateActivePlan
getStepDataForSteps   = no se llama
```

**Después (warm, `current_step` 7–11):**

```
PAGE data = getOrCreateActivePlan  luego  getStepDataForSteps(ids requeridos)
```

`getOrCreateActivePlan` y los seeds **no cambiaron**. En entrada típica por Step 1, `getAllStepData` ya iba en paralelo y solía taparse con el plan: el P0-B ahorra **trabajo y payload**, no necesariamente un RTT de wall-clock.

Labels nuevos: `getStepDataForSteps` y `haccp_step_data 7` / `7,8` / etc. Ya no aparece `getAllStepData` en `/haccp`.

## Muestras warm autenticadas

Este entorno **no tiene sesión**. Control no autenticado (N=3, `localhost:3001`, build P0):

| # | MW total | getOrCreateActivePlan | getStepDataForSteps | PAGE total | RSC browser |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 ms (`getUser` 0) | no corre (307 `/login`) | no corre | no corre | n/d |
| 2 | 1 ms | — | — | — | n/d |
| 3 | 1 ms | — | — | — | n/d |
| **Mediana** | **1 ms** | **n/d** | **n/d** | **n/d** | **n/d** |

Referencia autenticada **pre-P0** (N=1, no usar como mediana): MW 1891 · plan 915 · `getAllStepData` 704 · PAGE 2157.

Para completar AFTER autenticado: `NURA_PERF_TRACE=1`, `npm run start`, 3 clicks warm a `/haccp` (descartar seed/create). Mediana de MW / `getOrCreateActivePlan` / `getStepDataForSteps` (o ausencia) / PAGE total / RSC `?_rsc=`.

---

# Tests

| Check | Resultado |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass (warnings previos, no de HACCP P0) |
| `npm test` | 116 pass / 2 skip / 0 fail |
| `npm run test:haccp-p0` | 6/6 (incluido en `npm test`) |
| `npm run test:haccp-writes` | 7/7 (contratos de persistencia intactos) |
| `npm run build` | pass |

No se desactivaron reglas.

---

# Remaining P1 opportunities

Siguen **sin implementar**, y **siguen justificándose** para el servidor:

1. **Details mínimos** (teams + plan; products / diagrams / validations / hazards on-demand). `getOrCreateActivePlan` sigue siendo el suelo de `/haccp`. P0-B no lo tocó.
2. **`select` estrecho** (sobre todo `haccp_diagrams` JSON). Reduce payload, no RTT.
3. Lazy products / diagram **data** / validations / hazards — mismo bloque que (1).

P1 **no** va a bajar el First Load JS de 195 kB. El JS que queda es el shell del wizard + `data-service` de writes. Eso era P2 en el audit (partir read/write), no P1.

P0-B en Step 1: si el plan sigue siendo más lento que `haccp_step_data`, el TTFB percibido **casi no cambia**. El valor de P0-B es no parsear/hidratar 7–11 y no arriesgar autosave, más un RTT menos cuando esa query no está tapada.

---

# Recommendation

- **P0-A hecho y útil:** First Load 215 → 195 kB; el editor (~26 kB raw) y steps 2–12 ya no viajan en el entry de Step 1.
- **P0-B hecho y seguro:** no se bloquea `/haccp` en 7–11 si `current_step` no los necesita; hidratación gated para no pisar datos.
- **Los P1 de lazy data loading siguen justificándose** después de medir el P0: el coste de servidor de `/haccp` sigue siendo `getOrCreateActivePlan` (1 + 5 `select *`). El P0 no reduce esas queries.
- No implementar P1 hasta repetir 3 warm autenticados y usar **mediana**. Una muestra de MW 1.8 s no es el coste de HACCP.
- Siguiente palanca de JS (si se quiere acercar a ~120 kB): extraer writes de `data-service` del chunk inicial — fuera de este P0.
