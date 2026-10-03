-- CONCAT Google Gateway. Idempotente: `pnpm db:migrate` puede correr N veces.
-- ponytail: un solo archivo idempotente en M1; pasar a migraciones numeradas cuando haya un cambio destructivo.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  text NOT NULL UNIQUE,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Una cuenta de Google por usuario (spec §14.2). Refresh token cifrado (AES-256-GCM).
CREATE TABLE IF NOT EXISTS google_grants (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_ct  bytea NOT NULL,
  nonce             bytea NOT NULL,
  key_version       text NOT NULL,
  scopes            text[] NOT NULL DEFAULT '{}',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_state (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module          text NOT NULL,
  status          text NOT NULL DEFAULT 'not_connected'
                  CHECK (status IN ('not_connected','authorized','connected','no_resources','scope_lost','expired')),
  last_probe_at   timestamptz,
  last_error      text,
  resource_count  integer,
  PRIMARY KEY (user_id, module)
);

-- Sin contenido de respuestas: solo quien, que modulo, que herramienta y cuando.
CREATE TABLE IF NOT EXISTS audit_log (
  id       bigserial PRIMARY KEY,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module   text NOT NULL,
  tool     text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_at_idx ON audit_log (user_id, at DESC);

-- Capa A (gateway como Authorization Server). Solo hashes (sha256 hex) de tokens del gateway.

-- Estado de /oauth/authorize mientras el usuario hace login con Google.
CREATE TABLE IF NOT EXISTS pending_auth (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  scope           text NOT NULL,
  state           text,
  expires_at      timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS pending_auth_expires_idx ON pending_auth (expires_at);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash       text PRIMARY KEY,
  client_id       text NOT NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  scope           text NOT NULL,
  expires_at      timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx ON oauth_codes (expires_at);

-- Refresh tokens del gateway (y tokens de larga duracion para n8n/CI).
CREATE TABLE IF NOT EXISTS gateway_tokens (
  refresh_hash  text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     text NOT NULL,
  scope         text NOT NULL,
  name          text,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_tokens_user_idx ON gateway_tokens (user_id);

-- Device flow (CLI sin navegador). user_id NULL = pendiente de aprobacion.
CREATE TABLE IF NOT EXISTS device_codes (
  device_code_hash  text PRIMARY KEY,
  user_code         text NOT NULL UNIQUE,
  user_id           uuid REFERENCES users(id) ON DELETE CASCADE,
  client_id         text NOT NULL,
  scope             text NOT NULL,
  expires_at        timestamptz NOT NULL
);

-- Device flow: ultimo poll (para slow_down, RFC 8628 §3.5). Anadido por A (M1 fase 2).
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

-- Hardening (revision de seguridad M1). Todo idempotente.

-- Quien inicio el flujo (se muestra en la pantalla de aprobacion del device flow, anti-phishing) y topes por IP.
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS init_ip      text;
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS init_country text;
ALTER TABLE pending_auth ADD COLUMN IF NOT EXISTS ip text;
CREATE INDEX IF NOT EXISTS pending_auth_ip_idx ON pending_auth (ip);
CREATE INDEX IF NOT EXISTS device_codes_ip_idx ON device_codes (init_ip);

-- Familias de refresh tokens: un login = una familia. La vida absoluta (90 d) no se reinicia al rotar.
-- Las filas previas reciben una familia propia (default volatil evaluado por fila).
ALTER TABLE gateway_tokens ADD COLUMN IF NOT EXISTS family_id         uuid        NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE gateway_tokens ADD COLUMN IF NOT EXISTS family_expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days';
-- rotated_at != NULL = revocado por rotacion normal (elegible para la ventana de gracia); NULL + revoked_at = revocado a proposito.
ALTER TABLE gateway_tokens ADD COLUMN IF NOT EXISTS rotated_at        timestamptz;
CREATE INDEX IF NOT EXISTS gateway_tokens_family_idx ON gateway_tokens (family_id);

-- Sesiones web revocables (claim `sid` de la cookie de sesion).
CREATE TABLE IF NOT EXISTS web_sessions (
  sid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS web_sessions_user_idx ON web_sessions (user_id);

-- Rate limit de ventana fija. ponytail: suficiente para M1 en un solo Postgres; si escala,
-- mover a WAF de Vercel / Redis (Upstash) y borrar esta tabla.
CREATE TABLE IF NOT EXISTS rate_limits (
  key           text        NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
