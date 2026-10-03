# NOTES (desviaciones y decisiones vs. la spec)

- TypeScript fijado a ^6 (latest es 7.0.2): `typescript-eslint` 8.x no soporta TS 7.
- ESLint fijado a ^9 (latest 10.x): `eslint-plugin-react` (via eslint-config-next 16) no es compatible con ESLint 10.
- Next 16: `next lint` ya no existe; lint = `eslint .` con flat config.
- pnpm bloquea scripts de build de esbuild/unrs-resolver (aviso en install); no son necesarios para build/test/lint.
- `db/schema.sql` es un archivo idempotente (no migraciones numeradas) en M1. Agregadas a la spec: `pending_auth`, `gateway_tokens.name`.
- Vault: `encrypt/decrypt` aceptan `aad` opcional (userId) para ligar el ciphertext a su fila.
- Spec §4 habla de clave envuelta por KMS; M1 usa `VAULT_KEYS` en env (ver comentario `ponytail:` en lib/vault.ts).

## CLI (`packages/cli`)
- Cliente MCP: `@modelcontextprotocol/client` 2.3.0 (par del `@modelcontextprotocol/server` 2.3.0 del gateway), no el `@modelcontextprotocol/sdk` 1.x (arrastra express/hono). Transporte `StreamableHTTPClientTransport` con `authProvider` (token + onUnauthorized para refresh). Única dependencia runtime.
- Credenciales: macOS `security -i` (secreto por stdin, no argv) / Linux `secret-tool`; si falla o no existe, archivo `~/.config/concat/credentials.json` (0600, dir 0700; respeta `XDG_CONFIG_HOME`). `CONCAT_CREDENTIALS_STORE=file` fuerza el archivo.
- La CLI valida que los endpoints del metadata OAuth sean del mismo origin que el gateway y exige https salvo loopback.
- Supuestos sobre B que hay que verificar al integrar: `/api/status` lista TODOS los módulos (incl. `not_connected`) para poder distinguir "módulo no conectado" (exit 5) de "comando desconocido" (exit 2); `connect` considera terminado un módulo en `connected`, o en `no_resources` con `last_probe_at` distinto del inicial. Exit code por `error`/`next_action`/`retry_after` del ActionableError (ver `src/errors.ts`; `retry_after` no está aún en el tipo del gateway).
- Un prop del inputSchema llamado `help`, `json` o `gateway` no se expone como flag (usar `concat call`). Props `object` se aceptan como JSON en el flag.

### CLI: endurecimiento (ronda 2)
- Keychain -> archivo: aviso único por stderr (ruta + `CONCAT_CREDENTIALS_STORE=file`); no se avisa si el archivo se fuerza. Nunca incluye detalle del error del keychain. SKILL.md documenta que en macOS el item de `/usr/bin/security` es legible por procesos del mismo usuario (equivale a 0600).
- Loopback: `iss` del callback se compara exacto con `metadata.issuer` (RFC 9207). Mismatch aborta (`issuer_mismatch`) sin canjear el code; `iss` ausente aborta si el AS anuncia `authorization_response_iss_parameter_supported: true`. Se valida también en respuestas `error`. `discover` conserva ese campo.
- Device flow: solo `verification_uri` + `user_code` (a escribir a mano); `verification_uri_complete` se ignora. `verification_uri` debe ser del mismo origin que el issuer.
- `rate_limited` / HTTP 429 (OAuth y /mcp): exit 4 con `retry_after` (cuerpo, o cabecera `Retry-After` en OAuth). Las tools ya lo mapeaban via `exitCodeForActionable`.
- Supply chain: deps de `packages/cli` en versión exacta (+ `.npmrc` `save-exact=true`). Lockfile solo cambió los `specifier` del importer de cli.
- CI (`.github/workflows/ci.yml`): Node 22, `contents: read`, acciones fijadas por SHA verificado con `gh api` (checkout v7.0.1, pnpm/action-setup v6.1.0, setup-node v7.0.0); Dependabot las actualiza (`.github/dependabot.yml`, npm+actions, cooldown 7 d; `cooldown` e `directories` con globs no se pudieron validar en local).
- Release (`release-cli.yml`, tag `cli-vX.Y.Z` o manual): trusted publishing OIDC (`id-token: write`, sin NPM_TOKEN), Node 24 porque necesita npm >= 11.5.1 (Node 22 trae npm 10); `npm publish --provenance --access public` (el flag es redundante con trusted publishing, se deja explícito). Pendiente manual: configurar el Trusted Publisher en npmjs.com (repo + `release-cli.yml`), repo público, y añadir `repository.url` a `packages/cli/package.json` (no hay remote git aún; debe coincidir exacto con el repo).
- No verificado en vivo: los workflows no se ejecutaron (no hay remote).

