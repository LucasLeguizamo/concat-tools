import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "./env";

afterEach(() => resetEnvCache());

describe("getEnv", () => {
  it("es lazy: importar no valida; getEnv lanza sin variables y sin filtrar valores", () => {
    const saved = { ...process.env };
    for (const k of ["DATABASE_URL", "VAULT_KEYS", "JWT_SECRET"]) delete process.env[k];
    process.env.JWT_SECRET = "short-secret-value";
    resetEnvCache();
    try {
      expect(() => getEnv()).toThrow(/DATABASE_URL/);
      expect(() => getEnv()).not.toThrow(/short-secret-value/);
    } finally {
      process.env = saved;
    }
  });

  it("acepta env valido y normaliza PUBLIC_URL", () => {
    Object.assign(process.env, {
      DATABASE_URL: "postgres://x",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "s",
      PUBLIC_URL: "http://localhost:3000/",
      VAULT_KEYS: `v1:${randomBytes(32).toString("base64")}`,
      CRON_SECRET: "c".repeat(16),
      JWT_SECRET: "j".repeat(32),
    });
    resetEnvCache();
    expect(getEnv().PUBLIC_URL).toBe("http://localhost:3000");
  });
});
