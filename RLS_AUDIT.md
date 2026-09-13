# Auditoría RLS — CPU y evaluaciones repetitivas

Fecha: 2026-09-11  
Fuente de verdad: migraciones aplicadas, en especial `036_rbac_org_roles.sql` y `035_private_storage_tenant_isolation.sql`.  
Alcance: reducir CPU **sin cambiar permisos**. Este documento no propone relajar ni endurecer roles.

**No se modificó ninguna política ni función.**

---

## Resumen ejecutivo

Las helpers RBAC son `STABLE` + `SECURITY DEFINER`, pero **no se invocan como InitPlan**. El patrón dominante es:

```sql
USING (public.rbac_same_org(organization_id) AND public.rbac_quality())
```

`rbac_same_org(organization_id)` recibe una **columna de fila**. Eso fuerza evaluación por fila. Como `SECURITY DEFINER` no se inlinea, cada llamada vuelve a entrar a `current_organization_id()` → `SELECT profiles`.

El patrón anterior (aún vivo en `organizations` y `notifications`) era más barato para el planner:

```sql
organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
```

El subquery `(SELECT …)` es InitPlan: **una** lectura de `profiles` por statement. 036 lo reemplazó por una función con argumento de fila.

Ganancia esperada **sin cambiar permisos**: envolver helpers sin args en `(SELECT …)` y comparar `organization_id` con el UUID cacheado. Mismos roles, menos CPU.

| Hallazgo | Impacto |
| --- | --- |
| Cadena `rbac_quality` → `rbac_is` → `current_user_role` → `profiles` | 3 hops + 1 SELECT por evaluación si no hay InitPlan |
| Cadena `rbac_same_org` → `current_organization_id` → `profiles` | 2 hops + 1 SELECT por fila |
| UPDATE = USING + WITH CHECK | ×2 |
| 4 políticas por tabla (SELECT/INSERT/UPDATE/DELETE) con el mismo pred | PG evalúa N policies (OR) |
| Hijas sin `organization_id` + RLS anidado en el padre | EXISTS/IN + segunda pasada de RLS |
| `my_organization_id()` y `current_organization_id()` duplicadas | 2 DEFINER para el mismo SELECT |
| FKs sin índice (sobre todo `organization_id` en hijas) | seq scan / filter caro en el pred |

---

## 1. Funciones que consultan `profiles`

| Función | Volatility | DEFINER | Query interna | Justificación DEFINER |
| --- | --- | --- | --- | --- |
| `current_organization_id()` | STABLE | sí | `SELECT organization_id FROM profiles WHERE id = auth.uid()` | Evita recursión RLS de `profiles` |
| `current_user_role()` | STABLE | sí | `SELECT role FROM profiles WHERE id = auth.uid()` | Igual |
| `my_organization_id()` | STABLE | sí | Idéntico a `current_organization_id()` + `LIMIT 1` | **Duplicada** (017). Solo la usan `users_read_teammates` |
| `rbac_is(...)` | STABLE | sí | Ninguna directa → llama `current_user_role()` | **Innecesaria**. Podría ser INVOKER |
| `rbac_same_org(p_org)` | STABLE | sí | Ninguna directa → llama `current_organization_id()` | **Innecesaria**. Podría ser INVOKER |
| `rbac_quality()` | STABLE | sí | → `rbac_is('admin','quality_manager')` | **Innecesaria**. Wrapper extra |
| `rbac_admin()` | STABLE | sí | → `rbac_is('admin')` | **Innecesaria**. Wrapper extra |
| `storage_is_org_object(name)` | STABLE | sí | `current_organization_id()` **dos veces** (NULL check + `::text`) | Relativa (lee profiles desde `storage.objects`) |
| `storage_can_write_bucket(bucket)` | STABLE | sí | → `rbac_is` / `rbac_quality` / `rbac_admin` | Relativa |
| `protect_profile_identity()` | VOLATILE (trigger) | sí | `current_user_role()` al cambiar rol | Necesaria (trigger) |
| `complete_user_onboarding()` | VOLATILE | sí | SELECT/UPDATE `profiles` | Necesaria (onboarding) |
| `ensure_user_profile()` / `handle_new_user()` / `get_my_profile()` | — | sí | INSERT/SELECT `profiles` | Necesaria |
| `admins_update_own_organization` (policy, no fn) | — | — | 2× `SELECT organization_id/role FROM profiles` **sin helper** | 036 no reescribió `organizations` |

