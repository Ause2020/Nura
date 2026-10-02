# SECURITY AUDIT — SP-03 Profile identity (INSERT/UPDATE directo de `profiles`)

Fecha: 2026-10-02 · Working tree actual (incluye 053, sin commit) · Solo auditoría: sin cambios de código, sin migraciones, sin hosted.

**Pregunta central:** ¿un usuario `authenticated` sin profile puede hacer
`INSERT profiles (id = auth.uid(), organization_id = '<victim-org>', role = 'admin')` vía PostgREST y convertirse en admin de un tenant existente?

**Respuesta corta**

- **Estado esperado del repo (001→053):** **No.** El trigger `protect_profile_identity` (036) reescribe la fila a `organization_id = NULL`, `role = 'operator'`; la policy `users_insert_own_profile` (036) además exige ambos. Todos los UPDATE de identidad se rechazan.
- **Hosted:** **NOT VERIFIED** (staging INACTIVE). En el modelo de drift ya documentado (036 y 041 nunca aplicadas), el ataque **funciona** si el usuario no tiene fila en `profiles`. 053 no lo cubre.

## Método y evidencia

Script temporal **no integrado** en `npm test`: `scripts/audit-sp03-profile-identity.mjs`.

- Aplica **todas** las migraciones del working tree en orden lexicográfico sobre PGlite (Postgres 17 real en WASM), con stubs de Supabase:
  - roles `anon`, `authenticated`, `service_role` (BYPASSRLS), `supabase_auth_admin`;
  - `auth.users`, y `auth.uid()` / `auth.role()` / `auth.jwt()` con la misma lógica de GUC que Supabase;
  - `storage.*` y la publicación `supabase_realtime`;
  - default privileges de Supabase (`GRANT ALL` en `public` a `anon`, `authenticated` y `service_role`).
- **Modelo PostgREST:** cada ataque corre como `SET LOCAL ROLE authenticated` más `request.jwt.claims` / `request.jwt.claim.sub` / `request.jwt.claim.role`. Es lo que obtiene un atacante con `NEXT_PUBLIC_SUPABASE_URL` + anon key + JWT válido.
- **Modelo GoTrue:** INSERT en `auth.users` como `supabase_auth_admin` sin claims JWT.
- **Seeds** (orgs y perfiles legítimos) como `service_role`, igual que `provisionClient` y las invitaciones.

En una base limpia fallan 3 migraciones, ninguna toca `profiles`:
- `001_fsma204_kdes.sql`: referencia `trace_lots`, que se crea en 025.
- `019_qc_multi_parameters.sql`: función sobrecargada sin firma.
- `044_ai_daily_insights_telemetry.sql`: el constraint ya existe desde 033.

Además, los prefijos de versión duplicados (`001_*` ×2, `041_*` ×2) colisionan en `supabase_migrations.schema_migrations`. Por eso la cadena no es aplicable tal cual con la CLI, lo que es un factor que favorece el drift.

| Escenario | Comando | Qué modela |
| --- | --- | --- |
| **A** | `node scripts/audit-sp03-profile-identity.mjs` | Repo limpio 001→053 (estado final esperado) |
| **B** | `… --no-recursion` | A con las policies UPDATE reducidas a `id = auth.uid()`: mide el **trigger solo** |
| **B2** | `… --equivalent` | A con las mismas condiciones de 036 leídas vía `SECURITY DEFINER` (sin recursión): mide la **intención** de las policies |
| **C** | `… --skip 036_rbac_org_roles.sql,041_optimize_rls.sql,053_require_provisioned_onboarding.sql` | Drift hosted conocido, sin 053 |
| **D** | C + `--no-recursion` | (helpers de 036 ausentes: equivale a C) |
| **E** | `… --skip 036_rbac_org_roles.sql,041_optimize_rls.sql` | Drift hosted **con 053 aplicado** |

# Migration history

Columnas de `public.profiles` (final): `id` (PK, FK → `auth.users` ON DELETE CASCADE), `organization_id` (FK → `organizations`), `full_name` NOT NULL, `role` NOT NULL, `job_title`, `avatar_url`, `onboarding_completed`, `created_at`.

Campos de autorización: **`role`, `organization_id`**, y, por su efecto en los gates de middleware, **`onboarding_completed`**. No hay otros campos de privilegio en `profiles`.

