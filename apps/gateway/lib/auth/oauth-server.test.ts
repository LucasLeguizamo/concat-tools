import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../env";
import { hashToken, verifyAccessToken } from "./gateway-token";
import { OAuthError } from "./http";
import {
  createOAuthServer,
  DEVICE_INTERVAL_S,
  DEVICE_TTL_S,
  FAMILY_TTL_S,
  generateUserCode,
  MAX_DEVICE_PENDING_PER_IP,
  MAX_PENDING_PER_IP,
  REFRESH_GRACE_S,
  isScopeSubset,
  normalizeUserCode,
  parseScope,
  s256,
  verifyPkce,
  type OAuthServer,
} from "./oauth-server";
import type { CodeRecord, DeviceRecord, OAuthStore, PendingAuth, RefreshRecord } from "./oauth-store";

/** Store en memoria con la misma semantica atomica (take/consume) que la version Postgres. */
function memoryStore() {
  const pending = new Map<string, PendingAuth>();
  const codes = new Map<string, CodeRecord>();
  const refresh = new Map<string, RefreshRecord>();
  const devices = new Map<string, DeviceRecord & { hash: string }>();

  const store: OAuthStore = {
    async insertPending(p) {
      const id = randomUUID();
      pending.set(id, { ...p, id });
      return id;
    },
    async countPending(by, now) {
      return [...pending.values()].filter(
        (p) => p.expiresAt > now && ("clientId" in by ? p.clientId === by.clientId : p.ip === by.ip),
      ).length;
    },
    async getPending(id, now) {
      const p = pending.get(id);
      return p && p.expiresAt > now ? p : null;
    },
    async takePending(id, now) {
      const p = await store.getPending(id, now);
      pending.delete(id);
      return p;
    },
    async insertCode(hash, r) {
      codes.set(hash, r);
    },
    async takeCode(hash) {
      const r = codes.get(hash) ?? null;
      codes.delete(hash);
      return r;
    },
    async insertRefresh(hash, r) {
      refresh.set(hash, { ...r, revokedAt: null, rotatedAt: null });
    },
    async findRefresh(hash) {
      return refresh.get(hash) ?? null;
    },
    async consumeRefresh(hash, now) {
      const r = refresh.get(hash);
      if (!r || r.revokedAt || r.expiresAt <= now) return null;
      r.revokedAt = now;
      r.rotatedAt = now;
      return { ...r };
    },
    async revokeFamily(familyId, now) {
      for (const r of refresh.values()) {
        if (r.familyId !== familyId) continue;
        r.revokedAt ??= now;
        r.rotatedAt = null;
      }
    },
    async insertDevice(hash, r) {
      if ([...devices.values()].some((d) => d.userCode === r.userCode)) return false;
      devices.set(hash, { ...r, hash, userId: null, lastPolledAt: null, createdAt: new Date(now) });
      return true;
    },
    async countPendingDevices(by, now) {
      return [...devices.values()].filter(
        (d) => !d.userId && d.expiresAt > now && ("clientId" in by ? d.clientId === by.clientId : d.initIp === by.ip),
      ).length;
    },
    async getDeviceByUserCode(userCode, now) {
      return [...devices.values()].find((d) => d.userCode === userCode && d.expiresAt > now && !d.deniedAt) ?? null;
    },
    async getDevice(hash) {
      return devices.get(hash) ?? null;
    },
    async approveDevice(userCode, userId, now) {
      const d = await store.getDeviceByUserCode(userCode, now);
      if (!d || d.userId) return false;
      d.userId = userId;
      return true;
    },
    async denyDevice(userCode, now) {
      const d = await store.getDeviceByUserCode(userCode, now);
      if (!d || d.userId) return false;
      d.deniedAt = now;
      return true;
    },
    async touchDevice(hash, now) {
      const d = devices.get(hash);
      if (d) d.lastPolledAt = now;
    },
    async deleteDevice(hash) {
      devices.delete(hash);
    },
    async takeApprovedDevice(hash) {
      const d = devices.get(hash);
      if (!d || !d.userId) return null;
      devices.delete(hash);
      return d;
    },
  };
  return { store, refresh, codes, devices };
}

const verifier = randomBytes(32).toString("base64url");
const challenge = s256(verifier);

