import { getDb } from "./db";
import { getEnv } from "./env";
import { ActionableException, connectUrl } from "./modules/errors";
import { modules } from "./modules/registry";
import type { ModuleId } from "./modules/types";
import { toSafeError } from "./safe-error";
import { decrypt } from "./vault";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_SKEW_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;

type CacheEntry = { token: string; expiresAt: number; scopes: string[]; grantVersion: number };

// Cache en memoria por usuario hasta que expira (por instancia serverless; nunca se persiste ni se loguea).
// grantVersion = updated_at del grant: un re-consent o rotacion invalida la entrada.
const cache = new Map<string, CacheEntry>();

/** Solo para tests. */
export function clearTokenCache(): void {
  cache.clear();
}

type GrantRow = {
  refresh_token_ct: Buffer;
  nonce: Buffer;
  key_version: string;
  scopes: string[];
  updated_at: Date;
};

/** Modulo cuyo scope falta (para armar la URL de reconexion). */
function moduleForScopes(missing: string[]): ModuleId | undefined {
  return modules.find((m) => m.scopes.read.some((s) => missing.includes(s)))?.id;
}

function scopeLost(missing: string[]): ActionableException {
  const moduleId = moduleForScopes(missing);
  return new ActionableException({
    error: "scope_lost",
    module: moduleId ?? "gateway",
    message: `Falta un permiso de Google para ${moduleId ?? "este modulo"} (revocado o no concedido).`,
    fix: "Vuelve a conectar el modulo con el enlace indicado; se pedira unicamente el permiso de este modulo.",
    next_action: "reconnect_module",
    ...(moduleId ? { url: connectUrl(moduleId) } : {}),
  });
}

function relogin(error: string, message: string): ActionableException {
  return new ActionableException({
    error,
    module: "gateway",
    message,
    fix: `Vuelve a iniciar sesion: ${getEnv().PUBLIC_URL}/login (CLI: \`concat login\`).`,
    next_action: "relogin",
  });
}

async function refresh(refreshToken: string): Promise<{ token: string; expiresAt: number; scopes: string[] | undefined }> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ActionableException({
      error: "upstream_error",
      module: "gateway",
      message: `No se pudo contactar a Google para renovar el acceso: ${toSafeError(e).message}`,
      fix: "Reintenta en unos instantes.",
      next_action: "retry",
    });
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const safe = toSafeError({ response: { status: res.status, data: json } });
    if (safe.code === "invalid_grant") {
      throw relogin("session_expired", "El acceso a Google expiro o fue revocado.");
    }
    throw new ActionableException({
      error: "upstream_error",
      module: "gateway",
      message: `Google rechazo la renovacion del acceso: ${safe.message}`,
      fix: "Reintenta en unos instantes. Si persiste, vuelve a iniciar sesion.",
      next_action: "retry",
    });
  }

  const body = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new ActionableException({
      error: "upstream_error",
      module: "gateway",
      message: "Google no devolvio un access token.",
      fix: "Reintenta en unos instantes.",
      next_action: "retry",
    });
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    token: body.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : undefined,
  };
}

/**
 * Access token de Google del usuario, con `requiredScopes` verificados contra los scopes otorgados.
 * Lanza ActionableException: `scope_lost` -> reconnect_module (con url), `session_expired`/`not_connected` -> relogin.
 */
export async function getAccessToken(userId: string, requiredScopes: string[]): Promise<string> {
  const sql = getDb();
  const rows = await sql<GrantRow[]>`
    SELECT refresh_token_ct, nonce, key_version, scopes, updated_at
    FROM google_grants WHERE user_id = ${userId}
  `;
  const grant = rows[0];
  if (!grant) throw relogin("not_connected", "Esta cuenta aun no autorizo ningun acceso a Google.");

  const missingInGrant = requiredScopes.filter((s) => !grant.scopes.includes(s));
  if (missingInGrant.length > 0) throw scopeLost(missingInGrant);

  const grantVersion = grant.updated_at.getTime();
  const hit = cache.get(userId);
  if (hit && hit.grantVersion === grantVersion && hit.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    const missing = requiredScopes.filter((s) => !hit.scopes.includes(s));
    if (missing.length > 0) throw scopeLost(missing);
    return hit.token;
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(
      { ct: grant.refresh_token_ct, nonce: grant.nonce, keyVersion: grant.key_version },
      userId,
    );
  } catch {
    // Mensaje fijo: nada del fallo criptografico llega al agente.
    throw relogin("grant_unreadable", "No se pudo leer la autorizacion guardada de Google.");
  }

  const fresh = await refresh(refreshToken);
  // Los scopes reales vienen de la respuesta de Google; si no los trae, se usan los del grant.
  const scopes = fresh.scopes ?? grant.scopes;
  cache.set(userId, { token: fresh.token, expiresAt: fresh.expiresAt, scopes, grantVersion });
  const missing = requiredScopes.filter((s) => !scopes.includes(s));
  if (missing.length > 0) throw scopeLost(missing);
  return fresh.token;
}
