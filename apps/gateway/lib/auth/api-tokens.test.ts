import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "../modules/test-utils";

type Row = { id: string; refresh_hash: string; user_id: string; client_id: string; scope: string; name: string | null; created_at: Date; expires_at: Date; family_expires_at: Date; revoked_at: Date | null };
const store = { rows: [] as Row[], seq: 0 };

// Fake en memoria de gateway_tokens: interpreta solo las consultas de api-tokens.ts.
vi.mock("../db", () => {
  const tag = (strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join("?").replace(/\s+/g, " ").trim();
    const now = Date.now();
    const active = (r: Row) => r.client_id === "api-token" && r.revoked_at === null && r.expires_at.getTime() > now;
    if (q.startsWith("SELECT id FROM users")) return Promise.resolve([{ id: v[0] }]);
    if (q.startsWith("SELECT count(*)")) return Promise.resolve([{ n: store.rows.filter((r) => r.user_id === v[0] && active(r)).length }]);
    if (q.startsWith("INSERT INTO gateway_tokens")) {
      const [hash, user, client, scope, name, days1, days2] = v as [string, string, string, string, string, number, number];
      const row: Row = {
        id: `00000000-0000-4000-8000-${String(++store.seq).padStart(12, "0")}`,
        refresh_hash: hash, user_id: user, client_id: client, scope, name,
        created_at: new Date(now), expires_at: new Date(now + days1 * 86_400_000), family_expires_at: new Date(now + days2 * 86_400_000), revoked_at: null,
      };
      store.rows.push(row);
      return Promise.resolve([row]);
    }
    if (q.startsWith("SELECT id, name, scope")) return Promise.resolve(store.rows.filter((r) => r.user_id === v[0] && active(r)));
    if (q.startsWith("UPDATE gateway_tokens SET revoked_at")) {
      const r = store.rows.find((x) => x.id === v[0] && x.user_id === v[1] && x.client_id === "api-token" && x.revoked_at === null);
      if (r) r.revoked_at = new Date();
      return Promise.resolve(r ? [{ id: r.id }] : []);
    }
    if (q.startsWith("SELECT user_id, scope")) {
      const r = store.rows.find((x) => x.refresh_hash === v[0] && x.client_id === "api-token" && active(x) && x.family_expires_at.getTime() > now);
      return Promise.resolve(r ? [{ user_id: r.user_id, scope: r.scope }] : []);
    }
    return Promise.resolve([]);
  };
  return { getDb: () => Object.assign(tag, { begin: async (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag) }) };
});

const { createApiToken, listApiTokens, revokeApiToken, verifyApiToken, isApiToken, MAX_ACTIVE_API_TOKENS, TooManyTokensError } = await import("./api-tokens");
const { hashToken } = await import("./gateway-token");
const { authenticate } = await import("../bearer");

beforeEach(() => {
  setTestEnv();
  store.rows = [];
  store.seq = 0;
});

const mk = (userId = "u1", over: Partial<{ name: string; scope: string[]; expiresInDays: number }> = {}) =>
  createApiToken(userId, { name: "n8n", scope: ["gsc", "ga4"], expiresInDays: 90, ...over });

describe("tokens de API (n8n/CI)", () => {
  it("el secreto sale una sola vez y la DB guarda solo su sha256", async () => {
    const t = await mk();
    expect(t.token).toMatch(/^cgw_[A-Za-z0-9_-]{43}$/);
    expect(isApiToken(t.token)).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.refresh_hash).toBe(hashToken(t.token));
    expect(JSON.stringify(store.rows)).not.toContain(t.token);
    expect(t).toMatchObject({ name: "n8n", scope: ["gsc", "ga4"] });
    expect(new Date(t.expires_at).getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
  });

  it("listar no devuelve ni el token ni su hash; solo los activos del usuario", async () => {
    const a = await mk("u1", { name: "ci" });
    await mk("u2");
    const b = await mk("u1", { name: "otro" });
    await revokeApiToken("u1", b.id);
    const list = await listApiTokens("u1");
    expect(list.map((x) => x.id)).toEqual([a.id]);
    const text = JSON.stringify(list);
    expect(text).not.toContain(a.token);
    expect(text).not.toContain(hashToken(a.token));
    expect(Object.keys(list[0]!).sort()).toEqual(["created_at", "expires_at", "id", "name", "scope"]);
  });

  it("verifica un token activo y rechaza desconocido, revocado y expirado", async () => {
    const t = await mk();
    expect(await verifyApiToken(t.token)).toEqual({ userId: "u1", scope: ["gsc", "ga4"] });
    expect(await verifyApiToken(`cgw_${"x".repeat(43)}`)).toBeNull();
    expect(await verifyApiToken("no-es-cgw")).toBeNull();
    store.rows[0]!.expires_at = new Date(Date.now() - 1000);
    expect(await verifyApiToken(t.token)).toBeNull();
    store.rows[0]!.expires_at = new Date(Date.now() + 1e9);
    expect(await verifyApiToken(t.token)).not.toBeNull();
    expect(await revokeApiToken("u1", t.id)).toBe(true);
    expect(await verifyApiToken(t.token)).toBeNull();
  });

  it("revocar: solo los propios; segundo intento y ids ajenos -> false", async () => {
    const t = await mk("u1");
    expect(await revokeApiToken("u2", t.id)).toBe(false);
    expect(await revokeApiToken("u1", t.id)).toBe(true);
    expect(await revokeApiToken("u1", t.id)).toBe(false);
  });

  it("un refresh token OAuth (client_id distinto) nunca vale como token de API", async () => {
    const t = await mk();
    store.rows[0]!.client_id = "concat-cli";
    expect(await verifyApiToken(t.token)).toBeNull();
  });

  it("tope de tokens activos por usuario", async () => {
    for (let i = 0; i < MAX_ACTIVE_API_TOKENS; i++) await mk("u1");
    await expect(mk("u1")).rejects.toBeInstanceOf(TooManyTokensError);
    await expect(mk("u2")).resolves.toBeTruthy();
  });

  it("bearer.authenticate acepta cgw_ (DB) y rechaza basura", async () => {
    const t = await mk();
    const req = (tok: string) => new Request("https://gw.example.com/mcp", { headers: { authorization: `Bearer ${tok}` } });
    expect(await authenticate(req(t.token))).toEqual({ userId: "u1", scope: ["gsc", "ga4"] });
    expect(await authenticate(req("cgw_basura"))).toBeNull();
    await revokeApiToken("u1", t.id);
    expect(await authenticate(req(t.token))).toBeNull();
  });
});
