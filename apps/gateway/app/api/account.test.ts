import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../../lib/auth/gateway-token";
import { ActionableException } from "../../lib/modules/errors";
import { setTestEnv } from "../../lib/modules/test-utils";

const state = {
  session: null as { id: string; email: string } | null,
  disconnects: [] as Array<[string, string]>,
  disconnectError: undefined as unknown,
  created: [] as Array<{ userId: string; p: { name: string; scope: string[]; expiresInDays: number } }>,
  revoked: [] as Array<[string, string]>,
  tooMany: false,
};

vi.mock("../../lib/auth/session", () => ({ getSessionUser: async () => state.session }));
vi.mock("../../lib/disconnect", () => ({
  disconnectModule: async (u: string, m: string) => {
    if (state.disconnectError) throw state.disconnectError;
    state.disconnects.push([u, m]);
    return { module: m, revoked_at_google: true };
  },
}));
vi.mock("../../lib/auth/api-tokens", async (orig) => {
  const real = await orig<typeof import("../../lib/auth/api-tokens")>();
  return {
    ...real,
    verifyApiToken: async (t: string) => (t === "cgw_good" ? { userId: "u9", scope: ["gsc"] } : null),
    createApiToken: async (userId: string, p: { name: string; scope: string[]; expiresInDays: number }) => {
      if (state.tooMany) throw new real.TooManyTokensError();
      state.created.push({ userId, p });
      return { id: "7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11", name: p.name, scope: p.scope, created_at: "2026-10-03T00:00:00.000Z", expires_at: "2027-01-01T00:00:00.000Z", token: "cgw_SECRETO" };
    },
    listApiTokens: async () => [{ id: "7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11", name: "n8n", scope: ["gsc"], created_at: "2026-10-03T00:00:00.000Z", expires_at: "2027-01-01T00:00:00.000Z" }],
    revokeApiToken: async (u: string, id: string) => {
      state.revoked.push([u, id]);
      return id === "7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11";
    },
  };
});

const { DELETE: disconnect } = await import("./modules/[id]/route");
const { POST: createToken, GET: listTokens, DELETE: revokeToken } = await import("./tokens/route");

const URL_ = "https://gw.example.com";
const oauth = async (scope: string[]) => ({ authorization: `Bearer ${await signAccessToken({ userId: "u1", scope })}` });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (headers: Record<string, string>, body: unknown) =>
  new Request(`${URL_}/api/tokens`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  setTestEnv();
  Object.assign(state, { session: null, disconnects: [], disconnectError: undefined, created: [], revoked: [], tooMany: false });
});

describe("DELETE /api/modules/[id]", () => {
  const del = (headers: Record<string, string> = {}) => new Request(`${URL_}/api/modules/gsc`, { method: "DELETE", headers });

  it("401 sin sesion ni token; un Bearer invalido no cae a la cookie", async () => {
    expect((await disconnect(del(), params("gsc"))).status).toBe(401);
    state.session = { id: "u1", email: "a@b.c" };
    expect((await disconnect(del({ authorization: "Bearer basura" }), params("gsc"))).status).toBe(401);
    expect(state.disconnects).toEqual([]);
  });

  it("sesion web: desconecta", async () => {
    state.session = { id: "u1", email: "a@b.c" };
    const res = await disconnect(del(), params("gsc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ module: "gsc", revoked_at_google: true });
    expect(state.disconnects).toEqual([["u1", "gsc"]]);
  });

  it("cookie con Origin ajeno (CSRF) -> 401", async () => {
    state.session = { id: "u1", email: "a@b.c" };
    expect((await disconnect(del({ origin: "https://evil.example" }), params("gsc"))).status).toBe(401);
    expect((await disconnect(del({ origin: URL_ }), params("gsc"))).status).toBe(200);
  });

  it("token del gateway: respeta el scope; modulo desconocido 404", async () => {
    expect((await disconnect(del(await oauth(["*"])), params("gsc"))).status).toBe(200);
    expect((await disconnect(del(await oauth(["ga4"])), params("gsc"))).status).toBe(403);
    expect((await disconnect(del({ authorization: "Bearer cgw_good" }), params("gsc"))).status).toBe(200); // token de API con scope gsc
    expect((await disconnect(del({ authorization: "Bearer cgw_good" }), params("ga4"))).status).toBe(403);
    const unknown = await disconnect(del(await oauth(["*"])), params("nope"));
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe("unknown_module");
    expect(state.disconnects).toEqual([["u1", "gsc"], ["u9", "gsc"]]);
  });

  it("fallo de Google al revocar -> 502 con el error accionable", async () => {
    state.session = { id: "u1", email: "a@b.c" };
    state.disconnectError = new ActionableException({ error: "upstream_error", module: "gateway", message: "m", fix: "f", next_action: "retry" });
    const res = await disconnect(del(), params("gsc"));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "upstream_error", next_action: "retry" });
  });
});

