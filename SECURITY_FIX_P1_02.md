# Vulnerability

**SEC-P1-02** — Un administrador de organización puede modificar los controles de acceso comercial de **su propia** organización.

Un org admin autenticado puede llamar PostgREST de forma directa (sin pasar por `/api/settings/organization`) y ejecutar el equivalente de:

```js
supabase.from("organizations").update({
  access_status: "active",
  access_expires_at: null,
}).eq("id", myOrganizationId);
```

Impacto: una organización `suspended` o con `access_expires_at` vencido puede reactivarse a sí misma y anular el control de platform administration de Nura.

# Root cause

La policy `admins_update_own_organization` (`041_optimize_rls.sql`) exige:

- `id = current_organization_id()`
- `rbac_admin()`

No restringe **qué columnas** puede escribir el UPDATE. `protect_org_identity` no aplica a `organizations` (esa tabla no tiene `organization_id`). La API de settings ya omite `access_*`, pero no es la única vía: el cliente JWT habla con PostgREST.

# Implementation

Migración incremental `supabase/migrations/047_protect_org_access_fields.sql`. No se editaron migraciones históricas. No se borró ni recreó `organizations`.

| Objeto | Acción |
| --- | --- |
| `public.protect_org_access_fields()` | `CREATE OR REPLACE` — `SECURITY DEFINER`, `search_path = public` |
| `protect_org_access_fields` | `DROP TRIGGER IF EXISTS` + `CREATE` — `BEFORE UPDATE` en `public.organizations` |

Comportamiento:

1. Si `auth.role() = 'service_role'` → `RETURN NEW` (mismo criterio que `protect_profile_identity` / `protect_org_identity`).
2. Si cualquier columna privilegiada cambia (`IS DISTINCT FROM`) → `RAISE EXCEPTION` con `ERRCODE = '42501'`.
3. En caso contrario → `RETURN NEW` (UPDATE legítimo de settings).

No se restauran valores en silencio. El intento no autorizado falla de forma explícita.

`INSERT` (onboarding `complete_user_onboarding`, `provisionClient`) no pasa por este trigger. El aislamiento de tenant de `041` no se modifica.

# Protected columns

Inspección del schema real de `organizations` (001–046 + `types/database.ts` `Organization`). **No se inventaron campos.**

| Columna | Clasificación |
| --- | --- |
| `access_status` | Privilegiada — platform / `service_role` |
| `access_expires_at` | Privilegiada — platform / `service_role` |
| `access_granted_at` | Privilegiada — platform / `service_role` |
| `contract_notes` | Privilegiada — platform / `service_role` |
| `provisioned_by` | Privilegiada — platform / `service_role` |
| `name`, `industry`, `country`, `city`, `employees_range`, `certifications`, `logo_url` | Configuración legítima de org admin |
| `nc_quarantine_severity_threshold` | Setting CAPA de la org (no comercial) |
| `id`, `created_at` | Identidad / auditoría; no son billing ni access |

No existen columnas de billing, subscription, stripe ni plan. Las de reclamos/scorecard (`complaint_response_sla_hours`, `complaint_auto_nc_severity`, `supplier_scorecard_weights`) ya se eliminaron en `046`.

Quién puede modificar las privilegiadas: **solo** el JWT `service_role` (API de platform `lib/admin/provision.ts` / `createAdminClient`). Un JWT `authenticated` — admin, quality_manager u operator — no puede.

# Database enforcement

La protección está en PostgreSQL, no en TypeScript/UI.

Un cliente JWT que evite la API de Nura y hable con PostgREST sigue disparando el `BEFORE UPDATE`. RLS sigue exigiendo que el admin solo actualice **su** fila; el trigger impide mutar las cinco columnas aunque RLS deje pasar el UPDATE.

**¿Puede un org admin modificar `access_status` mediante PostgREST directo después del fix?**

**NO.**

# Tests

`scripts/verify-org-access-guard.mjs` (`npm run test:org-access-guard`, incluido en `npm test`):

1. Org admin puede cambiar campos normales (`name`, `industry`, …) vía API + policy + trigger `RETURN NEW`.
2. Org admin no puede cambiar las cinco columnas privilegiadas (API no las escribe; trigger `RAISE EXCEPTION`).
3. `quality_manager` no tiene UPDATE de `organizations` (`rbac_admin()`) y el trigger tampoco lo exceptúa.
4. `operator` igual.
5. `service_role` sí (`RETURN NEW` + `updateOrganizationAccess` / `provisionClient`).
6. Admin de Org A no actualiza Org B (`id = current_organization_id()` intacto).
7. Onboarding sigue siendo `INSERT` (el trigger es solo `BEFORE UPDATE`); provisioning de plataforma sigue con admin client.

Ejercicio live del trigger (no solo “la API no acepta el campo”): `supabase/verify_org_access_guard.sql`. Con `DATABASE_URL` + `psql` el test `live` actualiza orgs temporales como `authenticated` (debe fallar) y como `service_role` (debe pasar). Sin esas credenciales el caso se omite (`skip`); no se aplicó nada a producción.

# Regression

Ejecutado en este cambio (todos OK):

- `npx tsc --noEmit`
- `npm run lint` (solo warnings preexistentes, exit 0)
- `npm test` — 125 pass / 3 skip (live storage/signed-url/org-access sin credenciales)
- `npm run test:rbac` — 9 pass
- `npm run test:org-access-guard` — 9 pass / 1 skip (live)
- `npm run build`

No hay CLI de Supabase ni `psql` local (`config.toml` ausente). No se aplicó `047` a ningún proyecto hosted: el archivo queda listo para `supabase db push` / SQL Editor en el entorno que corresponda. **No se tocó producción.**

# Remaining risk

- **SEC-P1-01 sigue abierto:** `access_status` no se consulta en RLS ni en un gate de `/api/*`. Este fix impide la auto-reactivación, pero un JWT de una org ya suspendida **sigue** pudiendo leer/escribir el resto de tablas de su tenant.
- **SEC-P1-03 sigue abierto:** INSERT de `notifications` a un `user_id` de otra org.
- Un org admin aún puede enviar `created_at` (o intentar `id`) en un UPDATE de su fila. No son campos comerciales; no se protegieron para no inventar alcance.
- El SQL Editor como `postgres` (sin JWT) también queda bloqueado en esas columnas, igual que `protect_*` existentes, salvo que se configure `request.jwt.claim.role = service_role`. El camino soportado de platform es `service_role`.

# Next recommendation

Aplicar **SEC-P1-01** a continuación: hacer valer `access_status` en RLS y/o en un gate de API/PostgREST que el cliente JS no pueda saltarse. Sin eso, suspender una org sigue siendo cosmética para el resto de tablas.

Después, **SEC-P1-03** (INSERT de `notifications` same-org / solo service_role).

No se implementó ninguna otra vulnerabilidad de `PREPROD_SECURITY_AUDIT.md` en este cambio.
