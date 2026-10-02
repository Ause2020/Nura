# SEC-P2-07 — SSRF via `organizations.logo_url`

Auditoría de código únicamente. Sin cambios, sin migraciones, sin apply.

**SSRF via logo_url: CONFIRMED**

Un admin de organización puede persistir una URL absoluta arbitraria en `organizations.logo_url`. Esa cadena se pasa sin sanitizar a `@react-pdf/renderer` `<Image src>` en el route handler Node de PDF. `@react-pdf/image` hace `fetch(src.uri)` en el servidor y volca el body a un `Buffer` **antes** de validar que sea PNG/JPEG. No hay allowlist, ni bloqueo de IPs privadas, ni tope de tamaño, ni chequeo de Content-Type en este camino.

---

# Data flow

```
[admin JWT]
    │
    ├─ UI: upload bucket `logos` → getPublicUrl → PATCH logo_url
    │      components/settings/company-settings-form.tsx
    │
    └─ API / PostgREST: PATCH logo_url = String(cualquier cosa)
           app/api/settings/organization/route.ts
           RLS admins_update_own_organization
                 │
                 ▼
        organizations.logo_url  (TEXT, sin CHECK)
                 │
    ┌────────────┼──────────────────────────────────────────┐
    │            │                                          │
    ▼            ▼                                          ▼
 Sidebar      Informe HTML (cliente)              PDF (servidor)
 next/image    next/image unoptimized             renderToBuffer
 unoptimized   (navegador GET src)                <Image src={logo_url}>
 (navegador)                                      fetch() en Node
```

No hay server actions. No hay `axios`. Emails (`lib/email/send.ts`) no interpolan el logo. El export JSON (`/api/settings/export`) serializa filas; no descarga la URL.

---

# Write path

## Quién puede modificar `logo_url`

| Camino | Actor | Evidencia |
| --- | --- | --- |
| `PATCH /api/settings/organization` | Solo **admin de org** (`PERMISSIONS.settings.manage`) | `app/api/settings/organization/route.ts` 7–10, 36–38. QM y operator no tienen `settings.manage` (`lib/auth/permissions.ts` 60–74). |
| PostgREST `UPDATE organizations` | **admin** de la misma org | `admins_update_own_organization`: 010/016 `role = 'admin'`; 041 `rbac_admin()`. |
| UI `/configuracion/empresa` | Admin (ruta `/configuracion` es `ADMIN_ONLY` para operator; QM **ve** la página pero el PATCH 403) | `lib/team/permissions.ts` 21–28; `app/(dashboard)/configuracion/empresa/page.tsx`. |
| Storage upload `logos` | Admin, path `{orgId}/…` | 010 policies `logos_insert/update/delete`. |

047 (`protect_org_access_fields`) **permite** explícitamente que un JWT authenticated cambie `logo_url`. Solo bloquea `access_status` / fechas / `contract_notes` / `provisioned_by`.

`service_role` / platform admin pueden escribir cualquier columna; fuera del modelo de amenaza de un usuario de org.

## ¿URL absoluta arbitraria?

**Sí.** El API hace:

```36:38:app/api/settings/organization/route.ts
    if (body.logo_url !== undefined) {
      patch.logo_url = body.logo_url ? String(body.logo_url) : null;
    }
```

No hay `new URL()`, esquema, host, IP, allowlist, ni coincidencia con el bucket `logos`. `http://169.254.169.254/`, `http://127.0.0.1:3000/…`, `http://10.0.0.1/`, `file:///…`, data URI o un 302 público caben en la columna `TEXT` (`001_auth_onboarding.sql` 16; `types/database.ts` 276).

La UI feliz solo escribe `supabase.storage.from("logos").getPublicUrl(path)` (`company-settings-form.tsx` 86–93). Eso **no** es un control: el write efectivo es el PATCH / PostgREST.

## Validación actual

