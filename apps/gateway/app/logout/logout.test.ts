import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTestEnv } from "../../lib/modules/test-utils";

const revoked: string[] = [];
vi.mock("../../lib/auth/session", () => ({
  sessionCookieName: () => "__Host-concat_session",
  cookieOptions: (maxAge: number) => ({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge }),
  revokeSessionToken: async (t: string) => void revoked.push(t),
}));

const { POST } = await import("./route");
const route = await import("./route");

beforeEach(() => {
  setTestEnv();
  revoked.length = 0;
});

describe("POST /logout", () => {
  it("revoca la sesion, borra la cookie y redirige a /login", async () => {
    const res = await POST(
      new NextRequest("https://gw.example.com/logout", { method: "POST", headers: { cookie: "__Host-concat_session=tok123" } }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://gw.example.com/login");
    expect(revoked).toEqual(["tok123"]);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-concat_session=;");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("sin cookie tambien funciona y no revoca nada; solo existe POST (GET no cierra sesion)", async () => {
    const res = await POST(new NextRequest("https://gw.example.com/logout", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(revoked).toEqual([]);
    expect("GET" in route).toBe(false);
  });
});

describe("POST /logout con next (usar otra cuenta)", () => {
  it("vuelve a /login con el next saneado", async () => {
    const form = (next: string) =>
      new NextRequest("https://gw.example.com/logout", { method: "POST", body: new URLSearchParams({ next }) });
    const ok = await POST(form("/oauth/consent?pending=abc"));
    expect(ok.headers.get("location")).toBe("https://gw.example.com/login?next=%2Foauth%2Fconsent%3Fpending%3Dabc");
    const evil = await POST(form("//evil.example"));
    expect(evil.headers.get("location")).toBe("https://gw.example.com/login?next=%2Fdashboard");
  });
});