## Pieza B (modulos GSC/GA4, conexion, /mcp, status, cron)
- MCP: `@modelcontextprotocol/server` 2.3.0 (spec 2026-07-28). Se usa `createMcpHandler(factory, {legacy:"stateless"})` (fetch-native, no `WebStandardStreamableHTTPServerTransport` a mano): sirve la era moderna (JSON) y la 2025 en modo stateless (SSE). El usuario viaja en `authInfo.extra.userId`; el token del gateway NO se pasa al SDK. Verificado en tests con ambas eras.
- `mcp-handler` de Vercel no se usa (el SDK oficial ya cubre el handler Web Standard).
- GSC/GA4: `fetch` REST directo (sin `@googleapis/*`; rutas verificadas contra los discovery docs). GSC usa `searchconsole.googleapis.com/webmasters/v3`.
- `vercel.ts` con `@vercel/config` 0.9.0 (`@vercel/config/v1`), cron `0 6 * * *` en `/api/cron/health`.
- `ActionableError` no es una clase: `getAccessToken` lanza `ActionableException` (`lib/modules/errors.ts`, campo `.actionable`).
- Codigos `error` de ActionableError emitidos: `scope_lost` (reconnect_module + url), `session_expired` / `not_connected` / `grant_unreadable` (relogin), `missing_resource_permission` (fix_resource_permission), `no_resources`, `quota_exceeded` (retry), `api_disabled`, `upstream_error` (retry), `not_found`, `unknown_module`, `internal_error`.
- `explainError` escribe `{email}` como placeholder; `toActionable()` (lib/connection.ts) lo rellena con el correo del usuario. El mensaje de spec §6 se reparte en `message` + `fix` (concatenados son literales).
- GSC: `dataState: "final"` y el rango termina 3 dias antes de hoy (retraso de datos finales). Posicion a 1 decimal, CTR a 4.
- GA4 `ga4_daily_report`: rango = ultimos N dias hasta ayer (UTC); `meta.warnings` expone `subjectToThresholding`, muestreo y `dataLossFromOtherRow`.
- Fallback de texto de tools: banner "DATOS EXTERNOS NO CONFIABLES" + JSON con strings saneadas (control, zero-width, bidi, tags Unicode; max 200). `structuredContent` tambien se sanea (ver Hardening).
- `gateway_status`/`/api/status` devuelven ademas `action` (accion pendiente) y se limitan al scope del token.
- Cron: solo reprueba modulos `connected` (recuperar `no_resources`/`scope_lost` ocurre al reconectar). Sin email de aviso (opt-in, M2).
- No hecho (fuera del encargo): CORS en /mcp, `api/modules/[id]` (desconectar), `api/tokens`.
- Los cambios de `\u` en archivos: los helpers de edicion expanden escapes `\uXXXX` en el contenido; `sanitize.ts` itera por code point con rangos numericos para evitarlo.

## Pieza A (identidad + OAuth) — decisiones
- `db/schema.sql`: añadida `device_codes.last_polled_at` (idempotente) para `slow_down` (RFC 8628).
- `next.config.ts`: añadidos headers anti-clickjacking (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) para `/oauth/consent`, `/device`, `/connect/*`, `/login` (archivo sin dueño en el contrato).
- Archivos extra de A (fuera de la lista del contrato): `lib/auth/{http,oauth-store,grants,ui}.ts(x)`, `app/oauth/consent/page.tsx`.
- `/oauth/authorize` NO redirige a `/login`: guarda un `pending_auth` y manda a `/oauth/consent?pending=<id>`, que pide login si falta sesión y luego aprobación. El code solo se emite tras "Aprobar".
- `prompt=consent` no se pide de entrada: si el login no devuelve `refresh_token` y no hay grant previo, el callback reintenta UNA vez con `prompt=consent` (`retry=1`).
- Scopes en `google_grants`: con refresh token nuevo se reemplazan por los de Google (autoritativos); sin refresh token se unen con los existentes. `email`/`profile` se guardan en forma canónica (URL larga).
- Connect: el consent incremental incluye `openid email` + `login_hint` y el callback exige que el `sub` del id_token sea el del usuario (una cuenta de Google por usuario). id_token verificado con JWKS de Google (iss, aud, exp, nonce, email_verified).
- State = JWT firmado (10 min); el `code_verifier` y el nonce viajan en cookie httpOnly `…concat_gtx` (path `/google/callback`), nunca en la URL. Sesión = cookie `__Host-concat_session` (JWT, 7 d, aud propia). `Secure` siempre salvo `PUBLIC_URL=http://localhost`.
- Refresh del gateway: rotación + detección de reuso por familia (ver Hardening). TTL 30 d. Code TTL 60 s.
- CIMD: `redirect_uris` exactos, salvo puerto en loopback declarado (RFC 8252 §7.3). Solo https o http-loopback (no esquemas custom). Cache 5 min en memoria por instancia. Anti-SSRF: se rechazan hosts IP, puerto != 443 y hosts que resuelven a IP privada; la conexión se fija a las IPs validadas (ver Hardening).
- No implementado (M2+): PRM con sufijo de path (`/.well-known/oauth-protected-resource/mcp`); `scopes_supported`.

