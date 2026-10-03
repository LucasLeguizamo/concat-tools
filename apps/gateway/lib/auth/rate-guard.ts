import { rateLimiter, type RateLimiter } from "../rate-limit";
import { clientIp, OAuthError } from "./http";

/** Limite por IP para un endpoint OAuth. Devuelve el error (429 + Retry-After) o null si pasa. */
export async function limitByIp(
  req: Request,
  endpoint: string,
  cfg: { limit: number; windowS: number },
  limiter: RateLimiter = rateLimiter(),
): Promise<OAuthError | null> {
  const r = await limiter.hit(`ip:${endpoint}:${clientIp(req)}`, cfg.limit, cfg.windowS);
  return r.allowed
    ? null
    : new OAuthError("temporarily_unavailable", "Demasiadas solicitudes; reintenta mas tarde", 429, r.retryAfter);
}