`profiles.id` es PK (`auth.users`). El lookup por `auth.uid()` es barato **si se ejecuta una vez**. El coste es la **repetición**.

---

## 2. Funciones que llaman otras funciones

```
rbac_quality()
  └─ rbac_is('admin','quality_manager')     -- DEFINER
       └─ current_user_role()               -- DEFINER
            └─ SELECT profiles.role

rbac_admin()
  └─ rbac_is('admin')
       └─ current_user_role()
            └─ SELECT profiles.role

rbac_same_org(organization_id)             -- arg de FILA
  └─ current_organization_id()             -- DEFINER
       └─ SELECT profiles.organization_id

storage_can_write_bucket(bucket)
  └─ rbac_is / rbac_quality / rbac_admin   -- misma cadena

storage_is_org_object(name)
  └─ current_organization_id() × 2
```

Una policy quality típica (`same_org AND quality`) = **dos cadenas** = hasta **2 lecturas de `profiles`** por evaluación si el planner no cachea.

`rbac_quality()` no reutiliza un “sesión role” compartido con `rbac_same_org`: cada rama vuelve a `profiles` (una por `role`, otra por `organization_id`). Una sola función `current_profile_rbac()` que devuelva `(org_id, role)` cortaría a 1 SELECT. Eso no cambia permisos.

---

## 3. Evaluación por fila vs InitPlan

| Expresión | ¿InitPlan? | Evaluación |
| --- | --- | --- |
| `(SELECT public.current_organization_id())` | Sí (subquery sin corr.) | 1 / statement |
| `(SELECT public.rbac_quality())` | Sí | 1 / statement |
| `(SELECT organization_id FROM profiles WHERE id = auth.uid())` | Sí | 1 / statement |
| `public.rbac_quality()` suelta junto a pred de fila | Incierta; en RLS + DEFINER suele **no** cachear | Por fila o por policy |
| `public.rbac_same_org(organization_id)` | **No** | **Por fila** |
| `plan_id IN (SELECT id FROM haccp_plans WHERE rbac_same_org(organization_id))` | El IN es por fila; el SELECT interno re-aplica RLS del padre | Por fila + RLS anidado |
| `auth.uid()` | InitPlan | 1 / statement |

**Recomendación de forma (mismos permisos):**

```sql
USING (
  organization_id = (SELECT public.current_organization_id())
  AND (SELECT public.rbac_quality())
)
```

No pasar `organization_id` a una función. Comparar en SQL.

---

## 4. Inventario de políticas (estado post-036)

Leyenda de riesgo CPU: **Bajo** (InitPlan o `id = auth.uid()`), **Medio** (same_org + quality por fila), **Alto** (EXISTS/IN a padre + RLS anidado), **Crítico** (JOIN de 2+ padres por fila, o N policies × UPDATE × cadenas DEFINER).

### 4.1 Helpers y tablas de identidad