let now = 1_700_000_000_000;
let mem: ReturnType<typeof memoryStore>;
let server: OAuthServer;

beforeEach(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "sec",
    PUBLIC_URL: "https://gw.example.com",
    VAULT_KEYS: `v1:${randomBytes(32).toString("base64")}`,
    CRON_SECRET: "c".repeat(16),
    JWT_SECRET: randomBytes(48).toString("base64url"),
  });
  resetEnvCache();
  now = 1_700_000_000_000;
  mem = memoryStore();
  server = createOAuthServer(mem.store, () => now);
});

const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof OAuthError) return e.code;
    throw e;
  }
  return "no-error";
};

async function authorize(scope = ["*"]) {
  const id = await server.startAuthorization({
    clientId: "concat-cli",
    redirectUri: "http://127.0.0.1:5000/callback",
    codeChallenge: challenge,
    scope,
    state: "st",
    ip: "203.0.113.9",
  });
  return (await server.approveAuthorization(id, "user-1"))!;
}

describe("PKCE", () => {
  it("S256 coincide con el vector de RFC 7636 y rechaza verifier incorrecto o fuera de rango", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(randomBytes(32).toString("base64url"), challenge)).toBe(false);
    expect(verifyPkce("corto", s256("corto"))).toBe(false);
  });
});

describe("scope", () => {
  it("default *, normaliza, rechaza basura y valida subconjuntos", () => {
    expect(parseScope(undefined)).toEqual(["*"]);
    expect(parseScope("ga4 gsc gsc")).toEqual(["ga4", "gsc"]);
    expect(parseScope("gsc *")).toEqual(["*"]);
    expect(() => parseScope("gsc;drop")).toThrow(OAuthError);
    expect(isScopeSubset(["gsc"], ["*"])).toBe(true);
    expect(isScopeSubset(["gsc"], ["gsc", "ga4"])).toBe(true);
    expect(isScopeSubset(["ga4"], ["gsc"])).toBe(false);
    expect(isScopeSubset(["*"], ["gsc"])).toBe(false);
  });
});

describe("authorization_code", () => {
  const exchange = (code: string, over: Partial<{ clientId: string; redirectUri: string; codeVerifier: string }> = {}) =>
    server.exchangeCode({
      code,
      clientId: "concat-cli",
      redirectUri: "http://127.0.0.1:5000/callback",
      codeVerifier: verifier,
      ...over,
    });

  it("emite tokens validos con la forma del contrato y guarda solo el hash del code", async () => {
    const { code, state } = await authorize(["gsc"]);
    expect(state).toBe("st");
    expect(mem.codes.has(code)).toBe(false);
    expect(mem.codes.has(hashToken(code))).toBe(true);

    const t = await exchange(code);
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "gsc" });
    expect(await verifyAccessToken(t.access_token)).toEqual({ userId: "user-1", scope: ["gsc"] });
    expect(mem.refresh.has(t.refresh_token)).toBe(false);
    expect(mem.refresh.has(hashToken(t.refresh_token))).toBe(true);
  });

  it("es de un solo uso: el segundo canje falla", async () => {
    const { code } = await authorize();
    await exchange(code);
    expect(await errCode(exchange(code))).toBe("invalid_grant");
  });

  it("un intento fallido (verifier malo) tambien consume el code", async () => {
    const { code } = await authorize();
    expect(await errCode(exchange(code, { codeVerifier: randomBytes(32).toString("base64url") }))).toBe("invalid_grant");
    expect(await errCode(exchange(code))).toBe("invalid_grant");
  });

  it("rechaza client_id o redirect_uri distintos, y code expirado", async () => {
    expect(await errCode(exchange((await authorize()).code, { clientId: "otro" }))).toBe("invalid_grant");
    expect(
      await errCode(exchange((await authorize()).code, { redirectUri: "http://127.0.0.1:6000/callback" })),
    ).toBe("invalid_grant");
    const { code } = await authorize();
    now += 61_000;
    expect(await errCode(exchange(code))).toBe("invalid_grant");
  });

  it("el pending solo se aprueba una vez y expira", async () => {
    const id = await server.startAuthorization({
      clientId: "concat-cli",
      redirectUri: "http://127.0.0.1:5000/callback",
      codeChallenge: challenge,
      scope: ["*"],
      state: null,
      ip: "203.0.113.9",
    });
    expect(await server.approveAuthorization(id, "u")).not.toBeNull();
    expect(await server.approveAuthorization(id, "u")).toBeNull();
    const id2 = await server.startAuthorization({
      clientId: "concat-cli",
      redirectUri: "http://127.0.0.1:5000/callback",
      codeChallenge: challenge,
      scope: ["*"],
      state: null,
      ip: "203.0.113.9",
    });
    now += 601_000;
    expect(await server.approveAuthorization(id2, "u")).toBeNull();
  });
});

