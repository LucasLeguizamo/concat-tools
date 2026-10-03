import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rate-limit";
import { enterUserCode } from "./device-entry";

const memoryLimiter = (now = () => 1_000_000) => {
  const rows = new Map<string, number>();
  return createRateLimiter(async (k, w) => {
    const id = `${k}|${w.getTime()}`;
    rows.set(id, (rows.get(id) ?? 0) + 1);
    return rows.get(id)!;
  }, now);
};

const server = (valid: string) => ({
  lookupDevice: async (input: string) =>
    input === valid ? ({ userCode: valid, clientId: "concat-cli", scope: "*", createdAt: new Date(), initIp: null, initCountry: null }) : null,
});

describe("enterUserCode: limite de intentos por sesion", () => {
  it("5 intentos por 10 min por usuario; el 6to falla aunque el codigo sea correcto", async () => {
    const limiter = memoryLimiter();
    const deps = { limiter, server: server("BCDF-GHJK") };
    for (let i = 0; i < 5; i++) expect(await enterUserCode({ userId: "u1", input: "XXXX-XXXX" }, deps)).toBeNull();
    expect(await enterUserCode({ userId: "u1", input: "BCDF-GHJK" }, deps)).toBeNull(); // correcto pero sin cupo
    expect(await enterUserCode({ userId: "u2", input: "BCDF-GHJK" }, deps)).toBe("BCDF-GHJK"); // otro usuario no se ve afectado
  });

  it("un intento correcto dentro del cupo devuelve el user_code canonico; ventana nueva = cupo nuevo", async () => {
    let now = 1_000_000;
    const limiter = memoryLimiter(() => now);
    const deps = { limiter, server: server("BCDF-GHJK") };
    for (let i = 0; i < 5; i++) await enterUserCode({ userId: "u1", input: "mal" }, deps);
    now += 600_000;
    expect(await enterUserCode({ userId: "u1", input: "BCDF-GHJK" }, deps)).toBe("BCDF-GHJK");
  });

  it("no consulta el codigo cuando ya no hay cupo (no sirve de oraculo)", async () => {
    let lookups = 0;
    const deps = { limiter: memoryLimiter(), server: { lookupDevice: async () => (lookups++, null) } };
    for (let i = 0; i < 9; i++) await enterUserCode({ userId: "u1", input: "x" }, deps);
    expect(lookups).toBe(5);
  });
});
