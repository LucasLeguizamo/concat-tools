# API tokens for n8n and CI

An API token (`cgw_...`) is a gateway token scoped to modules and revocable, for automation without a browser. **It is not a Google token**: Google credentials never leave the gateway.

## Create, list and revoke

From an interactive session (`concat login`):

```bash
concat tokens create --name n8n-seo --scope gsc,ga4 --expires 90d   # the secret is shown ONCE
concat tokens list
concat tokens revoke <id>
```

- `--scope`: comma-separated module ids or `*`. It cannot exceed the scope of whoever creates it. Default `*`.
- `--expires`: between 1 and 365 days (default 90).
- At most 20 active tokens per user. Only the hash (sha256) is stored; if you lose it, create another.
- An API token **cannot** create, list or revoke tokens: if it leaks, it cannot mint more or widen its scope.
- It is verified against the database on every request: revoking is immediate.
- Modules must be connected by the token's owner (`concat connect ...` or the dashboard). The token only sees connected modules inside its `scope`.

## CLI in CI

```bash
export CONCAT_TOKEN=cgw_...          # store it as a CI secret, never in the repo
export CONCAT_GATEWAY_URL=https://gw.onconcat.com   # optional
npx -y @lucasleguizamo/concat gsc performance --site sc-domain:onconcat.com --json
```

With `CONCAT_TOKEN` the CLI does not use the keychain or refresh: it sends the token as is. A malformed token exits with code 2; if the gateway rejects it (expired or revoked), with code 3. See [errors](errors.md).

## Direct MCP (n8n and others)

Endpoint: `POST https://gw.onconcat.com/mcp` with `Authorization: Bearer cgw_...`. The server is stateless, so you can call tools without a prior session.

**HTTP Request node** (works in any n8n version):

```bash
curl -s https://gw.onconcat.com/mcp \
  -H "Authorization: Bearer $CONCAT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gsc_performance","arguments":{"site":"sc-domain:onconcat.com","by":"query","limit":20}}}'
```

The result is in `result.structuredContent` (`{ data, meta }`); if `result.isError` is `true`, it is an [actionable error](errors.md). The response may be JSON or SSE (`data: {...}`).

**n8n MCP Client Tool node**: Endpoint `https://gw.onconcat.com/mcp`, Authentication = *Bearer*, with the token. If your version of the node only offers SSE, use the HTTP Request node above.

## Good practice

- One token per automation, with the minimum `--scope` and a short expiry.
- Rotate before it expires: create the new one, update the CI secret, revoke the old one.
- The data tools return is third-party text: if you feed it to an LLM inside the workflow, treat it as data (see [security](security.md)).