| MIGRATION | POLICY / FUNCTION / GRANT / TRIGGER CREATED | DROPPED / REPLACED BY | FINAL EXPECTED STATE |
| --- | --- | --- | --- |
| 001 | Tabla `profiles`, `role DEFAULT 'admin'` | 036 → `DEFAULT 'operator'` + `profiles_role_check` | `operator`, CHECK `admin\|quality_manager\|operator` |
| 001 | `users_read_profiles` SELECT (subconsulta recursiva) | 017 DROP | — |
| 001 | `users_update_own_profile` UPDATE `WITH CHECK (id = auth.uid())` | 016 → 036 | 036 (ver abajo) |
| 001 | `users_insert_own_profile` INSERT `WITH CHECK (id = auth.uid())` | 017 (igual) → 036 | 036: `id = auth.uid() AND organization_id IS NULL AND role = 'operator'` |
| 001 | `handle_new_user` (role desde metadata) + trigger `on_auth_user_created` | 014 → 016 → 036 | 036: `role = 'operator'`, ignora metadata |
| 009 | `profiles_admin_update_team` UPDATE (subconsultas a `profiles`) | 036 → 041 | 041: `rbac_admin()` + `current_organization_id()` + subconsulta `profiles` en WITH CHECK |
| 014 | `service_role_{insert,update,select}_profiles`; `GRANT INSERT,UPDATE,SELECT TO supabase_auth_admin` | 016 (recrea iguales) | Presentes (redundantes: `service_role` tiene BYPASSRLS) |
| 014 | `handle_new_user`: `COALESCE(meta->>'role','admin')` | 016 (igual) → 036 | 036 |
| 016 | `users_update_own_profile`: fija `organization_id` y `onboarding_completed` vía subconsulta (**no fija `role`**) | 036 | 036 |
| 016 | `ensure_user_profile()` DEFINER → INSERT `role='admin'` | 036 → `'operator'` | 036 |
| 016 | `finalize_user_onboarding()` DEFINER | — | 016 (solo `onboarding_completed` si hay org) |
| 016 | `complete_user_onboarding` (crea org) | 036 → **053** | 053 (no crea org, no toca `role`/`organization_id`) |
| 017 | `users_read_own_profile`, `users_read_teammates` (`my_organization_id()`), `users_insert_own_profile` sin restricción de rol/org | 036 (insert), 041 (teammates) | Ver final |
| 036 | `protect_profile_identity` BEFORE INSERT OR UPDATE (bypass `service_role`) | — | Presente |
| 036 | `users_update_own_profile`: fija `role`, `organization_id`, `onboarding_completed` vía subconsultas | — | Presente (**recursivo**, ver abajo) |
| 036 | `protect_org_identity` en tablas de negocio (no `profiles`) | — | Presente |
| 041 | `users_read_teammates` → `current_organization_id()`; `profiles_admin_update_team` reescrita | — | Presente |
| 048 | `org_access_gate_profiles_select` / `_update` **RESTRICTIVE** | — | Presente (no cubre INSERT/DELETE) |
| 049–052 | Sin cambios en `profiles` | — | — |
| 053 | `complete_user_onboarding` sin auto-provisión; trigger `protect_org_insert` en **`organizations`** | — | Presente; **no toca `profiles`** |

`protect_profile_identity` (036), para no-`service_role`:

- En **INSERT**: `NEW.id := auth.uid()`, `NEW.organization_id := NULL`, `NEW.role := 'operator'`. **No** toca `onboarding_completed`.
- En **UPDATE**:
  - `organization_id` es inmutable **solo si `OLD.organization_id IS NOT NULL`**.
  - `cannot change own role`, salvo la excepción "fundador": `OLD.org NULL → NEW.org NOT NULL` con `NEW.role = 'admin'`.
  - Los cambios de rol requieren `current_user_role() = 'admin'`.
  - `onboarding_completed` solo puede ir a `true`.

# Final expected policies

Estado obtenido de `pg_policies` tras aplicar 001→053 (escenario A). RLS habilitado, **no** FORCE.

