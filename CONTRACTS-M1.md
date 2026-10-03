# Contratos M1 fase 2 (A = identidad/OAuth, B = módulos/MCP, C = CLI)

Rutas relativas a `apps/gateway/`. Imports relativos (sin alias `@/`).

## Propiedad de archivos (nadie toca archivos de otro)
- **A:** `app/.well-known/**`, `app/oauth/**`, `app/google/**`, `app/login/**`, `app/device/**`, `app/connect/**`, `lib/auth/session.ts`, `lib/auth/oauth-server.ts`, `lib/auth/google-oauth.ts`, `lib/auth/clients.ts`.
- **B:** `lib/google-token.ts`, `lib/connection.ts`, `lib/modules/**` (incl. registry.ts), `lib/mcp-server.ts`, `app/mcp/**`, `app/api/**`, `app/dashboard/**`, `vercel.ts`.
- **C:** `packages/cli/**`.
- Compartidos ya existentes (solo lectura salvo bug): `lib/env.ts`, `lib/db.ts`, `lib/vault.ts`, `lib/safe-error.ts`, `lib/auth/gateway-token.ts`, `lib/modules/types.ts`, `db/schema.sql`. Si necesitas cambiar `schema.sql`, añade solo columnas/tablas nuevas idempotentes y anótalo en NOTES.md.

## A → B
- A guarda el grant de Google: **una fila por usuario** en `google_grants`. Refresh token cifrado con `vault.encrypt(token, aad=userId)`. `scopes` = unión de scopes otorgados (leídos del campo `scope` de la respuesta de token, nunca asumidos). Si Google no devuelve refresh_token en un consent incremental, se conserva el existente y solo se actualiza `scopes`.
- Tras conectar un módulo, `app/google/callback` llama `await runProbe(userId, moduleId)` exportado por **B** desde `lib/connection.ts`, y redirige a `/dashboard?module=<id>`.
- Scopes de cada módulo: A los obtiene de `getModule(id).scopes.read` (registry de B). Login inicial: `openid email profile` con `access_type=offline`, `prompt=consent` solo la primera vez, `include_granted_scopes=true` siempre.

## B → A
- `lib/connection.ts` exporta `runProbe(userId: string, moduleId: ModuleId): Promise<ModuleStatus>` y `connectUrl(moduleId): string` = `${PUBLIC_URL}/google/start?module=<id>`.
- `lib/google-token.ts` exporta `getAccessToken(userId: string, requiredScopes: string[]): Promise<string>`; lanza `ActionableError` (`scope_lost` → `reconnect_module` con `url`, `invalid_grant` → `relogin`).

## Sesión web (A)
- `lib/auth/session.ts` exporta `getSessionUser(): Promise<{id, email} | null>` (cookie httpOnly, secure, sameSite=lax, firmada con JWT_SECRET) — B la usa en `app/dashboard`.

## Gateway OAuth (A) ↔ CLI (C) ↔ MCP (B)
- Discovery: `GET /.well-known/oauth-protected-resource` (resource=`${PUBLIC_URL}/mcp`, authorization_servers=[PUBLIC_URL]) y `GET /.well-known/oauth-authorization-server` (issuer, authorization_endpoint `/oauth/authorize`, token_endpoint `/oauth/token`, device_authorization_endpoint `/oauth/device`, revocation_endpoint `/oauth/revoke`, code_challenge_methods_supported [S256], `client_id_metadata_document_supported: true`).
- Clientes: (1) Client ID Metadata Documents (client_id es una URL https; A la descarga, valida y cachea); (2) cliente público integrado `concat-cli` que acepta cualquier redirect loopback `http://127.0.0.1:<puerto>/callback` (RFC 8252).
- Grants en `/oauth/token`: `authorization_code` (PKCE S256 obligatorio), `refresh_token` (rotación: el viejo se revoca), `urn:ietf:params:oauth:grant-type:device_code`.
- Respuesta de token: `{access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope}`. `scope` = ids de módulos separados por espacio o `*` (default `*`).
- Device flow: `POST /oauth/device` → `{device_code, user_code, verification_uri: PUBLIC_URL/device, verification_uri_complete, expires_in: 600, interval: 5}`.
- `/mcp` (B): `POST`, Streamable HTTP stateless. Sin token o token inválido → 401 con `WWW-Authenticate: Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`. Expone solo tools de módulos con estado `connected` y dentro del scope del token, más `gateway_status` y `gateway_connect_url` siempre.
- `GET /api/status` (B): Bearer gateway token → `{modules: [{id, status, last_probe_at, resource_count, last_error, connect_url}]}`.
- Formato de resultado de tool: `structuredContent` = `ToolResult` (`{data, meta}`); en error `isError: true` + `structuredContent` = `ActionableError`.
- Nombres de tools: `<module>_<verbo>` (`gsc_list_sites`, `gsc_performance`, `gsc_list_sitemaps`, `ga4_list_properties`, `ga4_daily_report`). CLI: `concat gsc performance` ↔ `gsc_performance` (primer `_` separa grupo; el resto `_`→`-`).
