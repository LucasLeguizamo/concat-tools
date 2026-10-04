# Tokens de API para n8n y CI

Un token de API (`cgw_...`) es un token del gateway acotado a módulos y revocable, para automatización sin navegador. **No es un token de Google**: Google nunca sale del gateway.

## Crear, listar y revocar

Desde una sesión interactiva (`concat login`):

```bash
concat tokens create --name n8n-seo --scope gsc,ga4 --expires 90d   # el secreto se muestra UNA vez
concat tokens list
concat tokens revoke <id>
```

- `--scope`: ids de módulo separados por coma o `*`. No puede exceder el alcance de quien lo crea. Por defecto `*`.
- `--expires`: entre 1 y 365 días (por defecto 90).
- Máximo 20 tokens activos por usuario. En la base solo se guarda el hash (sha256); si lo pierdes, crea otro.
- Un token de API **no puede** crear, listar ni revocar tokens: si se filtra, no acuña más ni amplía su alcance.
- Se verifica contra la base en cada petición: revocar es inmediato.
- Los módulos deben estar conectados por el usuario dueño del token (`concat connect ...` o el dashboard). El token solo ve los módulos conectados dentro de su `scope`.

## CLI en CI

```bash
export CONCAT_TOKEN=cgw_...          # guárdalo como secreto del CI, nunca en el repo
export CONCAT_GATEWAY_URL=https://gw.onconcat.com   # opcional
npx -y @lucasleguizamo/concat gsc performance --site sc-domain:onconcat.com --json
```

Con `CONCAT_TOKEN` la CLI no usa el keychain ni hace refresh: envía el token tal cual. Si tiene formato inválido sale con código 2; si el gateway lo rechaza (expirado o revocado), con código 3. Ver [errores](errors.md).

## MCP directo (n8n y otros)

Endpoint: `POST https://gw.onconcat.com/mcp` con `Authorization: Bearer cgw_...`. El servidor es stateless, así que puedes llamar herramientas sin sesión previa.

**Nodo HTTP Request** (funciona en cualquier versión de n8n):

```bash
curl -s https://gw.onconcat.com/mcp \
  -H "Authorization: Bearer $CONCAT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gsc_performance","arguments":{"site":"sc-domain:onconcat.com","by":"query","limit":20}}}'
```

El resultado viene en `result.structuredContent` (`{ data, meta }`); si `result.isError` es `true`, es un [error accionable](errors.md). Puedes leer la respuesta como JSON o como SSE (`data: {...}`).

**Nodo MCP Client Tool de n8n**: Endpoint `https://gw.onconcat.com/mcp`, Authentication = *Bearer*, con el token. Si tu versión del nodo solo ofrece SSE, usa el nodo HTTP Request de arriba.

## Buenas prácticas

- Un token por automatización, con el `--scope` mínimo y caducidad corta.
- Rota antes de que caduque: crea el nuevo, actualiza el secreto del CI, revoca el viejo.
- Los datos que devuelven las herramientas son texto de terceros: si los pasas a un LLM dentro del flujo, trátalos como datos (ver [seguridad](security.md)).