| Tabla | Política | Función / pred | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | `users_read_own_profile` | `id = auth.uid()` | ninguna | Bajo | Mantener | PK |
| `profiles` | `users_read_teammates` | `organization_id = my_organization_id()` | 1× profiles (DEFINER) | Medio | Unificar a `(SELECT current_organization_id())`. Sin DEFINER extra | **`profiles(organization_id)`** — no existe |
| `profiles` | `users_update_own_profile` | `id = auth.uid()` + 3 subselects a `profiles` en CHECK | 3× profiles (propios) | Medio | CHECK contra `OLD` en trigger (ya existe `protect_profile_identity`); el CHECK RLS es **redundante** | PK |
| `profiles` | `users_insert_own_profile` | `id = auth.uid() AND org IS NULL AND role = operator` | ninguna | Bajo | OK | PK |
| `profiles` | `profiles_admin_update_team` | `rbac_admin()` + `current_organization_id()` + CHECK correlacionado `profiles.id` | role + org + 1 SELECT por fila target | Medio | `(SELECT rbac_admin())` + `(SELECT current_organization_id())` | `profiles(organization_id)` |
| `profiles` | `service_role_*` | `true` | ninguna | Bajo | OK (service) | — |
| `organizations` | `users_read_own_organization` | `id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())` | 1× profiles (InitPlan) | Bajo | Ya es InitPlan. Opcional: `id = (SELECT current_organization_id())` | PK |
| `organizations` | `admins_update_own_organization` | 2× SELECT profiles (org + role) en USING y CHECK | **4** lookups profiles / update | Medio | 036 no la tocó. Usar `(SELECT current_organization_id())` + `(SELECT rbac_admin())` | PK |
| `organizations` | `service_role_all_organizations` | `true` | ninguna | Bajo | OK | — |
| `notifications` | `notifications_select/update` | `user_id = auth.uid()` | ninguna | Bajo | 036 no la tocó | `idx_notifications_user` |
| `notifications` | `notifications_insert` | `organization_id = (SELECT … profiles)` | 1× profiles InitPlan | Bajo | Dejar o alinear a `current_organization_id()` | `idx_notifications_org` |
| `rate_limit_windows` / `security_abuse_events` | **ninguna** (RLS on + REVOKE) | deny authenticated | 0 | Bajo | Correcto (solo service_role / DEFINER) | PK / created_at |

### 4.2 Patrón A — `rbac_same_org(organization_id) AND rbac_quality()` (CRUD ×4)

Generado por `_rbac_quality_crud`. UPDATE duplica el pred (USING + CHECK).

Tablas: `haccp_products`, `haccp_process_steps`, `haccp_hazards`, `haccp_ccps`, `haccp_plans`, `haccp_step_data`, `haccp_monitoring_records`, `haccp_plan_versions`, `audits`, `audit_templates`, `audit_template_sections`, `audit_template_items`, `suppliers`, `supplier_documents`, `supplier_evaluations`, `supplier_incidents`, `supplier_approval_checklist`, `supplier_approval_responses`, `supplier_approval_log`, `supplier_portal_tokens`, `customer_complaints` (+ extra operator INSERT), `complaint_photos`, `complaint_status_log`, `capa_actions`, `nc_5whys`, `nc_fishbone_causes`, `document_state_log`, `training_role_requirements`, `trace_lots`, `trace_lot_compositions`, `trace_events`, `mock_recall_simulations`, `mock_recall_simulation_lots`, `ai_daily_insights`.

| Tabla (patrón A) | Política | Función | Queries internas | Riesgo | Recomendación | Índice requerido |
| --- | --- | --- | --- | --- | --- | --- |
| *todas las de la lista* | `*_select_rbac` | `rbac_same_org(organization_id)` + `rbac_quality()` | profiles.role + profiles.org **por fila** | Medio | `(SELECT current_organization_id())` + `(SELECT rbac_quality())`. Fusionar 4 policies → 1 `FOR ALL` si el pred es idéntico | `organization_id` (ver §7) |
| *mismas* | `*_insert_rbac` | igual en WITH CHECK | igual | Medio | igual | igual |
| *mismas* | `*_update_rbac` | USING + CHECK (×2) | **×2** cadenas | Alto | Un solo pred InitPlan | igual |
| *mismas* | `*_delete_rbac` | igual que SELECT | igual | Medio | igual | igual |

