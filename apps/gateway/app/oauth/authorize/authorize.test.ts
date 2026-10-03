import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "../../../lib/modules/test-utils";

let allowed = true;
const started: unknown[] = [];
let startError: unknown;
vi.mock("../../../lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../../../lib/rate-limit")>()),
  rateLimiter: () => ({ hit: async () => ({ allowed, retryAfter: 17 }) }),
}));
vi.mock("../../../lib/auth/oauth-server", async (orig) => ({
  ...(await orig<typeof import("../../../lib/auth/oauth-server")>()),
  oauthServer: () => ({
    startAuthorization: async (p: unknown) => {
      if (startError) throw startError;
      started.push(p);
      return "11111111-1111-4111-8111-111111111111";
    },
  }),
}));

const { GET } = await import("./route");
const { OAuthError } = await import("../../../lib/auth/http");

const url = (extra = "") =>
  `https://gw.example.com/oauth/authorize?response_type=code&client_id=concat-cli&redirect_uri=${encodeURIComponent("http://127.0.0.1:5000/callback")}&code_challenge=${"A".repeat(43)}&code_challenge_method=S256${extra}`;

beforeEach(() => {
  setTestEnv();
  allowed = true;
  started.length = 0;
  startError = undefined;
});

describe("GET /oauth/authorize", () => {
  it("rate limit por IP: 429 con Retry-After, sin resolver el cliente", async () => {
    allowed = false;
    const res = await GET(new NextRequest(url()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("17");
    expect(started).toEqual([]);
  });

  it("pasa la IP a startAuthorization (tope de pendientes por IP)", async () => {
    const res = await GET(new NextRequest(url(), { headers: { "x-forwarded-for": "203.0.113.77" } }));
    expect(res.status).toBe(303);
    expect(started[0]).toMatchObject({ clientId: "concat-cli", ip: "203.0.113.77" });
  });

  it("tope de pendientes alcanzado: redirige al cliente con temporarily_unavailable", async () => {
    startError = new OAuthError("temporarily_unavailable", "Demasiadas solicitudes de autorizacion pendientes", 429, 60);
    const res = await GET(new NextRequest(url("&state=s1")));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("http://127.0.0.1:5000/callback");
    expect(loc.searchParams.get("error")).toBe("temporarily_unavailable");
    expect(loc.searchParams.get("state")).toBe("s1");
  });
});
