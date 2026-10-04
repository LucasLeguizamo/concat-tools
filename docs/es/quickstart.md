# Quickstart

Gateway alojado por CONCAT: `https://gw.onconcat.com` (endpoint MCP: `https://gw.onconcat.com/mcp`). ¿Prefieres tu propia instancia? Ve a [self-host](self-host.md).

## 1. Conecta tus módulos

Un módulo es un servicio de Google (Search Console, GA4, Ads, Calendar...). El agente solo ve las herramientas de los módulos **conectados**: conectado significa que la llamada de lista del módulo devolvió algo, no que terminó el login.

### Con la CLI

```bash
npx -y @lucasleguizamo/concat login            # navegador, una vez. Sin navegador: login --device
npx -y @lucasleguizamo/concat connect gsc ga4  # abre el consentimiento de Google solo para esos módulos
npx -y @lucasleguizamo/concat status           # estado real de cada módulo
```

Instalada (`npm i -g @lucasleguizamo/concat`) el comando es `concat`:

```bash
concat tools                                                        # catálogo vivo
concat gsc performance --site sc-domain:onconcat.com --by query --limit 20
concat ga4 daily-report --property 123456789 --json
concat call gmail_search_threads '{"query":"factura"}'              # escape genérico
```

- La salida es JSON si stdout no es una terminal y tabla si lo es (`--json` fuerza JSON).
- Los comandos se generan desde `tools/list`: `gsc_performance` es `concat gsc performance` y cada propiedad del esquema es una flag. Ver [tools.md](tools.md).
- Las credenciales quedan en el keychain del SO (o en `~/.config/concat/credentials.json`, 0600).
- Variables: `CONCAT_GATEWAY_URL` (otro gateway), `CONCAT_TOKEN` (token de API para CI, ver [api-tokens.md](api-tokens.md)), `CONCAT_CREDENTIALS_STORE=file`.
- También puedes conectar módulos desde el navegador: `https://gw.onconcat.com/dashboard`.

### Permisos extra

Google OAuth no basta en algunos módulos: tu correo debe ser usuario de la propiedad de Search Console, tener rol Viewer en GA4, acceso a la cuenta de Ads (directo o por MCC)... Si falta, el error te dice dónde arreglarlo. Detalle por módulo en [modules.md](modules.md).

Los módulos de Calendar, Docs, Sheets, Slides, Gmail, Drive y Chat están en **beta cerrada** (dependen del Developer Preview de Workspace MCP y de la verificación de Google, ver [self-host](self-host.md#fases-de-verificación)).

## 2. Conecta tu agente por MCP

Primero conecta al menos un módulo (paso 1); `tools/list` solo devuelve las herramientas de módulos conectados, más `gateway_status` y `gateway_connect_url`.

### Claude Code

```bash
claude mcp add --transport http concat https://gw.onconcat.com/mcp
```

Dentro de Claude Code ejecuta `/mcp` y sigue el login en el navegador. Para compartirlo con el equipo: `--scope project` (se guarda en `.mcp.json`).

### Claude Desktop

Ajustes → Conectores → Añadir → *Añadir conector personalizado* y pega `https://gw.onconcat.com/mcp`. Completa el login en el navegador.

### Cursor

`~/.cursor/mcp.json` (global) o `.cursor/mcp.json` (proyecto):

```json
{
  "mcpServers": {
    "concat": { "url": "https://gw.onconcat.com/mcp" }
  }
}
```

### Sin OAuth interactivo (token de API)

Si tu cliente no completa el OAuth del gateway, usa un token de API (`concat tokens create`, ver [api-tokens.md](api-tokens.md)) como cabecera:

```bash
claude mcp add --transport http concat https://gw.onconcat.com/mcp \
  --header "Authorization: Bearer cgw_..."
```

```json
{ "mcpServers": { "concat": { "url": "https://gw.onconcat.com/mcp", "headers": { "Authorization": "Bearer cgw_..." } } } }
```

## 3. Pruébalo

Pregunta a tu agente: «¿a qué propiedades de Search Console tengo acceso?» (usa `gsc_list_sites`) o «¿qué módulos tengo conectados?» (usa `gateway_status`). Si un módulo no está conectado, `gateway_connect_url` devuelve el enlace que debes abrir tú; el agente nunca lo abre por su cuenta.

Los resultados traen texto de terceros (queries, asuntos, nombres de archivo). El gateway los marca como datos no confiables; ver [seguridad](security.md).