`audit_template_sections` e `items` **sí tienen** `organization_id` (023). El bloque de 036 que las reescribe vía `template_id` **no corre**. Quedan en patrón A (mejor que el fallback).

### 4.3 Patrón B — hijas **sin** `organization_id` (vía `plan_id`)

`_rbac_quality_via_plan`: `rbac_quality() AND plan_id IN (SELECT id FROM haccp_plans WHERE rbac_same_org(organization_id))`.

El `SELECT` a `haccp_plans` **vuelve a disparar** las policies del padre (`same_org AND quality`). RLS anidado.

| Tabla | Política | Función | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `haccp_teams` | `*_select/insert/update/delete_rbac` | `rbac_quality` + IN `haccp_plans` | quality + same_org en padre + RLS padre otra vez | Alto | Corto plazo: `(SELECT rbac_quality())` + `plan_id IN (SELECT id FROM haccp_plans WHERE organization_id = (SELECT current_organization_id()))` **con helper DEFINER que lea el padre sin RLS** (mismos ids visibles hoy para quality). Largo plazo: denormalizar `organization_id` | `idx_haccp_teams_plan` OK |
| `haccp_plan_products` | igual | igual | igual | Alto | igual | `idx_haccp_plan_products_plan` OK |
| `haccp_diagrams` | igual | igual | igual | Alto | igual | `idx_haccp_diagrams_plan` OK |
| `haccp_validations` | igual | igual | igual | Alto | igual | UNIQUE(`plan_id`) OK |
| `haccp_plan_hazards` | igual | igual | igual | Alto | igual | `idx_haccp_plan_hazards_plan` OK |
| `haccp_ccp_decisions` | igual | igual | igual | Alto | igual | UNIQUE(`plan_id`,`hazard_id`) cubre `plan_id`; **falta `hazard_id`** |

UPDATE en estas tablas evalúa el IN **dos veces** (USING + CHECK).

### 4.4 Patrón C — vía `audit_id` (padre) **aunque la hija ya tiene `organization_id`**

| Tabla | Política | Función | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `audit_checklist_items` | `*_rbac` vía `audit_id IN (SELECT id FROM audits WHERE rbac_same_org(organization_id))` | quality + IN + RLS de `audits` | EXISTS caro **y redundante** | Alto | Tienen `organization_id`. Usar patrón A InitPlan. **Mismos permisos** si la app no escribe org distinta del padre (trigger `protect_org_identity`) | `organization_id` **no indexado**; `audit_id` sí |
| `audit_findings` | igual | igual | igual | Alto | igual | `organization_id` **no indexado**; `audit_id` sí; `checklist_item_id` **sin índice** |

### 4.5 Patrón D — producción: hijas **con** `organization_id` pero policies por JOIN

| Tabla | Política | Función | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `production_form_templates` | select: `same_org`; write: `same_org AND quality` | rbac_* | profiles ×1–2 / fila | Medio | InitPlan | `idx_production_templates_org` OK |
| `production_form_sections` | `template_id IN (SELECT id FROM templates WHERE same_org)` | same_org en padre + RLS templates | EXISTS + RLS anidado | Alto | Tienen `organization_id`. Comparar columna (InitPlan). Permiso equivalente | **`sections.organization_id`** no indexado; `template_id` sí |
| `production_form_fields` | `section_id IN (sections JOIN templates WHERE same_org)` | JOIN 2 tablas + RLS en ambas | **Crítico** | Crítico | Usar `organization_id` directo | **`fields.organization_id`** no; `section_id` sí |
| `production_form_submissions` | `same_org` (todos); delete + quality | rbac_same_org | Medio | InitPlan | `idx_production_submissions_org` OK |
| `production_form_submission_values` | `submission_id IN (SELECT … submissions WHERE same_org)` | EXISTS + RLS submissions | Alto | Tienen `organization_id`. Comparar columna | **`values.organization_id`** no; `submission_id` sí |
| `monitoring_qr_links` | same_org; delete + quality | rbac_* | Medio | InitPlan | `idx_monitoring_qr_links_org` OK |