| Control | ¿Existe? | Dónde |
| --- | --- | --- |
| Tamaño 2 MB | Solo **upload** de archivo en cliente | `LOGO_MAX_BYTES` + `file.size` en `company-settings-form.tsx` 75–77; bucket 010 `file_size_limit` 2097152 |
| MIME jpeg/png/webp/gif | Solo **upload** al bucket | `LOGO_ACCEPT`; 010 `allowed_mime_types` |
| Validación de `logo_url` | **No** | API `String()` |
| Allowlist de host / Storage | **No** en write | `extractStoragePath` existe en `lib/storage/paths.ts` para buckets **privados**; no se usa en settings ni PDF |
| Bloqueo RFC1918 / metadata / localhost | **No** | — |
| Content-Type / tamaño del GET remoto | **No** en app | react-pdf descarga el body entero y **después** exige magia PNG/JPEG |

---

# Read/render paths

| Superficie | Runtime | Cómo se consume `logo_url` | ¿Fetch servidor? |
| --- | --- | --- | --- |
| Sidebar | Cliente | `getSessionOrganizationBrand` → `next/image` `unoptimized` | No. El browser hace GET a `src`. |
| Settings preview | Cliente | `company-settings-form.tsx` 123–129, `unoptimized` | No |
| Informe HTML `/auditorias/[id]/informe` | Cliente | RSC lee `logo_url` y lo pasa a `AuditReport`; `next/image` `unoptimized` 304–310 | No (RSC no descarga la imagen) |
| **PDF** `GET /api/export/audit-pdf/[id]` | **Node** `runtime = "nodejs"` | Lee `logo_url`, `renderToBuffer(<AuditPdfDocument organizationLogoUrl={…} />)` | **Sí** |
| Excel del informe | Cliente | `lib/export/excel` — tablas, sin logo | No |
| Emails | Servidor | `fetch("https://api.resend.com/emails")` fijo; HTML sin logo | No vía `logo_url` |
| `/api/settings/export` | Servidor | JSON dump | No descarga la URL |

`next.config.mjs` no define `images.remotePatterns`. Con `unoptimized`, Next **no** usa `/_next/image` (el optimizer de Next también sería SSRF si `unoptimized` se quitara y se permitiera cualquier host). Hoy el único fetch servidor del logo es react-pdf.

Quién dispara el PDF: `requirePermission(PERMISSIONS.audits.read)` — **admin y quality_manager**. Operator no. El escritor (admin) y el trigger (admin o QM de la misma org) pueden ser la misma persona.

---

# Server-side fetch points

Único punto material:

1. `app/api/export/audit-pdf/[id]/route.tsx`
   - 11–12: `export const runtime = "nodejs"`
   - 60–63: `organizations.select("name, logo_url")`
   - 74–79: `organizationLogoUrl: org?.logo_url ?? null`
   - 85: `await renderToBuffer(element)`

2. `lib/export/audit-pdf-document.tsx`
   - Comentario L2–3: “Only used server-side (API route). Never import in client components.”
   - 325–326: `{organizationLogoUrl && (<Image src={organizationLogoUrl} style={s.logo} />)}`
   - `Image` es de `@react-pdf/renderer`, no `next/image`.

3. `@react-pdf/image` (`fetchRemoteFile` / `resolveImageFromUrl`), dependencia de `@react-pdf/renderer` ^4.5.1:

```js
const fetchRemoteFile = async (src) => {
  const response = await fetch(src.uri, { method, headers, body, credentials });
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
};

const resolveImageFromUrl = async (src) => {
  const data = getAbsoluteLocalPath(src.uri)
    ? await fetchLocalFile(src)   // fs.readFile para file: / path local
    : await fetchRemoteFile(src);
  const format = getImageFormat(data); // PNG/JPEG magic; si falla, el GET ya ocurrió
  return getImage(data, format);
};
```

`fetch()` nativo de Node sigue redirects (por defecto hasta 20). No filtra IPs. No limita tamaño. El chequeo de formato es **post-download**.

No hay otros `renderToBuffer` / `toBlob` / `pdf(` en el repo.

---

# Exploitability

Prerrequisito: JWT **admin** de una org **active** (gate 048). Luego cualquier JWT con `audits.read` de esa org genera el PDF de una auditoría existente.

Pasos (no ejecutados en esta auditoría):

1. `PATCH /api/settings/organization` `{ "logo_url": "http://127.0.0.1:8090/" }`  
   o `UPDATE organizations SET logo_url = 'http://169.254.169.254/latest/meta-data/'`.
