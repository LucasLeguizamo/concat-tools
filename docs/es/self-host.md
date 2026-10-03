# Self-host

Instala tu propio gateway con tu proyecto de Google Cloud. Pasos verificados contra la documentación oficial de Google y Vercel el 2026-10-03; la consola de Google cambia de nombres a menudo: si un menú no coincide, busca el equivalente en *Google Auth Platform*.

Necesitas: Node 22+, pnpm 10, una base Postgres, un dominio https (en local basta `http://localhost:3000`) y una cuenta de Google Cloud.

## 1. Proyecto de Google Cloud

1. Crea un proyecto en [console.cloud.google.com](https://console.cloud.google.com).
2. Habilita las APIs de los módulos que vayas a ofrecer (Consola → APIs y servicios → Biblioteca, o `gcloud services enable <servicio> --project=PROJECT_ID`):

| Módulo | Servicios a habilitar |
| --- | --- |
| `gsc` | `searchconsole.googleapis.com` |
| `ga4` | `analyticsadmin.googleapis.com`, `analyticsdata.googleapis.com` |
| `ads` | `googleads.googleapis.com` |
| `people` | `people.googleapis.com` (es también el endpoint MCP de People) |
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
# Workspace + sus servidores MCP (comando de la doc oficial para las APIs MCP):
gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com docsmcp.googleapis.com \
  sheetsmcp.googleapis.com slidesmcp.googleapis.com calendarmcp.googleapis.com chatmcp.googleapis.com \
  people.googleapis.com --project=PROJECT_ID
gcloud services enable gmail.googleapis.com drive.googleapis.com docs.googleapis.com sheets.googleapis.com \
  slides.googleapis.com calendar-json.googleapis.com chat.googleapis.com --project=PROJECT_ID
```

Los módulos de Workspace (proxy) además exigen:

- Estar inscrito en el **Google Workspace Developer Preview Program** ([guía oficial](https://developers.google.com/workspace/guides/configure-mcp-servers)).
- Para `chat`: configurar una **Chat app** en el mismo proyecto (nombre «Chat MCP», funciones interactivas desactivadas, registro de errores activado).

Si solo quieres `gsc`, `ga4` y `ads` no necesitas nada de esto.

**Google Ads:** el developer token fue dado de baja el 2026-09-09; el nivel de acceso pertenece al proyecto de Cloud (Explorer 2.880 operaciones/día en producción, Basic 15.000, Standard sin límite). Pedir Basic o Standard exige verificación de marca del proyecto. Si accedes por una cuenta MCC, usa `login_customer_id` en `ads_search`.

## 2. Pantalla de consentimiento y cliente OAuth

En Consola → **Google Auth Platform**:

1. **Branding**: nombre de la app, correo de soporte, dominio autorizado (el de tu gateway), página principal y enlace a la política de privacidad.
2. **Audience**: tipo **External**. Estado inicial *Testing*: añade los correos de prueba (hasta 100).
3. **Data Access**: añade los scopes. Login: `openid`, `email`, `profile`. Por módulo, los de [modules.md](modules.md) (solo los de los módulos que habilitaste).
4. **Clients → Create client → Web application**. En **Authorized redirect URIs** añade exactamente `${PUBLIC_URL}/google/callback`, por ejemplo `https://gw.example.com/google/callback` y, para desarrollo, `http://localhost:3000/google/callback`. Google exige https (excepto localhost), sin comodines ni fragmentos.
5. Copia el *Client ID* y el *Client secret* (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### Fases de verificación

| Estado | Efecto |
| --- | --- |
| Testing | Solo entran los correos de prueba (≤ 100). **El refresh token muere a los 7 días**; el chequeo diario del gateway lo detecta y marca el módulo como expirado. |
| Producción sin verificar | Sin vencimiento de 7 días, pero pantalla de «app no verificada» y tope de **100 usuarios nuevos** de por vida. |
| Producción verificada | El objetivo para servir a terceros. |

Fases por módulo (spec §11):

| Fase | Módulos | Requisito de Google |
| --- | --- | --- |
| A | `gsc`, `ga4`, `ads`, `people` | Verificación de marca y de scopes sensibles. Alrededor de 3-5 días hábiles tras tener el dominio verificado en Search Console. |
| B | `calendar`, `docs`, `sheets`, `slides` | Scopes sensibles: video demo (consentimiento y uso de cada scope, en inglés) y justificación por scope. Docs/Sheets/Slides pasan a la fase C si exigen `drive.readonly`. |
| C | `gmail`, `drive`, `chat` | Scopes **restringidos** (`gmail.readonly`, `drive.readonly`, `chat.messages.readonly`): evaluación de seguridad **CASA** porque el gateway accede a los datos desde un servidor, **renovada cada 12 meses**. Puede tardar varias semanas. |

Antes de pedir la verificación publica una política de privacidad que cumpla *Limited Use* (hosteada en tu dominio y enlazada en la pantalla de consentimiento) y verifica el dominio en Search Console. Referencias: [verificación](https://support.google.com/cloud/answer/13463073), [scopes sensibles](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [scopes restringidos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). La clasificación definitiva de cada scope se confirma en *Data Access* de tu consola.

Mientras no estés verificado, los módulos de las fases B/C funcionan en Testing para tu lista de prueba (la CLI y el MCP los muestran como «beta cerrada»).

## 3. Postgres

Probado con Postgres 16 (el esquema usa `pgcrypto`). En serverless usa la URL **con pooling**:

- **Neon**: copia la cadena de conexión *pooled* (el host lleva `-pooler`) con `?sslmode=require`.
- **Supabase**: usa el *Transaction pooler* (puerto 6543) y `sslmode=require`.

El gateway ya abre las conexiones con `prepare: false`, compatible con poolers en modo transacción.

## 4. Variables de entorno

Copia `apps/gateway/.env.example` a `apps/gateway/.env.local` (local) o configúralas en el proyecto de Vercel (producción).

| Variable | Qué es |
| --- | --- |
| `DATABASE_URL` | URL de Postgres (con pooling en serverless) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Cliente OAuth web del paso 2 |
| `PUBLIC_URL` | URL pública sin barra final, p. ej. `https://gw.example.com`. Debe coincidir con el redirect URI |
| `VAULT_KEYS` | Keyring del vault: `v1:<base64>`, 32 bytes por clave; **la última es la activa**. `node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))"` |
| `JWT_SECRET` | Secreto HS256 (≥ 32 caracteres). `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CRON_SECRET` | Secreto del cron de salud (≥ 16 caracteres) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Opcional; la API de Ads lo ignora desde 2026-09-09 |

Nunca subas estos valores al repositorio.

## 5. Migrar y probar en local

```bash
pnpm install
pnpm --filter gateway db:migrate     # idempotente: puedes correrlo N veces (lee apps/gateway/.env.local)
pnpm --filter gateway dev            # http://localhost:3000
```

Abre `http://localhost:3000/login`, entra con una cuenta de prueba y conecta un módulo desde el dashboard. Con la CLI: `CONCAT_GATEWAY_URL=http://localhost:3000 npx -y @concat/cli login`.

## 6. Deploy en Vercel

1. Importa el repositorio en Vercel. En *Settings → General* fija **Root Directory** = `apps/gateway` (framework Next.js, runtime Node.js; el gateway nunca usa Edge).
2. Añade las variables del paso 4 en *Settings → Environment Variables* (Production). `PUBLIC_URL` = tu dominio de producción.
3. `apps/gateway/vercel.ts` (con `@vercel/config`) ya declara el cron diario de salud: `0 6 * * *` sobre `/api/cron/health`. Vercel envía `Authorization: Bearer $CRON_SECRET` automáticamente al invocarlo, y el endpoint rechaza cualquier otra cosa. En el plan Hobby los crons solo pueden ejecutarse una vez al día y Vercel puede lanzarlo en cualquier minuto de esa hora.
4. Aplica el esquema a la base de producción desde tu máquina: `DATABASE_URL='postgres://...' pnpm --filter gateway db:migrate`.
5. Añade `https://TU-DOMINIO/google/callback` a los redirect URIs del cliente OAuth.
6. Despliega y comprueba:

```bash
curl -s https://TU-DOMINIO/.well-known/oauth-authorization-server | head      # metadata OAuth
curl -s -o /dev/null -w "%{http_code}\n" https://TU-DOMINIO/api/cron/health     # 401 sin secreto
curl -s -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/health
concat --gateway https://TU-DOMINIO login && concat --gateway https://TU-DOMINIO status
```

Si servirás el MCP a hosts públicos, fija el dominio de tu instancia en sus conectores (`https://TU-DOMINIO/mcp`).

## 7. Rotar secretos

**`VAULT_KEYS`** (cifra los refresh tokens de Google):

1. Genera una clave nueva y **añádela al final** del keyring: `v1:<vieja>,v2:<nueva>`. La última cifra; las anteriores solo descifran.
2. Despliega. Los grants nuevos o reconsentidos se guardan con `v2`; los existentes siguen descifrándose con `v1`.
3. Mira cuántos quedan: `SELECT key_version, count(*) FROM google_grants GROUP BY 1;`.
4. Solo cuando no queden filas con `v1` (los usuarios deben volver a conectar para re-cifrarse; todavía no hay script de re-cifrado masivo) quita `v1` del keyring. Si quitas una clave con filas vivas, esos usuarios reciben `grant_unreadable` y deben volver a iniciar sesión.
5. Si una clave se filtró: quítala de inmediato, acepta el re-login de esos usuarios y revoca los accesos afectados en [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

**`JWT_SECRET`**: cambiarlo invalida todas las sesiones web y access tokens; los usuarios vuelven a iniciar sesión. **`CRON_SECRET`**: cámbialo en Vercel y redespliega. **`GOOGLE_CLIENT_SECRET`**: crea un secreto nuevo en el cliente de Google, actualiza la variable, redespliega y desactiva el viejo.