### 4.6 CAPA / documentos / invitaciones / training (preds mixtos)

| Tabla | Política | Función | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `nonconformities` | select/update: same_org + quality; insert: same_org + `rbac_is(admin,QM,operator)` | `rbac_is` de **todos los roles** | INSERT = same_org + hop inútil | Medio | INSERT: solo `same_org` InitPlan. **Mismo permiso** (cualquier rol autenticado de la org ya pasa `rbac_is` de los 3) | org indexado |
| `capa_stage_log` | select: quality; insert: `rbac_is(3 roles)`; update: quality; delete: admin | igual que NC | Medio | INSERT sin `rbac_is` total | **`organization_id` no indexado** (solo `nc_id`) |
| `nc_photos` | select/delete: quality; insert: 3 roles | igual | Medio | INSERT = same_org InitPlan | `organization_id` si existe, indexar |
| `controlled_documents` | select: same_org AND (quality OR (operator AND status published/obsolete)); write: quality; delete: admin | 2–3 helpers | Medio | `(SELECT current_organization_id())` + `(SELECT current_user_role())` **una vez** | org+status OK |
| `document_versions` | select: same_org AND (quality OR operator) | quality OR operator = **todos los roles** | Medio | SELECT: solo same_org. **Redundante** | **`organization_id` no indexado** |
| `document_read_acknowledgments` | select: same_org; insert: same_org + `user_id = auth.uid()`; delete: admin | Medio | InitPlan | **`organization_id` no**; user/version sí |
| `invitations` | CRUD admin + same_org | `rbac_admin` ×2 en UPDATE | Medio | InitPlan | `idx_invitations_org` OK |
| `notification_preferences` | select: same_org; write: admin | Medio | InitPlan | PK = organization_id |
| `haccp_plan_version_log` | select/insert quality + same_org (sin update/delete) | Medio | InitPlan | **`organization_id` no** |
| `training_courses` / `training_quiz_questions` | select: same_org; write: quality | Medio | InitPlan | courses org OK; **quiz.organization_id no** |
| `training_assignments` | select/update: same_org AND (quality OR user_id = uid); insert/delete: quality | Medio | InitPlan + `user_id` | org+user OK |
| `training_completions` | select: quality OR self; insert: self; delete: admin | Medio | InitPlan | org+user OK |

### 4.7 Storage (`storage.objects`)

036 reescribe INSERT/UPDATE/DELETE; 035 dejó SELECT `*_select_org`.

| Tabla | Política | Función | Queries internas | Riesgo | Recomendación | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| `storage.objects` | `{bucket}_select_org` | `storage_is_org_object(name)` | `current_organization_id()` ×2 | Medio | Una sola llamada; `(SELECT current_organization_id())` | storage interno |
| `storage.objects` | `{bucket}_insert/update_org` | `storage_is_org_object` + `storage_can_write_bucket` | org ×2 + cadena role | Alto | Cachear org y role en InitPlan | — |
| `storage.objects` | `{bucket}_delete_org` | org object + `rbac_quality()` | org ×2 + quality chain | Alto | InitPlan | — |
| `storage.objects` | `logos_*` (010) | policies propias, no RBAC 036 | — | Bajo | Fuera de este hardening | — |

Buckets aún referenciados en policies: `supplier-docs`, `complaint-photos`, `lab-reports` (038 solo borra el bucket si está vacío; las policies pueden quedar).

---

## 5. Políticas duplicadas

Policies PERMISSIVE se **OR**. Duplicar no suma seguridad; suma CPU.

