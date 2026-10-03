import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "../modules/test-utils";
import { deriveKey } from "./keys";

// Fake minimo de las 3 consultas de web_sessions (misma semantica que el SQL).
type Sess = { sid: string; userId: string; expiresAt: number; revoked: boolean };
const db = { sessions: new Map<string, Sess>(), seq: 0, now: 1_700_000_000_000 };

vi.mock("../db", () => ({
  getDb: () => (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("INSERT INTO web_sessions")) {
      const sid = `00000000-0000-4000-8000-${String(++db.seq).padStart(12, "0")}`;
      db.sessions.set(sid, { sid, userId: v[0] as string, expiresAt: db.now + (v[1] as number) * 1000, revoked: false });
      return Promise.resolve([{ sid }]);
    }
    if (q.includes("SELECT sid FROM web_sessions")) {
      const s = db.sessions.get(v[0] as string);
      const ok = s && s.userId === v[1] && !s.revoked && s.expiresAt > db.now;
      return Promise.resolve(ok ? [{ sid: s.sid }] : []);
    }
    if (q.includes("UPDATE web_sessions")) {
      const s = db.sessions.get(v[0] as string);
      if (s) s.revoked = true;
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

const {
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  signDeviceConfirm,
  verifyDeviceConfirm,
} = await import("./session");
const { signAccessToken, verifyAccessToken } = await import("./gateway-token");

beforeEach(() => {
  setTestEnv();
  db.sessions.clear();
  db.seq = 0;
});

describe("sesion web con sid revocable", () => {
  it("el token lleva sid y la sesion existe en DB", async () => {
    const t = await createSessionToken("u1", "a@b.c");
    const payload = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString());
    expect(payload.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.sessions.has(payload.sid)).toBe(true);
    expect(await verifySessionToken(t)).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("tras revocar (logout) la cookie robada deja de valer aunque el JWT no haya expirado", async () => {
    const t = await createSessionToken("u1", "a@b.c");
    await revokeSessionToken(t);
    expect(await verifySessionToken(t)).toBeNull();
  });

  it("revocar una sesion no afecta a otra del mismo usuario", async () => {
    const a = await createSessionToken("u1", "a@b.c");
    const b = await createSessionToken("u1", "a@b.c");
    await revokeSessionToken(a);
    expect(await verifySessionToken(b)).not.toBeNull();
  });

  it("sesion expirada en DB o JWT sin sid / con sid ajeno: rechazado", async () => {
    const t = await createSessionToken("u1", "a@b.c");
    db.now += 8 * 24 * 3600 * 1000;
    expect(await verifySessionToken(t)).toBeNull();

    db.now -= 8 * 24 * 3600 * 1000;
    const nosid = await new SignJWT({ email: "a@b.c" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("concat-gateway-session")
      .setExpirationTime("1h")
      .sign(deriveKey("session"));
    expect(await verifySessionToken(nosid)).toBeNull();

    const other = await createSessionToken("u2", "x@y.z");
    const sidOfU2 = JSON.parse(Buffer.from(other.split(".")[1]!, "base64url").toString()).sid;
    const stolen = await new SignJWT({ email: "a@b.c", sid: sidOfU2 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("concat-gateway-session")
      .setExpirationTime("1h")
      .sign(deriveKey("session"));
    expect(await verifySessionToken(stolen)).toBeNull(); // sid de otro usuario
  });

  it("clave por proposito: la sesion no es un access token y viceversa", async () => {
    const session = await createSessionToken("u1", "a@b.c");
    await expect(verifyAccessToken(session)).rejects.toThrow();
    const access = await signAccessToken({ userId: "u1", scope: ["*"] });
    expect(await verifySessionToken(access)).toBeNull();
  });
});

describe("confirmacion del device flow (cookie firmada)", () => {
  it("ligada al usuario y al codigo; otra clave o usuario distinto no valen", async () => {
    const t = await signDeviceConfirm("u1", "BCDF-GHJK");
    expect(await verifyDeviceConfirm(t, "u1")).toBe("BCDF-GHJK");
    expect(await verifyDeviceConfirm(t, "u2")).toBeNull();
    const forged = await new SignJWT({ uc: "BCDF-GHJK" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("https://gw.example.com")
      .setAudience("concat-device-confirm")
      .setExpirationTime("5m")
      .sign(deriveKey("session"));
    expect(await verifyDeviceConfirm(forged, "u1")).toBeNull();
  });
});
