import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

/** Misma semantica que el upsert de Postgres: contador por (key, window_start). */
function memoryIncr() {
  const rows = new Map<string, number>();
  return {
    rows,
    incr: async (key: string, windowStart: Date) => {
      const k = `${key}|${windowStart.toISOString()}`;
      rows.set(k, (rows.get(k) ?? 0) + 1);
      return rows.get(k)!;
    },
  };
}

describe("rate limiter de ventana fija", () => {
  it("permite hasta `limit` y bloquea el siguiente, con retryAfter hasta fin de ventana", async () => {
    const { incr } = memoryIncr();
    let now = Date.UTC(2026, 9, 3, 12, 0, 10); // 10 s dentro de la ventana de 60 s
    const rl = createRateLimiter(incr, () => now);
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 3, 60)).allowed).toBe(true);
    const blocked = await rl.hit("k", 3, 60);
    expect(blocked).toEqual({ allowed: false, retryAfter: 50 });
    now += 50_000; // nueva ventana
    expect((await rl.hit("k", 3, 60)).allowed).toBe(true);
  });

  it("las claves son independientes", async () => {
    const rl = createRateLimiter(memoryIncr().incr, () => 1_000_000);
    expect((await rl.hit("ip:a", 1, 60)).allowed).toBe(true);
    expect((await rl.hit("ip:a", 1, 60)).allowed).toBe(false);
    expect((await rl.hit("ip:b", 1, 60)).allowed).toBe(true);
  });

  it("llamadas concurrentes: exactamente `limit` pasan", async () => {
    const rl = createRateLimiter(memoryIncr().incr, () => 5_000);
    const results = await Promise.all(Array.from({ length: 20 }, () => rl.hit("k", 5, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("retryAfter nunca es 0", async () => {
    const rl = createRateLimiter(memoryIncr().incr, () => 59_999);
    expect((await rl.hit("k", 0, 60)).retryAfter).toBeGreaterThanOrEqual(1);
  });
});