| Tabla | Duplicado | Nota |
| --- | --- | --- |
| `customer_complaints` | `customer_complaints_insert_rbac` (quality) **+** `complaints_insert_operator` | Intencional (operator quick-capture). Quality ya cubre admin/QM. No fusionar sin revisar el INSERT de operator |
| `complaint_photos` | igual + `complaint_photos_insert_operator` | Igual |
| `profiles` | `users_update_own_profile` + `profiles_admin_update_team` | Intencional (self vs team). OK |
| `profiles` / `organizations` | `service_role_*` + policies authenticated | Roles distintos. OK |
| Helpers | `my_organization_id` ≈ `current_organization_id` | Duplicado real |
| 4 policies CRUD idénticas | SELECT+INSERT+UPDATE+DELETE vs un `FOR ALL` | Duplicado de pred. UPDATE además duplica USING/CHECK |

036 hace `DROP` de policies que no empiezan por `service_role%`. No deberían quedar las policies viejas `*_org` / `haccp_*_all` en tablas que 036 recreó.

Tablas que **036 no reescribió** y siguen con el pred InitPlan antiguo (no duplicadas, solo desalineadas): `organizations`, `notifications`, y SELECT de storage 035.

---

## 6. Políticas redundantes (mismo permiso, más trabajo)

| Predicado actual | Equivalente más barato (mismos roles) |
| --- | --- |
| `rbac_same_org(org) AND rbac_is('admin','quality_manager','operator')` | `rbac_same_org(org)` — los 3 roles de `profiles_role_check` |
| `rbac_same_org(org) AND (rbac_quality() OR rbac_is('operator'))` en `document_versions` SELECT | `rbac_same_org(org)` |
| `rbac_quality()` además de un IN a `haccp_plans` que ya exige `rbac_quality()` vía RLS del padre | Un solo `(SELECT rbac_quality())` + IN por org |
| `users_update_own_profile` CHECK de role/org/onboarding | Ya lo fuerza `protect_profile_identity` |
| `rbac_quality()` wrapper vs `rbac_is('admin','quality_manager')` | Inlinar o una sola fn de sesión |
| `storage_is_org_object`: `current_organization_id() IS NOT NULL AND folder = current_organization_id()::text` | Una lectura |

---

## 7. Tablas hijas sin `organization_id`

Solo estas (modelo 12 pasos) **no** tienen la columna. El resto de “hijas” de 036 sí la tienen y aun así a veces no la usan.

| Tabla | FK al padre | ¿Índice del padre FK? | Policy actual |
| --- | --- | --- | --- |
| `haccp_teams` | `plan_id → haccp_plans` | sí (`plan_id, order_index`) | vía plan IN |
| `haccp_plan_products` | `plan_id` | sí | vía plan IN |
| `haccp_diagrams` | `plan_id` | sí | vía plan IN |
| `haccp_validations` | `plan_id` UNIQUE | sí (unique) | vía plan IN |
| `haccp_plan_hazards` | `plan_id` | sí | vía plan IN |
| `haccp_ccp_decisions` | `plan_id`, `hazard_id` | `plan_id` por UNIQUE; **`hazard_id` no** | vía plan IN |

Añadir `organization_id` denormalizado (mantenido por trigger) permitiría patrón A InitPlan **sin cambiar quién lee/escribe**. Es un cambio de esquema, no de permiso. No hacerlo ahora.

Hijas **con** `organization_id` que **ignoran** la columna (EXISTS innecesario):

- `audit_checklist_items`, `audit_findings`
- `production_form_sections`, `production_form_fields`, `production_form_submission_values`

---

## 8. FK sin índice (impacto RLS / JOIN)

Postgres no indexa FKs solo. Lista centrada en columnas que las policies filtran o que el padre usa en IN/JOIN.

