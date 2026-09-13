# Dependencias residuales del HACCP legacy

Fecha: 2026-09-11  
La aplicación **ya no lee ni escribe** las tablas v1. Este archivo lista lo que queda en schema, tipos o SQL histórico porque **no se puede quitar sin una migración nueva**.

No se modificaron migraciones históricas ni se dropearon tablas o columnas FK.

---

## Columnas FK que la app ya no usa

Migración `024_haccp_plan_versioning.sql` añadió `haccp_ccp_id UUID REFERENCES haccp_ccps(id) ON DELETE SET NULL` en:

| Tabla | Uso actual en código |
| --- | --- |
| `production_form_submissions.haccp_ccp_id` | La app **no escribe** este campo. Sigue en el tipo `ProductionFormSubmission` para describir filas históricas. Insert lo omite (queda null). |
| `production_form_fields.haccp_ccp_id` | No está en el typedef de aplicación. Nadie lo SELECT/UPDATE. La columna puede existir en DB. |
| `nonconformities.haccp_ccp_id` | La app **no escribe** este campo. Sigue en el tipo `Nonconformity` por el mismo motivo. Insert lo omite. |

Filas antiguas pueden seguir apuntando a `haccp_ccps`. El vínculo operativo nuevo es:

- Desviación de monitoreo → `production_form_submissions` + `origin_ref_id` en la NC
- PCC del plan 12 pasos → `haccp_ccp_decisions` + `haccp_step_data` (pasos 7–9) + `haccp_monitoring_records.pcc_reference_id`

No se reutilizó el UUID de `haccp_ccps` como id de `haccp_ccp_decisions`: rompería el FK.

---

## Tablas que siguen en Postgres (intocadas)

`haccp_products`, `haccp_process_steps`, `haccp_hazards`, `haccp_ccps`, `haccp_plan_versions`, `haccp_plan_version_log`.

Otras migraciones históricas las referencian (no se editaron):

- `002_haccp_products.sql`, `003_haccp_hazards_ccps.sql`, `024_haccp_plan_versioning.sql`
- `011_quality_lab.sql`, `013_customer_complaints.sql` (FK a `haccp_products` / `haccp_ccps`)
- `036_rbac_org_roles.sql` (policies sobre esas tablas)
- `APPLY_ALL.sql`, `check_state.sql` (runbooks)

---

## Superficie de app que no toca tablas v1

| Elemento | Motivo de conservarlo |
| --- | --- |
| `app/(dashboard)/haccp/[id]`, `/haccp/nuevo`, `/haccp/resumen` | Solo `redirect("/haccp")`. Bookmarks de la UI v1. |
| `lib/haccp/auth.ts` | Helper de sesión (`requireOrganizationId`). No consulta tablas HACCP. |

---

## Qué no es una dependencia de runtime

- Tipos TypeScript de las tablas v1: **eliminados** de `types/database.ts` (salvo las columnas FK residuales arriba).
- `Database.Tables` ya no declara las 6 tablas v1.
- Export de organización ya no las incluye.

Cuando se decida dropear schema, hará falta una **migración nueva** que quite FKs y tablas, nunca editar 002–024.