| policy name | command | role | permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| `org_access_gate_profiles_select` | SELECT | authenticated | **RESTRICTIVE** | `id = auth.uid() OR current_organization_access_allowed()` | — |
| `org_access_gate_profiles_update` | UPDATE | authenticated | **RESTRICTIVE** | igual | igual |
| `users_read_own_profile` | SELECT | authenticated | PERMISSIVE | `id = auth.uid()` | — |
| `users_read_teammates` | SELECT | authenticated | PERMISSIVE | `organization_id IS NOT NULL AND organization_id = current_organization_id() AND id <> auth.uid()` | — |
| `users_insert_own_profile` | INSERT | authenticated | PERMISSIVE | — | `id = auth.uid() AND organization_id IS NULL AND role = 'operator'` |
| `users_update_own_profile` | UPDATE | authenticated | PERMISSIVE | `id = auth.uid()` | `id = auth.uid()` AND `role`, `organization_id`, `onboarding_completed` `IS NOT DISTINCT FROM (SELECT … FROM profiles p WHERE p.id = auth.uid())` |
| `profiles_admin_update_team` | UPDATE | authenticated | PERMISSIVE | `rbac_admin() AND organization_id = current_organization_id() AND id <> auth.uid()` | `rbac_admin() AND organization_id = current_organization_id() AND organization_id IS NOT DISTINCT FROM (SELECT … FROM profiles p WHERE p.id = profiles.id)` |
| `service_role_insert_profiles` | INSERT | service_role | PERMISSIVE | — | `true` |
| `service_role_select_profiles` | SELECT | service_role | PERMISSIVE | `true` | — |
| `service_role_update_profiles` | UPDATE | service_role | PERMISSIVE | `true` | `true` |

No hay policy **DELETE** para `authenticated` (DELETE → 0 filas). Triggers en `profiles`: solo `protect_profile_identity`. Trigger en `auth.users`: `on_auth_user_created → handle_new_user()`.

**Hallazgo estructural (R-1):** `users_update_own_profile` y `profiles_admin_update_team` contienen subconsultas sobre `profiles` dentro de una policy de `profiles`. Postgres aborta **cualquier** UPDATE de `authenticated` sobre `profiles` con `infinite recursion detected in policy for relation "profiles"`, incluido `full_name`. Esto ocurre en el escenario A, en C (la policy de 016 tiene el mismo patrón) y en E. La app no lo nota porque todas sus escrituras de `profiles` usan `service_role` (`lib/team/members.ts`, `invitations.ts`, `admin/provision.ts`, `session-server.ts`). La única escritura con JWT de usuario es el INSERT fallback en `lib/auth/session.ts`. Hoy el UPDATE falla cerrado por accidente.

# Grants

Estado final (A) en `public.profiles`:

| grantee | privileges |
| --- | --- |
| `anon` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (default privileges de Supabase) |
| `authenticated` | ídem |
| `service_role` | ídem (+ BYPASSRLS) |
| `supabase_auth_admin` | INSERT, SELECT, UPDATE (014/016) |

Ninguna migración revoca privilegios de tabla en `profiles`. La seguridad descansa por completo en RLS + trigger. TRUNCATE y TRIGGER no son alcanzables vía PostgREST; son informativos.

Funciones que escriben `profiles` y son ejecutables por el cliente:

| función | DEFINER | `authenticated` | `anon` | efecto en A |
| --- | --- | --- | --- | --- |
| `complete_user_onboarding` (053) | sí | sí | **no** | Solo `onboarding_completed` con org activa |
| `ensure_user_profile` (036) | sí | sí | sí (default) | Crea `operator` sin org; anon → `Not authenticated` |
| `finalize_user_onboarding` (016) | sí | sí | sí (default) | Solo marca onboarding si hay org |
| `handle_new_user` | sí | sí | sí | Función trigger, no invocable directamente |

# Insert attack

User X `authenticated`, **sin fila en `profiles`**, vía PostgREST:
`INSERT profiles (id = auth.uid(), organization_id, role, onboarding_completed = true, full_name)`.

| role | organization_id | A: repo limpio | B2: intención de las policies | C/E: drift hosted (con o sin 053) |
| --- | --- | --- | --- | --- |
| admin | victim | **NEUTRALIZED** → `{org: null, role: operator, onboarding: true}` | igual | **ALLOWED** ← admin de la org víctima |
| admin | null | NEUTRALIZED → operator | igual | **ALLOWED** (admin sin org) |
| admin | inexistente | NEUTRALIZED → operator | igual | DENIED (FK) |
| quality_manager | victim | NEUTRALIZED → operator | igual | **ALLOWED** |
| quality_manager | null | NEUTRALIZED → operator | igual | **ALLOWED** |
| quality_manager | inexistente | NEUTRALIZED → operator | igual | DENIED (FK) |
| operator | victim | NEUTRALIZED → org null | igual | **ALLOWED** (miembro de la víctima) |
| operator | null | ALLOWED (benigno) | igual | ALLOWED (benigno) |
| operator | inexistente | NEUTRALIZED → org null | igual | DENIED (FK) |

