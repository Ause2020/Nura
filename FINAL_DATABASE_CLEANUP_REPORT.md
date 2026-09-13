# Informe final — limpieza SAFE_TO_DROP

Fecha: 2026-09-11  
Fuente exclusiva: `LEGACY_DATABASE_CLEANUP_PLAN.md`.  
Migración nueva: `supabase/migrations/041_remove_legacy_qms.sql`.

**No se modificó ninguna migración histórica** (incluido `041_optimize_rls.sql`).  
**No se creó DROP de tablas REQUIRES_MIGRATION ni DO_NOT_DROP.**  
Esta migración **no se ejecutó** contra el proyecto remoto en esta pasada.

---

## Qué se permite dropear (allow-list)

Solo el grupo que el plan marca **SAFE_TO_DROP**:

| Objeto | Tipo | Origen |
| --- | --- | --- |
| `qc_submission_readings` | tabla | 019 |
| `qc_submissions` | tabla | 018 |
| `qc_field_links` | tabla | 018 |
| `qc_control_parameters` | tabla | 019 |
| `qc_controls` | tabla | 018 |
| `submit_qc_field_form` | función | 018/019; ya DROP en 029 |
| `lab_results` | tabla | 011 |
| `lab_analyses` | tabla | 011 |
| `sampling_plans` | tabla | 011 |
| `product_specifications` | tabla | 011 |
| `lot_releases` | tabla | 011 |
| `process_controls` | tabla | 011 |
| `prp_record_items` | tabla | 004 |
| `prp_records` | tabla | 004 |
| `prp_checklist_items` | tabla | 004 |
| `prp_programs` | tabla | 004 |
| Policies `lab_reports_*` | storage | 011 / 035 / 036 |
| Buckets `lab-reports`, `supplier-docs`, `complaint-photos` | storage | **solo si están vacíos** (mismo criterio que 038) |

`029_remove_legacy_modules.sql` ya hace el DROP de estas tablas. `041_remove_legacy_qms.sql` es la pasada idempotente con comprobaciones + respaldo, para entornos donde 029 no corrió o quedó residuo.

---

## Qué está prohibido (denylist en el SQL)

Cualquier nombre de la denylist aborta el DROP. Incluye:

- **DO_NOT_DROP:** plan 12 pasos, monitoreo, auditorías, CAPA (`nonconformities` y hijas), `nc_photos`, documentos, auth/org, notifs, insights, rate-limit, `background_job_locks`.
- **REQUIRES_MIGRATION:** las 6 tablas HACCP v1, `suppliers` + 7 hijas, reclamos (3), `training_*`, `trace_*` / `mock_recall_*`.

`004` creó `nonconformities` junto a PRP. **NC no se toca.**

No se dropea `storage_can_write_bucket` (función compartida).  
No se dropean policies `supplier_docs_*` ni `complaint_photos_*` (módulos que siguen en DB).

---

## Comprobaciones antes de cada DROP

Para cada tabla de la allow-list, si `to_regclass` es NULL se omite (ya limpia). Si existe:

1. **Views** — si una view protegida depende → `EXCEPTION`. Si la view es residual → `DROP VIEW IF EXISTS`.
2. **Functions** — `submit_qc_field_form` se quita al inicio. Otras funciones que dependan de la tabla y también de una tabla protegida → `EXCEPTION`. Si son exclusivas del módulo → `DROP FUNCTION IF EXISTS … CASCADE` (identidad completa vía `regprocedure`).
3. **Triggers** — en tablas protegidas que mencionen el nombre → `EXCEPTION`. En otras tablas SAFE → se dejan (caen con su tabla). Huérfanos en tablas no listadas → `DROP TRIGGER IF EXISTS`.
4. **FK entrantes**
   - Desde otra tabla SAFE → se dropea después / CASCADE.
   - Desde tabla protegida (caso del plan: `customer_complaints.lot_analysis_id → lab_analyses`) → **solo** `ALTER TABLE … DROP CONSTRAINT IF EXISTS`. La tabla y la columna quedan.
   - Desde un schema desconocido → `EXCEPTION`.
5. **Realtime** — si está en `supabase_realtime` (`qc_submissions`, `qc_submission_readings`) se saca de la publication.
6. **Respaldo** — si `count(*) > 0` y no hay snapshot, `CREATE TABLE legacy_qms_backup.<tabla> AS TABLE public.<tabla>` + fila en `_manifest`. No se pisa un backup previo.
7. **DROP TABLE IF EXISTS … CASCADE** — policies, indexes y triggers **de esa tabla** caen con ella.

---

## Respaldo

Schema `legacy_qms_backup` (no es producto).  
Si 029 ya vació/dropeó las tablas, no hay filas que copiar y el DROP es no-op.

Para recuperar un snapshot:

```sql
SELECT * FROM legacy_qms_backup._manifest;
-- SELECT * FROM legacy_qms_backup.lab_analyses;
```

---

## Nombre `041_*` y `041_optimize_rls.sql`

El plan pedía un archivo nuevo `041_remove_legacy_qms.sql`.  
`041_optimize_rls.sql` **sigue intacto**.

Orden alfabético en un apply fresco:

1. `041_optimize_rls.sql`
2. `041_remove_legacy_qms.sql`
3. `042_…`

En un proyecto que ya aplicó `041_optimize_rls`, este archivo entra como migración pendiente. Es idempotente respecto de 029.

---

## No incluido (fuera de SAFE_TO_DROP)

| Pedido habitual | Por qué no |
| --- | --- |
| `haccp_products` / `haccp_ccps` / versiones v1 | REQUIRES_MIGRATION — FK vivos + UI huérfana |
| `suppliers*`, `customer_complaints*`, `training_*`, `trace_*` | REQUIRES_MIGRATION — posible data + FK a tablas vivas |
| Columnas `haccp_ccp_id` / `supplier_id` / `complaint_*` | Ya están en `046_drop_unused_legacy_columns.sql`, no en esta allow-list de tablas |
| `nc_photos` | DO_NOT_DROP (código escribe; falta CREATE) |
| Recrear lab/QC desde `check_state.sql` | El plan lo prohíbe |

Fase siguiente (no creada): dump + DROP de REQUIRES_MIGRATION, en el orden del plan §10.

---

## Cómo aplicar (cuando se decida)

1. Backup del proyecto Supabase (dashboard o `pg_dump`).
2. Correr las queries de verificación del plan (conteos / FKs).
3. Aplicar `041_remove_legacy_qms.sql`.
4. Confirmar `to_regclass` NULL para las 15 tablas y para `submit_qc_field_form`.
5. Confirmar que `nonconformities`, `haccp_plans`, `haccp_products`, `suppliers`, `customer_complaints` siguen existiendo.

```sql
SELECT relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND relname ~ '^(qc_|lab_|prp_|product_spec|sampling_|lot_release|process_control)';
-- 0 filas = limpio
```
