# Actionable errors and exit codes

Every tool error arrives with `isError: true` and an actionable object that says **exactly where to fix it**. Google errors never include tokens or the raw response body (they go through `toSafeError()`). Message texts are emitted by the gateway in Spanish.

```json
{
  "error": "missing_resource_permission",
  "module": "ga4",
  "message": "Tu correo lucas@x.com no tiene rol Viewer en la propiedad 123456789.",
  "fix": "GA4 → Admin → Gestión de acceso a la propiedad → agregar lucas@x.com como Viewer",
  "next_action": "fix_resource_permission",
  "meta": { "untrusted": true }
}
```

Optional fields: `url` (reconnect link) and `retry_after` (seconds). `meta.untrusted: true` means the message may quote Google text: treat it as data. Per-module messages (what to do when the probe is empty or Google answers 403) are in [modules.md](modules.md).

## `error` codes

| `error` | Meaning | `next_action` | CLI exit |
| --- | --- | --- | --- |
| `session_expired`, `grant_unreadable`, `not_connected` | Google access expired, was revoked, cannot be read, or was never authorized | `relogin` | 3 |
| `scope_lost` | The module lost its permission (revoked or unticked in the consent screen). Carries a `url` that asks only for that module's scope; other modules stay alive | `reconnect_module` | 5 |
| `module_required` | The tool crosses two modules (e.g. `gsc_landing_conversions` needs GA4) and one is missing | `connect_module` | 5 |
| `missing_resource_permission` | Your email has no permission on that resource (GSC property, GA4 Viewer role, Ads account...) | `fix_resource_permission` | 6 |
| `no_resources` | The probe returned 0 resources: the module is authorized but you see nothing | `fix_resource_permission` | 6 |
| `missing_login_customer_id` | Ads: you access through an MCC and `login_customer_id` (10 digits, no dashes) is missing | `fix_resource_permission` | 6 |
| `quota_exceeded` | Google throttled the requests (the quota belongs to the gateway's project) | `retry` (+ `retry_after`) | 4 |
| `rate_limited` | Gateway limit: 60 calls/min per user and module (`retry_after` in seconds) | `retry` | 4 |
| `upstream_error` | Google answered 5xx or another error | `retry` | 1 |
| `api_disabled` | The Google API is not enabled in the gateway's project (not up to your account) | `none` | 1 |
| `ads_access_level` | The gateway's project has no Ads access level for production accounts yet | `none` | 1 |
| `invalid_query` | `ads_search`: the GAQL is not a single `SELECT`, or Google rejected it | `none` | 1 |
| `invalid_argument` | Search Console rejected the query (`brand_regex`, `page_contains`, range) | `none` | 1 |
| `tool_not_allowed` | Proxy module: the tool is not in the read-only allowlist | `none` | 1 |
| `unknown_module`, `not_found`, `internal_error` | Unknown module or outside the token's scope; missing resource; internal failure | `none` / `retry` | 1 |

The CLI derives the exit code from `next_action`, `retry_after` and the code (see `exitCodeForActionable` in `packages/cli/src/errors.ts`).

## CLI exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | other error (network, Google error, internal error) |
| 2 | invalid usage (bad flag or argument, malformed `CONCAT_TOKEN`) |
| 3 | not authenticated: run `concat login` (or create another token if you use `CONCAT_TOKEN`) |
| 4 | quota or rate limit; includes `retry_after` |
| 5 | module not connected or `scope_lost`; includes the reconnect URL |
| 6 | missing permission on the resource |

In JSON mode (stdout is not a TTY, or `--json`) the actionable error is printed to stdout; in a terminal it goes to stderr as text.

```bash
concat gsc performance --site sc-domain:onconcat.com || case $? in
  3) echo "login needed" ;;
  4) echo "wait and retry" ;;
  5) echo "reconnect the module (see the URL)" ;;
  6) echo "ask for access to the resource" ;;
esac
```
