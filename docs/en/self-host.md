# Self-host

Run your own gateway with your own Google Cloud project. Steps verified against Google's and Vercel's official documentation on 2026-10-03; Google's console renames menus often: if one does not match, look for the equivalent under *Google Auth Platform*.

You need: Node 22+, pnpm 10, a Postgres database, an https domain (`http://localhost:3000` is enough locally) and a Google Cloud account.

## 1. Google Cloud project

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the APIs of the modules you will offer (Console → APIs & Services → Library, or `gcloud services enable <service> --project=PROJECT_ID`):

| Module | Services to enable |
| --- | --- |
| `gsc` | `searchconsole.googleapis.com` |
| `ga4` | `analyticsadmin.googleapis.com`, `analyticsdata.googleapis.com` |
| `ads` | `googleads.googleapis.com` |
| `people` | `people.googleapis.com` (also People's MCP endpoint) |
| `calendar` | `calendar-json.googleapis.com`, `calendarmcp.googleapis.com` |
| `docs` | `docs.googleapis.com`, `docsmcp.googleapis.com` |
| `sheets` | `sheets.googleapis.com`, `sheetsmcp.googleapis.com` |
| `slides` | `slides.googleapis.com`, `slidesmcp.googleapis.com` |
| `gmail` | `gmail.googleapis.com`, `gmailmcp.googleapis.com` |
| `drive` | `drive.googleapis.com`, `drivemcp.googleapis.com` |
| `chat` | `chat.googleapis.com`, `chatmcp.googleapis.com` |

```bash
gcloud services enable searchconsole.googleapis.com analyticsadmin.googleapis.com analyticsdata.googleapis.com \
  googleads.googleapis.com --project=PROJECT_ID
# Workspace + their MCP servers (command from the official docs for the MCP APIs):
gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com docsmcp.googleapis.com \
  sheetsmcp.googleapis.com slidesmcp.googleapis.com calendarmcp.googleapis.com chatmcp.googleapis.com \
  people.googleapis.com --project=PROJECT_ID
gcloud services enable gmail.googleapis.com drive.googleapis.com docs.googleapis.com sheets.googleapis.com \
  slides.googleapis.com calendar-json.googleapis.com chat.googleapis.com --project=PROJECT_ID
```

Workspace (proxy) modules additionally require:

- Enrollment in the **Google Workspace Developer Preview Program** ([official guide](https://developers.google.com/workspace/guides/configure-mcp-servers)).
- For `chat`: configure a **Chat app** in the same project (name "Chat MCP", interactive features disabled, error logging enabled).

If you only want `gsc`, `ga4` and `ads` you need none of this.

**Google Ads:** the developer token was retired on 2026-09-09; the access level belongs to the Cloud project (Explorer 2,880 operations/day in production, Basic 15,000, Standard unlimited). Requesting Basic or Standard requires brand verification of the project. If you go through an MCC account, use `login_customer_id` in `ads_search`.

## 2. Consent screen and OAuth client

In Console → **Google Auth Platform**:

1. **Branding**: app name, support email, authorized domain (your gateway's), homepage and a link to the privacy policy.
2. **Audience**: type **External**. Initial status *Testing*: add the test emails (up to 100).
3. **Data Access**: add the scopes. Login: `openid`, `email`, `profile`. Per module, those in [modules.md](modules.md) (only for the modules you enabled).
4. **Clients → Create client → Web application**. Under **Authorized redirect URIs** add exactly `${PUBLIC_URL}/google/callback`, for example `https://gw.example.com/google/callback` and, for development, `http://localhost:3000/google/callback`. Google requires https (except localhost), no wildcards or fragments.
5. Copy the *Client ID* and *Client secret* (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### Verification phases

| Status | Effect |
| --- | --- |
| Testing | Only the test emails get in (≤ 100). **The refresh token dies after 7 days**; the gateway's daily check detects it and marks the module expired. |
| Production, unverified | No 7-day expiry, but the "unverified app" screen and a lifetime cap of **100 new users**. |
| Production, verified | The goal for serving third parties. |

Per-module phases (spec §11):

| Phase | Modules | Google requirement |
| --- | --- | --- |
| A | `gsc`, `ga4`, `ads`, `people` | Brand and sensitive-scope verification. Around 3-5 business days once the domain is verified in Search Console. |
| B | `calendar`, `docs`, `sheets`, `slides` | Sensitive scopes: demo video (consent flow and use of each scope, in English) and per-scope justification. Docs/Sheets/Slides move to phase C if they require `drive.readonly`. |
| C | `gmail`, `drive`, `chat` | **Restricted** scopes (`gmail.readonly`, `drive.readonly`, `chat.messages.readonly`): **CASA** security assessment because the gateway reaches the data from a server, **renewed every 12 months**. It can take several weeks. |

Before applying, publish a privacy policy that meets *Limited Use* (hosted on your domain and linked from the consent screen) and verify the domain in Search Console. References: [verification](https://support.google.com/cloud/answer/13463073), [sensitive scopes](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [restricted scopes](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). The final classification of each scope is confirmed in *Data Access* in your console.

Until you are verified, phase B/C modules work in Testing for your test list (the CLI and MCP show them as "closed beta").

## 3. Postgres

Tested with Postgres 16 (the schema uses `pgcrypto`). On serverless use the **pooled** URL:

- **Neon**: copy the *pooled* connection string (the host contains `-pooler`) with `?sslmode=require`.
- **Supabase**: use the *Transaction pooler* (port 6543) and `sslmode=require`.

The gateway already opens connections with `prepare: false`, compatible with transaction-mode poolers.

## 4. Environment variables

Copy `apps/gateway/.env.example` to `apps/gateway/.env.local` (local) or set them in the Vercel project (production).

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres URL (pooled on serverless) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The web OAuth client from step 2 |
| `PUBLIC_URL` | Public URL without trailing slash, e.g. `https://gw.example.com`. Must match the redirect URI |
| `VAULT_KEYS` | Vault keyring: `v1:<base64>`, 32 bytes per key; **the last one is active**. `node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))"` |
| `JWT_SECRET` | HS256 secret (≥ 32 characters). `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CRON_SECRET` | Health cron secret (≥ 16 characters) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Optional; the Ads API ignores it since 2026-09-09 |

Never commit these values.

## 5. Migrate and test locally

```bash
pnpm install
pnpm --filter gateway db:migrate     # idempotent: run it as often as you like (reads apps/gateway/.env.local)
pnpm --filter gateway dev            # http://localhost:3000
```

Open `http://localhost:3000/login`, sign in with a test account and connect a module from the dashboard. With the CLI: `CONCAT_GATEWAY_URL=http://localhost:3000 npx -y @lucasleguizamo/concat login`.

## 6. Deploy on Vercel

1. Import the repository in Vercel. In *Settings → General* set **Root Directory** = `apps/gateway` (Next.js framework, Node.js runtime; the gateway never uses Edge).
2. Add the step 4 variables under *Settings → Environment Variables* (Production). `PUBLIC_URL` = your production domain.
3. `apps/gateway/vercel.ts` (using `@vercel/config`) already declares the daily health cron: `0 6 * * *` on `/api/cron/health`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when invoking it, and the endpoint rejects anything else. On the Hobby plan crons can only run once a day and Vercel may fire it at any minute within that hour.
4. Apply the schema to the production database from your machine: `DATABASE_URL='postgres://...' pnpm --filter gateway db:migrate`.
5. Add `https://YOUR-DOMAIN/google/callback` to the OAuth client's redirect URIs.
6. Deploy and check:

```bash
curl -s https://YOUR-DOMAIN/.well-known/oauth-authorization-server | head      # OAuth metadata
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-DOMAIN/api/cron/health    # 401 without the secret
curl -s -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/health
concat --gateway https://YOUR-DOMAIN login && concat --gateway https://YOUR-DOMAIN status
```

Point your MCP hosts at your instance: `https://YOUR-DOMAIN/mcp`.

## 7. Rotating secrets

**`VAULT_KEYS`** (encrypts Google refresh tokens):

1. Generate a new key and **append it** to the keyring: `v1:<old>,v2:<new>`. The last one encrypts; earlier ones only decrypt.
2. Deploy. New or re-consented grants are stored with `v2`; existing ones keep decrypting with `v1`.
3. See how many remain: `SELECT key_version, count(*) FROM google_grants GROUP BY 1;`.
4. Only when no rows with `v1` remain (users must reconnect to be re-encrypted; there is no bulk re-encryption script yet) remove `v1` from the keyring. If you remove a key that still has live rows, those users get `grant_unreadable` and must sign in again.
5. If a key leaked: remove it right away, accept the re-login of those users and revoke the affected access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

**`JWT_SECRET`**: changing it invalidates all web sessions and access tokens; users sign in again. **`CRON_SECRET`**: change it in Vercel and redeploy. **`GOOGLE_CLIENT_SECRET`**: create a new secret on the Google client, update the variable, redeploy and disable the old one.