Otros casos:

| intento | A | C/E |
| --- | --- | --- |
| INSERT con `id` de **otro** usuario (`admin`, victim) | NEUTRALIZED: `id` reescrito a `auth.uid()`; el target no recibe fila | DENIED (RLS `id = auth.uid()`) |
| UPSERT (`ON CONFLICT DO UPDATE`) sobre perfil propio existente → admin / org B | DENIED (recursión) | DENIED (recursión) |
| DELETE del propio perfil para re-insertarlo | DENIED (0 filas, sin policy DELETE) | DENIED |
| `anon` INSERT admin victim | DENIED (RLS) | DENIED |
| Signup GoTrue con `raw_user_meta_data.role = admin` | **El signup falla** (ver F-1) | Perfil creado con **`role = admin`**, org null (metadata respetada) |

**Residual en A (R-2, LOW):** el INSERT conserva `onboarding_completed = true`. Ni el trigger ni la policy lo restringen. Un usuario sin perfil puede crearse `operator`, sin org, con onboarding completado y saltarse el redirect `/onboarding → /acceso-pendiente`. No obtiene datos, porque todo el RLS de negocio filtra por `current_organization_id()`, que es NULL.

**Precondición "sin profile" en hosted:** con `handle_new_user` de 016 activo, cada signup crea la fila en la misma transacción, así que el atacante no puede ganar la carrera, y DELETE/UPSERT están bloqueados. El INSERT con org víctima solo es alcanzable si:
- el trigger `on_auth_user_created` no existe o falla en hosted; o
- existen usuarios de Auth previos sin perfil.

La existencia de los fallbacks `ensureUserProfile` / `ensureProfileWithAdmin` ("Recuperar perfil si el trigger falló", 016 §2) indica que esto ya ocurrió históricamente. El atacante necesita además el UUID de la org víctima, que no es un secreto: aparece en rutas de storage, en exports y en payloads de la API.

# Update attack

Usuario existente modificando **su propio** perfil.

| actor | cambio | A: repo limpio | B2: intención (sin recursión) | B: trigger solo | C/E: drift |
| --- | --- | --- | --- | --- | --- |
| operator Org A | role → admin | DENIED (recursión) | DENIED (`cannot change own role`) | DENIED (trigger) | DENIED (recursión)¹ |
| operator Org A | role → quality_manager | DENIED | DENIED (trigger) | DENIED | DENIED¹ |
| operator Org A | organization_id → Org B | DENIED | DENIED (`organization_id is immutable`) | DENIED | DENIED (recursión) |
| operator Org A | organization_id → NULL | DENIED | DENIED (immutable) | DENIED | DENIED |
| operator Org A | onboarding false → true | DENIED | DENIED (RLS) | **ALLOWED** | DENIED |
| admin Org A | organization_id → Org B | DENIED | DENIED (immutable) | DENIED | DENIED |
| admin Org A | role → operator | DENIED | DENIED (trigger) | DENIED | DENIED |
| quality_manager Org A | role → admin | DENIED | DENIED (trigger) | DENIED | DENIED¹ |
| quality_manager Org A | organization_id → Org B | DENIED | DENIED (immutable) | DENIED | DENIED |
| operator **sin org** | organization_id → victim | DENIED | DENIED (RLS) | **ALLOWED** | DENIED |
| operator sin org | role → admin | DENIED | DENIED (trigger) | DENIED | DENIED |
| **admin sin org** (SP-04) | organization_id → victim | DENIED | DENIED (RLS) | **ALLOWED** | DENIED |
| admin sin org (SP-04) | organization_id → victim + role admin | DENIED | DENIED (RLS) | **ALLOWED** | DENIED |

¹ En C/E la policy de 016 **no fija `role`** y no hay trigger. `operator → admin` está bloqueado **solo** por el error de recursión. Si en hosted alguien "arregló" la recursión a mano, o la policy viva difiere, el ataque sería posible. Esto es NOT VERIFIED.