| Columna | ¿Índice? | Por qué importa |
| --- | --- | --- |
| `profiles.organization_id` | **No** | Teammates + cualquier scan por org |
| `haccp_process_steps.organization_id` | **No** | Patrón A |
| `haccp_hazards.organization_id` | **No** | Patrón A |
| `haccp_ccps.organization_id` | **No** | Patrón A |
| `haccp_ccp_decisions.hazard_id` | **No** | ON DELETE CASCADE / join peligros |
| `haccp_plan_versions.organization_id` | **No** | Patrón A |
| `haccp_plan_version_log.organization_id` | **No** | select/insert quality |
| `audit_checklist_items.organization_id` | **No** | Si se pasa a patrón A |
| `audit_findings.organization_id` | **No** | igual |
| `audit_findings.checklist_item_id` | **No** | FK |
| `audit_template_sections.organization_id` | **No** | Patrón A |
| `audit_template_items.organization_id` | **No** | Patrón A |
| `production_form_sections.organization_id` | **No** | Debería usarse en RLS |
| `production_form_fields.organization_id` | **No** | Debería usarse en RLS |
| `production_form_submission_values.organization_id` | **No** | Debería usarse en RLS |
| `document_versions.organization_id` | **No** | SELECT frecuente |
| `document_state_log.organization_id` | **No** | Patrón A |
| `document_read_acknowledgments.organization_id` | **No** | SELECT org-wide |
| `document_read_acknowledgments.document_id` | **No** | FK |
| `capa_stage_log.organization_id` | **No** | solo `nc_id` |
| `nc_5whys.organization_id` | **No** | UNIQUE es `nc_id` |
| `nc_fishbone_causes.organization_id` | **No** | solo `nc_id` |
| `supplier_documents.organization_id` | **No** | Patrón A |
| `supplier_evaluations.organization_id` | **No** | Patrón A |
| `supplier_incidents.organization_id` | **No** | Patrón A |
| `complaint_photos.organization_id` | **No** | Patrón A |
| `complaint_status_log.organization_id` | revisar | log indexa `complaint_id` |
| `training_quiz_questions.organization_id` | **No** | select all-org |
| `trace_lot_compositions.organization_id` | **No** | Patrón A |
| `trace_events.organization_id` | **No** | Patrón A |
| `mock_recall_simulation_lots.organization_id` | **No** | Patrón A |
| `mock_recall_simulation_lots.lot_id` | **No** (PK es `simulation_id, lot_id`) | FK lots |
| `monitoring_qr_links.template_id` | **No** | FK templates |
| `invitations.invited_by` | **No** | FK profiles |
| `audits.created_by`, `haccp_plans.created_by`, y demás `*_by` | **No** | FK profiles; bajo impacto RLS |

Índices que **sí** cubren el pred org: `haccp_plans(organization_id, updated_at)`, `haccp_products`, `haccp_monitoring_records`, `audits`, `audit_templates`, `suppliers`, `customer_complaints`, `capa_actions`, `controlled_documents`, `invitations`, `notifications`, `trace_lots`, `mock_recall_simulations`, `ai_daily_insights`, `training_courses`, `training_assignments`, `training_completions`, `production_form_templates`, `production_form_submissions`, `monitoring_qr_links`.

---

## 9. EXISTS / IN costosos

| Sitio | Forma | Coste |
| --- | --- | --- |
| `_rbac_quality_via_plan` (6 tablas × 4 policies; UPDATE ×2) | `plan_id IN (SELECT id FROM haccp_plans WHERE rbac_same_org(organization_id))` | IN + RLS padre + same_org por fila del padre |
| `_rbac_quality_via_audit` (2 tablas) | igual con `audits` | Redundante: la hija ya tiene `organization_id` |
| Fallback 036 `audit_template_items` (no activo) | `section_id IN (sections JOIN templates)` | 2 hops; no aplica hoy |
| `production_form_sections` | `template_id IN (templates)` | Redundante |
| `production_form_fields` | JOIN sections+templates | El peor pred del esquema |
| `production_form_submission_values` | `submission_id IN (submissions)` | Redundante |
| `organizations` read/update | `id IN (SELECT organization_id FROM profiles …)` | Barato (InitPlan, 1 fila) |

