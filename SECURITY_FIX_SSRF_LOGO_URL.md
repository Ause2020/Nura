# Root cause

`organizations.logo_url` era `TEXT` libre. `PATCH /api/settings/organization` hacía `String(body.logo_url)` y RLS permitía al admin de org persistirlo. `/api/export/audit-pdf/[id]` pasaba ese string a `@react-pdf/renderer` `<Image src>`. En Node, `@react-pdf/image` hace `fetch(src.uri)` (sigue redirects, sin allowlist). SSRF confirmado en `SECURITY_AUDIT_SSRF_LOGO_URL.md`.

# Attack chain

1. Admin JWT: `PATCH { "logo_url": "http://169.254.169.254/…" }` o UPDATE PostgREST.
2. Valor queda en `organizations.logo_url`.
3. Admin o QM con `audits.read` llama `GET /api/export/audit-pdf/{id}`.
4. `renderToBuffer` → `<Image src={logo_url}>` → `fetch` servidor.

# Fix implemented

Columna sigue `TEXT` (menor regresión). El valor **persistido** válido es solo un object path del bucket `logos`:

`{organization_id}/logo-….png`

- Helper: `lib/storage/org-logo.ts`
- Write API normaliza URL pública de **este** proyecto → path; rechaza el resto (400).
- Migración **052** `protect_org_logo_url`: trigger INSERT/UPDATE; URLs/`file:`/`data:` rechazadas. UPDATE de otras columnas no reescribe legacy.
- PDF: parsea path → `supabase.storage.from("logos").download(path)` → magia PNG/JPEG + tope 2 MB → `<Image src={{ data, format }}>` (Buffer). **Nunca** una URL de usuario.
- Legacy inválido: PDF sin logo; warning `[nura:logo] skipped…` (sin el valor).
- Sidebar / settings / informe HTML: `resolveOrgLogoPublicUrl` (host = `NEXT_PUBLIC_SUPABASE_URL`). Valor C (externo) → se muestra sin logo.

**052 aplicada** en hosted **dev/staging** (`fbunktfkihythsclhgnw`). **No** en producción.

# Write validation

`normalizeOrgLogoForWrite` (`app/api/settings/organization/route.ts`):

- vacío → `null`
- path `{orgId}/{file}` con ext png/jpg/jpeg/webp/gif → se guarda
- URL `https://{ESTE_PROYECTO}/storage/v1/object/(public|sign|authenticated)/logos/{orgId}/{file}` → se guarda el path
- cualquier otra cosa → 400 `Logo inválido`

Origen comparado por protocol + hostname + port. Rechaza userinfo, `file:`, `data:`, IPs/hosts ajenos, otro proyecto Supabase, path `/logos/` en host externo, `..`, org distinta.

Trigger 052: mismo contrato en DB (path only, primer segmento = `organizations.id`). PostgREST no puede persistir `http://127.0.0.1/…`.

# PDF protection

`loadOrgLogoImageBytes` + `storage.download(objectPath)`:

- Si `parseOrgLogoObjectPath` es null → no download, PDF sin logo
- Download solo contra el cliente Supabase (base URL de entorno), path ya validado
- Tamaño ≤ `LOGO_MAX_BYTES` (2 MB)
- Magia PNG (`89 50 4E 47…`) o JPEG (`FF D8 FF`); no se confía en Content-Type
- webp/gif de Storage: UI sí, PDF omite logo
- Si `renderToBuffer` falla con logo, reintenta sin logo

# Legacy behavior

| Clase | Ejemplo | Write nuevo | PDF | UI |
| --- | --- | --- | --- | --- |
| A | URL de este proyecto `/object/public/logos/{org}/…` o path | se normaliza a path | download Storage | public URL |
| B | `null` | `null` | sin logo | sin logo |
| C | localhost, IMDS, evil.com, otro proyecto, `file:`, `data:` | 400 / trigger | sin fetch | sin logo |

No hay backfill que haga fetch. URLs A existentes se parsean en read; al próximo PATCH de logo se persiste el path.

# Tests

`scripts/verify-ssrf-logo-url.mjs` (`npm run test:ssrf-logo`):

Rechaza / no llama download:

`http://127.0.0.1:8080/logo.png`, `http://localhost/logo.png`, `http://169.254.169.254/latest/meta-data/`, `http://10.0.0.1/logo.png`, `file:///etc/passwd`, `data:image/png;base64,…`, `https://evil.example/logo.png`, otro `*.supabase.co`, URL con path `/logos/` en host externo.

Permite: path/URL de este proyecto; `null`.

# Regression

| Check | Resultado |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass (warnings previos) |
| `npm test` | 165 (157 pass, 8 skip, 0 fail) |
| `test:rbac` | pass |
| `test:haccp-rbac-drift` | pass |
| `test:rbac-generator-grants` | pass |
| `npm run build` | pass |

047–051, RLS HACCP y tenant isolation no se editaron.

# Remaining risk

- El bucket `logos` sigue **público** (P3-04): enumeración de branding, no SSRF.
- webp/gif válidos en UI no se incrustan en PDF (react-pdf solo png/jpeg).
- Filas C legacy siguen en DB hasta que un admin suba un logo nuevo; el servidor ya no las fetchea.
- Sidebar usa `next/image` `unoptimized` solo con URL ya resuelta de este proyecto.

# Live verification

Staging (`fbunktfkihythsclhgnw`):

1. Aplicada `052_protect_org_logo_url.sql` (Management API, no `db push`).
2. `verify_org_logo_url.sql`: trigger presente.
3. Probe: `UPDATE logo_url = 'http://127.0.0.1/x.png'` → excepción `organization logo_url must be a logos object path`. Transacción sin persistir.

**Producción:** no aplicar aún. Cuando toque:

```text
1. Pegar supabase/migrations/052_protect_org_logo_url.sql en SQL Editor (o db query --linked).
2. Ejecutar supabase/verify_org_logo_url.sql
3. Como admin: PATCH /api/settings/organization { "logo_url": "http://127.0.0.1/x.png" } → 400
4. PostgREST UPDATE organizations.logo_url a URL externa → error 22023
5. Subir logo png/jpeg en /configuracion/empresa → sidebar + informe HTML + PDF con logo
6. Org sin logo → PDF 200 sin logo
7. No usar db push (aplicaría 036/041 completas)
```

# Respuestas

1. **¿Puede un admin persistir una URL arbitraria como logo?** **No.** API 400 + trigger 052.
2. **¿Puede react-pdf recibir una URL arbitraria desde DB?** **No.** Solo `{ data, format }` o nada.
3. **¿Puede el PDF hacer fetch a localhost/private IP/file:// mediante logo_url?** **No.** Sin path de `logos` no hay download; download no usa la URL del usuario.
4. **¿Un logo legacy malicioso rompe la generación del PDF?** **No.** Se omite el logo.
5. **¿Los logos normales de Supabase Storage siguen funcionando?** **Sí** (png/jpeg en PDF; webp/gif en UI).
6. **¿Cambió RLS/RBAC/tenant isolation?** **No.**

**SSRF via logo_url = FIXED**