**Hallazgo latente (R-3, MEDIUM como defensa en profundidad):** `protect_profile_identity` solo hace inmutable `organization_id` cuando `OLD.organization_id IS NOT NULL`. Además, la excepción "fundador" permite `NULL → X` con `role = admin`. El escenario B lo demuestra: un perfil sin org, sea `operator` o un `admin` creado por `ensureProfileWithAdmin` (SP-04), puede asignarse **cualquier** org existente.

En el repo limpio, el único control que lo impide es la WITH CHECK de `users_update_own_profile`. Ese control es correcto en intención (B2) pero hoy funciona porque aborta por recursión. La excepción fundador existía solo para el `complete_user_onboarding` de 036; desde 053 ya no tiene uso legítimo.

# Cross-user attack

Misma organización (Org A). Resultados A / B2:

| actor | acción sobre User B (operator, Org A) | A | B2 |
| --- | --- | --- | --- |
| operator | SELECT | VISIBLE (`users_read_teammates`, esperado) | VISIBLE |
| operator | UPDATE role / org / full_name | DENIED (recursión) | DENIED (0 filas, USING) |
| quality_manager | SELECT | VISIBLE | VISIBLE |
| quality_manager | UPDATE role / org / full_name | DENIED | DENIED (0 filas) |
| admin | SELECT | VISIBLE | VISIBLE |
| admin | UPDATE role → admin | DENIED (recursión) | ALLOWED: **flujo legítimo** de gestión de equipo, limitado al tenant |
| admin | UPDATE organization_id → otra org | DENIED | DENIED (immutable) |
| cualquiera | DELETE | DENIED (0 filas) | DENIED |

# Cross-tenant attack

Actor en Org A, User B en Org B:

| actor | acción | A | B2 | C |
| --- | --- | --- | --- | --- |
| operator | SELECT B | NOT VISIBLE | NOT VISIBLE | NOT VISIBLE |
| operator | UPDATE role / org / full_name | DENIED | DENIED (0 filas) | DENIED |
| admin | SELECT B | NOT VISIBLE | NOT VISIBLE | NOT VISIBLE |
| admin | UPDATE role / org / full_name | DENIED | DENIED (0 filas) | DENIED |
| cualquiera | DELETE B | DENIED | DENIED | DENIED |

El vector cross-tenant real no es modificar perfiles ajenos: es **auto-asignarse** el `organization_id` de otro tenant.
- Por INSERT: solo en drift.
- Por UPDATE desde un perfil sin org: latente, ver R-3.

# Interaction with 053

053 cubre:
- `complete_user_onboarding` ya no crea organizaciones ni toca `role`, `organization_id` ni `access_status`. Sin org → `organization_not_provisioned`. Confirmado en A y E.
- INSERT en `organizations` con un JWT distinto de `service_role` queda bloqueado (trigger + REVOKE + DROP policy).

053 **no** cubre:
- **Nada sobre `profiles`.** No toca policies, trigger ni grants de `profiles`.
- **INSERT de un perfil apuntando a una org existente.** En E (drift + 053), `INSERT profiles (org = victim, role = admin)` sigue **ALLOWED**. 053 impide crear un tenant nuevo, pero no impide unirse a uno existente.
- **`handle_new_user` con rol desde metadata** en el estado de drift (E: signup con metadata `admin` → perfil `admin`).
- **El UPDATE desde un perfil sin org** (R-3).

En resumen: SP-01 no resuelve SP-03. En un hosted con drift, 053 desplaza el ataque de "crear un tenant" a "unirse como admin a un tenant ajeno", siempre que exista la precondición sin perfil.

# Clean database result

Modelo de identidad esperado frente a la realidad del repo limpio (A + B2):

| actor | ¿puede cambiar `role`? | ¿puede cambiar `organization_id`? | Esperado | Real (A) |
| --- | --- | --- | --- | --- |
| Usuario nuevo / sin perfil | No (INSERT → operator) | No (INSERT → NULL) | Nunca | ✅ cumple |
| operator / quality_manager (propio) | No | No | Nunca | ✅ cumple (recursión + trigger) |
| org admin (propio) | No | No | Nunca | ✅ cumple |
| org admin (otros, mismo tenant) | Sí, por diseño (`profiles_admin_update_team`) | No | Solo flujo admin, limitado al tenant | ✅ intención correcta; hoy roto por recursión, y la app usa `service_role` tras checks propios |
| org admin (otro tenant) | No | No | Nunca | ✅ cumple |
| service_role / platform admin | Sí | Sí | Provisioning explícito | ✅ (trigger y RLS hacen bypass) |