2. Completar (o usar) una auditoría `completed`.
3. `GET /api/export/audit-pdf/{id}` con cookie/JWT admin o QM.

Efecto: el proceso Node del API hace GET a esa URL. Si la respuesta es PNG/JPEG, el body puede **incrustarse en el PDF** (exfiltración). Si no lo es, `getImageFormat` lanza y el API falla, pero el request interno ya salió (SSRF ciego). Timing/errores pueden filtrar reachability.

## ¿Puede apuntarse a…?

| Destino | ¿El código lo impide? | Notas de hosting |
| --- | --- | --- |
| `localhost` / `127.0.0.1` / `::1` | No | En serverless, el loopback es la propia función / sidecars. En self-host, servicios locales. |
| `169.254.169.254` (IMDS) | No | En **Vercel** suele ser inalcanzable (no es IMDS AWS clásico). En VM/AWS self-host, sí. |
| RFC1918 (`10/8`, `172.16/12`, `192.168/16`) | No | Depende de la red del runtime. |
| Link-local / IPv6 ULA | No | Igual. |
| Dominios internos (`*.internal`, DNS corporativo) | No | Si el resolver del host los ve. |
| `file://` o path local | No | `getAbsoluteLocalPath` + `fs.readFile` — LFI acotado al FS del runtime, no al tenant DB. |

El impacto **cross-tenant HACCP** es nulo: no se lee otra org. El impacto es **SSRF del servidor de aplicación** (y posible LFI de `file://`).

Confianza: **alta** (código). No se disparó un PDF contra un listener interno en esta pasada.

---

# Bypass analysis

No hay allowlist que bypassear hoy: el valor crudo llega a `fetch`.

Si se añadiera un filtro débil, los bypass clásicos aplicarían:

| Mitigación incompleta | Bypass |
| --- | --- |
| `startsWith("https://")` | Redirect 302 → `http://127.0.0.1`; DNS rebinding; IPv6 `[::1]`; decimal/hex IP |
| Allowlist del host de Storage | Open redirect en el mismo host; `userinfo@host`; path ` /storage/v1/object/public/logos@evil` |
| Bloqueo de `169.254.169.254` literal | DNS a esa IP; `169.254.169.254.nip.io`; IPv6 IMDS |
| Validar Content-Type del upload | Irrelevante: el GET remoto no usa el bucket |
| Confiar en `unoptimized` del sidebar | El PDF no usa Next Image |

`fetch` de Node **sigue redirects** → un logo “https público” que 302 a IMDS/RFC1918 sigue siendo SSRF aunque se allowlistee el primer hop sin resolver el destino final.

---

# Impact

- **Confidencialidad:** lectura de HTTP interno alcanzable desde el runtime (metadata cloud, admin panels, Redis HTTP, APIs de Vercel/host). Si la respuesta es imagen, sale en el PDF del atacante.
- **Integridad / disponibilidad:** PDF puede fallar o crecer sin límite (DoS de memoria por body enorme). No altera RLS ni datos de otra org.
- **Privacidad menor (no SSRF):** sidebar/informe HTML hacen que **otros usuarios de la org** carguen `logo_url` en su navegador (pixel de tracking). Fuera de este P2.

Severidad alineada con PREPROD: **P2**. En Vercel el IMDS clásico suele fallar; el bug de aplicación (fetch user-controlled) está confirmado igual.

---

# Recommended remediation

1. **No persistir URLs abiertas.** Guardar object path del bucket `logos` (`{organization_id}/logo-…`) o rechazar cualquier `logo_url` que no sea URL pública de **ese** bucket en el proyecto (`extractStoragePath` + host de `NEXT_PUBLIC_SUPABASE_URL`).
2. En el PDF: resolver path → `getPublicUrl` / bytes vía cliente Storage; **no** pasar un string de usuario a `<Image src>`. Mejor: descargar con cliente Supabase (o `fetch` allowlisteado) y pasar `Buffer` a `<Image>`.
3. Denegar `file:`, `http` no Storage, IPs privadas, y seguir redirects solo si el **URL final** sigue en la allowlist (o `redirect: 'error'`).
4. Tope de bytes en el GET (p.ej. 2 MB, igual que el bucket).
5. RLS ya limita el UPDATE a admin; el API debe validar igual por si el cliente PostgREST escribe directo.