describe("/api/tokens", () => {
  it("crear requiere sesion o token OAuth; el secreto se devuelve una vez con no-store", async () => {
    expect((await createToken(post({}, { name: "n8n" }))).status).toBe(401);
    const res = await createToken(post(await oauth(["*"]), { name: " n8n ", scope: ["ga4", "gsc"], expires_in_days: 30 }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).token).toBe("cgw_SECRETO");
    expect(state.created).toEqual([{ userId: "u1", p: { name: "n8n", scope: ["ga4", "gsc"], expiresInDays: 30 } }]);
  });

  it("defaults: scope * y 90 dias; con sesion web", async () => {
    state.session = { id: "u1", email: "a@b.c" };
    expect((await createToken(post({}, { name: "ci" }))).status).toBe(201);
    expect(state.created[0]!.p).toEqual({ name: "ci", scope: ["*"], expiresInDays: 90 });
  });

  it("valida cuerpo, modulos y dias", async () => {
    const h = await oauth(["*"]);
    for (const body of [{}, { name: "" }, { name: "x", expires_in_days: 0 }, { name: "x", expires_in_days: 366 }, { name: "x", expires_in_days: 1.5 }, { name: "x", scope: [] }]) {
      expect((await createToken(post(h, body))).status, JSON.stringify(body)).toBe(400);
    }
    const unknown = await createToken(post(h, { name: "x", scope: ["gsc", "nope"] }));
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toBe("invalid_scope");
    expect(state.created).toEqual([]);
  });

  it("el token nuevo no puede tener mas alcance que quien lo crea", async () => {
    const h = await oauth(["gsc"]);
    expect((await createToken(post(h, { name: "x", scope: ["gsc"] }))).status).toBe(201);
    expect((await createToken(post(h, { name: "x", scope: ["gsc", "ga4"] }))).status).toBe(403);
    expect((await createToken(post(h, { name: "x", scope: ["*"] }))).status).toBe(403);
    expect((await createToken(post(h, { name: "x" }))).status).toBe(403); // default * excede gsc
  });

  it("un token de API no puede crear, listar ni revocar tokens", async () => {
    const h = { authorization: "Bearer cgw_good" };
    expect((await createToken(post(h, { name: "x", scope: ["gsc"] }))).status).toBe(403);
    expect((await listTokens(new Request(`${URL_}/api/tokens`, { headers: h }))).status).toBe(403);
    expect((await revokeToken(new Request(`${URL_}/api/tokens?id=7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11`, { method: "DELETE", headers: h }))).status).toBe(403);
    expect(state.created).toEqual([]);
    expect(state.revoked).toEqual([]);
  });

  it("listar no incluye secretos", async () => {
    const res = await listTokens(new Request(`${URL_}/api/tokens`, { headers: await oauth(["*"]) }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("cgw_");
    expect(JSON.parse(text).tokens[0]).toMatchObject({ name: "n8n", scope: ["gsc"] });
  });

  it("revocar por id: 200, 404 si no existe, 400 si el id no es uuid", async () => {
    const h = await oauth(["*"]);
    const mk = (id: string) => new Request(`${URL_}/api/tokens?id=${id}`, { method: "DELETE", headers: h });
    expect((await revokeToken(mk("7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11"))).status).toBe(200);
    expect((await revokeToken(mk("11111111-1111-4111-8111-111111111111"))).status).toBe(404);
    expect((await revokeToken(mk("no-uuid"))).status).toBe(400);
    expect((await revokeToken(new Request(`${URL_}/api/tokens`, { method: "DELETE", headers: h }))).status).toBe(400);
    expect(state.revoked[0]).toEqual(["u1", "7b0c1f40-8f55-4a54-9d63-5d5f6c0f2a11"]);
  });

  it("tope de tokens -> 409", async () => {
    state.tooMany = true;
    expect((await createToken(post(await oauth(["*"]), { name: "x" }))).status).toBe(409);
  });
});

describe("PRM con sufijo de path (RFC 9728)", () => {
  it("/.well-known/oauth-protected-resource/mcp responde lo mismo que la ruta base", async () => {
    const base = await import("../.well-known/oauth-protected-resource/route");
    const suffixed = await import("../.well-known/oauth-protected-resource/mcp/route");
    const a = await base.GET();
    const b = await suffixed.GET();
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ resource: `${URL_}/mcp`, authorization_servers: [URL_], bearer_methods_supported: ["header"] });
    expect(await a.json()).toEqual(await (await suffixed.GET()).json());
  });
});
