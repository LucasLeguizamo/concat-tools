import { verifyAccessToken, type GatewayClaims } from "./auth/gateway-token";
import { getEnv } from "./env";

/** Token Bearer del header Authorization, o null. */
export function bearerFrom(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return m?.[1] ?? null;
}

/** Verifica el token del gateway (firma, exp, iss, aud). null si falta o es invalido. */
export async function authenticate(request: Request): Promise<GatewayClaims | null> {
  const token = bearerFrom(request);
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

/** 401 con el challenge del contrato (PRM, RFC 9728). */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${getEnv().PUBLIC_URL}/.well-known/oauth-protected-resource"`,
      "cache-control": "no-store",
    },
  });
}

/** El scope del token (`*` o ids de modulo) permite este modulo. */
export function scopeAllows(scope: string[], moduleId: string): boolean {
  return scope.includes("*") || scope.includes(moduleId);
}