---

# Minimal fix options

**Opción A (mínima, API only):** en `PATCH` settings, aceptar `logo_url` solo si `extractStoragePath(value, "logos")` es no-null **y** el host es el del proyecto. En `audit-pdf` route, si `logo_url` no pasa el mismo predicado, renderizar sin logo. No toca schema.

**Opción B (preferida, poco más):** dejar de guardar URL absoluta. Columna sigue TEXT: path `orgId/logo-x.png`. Read paths (sidebar, settings, informe, PDF) resuelven con `getPublicUrl`. El PDF puede `download` el objeto y pasar Buffer (cero URL user-controlled a react-pdf).

**Opción C:** quitar `<Image>` del PDF hasta A/B. Cero SSRF; informes sin logo.

No hace falta migración de policies. Un backfill opcional de URLs actuales de Storage → path. URLs externas ya guardadas dejarían de mostrarse (hoy la UI no las crea).

---

# Regression risk

| Flujo | Si se restringe a Storage del proyecto |
| --- | --- |
| Upload logo en settings | Sigue igual (`getPublicUrl` ya es esa forma) |
| Sidebar / settings preview / informe HTML | Siguen si la URL/path es del bucket `logos` |
| PDF con logo jpeg/png de Storage | Sigue; webp/gif **ya** pueden fallar en react-pdf (solo png/jpg) |
| Logo apuntando a CDN / dominio propio vía API crudo | **Se rompe** (no hay UI; uso no soportado) |
| Org sin logo | Sin cambio |
| Tenant isolation / 047 / 048 / 050 / 051 | Sin cambio si no se tocan policies |

---

# Respuestas

1. **¿Quién puede modificar `logo_url`?** Admin de la organización (API settings + RLS UPDATE). QM/operator no. `service_role` sí.
2. **¿Puede contener una URL absoluta arbitraria?** Sí. `String(body.logo_url)` / UPDATE directo.
3. **¿Existe validación actual?** No sobre `logo_url`. Sí sobre el **archivo** subido al bucket (2 MB, MIME).
4. **¿El navegador consume la URL o el servidor?** Ambos. Sidebar e informe HTML: **navegador** (`next/image` `unoptimized`). PDF: **servidor**.
5. **¿Algún renderer/server descarga el contenido remoto?** Sí. `renderToBuffer` → `@react-pdf/image` `fetch(src.uri)`.
6. **¿Puede apuntarse a localhost / 127.0.0.1 / ::1 / 169.254.169.254 / RFC1918 / link-local / internos?** El código no lo impide. Alcance real = red del runtime (Vercel vs self-host).
7. **¿Redirects para bypass?** `fetch` sigue redirects. Hoy no hay primer filtro; con allowlist débil, el 302 es bypass.
8. **¿Content-Type / tamaño en el GET?** No. Magia PNG/JPEG **después** de bajar el body, sin límite de tamaño en app.
9. **¿Supabase Storage y path?** Sí. Bucket público `logos` (010; 035 no lo privatiza). Reemplazar `logo_url` por object path es el arreglo limpio; `lib/storage/paths.ts` ya parsea URLs de Storage (hoy no para `logos` en writers).
10. **¿Qué rompería restringir a URLs internas del proyecto?** Solo logos que no sean del bucket `logos` de este proyecto (API/manual). El flujo de producto (upload → public URL → sidebar/PDF) se mantiene.

---

# Conclusión

**SSRF via logo_url: CONFIRMED**

Evidencia:

- Write sin allowlist: `app/api/settings/organization/route.ts` 36–38
- Persistencia abierta: `organizations.logo_url` TEXT; 047 no la protege
- Paso al renderer: `app/api/export/audit-pdf/[id]/route.tsx` 60–85
- `Image src` user-controlled: `lib/export/audit-pdf-document.tsx` 325–326
- Fetch servidor: `@react-pdf/image` `fetchRemoteFile` → `fetch(src.uri)` + `arrayBuffer()` en Node (`runtime = "nodejs"`)

No es “likely”: la cadena write → store → `renderToBuffer` → `fetch` está en el código. La explotabilidad de IMDS depende del host; la de loopback/servicios locales es el caso típico de SSRF de aplicación.