**Resultado: CODE/EXPECTED DB STATE = SAFE** para la escalada que se pregunta. Residuales y hallazgos colaterales (no son escalada explotable en A):

- **R-1:** las policies UPDATE de `profiles` son recursivas. Todo UPDATE `authenticated` falla. Es un problema funcional y, hoy, un control accidental.
- **R-2 (LOW):** INSERT con `onboarding_completed = true` no se neutraliza.
- **R-3 (latente):** el trigger permite `organization_id NULL → X`, y la excepción fundador ya no tiene uso.
- **F-1 (funcional, alto impacto operativo):** en el estado 036, **la creación de usuarios de Auth falla**.
  - **Causa:** GoTrue inserta en `auth.users` como `supabase_auth_admin`, sin claims. Por eso `auth.role()` es NULL y `protect_profile_identity` entra en la rama no-`service_role`. Ahí asigna `NEW.id := auth.uid()`, que vale NULL, y el INSERT de `handle_new_user` viola NOT NULL.
  - **Alcance:** afecta al signup, a `auth.admin.createUser` (`provisionClient`, invitaciones) y a `inviteUserByEmail`.
  - **Evidencia:** escenario A, `SIGNUP FAILS: null value in column "id"`.
  - **Implicación:** si el hosted tuviera 036, la provisión estaría rota. Es coherente con que el hosted **no** tenga 036. Hay que verificarlo live antes de llevar 036 a hosted.
- **Default grants:** `ensure_user_profile` y `finalize_user_onboarding` son ejecutables por `anon`. Es inocuo (requieren `auth.uid()`), pero innecesario.

# Hosted drift risk

**A. ¿El repositorio limpio es vulnerable?** No (ver la sección anterior).

**B. ¿El hosted podría estar vulnerable por drift?** Sí, y no se puede verificar porque staging está INACTIVE.

Hechos previos (de `HACCP_RBAC_LIVE_AUDIT.md` y del audit de signup): en hosted faltaban `current_user_role` y `rbac_quality`. 050 restauró solo esos helpers, sin la identidad de 036. Si el hosted es "todo menos 036/041" (escenarios C y E):

| vector | C/E |
| --- | --- |
| Usuario sin perfil → INSERT `role = admin`, org víctima | **ALLOWED**: takeover de tenant |
| Signup con `raw_user_meta_data.role = 'admin'` | Perfil `admin` (sin org) |
| `ensure_user_profile()` | Crea `admin` (016) |
| operator → admin (UPDATE propio) | DENIED **solo por recursión**; la policy 016 no fija `role` |
| Org A → Org B (UPDATE) | DENIED (recursión / WITH CHECK) |
| `complete_user_onboarding` sin org | C: crea org + admin (SP-01). E: DENIED (053) |

Incógnitas que deciden la explotabilidad real en hosted:
1. Si existe `protect_profile_identity`.
2. La definición viva de `users_insert_own_profile` y `users_update_own_profile`, y si alguien las editó a mano.
3. La versión viva de `handle_new_user` y si el trigger `on_auth_user_created` existe.
4. Si hay usuarios de Auth **sin** fila en `profiles`, y si hay perfiles `admin` sin org.
5. Si signup y anonymous sign-ins están habilitados.

# Recommended remediation

No implementado. Para una migración incremental **posterior a la verificación hosted**, sin re-ejecutar 036 ni 041:

