import { LOGIN_SCOPES, normalizeScope } from "./auth/google-oauth";
import { getDb } from "./db";
import { ActionableException } from "./modules/errors";
import { getModule } from "./modules/registry";
import type { ModuleId } from "./modules/types";
import { toSafeError } from "./safe-error";
import { decrypt } from "./vault";

const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REVOKE_TIMEOUT_MS = 15_000;

/** Estados en los que otro modulo sigue necesitando el grant (un `expired`/`not_connected` no lo usa). */
const HOLDS_GRANT = ["authorized", "connected", "no_resources", "scope_lost"];

export type DisconnectResult = {
  module: ModuleId;
  /** true = se revoco el refresh token en Google y se borro el grant (ningun otro modulo lo necesitaba). */
  revoked_at_google: boolean;
};

/** Scopes que se pueden quitar del estado: los del modulo que ningun otro usa, y nunca los de login. */
export function scopesToDrop(moduleScopes: string[], keep: Iterable<string>): string[] {
  const protectedScopes = new Set([...LOGIN_SCOPES, ...keep].map(normalizeScope));
  return moduleScopes.map(normalizeScope).filter((s) => !protectedScopes.has(s));
}

async function revokeAtGoogle(refreshToken: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
  } catch (e) {
    throw upstream(toSafeError(e).message);
  }
  if (res.ok) return;
  const body: unknown = await res.json().catch(() => undefined);
  const safe = toSafeError({ response: { status: res.status, data: body } });
  // Ya revocado o caducado en Google: el objetivo (que no sirva) ya se cumple.
  if (safe.code === "invalid_token" || safe.code === "invalid_grant") return;
  throw upstream(safe.message);
}

const upstream = (detail: string) =>
  new ActionableException({
    error: "upstream_error",
    module: "gateway",
    message: `Google no confirmo la revocacion del acceso: ${detail}`,
    fix: "No se borro nada. Reintenta en unos instantes.",
    next_action: "retry",
  });

/**
 * Desconecta un modulo (spec §4, §12).
 * - Si otro modulo sigue usando el grant: solo quita del estado los scopes exclusivos de este y borra su module_state
 *   (Google no permite revocar scopes sueltos; el token sigue valido para los demas).
 * - Si no: revoca el refresh token en Google y borra el grant y todo el module_state del usuario.
 * Si Google falla al revocar no se borra nada (el usuario puede reintentar).
 */
export async function disconnectModule(userId: string, moduleId: ModuleId): Promise<DisconnectResult> {
  const mod = getModule(moduleId);
  if (!mod) throw new Error(`modulo desconocido: ${moduleId}`);
  const sql = getDb();

  const others = await sql<{ module: string }[]>`
    SELECT module FROM module_state
    WHERE user_id = ${userId} AND module <> ${moduleId} AND status = ANY(${HOLDS_GRANT})`;

  if (others.length > 0) {
    const keep = others.flatMap((r) => getModule(r.module)?.scopes.read ?? []);
    const drop = new Set(scopesToDrop(mod.scopes.read, keep));
    await sql.begin(async (tx) => {
      const rows = await tx<{ scopes: string[] }[]>`SELECT scopes FROM google_grants WHERE user_id = ${userId} FOR UPDATE`;
      if (rows[0]) {
        const scopes = rows[0].scopes.filter((s) => !drop.has(normalizeScope(s)));
        await tx`UPDATE google_grants SET scopes = ${scopes}, updated_at = now() WHERE user_id = ${userId}`;
      }
      await tx`DELETE FROM module_state WHERE user_id = ${userId} AND module = ${moduleId}`;
    });
    return { module: moduleId, revoked_at_google: false };
  }

  const grants = await sql<{ refresh_token_ct: Buffer; nonce: Buffer; key_version: string }[]>`
    SELECT refresh_token_ct, nonce, key_version FROM google_grants WHERE user_id = ${userId}`;
  const grant = grants[0];
  let revoked = false;
  if (grant) {
    let refreshToken: string | undefined;
    try {
      refreshToken = decrypt({ ct: grant.refresh_token_ct, nonce: grant.nonce, keyVersion: grant.key_version }, userId);
    } catch {
      // Grant ilegible: no hay nada que revocar en Google; se borra la fila igualmente.
    }
    if (refreshToken !== undefined) {
      await revokeAtGoogle(refreshToken);
      revoked = true;
    }
  }
  await sql.begin(async (tx) => {
    await tx`DELETE FROM google_grants WHERE user_id = ${userId}`;
    await tx`DELETE FROM module_state WHERE user_id = ${userId}`;
  });
  return { module: moduleId, revoked_at_google: revoked };
}
