import { getSessionUser } from "./auth/session";
import { bearerFrom, authenticate } from "./bearer";
import { isApiToken } from "./auth/api-tokens";
import { getEnv } from "./env";

export type ApiAuth = {
  userId: string;
  scope: string[];
  /** session = cookie web; oauth = access token OAuth; api-token = token de larga duracion (n8n/CI). */
  via: "session" | "oauth" | "api-token";
};

/**
 * Auth de /api/* (gestion de cuenta): token del gateway (Bearer) o sesion web (cookie).
 * Un Bearer presente pero invalido NO cae a la cookie. La cookie solo vale si el Origin (cuando viene)
 * es el del propio gateway (defensa en profundidad sobre SameSite=Lax).
 */
export async function authenticateApi(request: Request): Promise<ApiAuth | null> {
  const bearer = bearerFrom(request);
  if (bearer) {
    const claims = await authenticate(request);
    return claims ? { ...claims, via: isApiToken(bearer) ? "api-token" : "oauth" } : null;
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== getEnv().PUBLIC_URL) return null;
  const user = await getSessionUser();
  return user ? { userId: user.id, scope: ["*"], via: "session" } : null;
}