1. **Policies de `profiles` sin recursión, con la misma semántica que 036** (patrón B2): leer `role`, `organization_id` y `onboarding_completed` actuales vía helpers `SECURITY DEFINER STABLE`, o eliminar `users_update_own_profile` si ningún flujo de usuario necesita UPDATE. Hoy ninguno lo necesita: la app escribe con `service_role`.
2. **`users_insert_own_profile`** con `organization_id IS NULL AND role = 'operator' AND onboarding_completed IS NOT TRUE`. Alternativa más estricta: `REVOKE INSERT ON profiles FROM authenticated, anon` y eliminar el fallback cliente de `lib/auth/session.ts` (toca SP-04).
3. **`protect_profile_identity`**:
   - para no-`service_role`, prohibir **todo** cambio de `organization_id`, incluido `NULL → X`;
   - eliminar la excepción fundador;
   - en INSERT, forzar `onboarding_completed = false`;
   - tratar como confiable solo el contexto sin JWT de `supabase_auth_admin` / owner (por ejemplo, `auth.role() IS NULL AND current_user IN (...)`), para no romper GoTrue (F-1).
4. **`handle_new_user`** y **`ensure_user_profile`** de 036: ignorar metadata y usar `operator` (repone SP-03 §3 si falta en hosted).
5. **Grants:** `REVOKE TRUNCATE, TRIGGER, REFERENCES ON profiles FROM anon, authenticated`; `REVOKE ALL ON public.profiles FROM anon`; `REVOKE EXECUTE` de `ensure_user_profile` y `finalize_user_onboarding` para `anon`.
6. **Datos:** auditar y corregir usuarios de Auth sin perfil y perfiles `admin` sin org (SP-04) antes de abrir signup.
7. **Test permanente:** convertir el harness en una suite (`test:profile-identity`) que aplique la cadena y ejecute los casos A y B2. Debe incluir un test GoTrue que detecte F-1.

# Live verification plan

Cuando se autorice reactivar staging. Todo es de solo lectura o termina en `ROLLBACK`.

**1. Catálogo**

```sql
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' ORDER BY cmd, policyname;

SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid IN ('public.profiles'::regclass, 'auth.users'::regclass) AND NOT tgisinternal;

SELECT proname, prosecdef, md5(prosrc), prosrc ~ 'raw_user_meta_data->>''role''' AS meta_role,
       prosrc ~ '''admin''' AS literal_admin
FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('handle_new_user','ensure_user_profile','protect_profile_identity',
                  'complete_user_onboarding','finalize_user_onboarding');

SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass;

SELECT grantee, string_agg(privilege_type, ',') FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles' GROUP BY grantee;
```

**2. Exposición (precondiciones)**

```sql
SELECT count(*) AS auth_users_without_profile
FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;

SELECT count(*) AS orgless_admins FROM public.profiles WHERE organization_id IS NULL AND role = 'admin';

SELECT role, count(*) FROM public.profiles GROUP BY role;
```

**3. Probe INSERT** (transacción, `ROLLBACK`; no requiere superuser)

```sql
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES ('00000000-0000-4000-8000-000000005903'::uuid, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'sp03-probe@invalid.test');
-- Si 036 está activa el INSERT anterior puede fallar (F-1): registrar el error y continuar en otra transacción.
DELETE FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000005903';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000005903","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.profiles (id, full_name, organization_id, role, onboarding_completed)
VALUES (auth.uid(), 'probe', (SELECT id FROM public.organizations LIMIT 1), 'admin', true)
RETURNING organization_id, role, onboarding_completed;   -- esperado seguro: NULL, operator / o error RLS
RESET ROLE;
ROLLBACK;
```

(UUID fijo de probe; verificar antes que no exista en `auth.users`.)

**4. Probe UPDATE** (`ROLLBACK`): con `request.jwt.claims` de un operator real, ejecutar `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()` y `SET organization_id = '<otra org>'`. Registrar si da recursión, error de trigger, error de RLS o se aplica.

**5. GoTrue / F-1:** en el entorno local de la CLI (no hosted), aplicar 036 y crear un usuario con `auth.admin.createUser`, para confirmar o descartar el fallo de `handle_new_user`.

**6. Auth config:** `GET /auth/v1/settings` → `disable_signup`, `external.anonymous_users`.

---

SP-03 CLEAN DATABASE: NOT EXPLOITABLE

SP-03 HOSTED: NOT VERIFIED

NEW USER → ADMIN: NOT POSSIBLE

OPERATOR → ADMIN: NOT POSSIBLE

ORG A → ORG B: NOT POSSIBLE

**RECOMMENDATION: VERIFY HOSTED FIRST**

