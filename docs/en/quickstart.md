# Quickstart

Hosted by CONCAT: `https://gw.onconcat.com` (MCP endpoint: `https://gw.onconcat.com/mcp`). Prefer your own instance? See [self-host](self-host.md).

## 1. Connect your modules

A module is a Google service (Search Console, GA4, Ads, Calendar...). The agent only sees the tools of **connected** modules: connected means the module's list call returned something, not that login finished.

### With the CLI

```bash
npx -y @lucasleguizamo/concat login            # browser, once. No browser: login --device
npx -y @lucasleguizamo/concat connect gsc ga4  # opens Google's consent for those modules only
npx -y @lucasleguizamo/concat status           # real state of every module
```

Once installed (`npm i -g @lucasleguizamo/concat`) the command is `concat`:

```bash
concat tools                                                        # live catalog
concat gsc performance --site sc-domain:onconcat.com --by query --limit 20
concat ga4 daily-report --property 123456789 --json
concat call gmail_search_threads '{"query":"invoice"}'              # generic escape hatch
```

- Output is JSON when stdout is not a terminal and a table when it is (`--json` forces JSON).
- Commands are generated from `tools/list`: `gsc_performance` becomes `concat gsc performance` and every schema property is a flag. See [tools.md](tools.md).
- Credentials live in the OS keychain (or `~/.config/concat/credentials.json`, mode 0600).
- Variables: `CONCAT_GATEWAY_URL` (another gateway), `CONCAT_TOKEN` (API token for CI, see [api-tokens.md](api-tokens.md)), `CONCAT_CREDENTIALS_STORE=file`.
- You can also connect modules from the browser: `https://gw.onconcat.com/dashboard`.

### Extra permissions

Google OAuth is not enough for some modules: your email must be a user of the Search Console property, have the Viewer role in GA4, have access to the Ads account (directly or through an MCC)... If something is missing, the error tells you where to fix it. Per-module detail in [modules.md](modules.md).

Calendar, Docs, Sheets, Slides, Gmail, Drive and Chat are in **closed beta** (they depend on the Workspace MCP Developer Preview and on Google's verification, see [self-host](self-host.md#verification-phases)).

## 2. Connect your agent over MCP

Connect at least one module first (step 1); `tools/list` only returns tools of connected modules, plus `gateway_status` and `gateway_connect_url`.

### Claude Code

```bash
claude mcp add --transport http concat https://gw.onconcat.com/mcp
```

Inside Claude Code run `/mcp` and follow the browser login. To share it with your team use `--scope project` (stored in `.mcp.json`).

### Claude Desktop

Settings → Connectors → Add → *Add custom connector*, then paste `https://gw.onconcat.com/mcp`. Finish the login in the browser.

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "concat": { "url": "https://gw.onconcat.com/mcp" }
  }
}
```

### Without interactive OAuth (API token)

If your client cannot complete the gateway's OAuth, use an API token (`concat tokens create`, see [api-tokens.md](api-tokens.md)) as a header:

```bash
claude mcp add --transport http concat https://gw.onconcat.com/mcp \
  --header "Authorization: Bearer cgw_..."
```

```json
{ "mcpServers": { "concat": { "url": "https://gw.onconcat.com/mcp", "headers": { "Authorization": "Bearer cgw_..." } } } }
```

## 3. Try it

Ask your agent: "which Search Console properties do I have access to?" (uses `gsc_list_sites`) or "which modules do I have connected?" (uses `gateway_status`). If a module is not connected, `gateway_connect_url` returns the link you must open yourself; the agent never opens it on its own.

Results contain third-party text (queries, subjects, file names). The gateway marks them as untrusted data; see [security](security.md).
