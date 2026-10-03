import { getDb } from "../db";
import { sanitizeString } from "../modules/sanitize";
import { hashToken, randomToken, type GatewayClaims } from "./gateway-token";

// Tokens de larga duracion para n8n/CI (spec §4). Opacos, con prefijo reconocible; solo se guarda el sha256.
// Viven en gateway_tokens con client_id fijo: el flujo OAuth nunca los refresca (ver exchangeRefresh).

export const API_TOKEN_PREFIX = "cgw_";
export const API_TOKEN_CLIENT_ID = "api-token";
export const MAX_ACTIVE_API_TOKENS = 20;
export const DEFAULT_EXPIRY_DAYS = 90;
export const MAX_EXPIRY_DAYS = 365;

export const isApiToken = (token: string) => token.startsWith(API_TOKEN_PREFIX);

export type ApiTokenInfo = { id: string; name: string | null; scope: string[]; created_at: string; expires_at: string };

type Row = { id: string; name: string | null; scope: string; created_at: Date; expires_at: Date };
const toInfo = (r: Row): ApiTokenInfo => ({
  id: r.id,
  name: r.name,
  scope: r.scope.split(" ").filter(Boolean),
  created_at: r.created_at.toISOString(),
  expires_at: r.expires_at.toISOString(),
});

export class TooManyTokensError extends Error {
  constructor() {
    super(`maximo ${MAX_ACTIVE_API_TOKENS} tokens activos`);
    this.name = "TooManyTokensError";
  }
}

/** Crea el token. El secreto solo existe en este retorno: la DB guarda su hash. */
export async function createApiToken(
  userId: string,
  p: { name: string; scope: string[]; expiresInDays: number },
): Promise<ApiTokenInfo & { token: string }> {
  const token = `${API_TOKEN_PREFIX}${randomToken(32)}`;
  const name = sanitizeString(p.name, 60);
  const sql = getDb();
  // Tope + insercion en una transaccion con bloqueo de la fila de usuario (sin carrera entre dos creaciones).
  const row = await sql.begin(async (tx) => {
    await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const counted = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM gateway_tokens
      WHERE user_id = ${userId} AND client_id = ${API_TOKEN_CLIENT_ID} AND revoked_at IS NULL AND expires_at > now()`;
    if ((counted[0]?.n ?? 0) >= MAX_ACTIVE_API_TOKENS) throw new TooManyTokensError();
    const rows = await tx<Row[]>`
      INSERT INTO gateway_tokens (refresh_hash, user_id, client_id, scope, name, expires_at, family_expires_at)
      VALUES (${hashToken(token)}, ${userId}, ${API_TOKEN_CLIENT_ID}, ${p.scope.join(" ")}, ${name},
              now() + make_interval(days => ${p.expiresInDays}), now() + make_interval(days => ${p.expiresInDays}))
      RETURNING id, name, scope, created_at, expires_at`;
    return rows[0]!;
  });
  return { ...toInfo(row), token };
}

/** Tokens activos del usuario. Nunca incluye el secreto ni su hash. */
export async function listApiTokens(userId: string): Promise<ApiTokenInfo[]> {
  const rows = await getDb()<Row[]>`
    SELECT id, name, scope, created_at, expires_at FROM gateway_tokens
    WHERE user_id = ${userId} AND client_id = ${API_TOKEN_CLIENT_ID} AND revoked_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC`;
  return rows.map(toInfo);
}

/** true si revoco algo (solo tokens propios y activos). */
export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const rows = await getDb()`
    UPDATE gateway_tokens SET revoked_at = now()
    WHERE id = ${id} AND user_id = ${userId} AND client_id = ${API_TOKEN_CLIENT_ID} AND revoked_at IS NULL
    RETURNING id`;
  return rows.length === 1;
}

/** Consulta a DB en cada request: la revocacion es inmediata. null = desconocido, revocado o expirado. */
export async function verifyApiToken(token: string): Promise<GatewayClaims | null> {
  if (!isApiToken(token)) return null;
  const rows = await getDb()<{ user_id: string; scope: string }[]>`
    SELECT user_id, scope FROM gateway_tokens
    WHERE refresh_hash = ${hashToken(token)} AND client_id = ${API_TOKEN_CLIENT_ID}
      AND revoked_at IS NULL AND expires_at > now() AND family_expires_at > now()`;
  const r = rows[0];
  return r ? { userId: r.user_id, scope: r.scope.split(" ").filter(Boolean) } : null;
}
