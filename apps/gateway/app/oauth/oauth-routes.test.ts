import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "../../lib/modules/test-utils";

const calls = { startDevice: [] as unknown[], exchangeRefresh: 0, hits: [] as Array<[string, number, number]> };
let allowed = true;

vi.mock("../../lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../../lib/rate-limit")>()),
  rateLimiter: () => ({
    hit: async (key: string, limit: number, windowS: number) => {
      calls.hits.push([key, limit, windowS]);
      return { allowed, retryAfter: 42 };
    },
  }),
}));
vi.mock("../../lib/auth/oauth-server", async (orig) => ({
  ...(await orig<typeof import("../../lib/auth/oauth-server")>()),
  oauthServer: () => ({
    startDevice: async (p: unknown) => (calls.startDevice.push(p), { device_code: "d", user_code: "BCDF-GHJK", verification_uri: "x", expires_in: 600, interval: 5 }),
    exchangeRefresh: async () => (calls.exchangeRefresh++, { access_token: "a" }),
  }),
}));

const { POST: device } = await import("./device/route");
const { POST: token } = await import("./token/route");

const form = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });

beforeEach(() => {
  setTestEnv();
  allowed = true;
  calls.startDevice.length = 0;
  calls.exchangeRefresh = 0;
  calls.hits.length = 0;
});

describe("POST /oauth/device", () => {
  it("client_id distinto de concat-cli (incl. CIMD): unauthorized_client, sin iniciar el flujo", async () => {
    for (const client_id of ["https://evil.example.com/client.json", "otro"]) {
      const res = await device(form("https://gw.example.com/oauth/device", { client_id }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "unauthorized_client" });
    }
    expect(calls.startDevice).toEqual([]);
  });

  it("concat-cli: guarda IP y pais de quien inicia; la respuesta no trae verification_uri_complete", async () => {
    const res = await device(
      form("https://gw.example.com/oauth/device", { client_id: "concat-cli", scope: "gsc" }, { "x-forwarded-for": "203.0.113.5", "x-vercel-ip-country": "AR" }),
    );
    expect(res.status).toBe(200);
    expect(calls.startDevice).toEqual([{ clientId: "concat-cli", scope: ["gsc"], ip: "203.0.113.5", country: "AR" }]);
    expect(await res.json()).not.toHaveProperty("verification_uri_complete");
  });

  it("rate limit por IP: 429 + Retry-After y no inicia nada", async () => {
    allowed = false;
    const res = await device(form("https://gw.example.com/oauth/device", { client_id: "concat-cli" }, { "x-forwarded-for": "203.0.113.5" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(calls.hits[0]).toEqual(["ip:device:203.0.113.5", 10, 60]);
    expect(calls.startDevice).toEqual([]);
  });
});

describe("POST /oauth/token", () => {
  it("rate limit por IP: 429 antes de procesar el grant", async () => {
    allowed = false;
    const res = await token(
      form("https://gw.example.com/oauth/token", { client_id: "concat-cli", grant_type: "refresh_token", refresh_token: "r" }, { "x-forwarded-for": "198.51.100.9" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(calls.hits[0]).toEqual(["ip:token:198.51.100.9", 60, 60]);
    expect(calls.exchangeRefresh).toBe(0);
  });

  it("dentro del limite procesa normalmente", async () => {
    const res = await token(form("https://gw.example.com/oauth/token", { client_id: "concat-cli", grant_type: "refresh_token", refresh_token: "r" }));
    expect(res.status).toBe(200);
    expect(calls.exchangeRefresh).toBe(1);
  });
});
