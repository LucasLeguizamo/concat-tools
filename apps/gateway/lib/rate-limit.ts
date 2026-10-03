import { getDb } from "./db";

// Rate limit de ventana fija sobre Postgres: un upsert atomico por intento.
// ponytail: suficiente en M1 (un Postgres, trafico bajo). Si escala, mover a WAF de Vercel / Redis
// y borrar la tabla `rate_limits` (la limpieza de filas viejas corre en el cron diario).

export type RateResult = { allowed: boolean; /** segundos hasta que abre la siguiente ventana */ retryAfter: number };

/** Incrementa y devuelve el contador de (key, windowStart). Atomico. */
export type Incr = (key: string, windowStart: Date) => Promise<number>;

export const pgIncr: Incr = async (key, windowStart) => {
  const rows = await getDb()<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  return rows[0]!.count;
};

export function createRateLimiter(incr: Incr = pgIncr, clock: () => number = Date.now) {
  return {
    /** Cuenta un intento. `allowed=false` cuando se supera `limit` dentro de la ventana de `windowS` segundos. */
    async hit(key: string, limit: number, windowS: number): Promise<RateResult> {
      const windowMs = windowS * 1000;
      const now = clock();
      const start = Math.floor(now / windowMs) * windowMs;
      const count = await incr(key, new Date(start));
      return { allowed: count <= limit, retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

let cached: RateLimiter | undefined;
export const rateLimiter = (): RateLimiter => (cached ??= createRateLimiter());

/** Limites por endpoint (ventana de 60 s salvo indicacion). */
export const LIMITS = {
  authorizeIp: { limit: 30, windowS: 60 },
  deviceIp: { limit: 10, windowS: 60 },
  tokenIp: { limit: 60, windowS: 60 },
  /** tools/call por usuario x modulo */
  toolCall: { limit: 60, windowS: 60 },
  /** intentos de user_code por usuario (sesion) */
  userCode: { limit: 5, windowS: 600 },
} as const;
