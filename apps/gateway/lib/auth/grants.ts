import { getDb } from "../db";
import { encrypt } from "../vault";
import { normalizeScope } from "./google-oauth";

/**
 * Scopes a guardar. Con refresh token NUEVO la lista de Google es autoritativa
 * (reemplaza: si el usuario revoco el acceso en su cuenta, los scopes viejos ya no valen).
 * Sin refresh token (consent incremental / relogin) se une con los existentes.
 */
export function mergeScopes(existing: string[], granted: string[], newRefreshToken: boolean): string[] {
  const g = granted.map(normalizeScope);
  const all = newRefreshToken ? g : [...existing.map(normalizeScope), ...g];
  return [...new Set(all)].sort();
}

export type UserRow = { id: string; email: string; google_sub: string };

export async function upsertUser(googleSub: string, email: string): Promise<{ id: string; email: string }> {
  const rows = await getDb()<{ id: string; email: string }[]>`
    INSERT INTO users (google_sub, email) VALUES (${googleSub}, ${email})
    ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email`;
  return rows[0]!;
}

export async function getUser(id: string): Promise<UserRow | null> {
  const rows = await getDb()<UserRow[]>`SELECT id, email, google_sub FROM users WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function hasGrant(userId: string): Promise<boolean> {
  const rows = await getDb()`SELECT 1 FROM google_grants WHERE user_id = ${userId}`;
  return rows.length > 0;
}

/**
 * Una fila por usuario. Refresh token cifrado con aad=userId. Si no llega refresh
 * token se conserva el existente y solo se actualizan los scopes. Devuelve los scopes finales.
 */
export async function saveGrant(
  userId: string,
  p: { refreshToken?: string; scopes: string[] },
): Promise<string[]> {
  return getDb().begin(async (tx) => {
    const rows = await tx<{ scopes: string[] }[]>`
      SELECT scopes FROM google_grants WHERE user_id = ${userId} FOR UPDATE`;
    const existing = rows[0];
    const scopes = mergeScopes(existing?.scopes ?? [], p.scopes, p.refreshToken !== undefined);

    if (p.refreshToken !== undefined) {
      const s = encrypt(p.refreshToken, userId);
      await tx`
        INSERT INTO google_grants (user_id, refresh_token_ct, nonce, key_version, scopes, updated_at)
        VALUES (${userId}, ${s.ct}, ${s.nonce}, ${s.keyVersion}, ${scopes}, now())
        ON CONFLICT (user_id) DO UPDATE SET
          refresh_token_ct = EXCLUDED.refresh_token_ct, nonce = EXCLUDED.nonce,
          key_version = EXCLUDED.key_version, scopes = EXCLUDED.scopes, updated_at = now()`;
    } else if (existing) {
      await tx`UPDATE google_grants SET scopes = ${scopes}, updated_at = now() WHERE user_id = ${userId}`;
    } else {
      // Sin refresh token y sin fila previa: el llamante debe reintentar con prompt=consent.
      throw new Error("saveGrant: no hay refresh token ni grant previo");
    }
    return scopes;
  });
}

export async function markModuleAuthorized(userId: string, moduleId: string): Promise<void> {
  await getDb()`
    INSERT INTO module_state (user_id, module, status) VALUES (${userId}, ${moduleId}, 'authorized')
    ON CONFLICT (user_id, module) DO UPDATE SET status = 'authorized', last_error = NULL`;
}
