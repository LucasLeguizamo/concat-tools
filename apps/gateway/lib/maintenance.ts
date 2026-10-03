import type { Sql } from "./db";

/**
 * Borra filas expiradas (cron diario). Los tokens refresh se conservan 1 dia tras expirar
 * y las sesiones web 1 dia; las ventanas de rate limit, 1 hora.
 */
export async function cleanupExpired(db: Sql): Promise<Record<string, number>> {
  const run = async (q: PromiseLike<{ count: number }>) => (await q).count;
  return {
    rate_limits: await run(db`DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'`),
    pending_auth: await run(db`DELETE FROM pending_auth WHERE expires_at < now()`),
    oauth_codes: await run(db`DELETE FROM oauth_codes WHERE expires_at < now()`),
    device_codes: await run(db`DELETE FROM device_codes WHERE expires_at < now()`),
    gateway_tokens: await run(
      db`DELETE FROM gateway_tokens WHERE expires_at < now() - interval '1 day' OR family_expires_at < now() - interval '1 day'`,
    ),
    web_sessions: await run(
      db`DELETE FROM web_sessions WHERE expires_at < now() - interval '1 day' OR revoked_at < now() - interval '1 day'`,
    ),
  };
}