> Los tres "NOT POSSIBLE" describen el estado esperado del repo (001→053), verificado ejecutando la cadena completa en Postgres.
>
> En el modelo de drift hosted (sin 036/041), **NEW USER → ADMIN de un tenant existente es POSSIBLE** cuando el usuario de Auth no tiene fila en `profiles`. **OPERATOR → ADMIN** queda bloqueado solo por el error de recursión de la policy. Ninguno de los dos está verificado contra el hosted real.
>
> No se debe escribir una migración compensatoria hasta leer el catálogo hosted (plan §1–2). Hay que tener en cuenta F-1 antes de reponer `protect_profile_identity` en hosted.

---

# Live verification result (staging `fbunktfkihythsclhgnw`, probes con ROLLBACK, 0 residuo)

Hosted coincide con el drift sin 036/041: no hay `protect_profile_identity` ni `profiles_role_check`, el default de `role` es `'admin'`, `handle_new_user` toma `role` de la metadata y `ensure_user_profile` crea `'admin'`.

- **NEW USER → ADMIN: ALLOWED.** Un usuario sin fila en `profiles` puede insertarse como admin, quality_manager u operator en una org ajena, y además con onboarding completado.
- **OPERATOR → ADMIN** y **ORG A → ORG B: DENIED**, pero solo porque las policies UPDATE fallan con recursión (42P17). Esa misma recursión rompe también el UPDATE legítimo de `full_name`.
- **F-1:** GoTrue crea `auth.users` sin JWT. En ese contexto, un trigger que haga `NEW.id := auth.uid()` (como el de 036) deja `id = NULL` y rompe el alta. Por eso 036 no se puede aplicar entera.

# FIX — `054_harden_profile_identity.sql` (no aplicada en hosted)

Es autosuficiente: no depende de 036 y es idempotente. No modifica migraciones históricas.

- **Trigger `protect_profile_identity`** (BEFORE INSERT/UPDATE, `SECURITY DEFINER`, `search_path = public`):
  - Contexto confiable (`auth.role()` NULL, es decir GoTrue, postgres o migraciones; o `service_role`): no se toca NEW. Así se evita F-1.
  - JWT de usuario, INSERT: se fuerza `id = auth.uid()`, `organization_id = NULL`, `role = 'operator'` y `onboarding_completed = false`. Se neutraliza en lugar de rechazar para que siga funcionando el fallback de `lib/auth/session.ts`.
  - JWT de usuario, UPDATE: cambiar `role` u `organization_id` da error 42501. `onboarding_completed` solo puede pasar a `true`, porque lo necesitan los RPC de 053 y 016.
- **`handle_new_user`**: crea siempre `operator`, sin org y con onboarding en false. Ignora `role`, `organization_id` y onboarding de la metadata.
- **`ensure_user_profile`**: crea siempre `operator` sin org.
- **Default y constraint**: default `role = 'operator'` y `profiles_role_check`. La migración aborta si hay roles fuera del set permitido.
- **RLS INSERT**: `id = auth.uid() AND organization_id IS NULL AND role = 'operator' AND onboarding_completed IS NOT TRUE`.
- **RLS UPDATE**: queda solo `users_update_own_profile` con `id = auth.uid()`, sin subconsultas a `profiles`. Se elimina `profiles_admin_update_team`; los cambios de rol de miembros siguen por service_role (`lib/team/members.ts`).
- **Grants**:
  - `anon` pierde INSERT, UPDATE y DELETE sobre `profiles`; `authenticated` pierde DELETE y TRUNCATE.
  - `handle_new_user` deja de ser ejecutable por PUBLIC, `anon` y `authenticated`.
  - `ensure_user_profile` y `finalize_user_onboarding` solo los ejecuta `authenticated`.
- **Tests**: `scripts/verify-profile-identity.mjs` (59 tests, en `npm test`). Corre sobre PGlite en dos escenarios: repo 001→054 y hosted drift + 053 + 054.
- **Control negativo**: el drift sin 054 reproduce el resultado live (INSERT admin + org ajena aceptado, y recursión en UPDATE).

SP-03 CODE FIX: PASS

NEW USER → ADMIN: DENIED

OPERATOR → ADMIN: DENIED

ORG A → ORG B: DENIED

PROFILE UPDATE RECURSION: FIXED

GOTRUE USER CREATION: PASS

SERVICE_ROLE PROVISIONING: PASS

> Pendiente: aplicar 054 en staging (después de 053) con autorización, y repetir los probes live. La revisión SP-04 del código Next.js sigue abierta.