## Hardening (revision de seguridad M1, apps/gateway)
- **Device flow**: solo `client_id=concat-cli` (otros -> `unauthorized_client`, antes de resolver CIMD). Se omite `verification_uri_complete` (la CLI ya lo ignoraba). `/device` ignora `?code=`: el codigo se teclea en un server action (POST), tras limite de 5 intentos/10 min por usuario (`lib/auth/device-entry.ts`, error generico unico) se guarda una cookie firmada de 5 min (`device-confirm`, ligada a usuario+codigo) y la pantalla de aprobacion muestra client_id, hora UTC y pais/IP de quien inicio el flujo (`device_codes.created_at/init_ip/init_country`; IP desde `x-vercel-forwarded-for` > `x-real-ip` > `x-forwarded-for`, validada con `isIP`; pais de `x-vercel-ip-country`). Fuera de Vercel esas cabeceras son spoofables.
- **Rate limit** (`lib/rate-limit.ts`, tabla `rate_limits`, ventana fija con upsert atomico, `ponytail` para moverlo a WAF/Redis): por IP 30/min `/oauth/authorize`, 10/min `/oauth/device`, 60/min `/oauth/token` (429 + `Retry-After`); por usuario x modulo 60/min en cada tools/call de `/mcp` (modulo `gateway` para `gateway_*`) -> ActionableError `rate_limited` con `retry_after`. Topes de pendientes: `pending_auth` 20/IP y 200/client_id, `device_codes` 10/IP y 500/client_id (`temporarily_unavailable`). Cron diario borra filas expiradas (`lib/maintenance.ts`). Si la DB falla, el limite falla cerrado (500).
- **MCP**: `structuredContent` pasa por `sanitizeDeep` (cadenas truncadas a 200 + `…`, claves incluidas) y `meta.untrusted: true` en resultados/errores de modulos y `gateway_status`. Sanitizador ampliado: U+2060-206F completo, selectores de variacion (FE00-FE0F, E0100-E01EF), CGJ, U+180E, FFF9-FFFB. Se pierde el VS16 de algunos emoji (aceptado). `ToolResult.meta.module` admite `"gateway"`.
- **safeNext**: rechaza control chars y `\` en la entrada y, tras normalizar, cualquier resultado que empiece por `//` o `/\`.
- **SSRF CIMD**: dependencia nueva `undici` 8.11.2 (`pinnedFetch`: `Agent` con `connect.lookup` fijado a las IPs ya validadas; sin redirects; cuerpo con tope de 5 KB). `isPrivateIp` completo (NAT64, 6to4, Teredo, `::/96`, mapped en hex/punteado, CGNAT, 0/8, link-local, ULA, multicast, TEST-NETs). Errores del documento sin status upstream. `ClientDeps.fetch` recibe ahora las IPs como 3er argumento.
- **Refresh**: `gateway_tokens.family_id` (un login = una familia), `family_expires_at` (90 d absolutos, no se reinician; ningun token vive mas que su familia), `rotated_at`. Gracia de 30 s: reusar un refresh recien rotado emite un par NUEVO en la misma familia sin revocar (los pares previos siguen validos; es el caso de reintento de red y de requests concurrentes). Fuera de gracia: se revoca SOLO esa familia. `/oauth/revoke` revoca la familia entera. Filas previas a la migracion reciben una familia propia.
- **Sesion web**: tabla `web_sessions` + claim `sid`; `getSessionUser` consulta la DB (1 query por request). `POST /logout` (boton en dashboard) revoca el `sid` y borra la cookie. Claves HKDF por proposito (`lib/auth/keys.ts`: `session`, `access`, `device-confirm`, `google-state`, `google-tx`) en vez de JWT_SECRET crudo; `verifyAccessToken` exige `typ: at+jwt`. Efecto de desplegar: todos los tokens/sesiones/cookies emitidos antes dejan de validar (re-login; M1 sin usuarios).
- Probado contra Postgres 16 local (migracion dos veces, upsert concurrente de rate limit, familias y gracia, device con IP/pais, cleanup) con un script desechable; los tests de vitest usan fakes en memoria, asi que el SQL nuevo no esta cubierto en CI.
