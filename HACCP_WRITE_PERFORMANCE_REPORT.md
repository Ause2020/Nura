# Informe de performance — Persistencia del editor HACCP

Fecha: 2026-09-11  
Archivos: `components/haccp-plan/haccp-plan-wizard.tsx`, `lib/haccp-plan/data-service.ts`, `lib/haccp-plan/step-data-service.ts`, `components/haccp-plan/diagram/flow-diagram-editor.tsx`, `lib/haccp-plan/write-guard.ts`, `lib/haccp-plan/use-debounced-callback.ts`

El flujo de 12 pasos, el backup en `localStorage` y el comportamiento funcional no cambian. Solo se evitan writes remotas redundantes.

---

## Antes

Cada tecla, toggle, pan o análisis de peligros podía terminar en un round trip a Supabase. El debounce existía, pero no había comparación de payload ni consolidación.

| Acción | Queries remotas | Problema |
| --- | --- | --- |
| Cambiar de paso | `UPDATE haccp_plans` con `current_step` **y** `checklist_progress` | Reescribía el checklist aunque no hubiera cambiado |
| Toggle de checklist | Otro `UPDATE haccp_plans` (checklist) + el efecto de paso volvía a persistir | 2 updates por un checkbox |
| Draft → in_progress / completed | `UPDATE` inmediato, aparte del debounce del paso | 2–3 updates al navegar |
| Editar equipo / producto / peligro / validación | `UPDATE`/`UPSERT` aunque el valor volviera al original | Sin skip-if-unchanged |
| Guardar diagrama (`syncDiagrams`) | `SELECT id` + N `UPDATE`/`INSERT` + `DELETE` | SELECT previo innecesario; N writes por diagrama |
| Pan / drag / rueda | `onChange` **por frame** → debounce reset + 1 upsert al soltar (tras SELECT) | Re-renders del wizard y writes de viewport por gesto continuo |
| Paso 7 (N peligros significativos) | `UPSERT haccp_step_data` + **N ×** `UPSERT haccp_ccp_decisions` | N+1 queries por un cambio |
| Crear producto / diagrama | `SELECT max(order_index)` + `INSERT` | SELECT evitable si el cliente ya conoce el índice |
| Cerrar pestaña con debounce pendiente | El timer se cancelaba en unmount | Riesgo de perder el último autosave |

**Paso 7, 8 peligros:** 1 + 8 = **9** writes.  
**Diagrama, 2 procesos, un pan:** 1 SELECT + 2 UPDATE = **3** queries al terminar el gesto (y `onChange` en cada `pointermove`).

---

## Después

Capa `write-guard`: huella JSON del payload (sin `updated_at`). Si coincide con la última escritura, no hay red.

| Acción | Queries remotas | Cómo |
| --- | --- | --- |
| Cambiar paso + checklist + status en la misma ráfaga | **0–1** `UPDATE haccp_plans` | `queuePlanPatch` fusiona campos; `updatePlanFields` solo envía claves distintas |
| Payload idéntico (cualquier entidad) | **0** | `shouldSkipWrite` / comparación campo a campo del plan |
| Editar equipo / producto / peligro / validación / step_data | **0 o 1** | Debounce existente + skip |
| Guardar diagrama | **0 o 1** `UPSERT` (y `DELETE` solo si hay `removedIds`) | Sin SELECT; `onConflict: id` |
| Pan / drag / zoom | **0** durante el gesto; **0–1** al `pointerup` / idle de rueda | Estado local `working`; `onChange` al terminar |
| Paso 7 | **1** `UPSERT haccp_step_data` + **1** `UPSERT haccp_ccp_decisions` (array) | `upsertCcpDecisions` |
| Crear producto / diagrama desde el wizard | **1** `INSERT` | `orderIndex` lo aporta el cliente |
| Cerrar pestaña / cambiar de paso 4 | Flush del debounce + `visibilitychange` | No se descartan writes pendientes |

`localStorage` (`LOCAL_BACKUP_KEY`) se escribe **en el cambio de UI** (pasos 7–11), no solo cuando corre el debounce remoto. Si la red falla, `getStepData` sigue hidratando desde local.

---

## Paso 7 (N peligros → 2 queries)

Antes:

```
saveStepData(org, 7, payload)           → UPSERT haccp_step_data
rows.forEach(upsertCcpDecision)         → N × UPSERT haccp_ccp_decisions
```

Después (compatible con `UNIQUE (plan_id, hazard_id)` de la migración 030):

```
saveStepData(org, 7, payload)           → UPSERT haccp_step_data   (si cambió)
upsertCcpDecisions(rows)                → 1 × UPSERT haccp_ccp_decisions
                                          onConflict: plan_id,hazard_id
```

| Peligros | Antes | Después |
| --- | --- | --- |
| 1 | 2 | 2 (o 0 si no cambió) |
| 8 | 9 | **2** (o 0) |
| 20 | 21 | **2** (o 0) |

`upsertCcpDecision` (singular) queda como wrapper de un elemento.

---

## Diagrama

| | Antes | Después |
| --- | --- | --- |
| Pan / drag | `onChange` por `pointermove` | Solo estado local |
| Rueda | `onChange` por tick | Local + commit a ~280 ms de idle |
| Add / delete / conectar / label / generate | `onChange` inmediato | Igual (debounce 800 ms en el wizard) |
| Persistencia | SELECT + N updates | 1 upsert; skip si el snapshot no cambió |
| Salir del paso 4 / unmount | `syncDiagrams` | Flush + sync; el segundo es no-op si ya se escribió |

No se guarda por frame.

---

## Round trips típicos

| Escenario | Antes | Después |
| --- | --- | --- |
| Abrir el wizard y no tocar nada | 1–2 `UPDATE` del paso/checklist al montar | **0** (caché primada) |
| Ir al paso 2 (draft) | 2–3 `UPDATE` plan | **1** (`current_step` + `status`) |
| Marcar un ítem de checklist | 2 `UPDATE` plan | **1** |
| Mover un nodo y soltar | 1 SELECT + N updates | **1** upsert (tras debounce) |
| Cambiar Q1 en 8 peligros | 1 + 8 upserts | **2** |
| Re-guardar el mismo análisis | 1 + N | **0** |

---

## Qué no se tocó

- UX de los 12 pasos, CCP, matriz, versiones, evidencias
- Uploads (entrenamiento / validación): siguen persistiendo al completar
- `create` / `delete` explícitos (miembro, producto, peligro, diagrama)
- Migraciones 030–032
- Tablas HACCP v1 en la base (el editor no las escribe)

---

## Verificación

```
npm run typecheck
npm run lint
npm test
```

Contrato adicional: `npm run test:haccp-writes` (`scripts/verify-haccp-writes.mjs`).
