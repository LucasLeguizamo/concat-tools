import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../../lib/auth/gateway-token";
import { setTestEnv } from "../../lib/modules/test-utils";

const probed: Array<[string, string]> = [];
vi.mock("../../lib/connection", () => ({
  runProbe: async (u: string, m: string) => {
    probed.push([u, m]);
    return m === "ga4" ? "scope_lost" : "connected";
  },
  getModuleStatuses: async (_u: string, allowed: (id: string) => boolean) =>
    ["gsc", "ga4"].filter(allowed).map((id) => ({ id, status: "connected" })),
}));
const deletes: string[] = [];
vi.mock("../../lib/db", () => ({
  getDb: () => (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (q.includes("DELETE FROM")) {
      deletes.push(q.match(/DELETE FROM (\w+)/)![1]!);
      return Promise.resolve(Object.assign([], { count: 2 }));
    }
    return Promise.resolve([
      { user_id: "u1", module: "gsc" },
      { user_id: "u1", module: "ga4" },
      { user_id: "u2", module: "gsc" },
      { user_id: "u3", module: "desconocido" },
    ]);
  },
}));

const { GET: status } = await import("./status/route");
const { GET: cron } = await import("./cron/health/route");

beforeEach(() => {
  setTestEnv();
  probed.length = 0;
  deletes.length = 0;
});

describe("GET /api/status", () => {
  it("401 con challenge sin token", async () => {
    const res = await status(new Request("https://gw.example.com/api/status"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("devuelve modulos limitados al scope del token", async () => {
    const t = await signAccessToken({ userId: "u1", scope: ["gsc"] });
    const res = await status(new Request("https://gw.example.com/api/status", { headers: { authorization: `Bearer ${t}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ modules: [{ id: "gsc", status: "connected" }] });
  });
});

describe("GET /api/cron/health", () => {
  it("rechaza sin CRON_SECRET correcto", async () => {
    for (const h of [undefined, "Bearer mal", `Bearer ${"x".repeat(16)}`]) {
      const res = await cron(new Request("https://gw.example.com/api/cron/health", { headers: h ? { authorization: h } : {} }));
      expect(res.status).toBe(401);
    }
    expect(probed).toEqual([]);
  });

  it("corre probe por cada usuario x modulo conectado y resume estados", async () => {
    const res = await cron(
      new Request("https://gw.example.com/api/cron/health", { headers: { authorization: `Bearer ${"c".repeat(16)}` } }),
    );
    expect(res.status).toBe(200);
    expect(probed.sort()).toEqual([["u1", "ga4"], ["u1", "gsc"], ["u2", "gsc"]]);
    const body = await res.json();
    expect(body).toMatchObject({ checked: 3, changed: 1, failures: 0, by_status: { connected: 2, scope_lost: 1 } });
    // Limpieza de filas expiradas incluida en el cron diario.
    expect(deletes.sort()).toEqual(["device_codes", "gateway_tokens", "oauth_codes", "pending_auth", "rate_limits", "web_sessions"]);
    expect(body.cleaned).toMatchObject({ rate_limits: 2, pending_auth: 2, web_sessions: 2 });
  });
});