No hay `EXISTS (SELECT 1 FROM …)` literal; el `IN (SELECT …)` es el mismo plan (Semi Join / hash). El daño es el **RLS anidado**, no el keyword.

---

## 10. SECURITY DEFINER innecesario (para RLS)

| Función | ¿Hace falta DEFINER para el permiso actual? |
| --- | --- |
| `current_organization_id` / `current_user_role` / `my_organization_id` | Sí, para no recursar `profiles` |
| `rbac_is` / `rbac_same_org` / `rbac_quality` / `rbac_admin` | **No**. Solo delegan. DEFINER bloquea inline y encarece |
| `storage_is_org_object` / `storage_can_write_bucket` | Discutible; podrían ser INVOKER si leen solo las helpers de arriba |
| `_rbac_drop_all_policies` / `_rbac_*_crud` | DDL de migración; no se usan en queries. Ya REVOKE PUBLIC |
| `handle_new_user`, `ensure_user_profile`, `complete_user_onboarding`, `protect_*`, `get_my_profile` | Sí |
| `consume_rate_limit*` / `record_rate_limit_abuse` / `cleanup_rate_limit_windows` | Sí (service_role, tablas sin grant) |
| `get_dashboard_metrics` / `get_kiosk_metrics` | **INVOKER** — correcto |
| `update_haccp_product_timestamp` (002) | DEFINER sobre `haccp_products`; no es RLS de lectura, pero salta RLS en el UPDATE del trigger |
| `create_default_notification_preferences` | Sí (INSERT en trigger de org) |

Quitar DEFINER de `rbac_*` **no cambia** quién pasa: autenticados ya tienen EXECUTE. Baja CPU si el planner puede inlinear.

---

## 11. Estimación de CPU (orden de magnitud)

Escenario: quality_manager lista 200 `haccp_plan_hazards` (hija sin org_id) y 50 nodos de diagrama.

| | Hoy (aprox.) | Con InitPlan + pred en columna |
| --- | --- | --- |
| Lecturas `profiles` | cientos (por fila × cadenas × UPDATE×2 si escribe) | 1–2 / statement |
| Scans `haccp_plans` (RLS anidado) | 1 por fila hija, re-filtrado | 1 (lista de plan_id) o 0 si hay `organization_id` en la hija |
| Policies consultadas | 4 nombres × OR | 1 `FOR ALL` |

El dashboard (`get_dashboard_metrics`, INVOKER) paga este impuesto en **cada** tabla que toca (`audits`, `nonconformities`, `capa_actions`, `controlled_documents`, `production_form_submissions`, `haccp_plans`).

---

## 12. Plan recomendado (sin tocar permisos todavía)

Orden seguro, cada paso es equivalente en ACL:

1. **InitPlan wrap** en helpers de sesión: `(SELECT current_organization_id())`, `(SELECT current_user_role())`, `(SELECT rbac_quality())`. Dejar de pasar columnas a `rbac_same_org`.
2. **Colapsar wrappers DEFINER** `rbac_is` / `rbac_quality` / `rbac_admin` / `rbac_same_org` a SQL INVOKER o a una sola fn `(org_id, role)`.
3. **Usar `organization_id` de la fila** en hijas que ya lo tienen (auditoría, producción, values). Quitar IN/JOIN.
4. **Índices** de la tabla §8, empezando por `profiles(organization_id)` y `*.organization_id` de tablas patrón A sin índice.
5. **Unificar** `my_organization_id` → `current_organization_id`.
6. **Quitar `rbac_is` de los 3 roles** en INSERT de NC / fotos / capa_stage_log; SELECT de `document_versions`.
7. Recién entonces: denormalizar `organization_id` en las 6 hijas HACCP (paso de esquema; trigger de relleno).

Ningún paso de esta lista se aplicó en este audit.
