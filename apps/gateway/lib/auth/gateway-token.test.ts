import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../env";
import { deriveKey } from "./keys";
import { hashToken, randomToken, signAccessToken, verifyAccessToken } from "./gateway-token";

const SECRET = randomBytes(48).toString("base64url");

beforeEach(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "sec",
    PUBLIC_URL: "https://gw.example.com/",
    VAULT_KEYS: `v1:${randomBytes(32).toString("base64")}`,
    CRON_SECRET: "c".repeat(16),
    JWT_SECRET: SECRET,
  });
  resetEnvCache();
});
afterEach(() => resetEnvCache());

describe("gateway token", () => {
  it("firma y verifica; claims sub/scope/aud", async () => {
    const t = await signAccessToken({ userId: "u1", scope: ["gsc", "ga4"] });
    const c = await verifyAccessToken(t);
    expect(c).toEqual({ userId: "u1", scope: ["gsc", "ga4"] });
    const payload = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString());
    expect(payload.aud).toBe("https://gw.example.com/mcp");
    expect(payload.exp - payload.iat).toBe(3600);
    expect(payload.scope).toBe("gsc ga4");
  });

  it("rechaza firma ajena, aud incorrecta y expirado", async () => {
    const other = new TextEncoder().encode(randomBytes(48).toString("base64url"));
    const forged = await new SignJWT({ scope: "gsc" })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("https://gw.example.com/mcp")
      .setExpirationTime("1h")
      .sign(other);
    await expect(verifyAccessToken(forged)).rejects.toThrow();

    const key = deriveKey("access");
    const badAud = await new SignJWT({ scope: "gsc" })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("https://evil.example.com/mcp")
      .setExpirationTime("1h")
      .sign(key);
    await expect(verifyAccessToken(badAud)).rejects.toThrow();

    const expired = await new SignJWT({ scope: "gsc" })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("https://gw.example.com/mcp")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);
    await expect(verifyAccessToken(expired)).rejects.toThrow();
  });

  it("exige typ at+jwt (RFC 9068): un JWT con el mismo secreto y typ JWT se rechaza", async () => {
    const claims = (typ: string, key: Uint8Array) =>
      new SignJWT({ scope: "gsc" })
        .setProtectedHeader({ alg: "HS256", typ })
        .setSubject("u1")
        .setIssuer("https://gw.example.com")
        .setAudience("https://gw.example.com/mcp")
        .setExpirationTime("1h")
        .sign(key);
    await expect(verifyAccessToken(await claims("at+jwt", deriveKey("access")))).resolves.toMatchObject({ userId: "u1" });
    await expect(verifyAccessToken(await claims("JWT", deriveKey("access")))).rejects.toThrow();
  });

  it("clave derivada por proposito: ni el secreto crudo ni la clave de sesion firman access tokens", async () => {
    const mk = (key: Uint8Array) =>
      new SignJWT({ scope: "gsc" })
        .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
        .setSubject("u1")
        .setIssuer("https://gw.example.com")
        .setAudience("https://gw.example.com/mcp")
        .setExpirationTime("1h")
        .sign(key);
    await expect(verifyAccessToken(await mk(new TextEncoder().encode(SECRET)))).rejects.toThrow();
    await expect(verifyAccessToken(await mk(deriveKey("session")))).rejects.toThrow();
    await expect(verifyAccessToken(await mk(deriveKey("access")))).resolves.toBeTruthy();
    expect(Buffer.from(deriveKey("access")).equals(Buffer.from(deriveKey("session")))).toBe(false);
  });

  it("hashToken/randomToken", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const a = randomToken();
    expect(a).not.toBe(randomToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