describe("tope de pending_auth", () => {
  it("por IP: pasado el tope, startAuthorization falla con temporarily_unavailable (429)", async () => {
    const start = (ip: string) =>
      server.startAuthorization({
        clientId: "concat-cli",
        redirectUri: "http://127.0.0.1:5000/callback",
        codeChallenge: challenge,
        scope: ["*"],
        state: null,
        ip,
      });
    for (let i = 0; i < MAX_PENDING_PER_IP; i++) await start("198.51.100.1");
    const err = await start("198.51.100.1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).code).toBe("temporarily_unavailable");
    expect((err as OAuthError).status).toBe(429);
    await start("198.51.100.2");
  });
});

describe("refresh con rotacion", () => {
  async function login(scope = ["*"]) {
    const { code } = await authorize(scope);
    return server.exchangeCode({
      code,
      clientId: "concat-cli",
      redirectUri: "http://127.0.0.1:5000/callback",
      codeVerifier: verifier,
    });
  }

  it("rota: el viejo queda revocado y el nuevo funciona", async () => {
    const t1 = await login();
    const t2 = await server.exchangeRefresh({ refreshToken: t1.refresh_token, clientId: "concat-cli" });
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect(mem.refresh.get(hashToken(t1.refresh_token))!.revokedAt).not.toBeNull();
    const t3 = await server.exchangeRefresh({ refreshToken: t2.refresh_token, clientId: "concat-cli" });
    expect(t3.token_type).toBe("Bearer");
  });

  it("reusar un refresh ya rotado FUERA de gracia falla y revoca la familia (incluido el token mas nuevo)", async () => {
    const t1 = await login();
    const t2 = await server.exchangeRefresh({ refreshToken: t1.refresh_token, clientId: "concat-cli" });
    now += (REFRESH_GRACE_S + 1) * 1000;
    expect(await errCode(server.exchangeRefresh({ refreshToken: t1.refresh_token, clientId: "concat-cli" }))).toBe(
      "invalid_grant",
    );
    expect(await errCode(server.exchangeRefresh({ refreshToken: t2.refresh_token, clientId: "concat-cli" }))).toBe(
      "invalid_grant",
    );
  });

  const refreshWith = (refreshToken: string) => server.exchangeRefresh({ refreshToken, clientId: "concat-cli" });

  it("ventana de gracia: reusar el refresh recien rotado entrega un par nuevo en la misma familia, sin revocar", async () => {
    const t1 = await login();
    const t2 = await refreshWith(t1.refresh_token);
    now += 10_000; // dentro de 30 s (p. ej. la respuesta se perdio y el cliente reintenta)
    const t2b = await refreshWith(t1.refresh_token);
    expect(t2b.refresh_token).not.toBe(t2.refresh_token);
    const fam = (t: string) => mem.refresh.get(hashToken(t))!.familyId;
    expect(fam(t2b.refresh_token)).toBe(fam(t1.refresh_token));
    expect(mem.refresh.get(hashToken(t2.refresh_token))!.revokedAt).toBeNull(); // no se revoco nada
    await refreshWith(t2.refresh_token); // ambos pares siguen funcionando
    await refreshWith(t2b.refresh_token);
  });

  it("refresh concurrente del mismo token: ninguno revoca la familia (el perdedor cae en gracia)", async () => {
    const t1 = await login();
    const [a, b] = await Promise.all([refreshWith(t1.refresh_token), refreshWith(t1.refresh_token)]);
    expect(a.refresh_token).not.toBe(b.refresh_token);
    await refreshWith(a.refresh_token);
  });

  it("el reuso fuera de gracia revoca SOLO su familia: otro login del mismo usuario+cliente sigue vivo", async () => {
    const victim = await login();
    const other = await login(); // misma persona, otro dispositivo
    await refreshWith(victim.refresh_token);
    now += (REFRESH_GRACE_S + 1) * 1000;
    expect(await errCode(refreshWith(victim.refresh_token))).toBe("invalid_grant");
    expect((await refreshWith(other.refresh_token)).token_type).toBe("Bearer");
  });

  it("un token revocado a proposito (revoke) no tiene gracia", async () => {
    const t1 = await login();
    const t2 = await refreshWith(t1.refresh_token);
    await server.revoke(t2.refresh_token);
    expect(await errCode(refreshWith(t2.refresh_token))).toBe("invalid_grant");
    expect(await errCode(refreshWith(t1.refresh_token))).toBe("invalid_grant"); // revoke tumba la familia
  });

  it("vida absoluta de 90 d de la familia: rotar no la reinicia y ningun token vive mas que ella", async () => {
    let t = await login();
    const familyEnd = now + FAMILY_TTL_S * 1000;
    for (let i = 0; i < 3; i++) {
      now += 29 * 24 * 3600 * 1000; // dia 29, 58, 87
      t = await refreshWith(t.refresh_token);
    }
    expect(mem.refresh.get(hashToken(t.refresh_token))!.expiresAt.getTime()).toBe(familyEnd); // recortado a la familia
    now = familyEnd + 1000;
    expect(await errCode(refreshWith(t.refresh_token))).toBe("invalid_grant");
  });

  it("rechaza client distinto, token desconocido y expirado", async () => {
    const t = await login();
    expect(await errCode(server.exchangeRefresh({ refreshToken: t.refresh_token, clientId: "otro" }))).toBe("invalid_grant");
    expect(await errCode(server.exchangeRefresh({ refreshToken: "nope", clientId: "concat-cli" }))).toBe("invalid_grant");
    now += 31 * 24 * 3600 * 1000;
    expect(await errCode(server.exchangeRefresh({ refreshToken: t.refresh_token, clientId: "concat-cli" }))).toBe(
      "invalid_grant",
    );
  });

  it("un token de API (client_id api-token) nunca se canjea por el flujo refresh", async () => {
    const { hashToken } = await import("./gateway-token");
    await mem.store.insertRefresh(hashToken("cgw_secreto"), {
      userId: "u1",
      clientId: "api-token",
      scope: "*",
      expiresAt: new Date(now + 1e9),
      familyId: randomUUID(),
      familyExpiresAt: new Date(now + 1e9),
    });
    expect(await errCode(server.exchangeRefresh({ refreshToken: "cgw_secreto", clientId: "api-token" }))).toBe("invalid_grant");
  });

  it("scope solo puede estrecharse", async () => {
    const t = await login(["gsc", "ga4"]);
    expect(await errCode(server.exchangeRefresh({ refreshToken: t.refresh_token, clientId: "concat-cli", scope: "drive" }))).toBe(
      "invalid_scope",
    );
    const narrowed = await server.exchangeRefresh({ refreshToken: t.refresh_token, clientId: "concat-cli", scope: "gsc" });
    expect(narrowed.scope).toBe("gsc");
  });

  it("revoke invalida el refresh sin error aunque el token no exista", async () => {
    const t = await login();
    await server.revoke("desconocido");
    await server.revoke(t.refresh_token);
    expect(await errCode(server.exchangeRefresh({ refreshToken: t.refresh_token, clientId: "concat-cli" }))).toBe(
      "invalid_grant",
    );
  });
});

describe("device flow", () => {
  const poll = (deviceCode: string) => server.pollDevice({ deviceCode, clientId: "concat-cli" });

  it("user_code legible ABCD-EFGH, sin vocales; normaliza la entrada del usuario", () => {
    for (let i = 0; i < 50; i++) expect(generateUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(normalizeUserCode("bcdf ghjk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("BCDF-GHJA")).toBeNull(); // vocal fuera del alfabeto
    expect(normalizeUserCode("BCDF")).toBeNull();
  });

  it("respuesta segun contrato y solo se guarda el hash del device_code", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "203.0.113.9", country: "AR" });
    expect(d).toMatchObject({
      verification_uri: "https://gw.example.com/device",
      expires_in: DEVICE_TTL_S,
      interval: DEVICE_INTERVAL_S,
    });
    // Sin enlace con el codigo incrustado (vector de phishing de device code).
    expect(d).not.toHaveProperty("verification_uri_complete");
    expect(mem.devices.has(d.device_code)).toBe(false);
    expect(mem.devices.has(hashToken(d.device_code))).toBe(true);
  });

  it("device flow solo para concat-cli: cualquier otro client_id (incl. CIMD) es unauthorized_client", async () => {
    for (const clientId of ["https://evil.example.com/client.json", "otro", ""]) {
      expect(
        await errCode(server.startDevice({ clientId, scope: ["*"], ip: "203.0.113.9", country: null })),
        clientId,
      ).toBe("unauthorized_client");
    }
    expect(mem.devices.size).toBe(0);
  });

  it("guarda quien inicio el flujo (IP, pais, hora) y lookupDevice lo expone para la pantalla de aprobacion", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["gsc"], ip: "198.51.100.7", country: "AR" });
    const found = await server.lookupDevice(d.user_code);
    expect(found).toMatchObject({ clientId: "concat-cli", initIp: "198.51.100.7", initCountry: "AR" });
    expect(found?.createdAt.getTime()).toBe(now);
  });

  it("tope de device codes pendientes por IP (otra IP no se ve afectada)", async () => {
    for (let i = 0; i < MAX_DEVICE_PENDING_PER_IP; i++) {
      await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "198.51.100.7", country: null });
    }
    expect(
      await errCode(server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "198.51.100.7", country: null })),
    ).toBe("temporarily_unavailable");
    await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "198.51.100.8", country: null });
    now += (DEVICE_TTL_S + 1) * 1000; // al expirar, vuelve a caber
    await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "198.51.100.7", country: null });
  });

  it("authorization_pending -> slow_down si se consulta antes del intervalo -> tokens tras aprobar", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["gsc"], ip: "203.0.113.9", country: "AR" });
    expect(await errCode(poll(d.device_code))).toBe("authorization_pending");

    now += 1_000; // < 5 s
    expect(await errCode(poll(d.device_code))).toBe("slow_down");

    expect(await server.approveDevice(d.user_code.toLowerCase(), "user-9")).toBe(true);
    now += 6_000;
    const t = await poll(d.device_code);
    expect(await verifyAccessToken(t.access_token)).toEqual({ userId: "user-9", scope: ["gsc"] });
  });

  it("el device_code es de un solo uso y no se puede aprobar dos veces", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "203.0.113.9", country: "AR" });
    expect(await server.approveDevice(d.user_code, "u1")).toBe(true);
    expect(await server.approveDevice(d.user_code, "u2")).toBe(false);
    now += 6_000;
    await poll(d.device_code);
    now += 6_000;
    expect(await errCode(poll(d.device_code))).toBe("invalid_grant");
  });

  it("Denegar en /device: el siguiente poll recibe access_denied, el codigo muere y ya no se puede aprobar", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "203.0.113.9", country: "AR" });
    expect(await server.denyDevice(d.user_code.toLowerCase())).toBe(true);
    expect(await server.approveDevice(d.user_code, "u")).toBe(false);
    expect(await server.lookupDevice(d.user_code)).toBeNull();
    now += 6_000;
    expect(await errCode(poll(d.device_code))).toBe("access_denied");
    now += 6_000;
    expect(await errCode(poll(d.device_code))).toBe("invalid_grant"); // ya borrado
    expect(await server.denyDevice(d.user_code)).toBe(false);
  });

  it("expired_token tras 600 s, y el user_code expirado ya no se aprueba", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "203.0.113.9", country: "AR" });
    now += (DEVICE_TTL_S + 1) * 1000;
    expect(await server.approveDevice(d.user_code, "u")).toBe(false);
    expect(await errCode(poll(d.device_code))).toBe("expired_token");
  });

  it("rechaza device_code de otro cliente o desconocido", async () => {
    const d = await server.startDevice({ clientId: "concat-cli", scope: ["*"], ip: "203.0.113.9", country: "AR" });
    expect(await errCode(server.pollDevice({ deviceCode: d.device_code, clientId: "otro" }))).toBe("invalid_grant");
    expect(await errCode(poll("desconocido"))).toBe("invalid_grant");
  });
});

it("sanity: sha256 hex de hashToken", () => {
  expect(hashToken("a")).toBe(createHash("sha256").update("a").digest("hex"));
});
