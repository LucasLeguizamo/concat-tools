import { LIMITS, type RateLimiter } from "../rate-limit";
import type { OAuthServer } from "./oauth-server";

/**
 * Valida un user_code tecleado en /device. Cada intento (acierte o no) cuenta contra el limite
 * por usuario/sesion (5 por 10 min); pasado el limite, el codigo ni se consulta.
 * Un solo resultado generico (`null`) para "no existe", "expirado" y "demasiados intentos":
 * no revela cual de los tres fue.
 */
export async function enterUserCode(
  p: { userId: string; input: string },
  deps: { limiter: RateLimiter; server: Pick<OAuthServer, "lookupDevice"> },
): Promise<string | null> {
  const { limit, windowS } = LIMITS.userCode;
  const rate = await deps.limiter.hit(`usercode:${p.userId}`, limit, windowS);
  if (!rate.allowed) return null;
  const device = await deps.server.lookupDevice(p.input);
  return device ? device.userCode : null;
}
