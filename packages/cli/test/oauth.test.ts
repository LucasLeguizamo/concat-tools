import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { discover, loginDevice, loginLoopback, pkcePair, refreshTokens, type Net } from "../src/oauth.js";
import { createSession } from "../src/session.js";
import { discoveryRoute, fakeFetch, GATEWAY, json, memoryStore, metadata } from "./helpers.js";

const clock = { t: 0 };
const mkNet = (f: typeof fetch): Net => ({
  fetch: f,
  sleep: async (ms) => void (clock.t += ms),
  now: () => clock.t,
});
const io = (open: (u: string) => void = () => {}) => ({ log: () => {}, openBrowser: open });

describe("discover", () => {
  it("rechaza metadata con endpoints de otro origen", async () => {
    const f = fakeFetch((u) =>
      u.pathname.includes("oauth-authorization-server")
        ? json({ ...metadata, token_endpoint: "https://evil.example/token" })
        : undefined,
    );
    await expect(discover(GATEWAY, mkNet(f))).rejects.toThrow(/otro origen/);
  });

  it("rechaza metadata incompleta", async () => {
    const f = fakeFetch(() => json({ issuer: GATEWAY }));
    await expect(discover(GATEWAY, mkNet(f))).rejects.toThrow(/incompleta/);
  });
});

describe("PKCE", () => {
  it("challenge = base64url(sha256(verifier))", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("loginLoopback", () => {
  it("authorization code + PKCE con redirect loopback", async () => {
    let tokenBody: URLSearchParams | undefined;
    const f = fakeFetch(discoveryRoute, (u, init) => {
      if (u.pathname === "/oauth/token") {
        tokenBody = init.body as URLSearchParams;
        return json({ access_token: "AT", token_type: "Bearer", expires_in: 3600, refresh_token: "RT", scope: "*" });
      }
    });
    let authUrl!: URL;
    const creds = await loginLoopback(metadata, mkNet(f), io((u) => {
      authUrl = new URL(u);
      const redirect = new URL(authUrl.searchParams.get("redirect_uri")!);
      // el "navegador" vuelve al callback loopback
      redirect.searchParams.set("code", "CODE123");
      redirect.searchParams.set("state", authUrl.searchParams.get("state")!);
      void fetch(redirect);
    }));

    expect(authUrl.searchParams.get("client_id")).toBe("concat-cli");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(tokenBody?.get("grant_type")).toBe("authorization_code");
    expect(tokenBody?.get("code")).toBe("CODE123");
    expect(tokenBody?.get("client_id")).toBe("concat-cli");
    const verifier = tokenBody!.get("code_verifier")!;
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(authUrl.searchParams.get("code_challenge"));
    expect(creds).toMatchObject({ access_token: "AT", refresh_token: "RT", scope: "*" });
  });

  it("ignora callbacks con state incorrecto y acepta el legítimo", async () => {
    const f = fakeFetch(discoveryRoute, (u) =>
      u.pathname === "/oauth/token" ? json({ access_token: "AT", token_type: "Bearer", expires_in: 60 }) : undefined,
    );
    let bad = 0;
    const creds = await loginLoopback(metadata, mkNet(f), io((u) => {
      const a = new URL(u);
      const cb = new URL(a.searchParams.get("redirect_uri")!);
      void (async () => {
        const evil = new URL(cb);
        evil.searchParams.set("code", "EVIL");
        evil.searchParams.set("state", "nope");
        bad = (await fetch(evil)).status;
        cb.searchParams.set("code", "GOOD");
        cb.searchParams.set("state", a.searchParams.get("state")!);
        await fetch(cb);
      })();
    }));
    expect(bad).toBe(400);
    expect(creds.access_token).toBe("AT");
  });

  it("propaga el error de autorización del callback", async () => {
    const f = fakeFetch(discoveryRoute);
    await expect(
      loginLoopback(metadata, mkNet(f), io((u) => {
        const a = new URL(u);
        const cb = new URL(a.searchParams.get("redirect_uri")!);
        cb.searchParams.set("error", "access_denied");
        cb.searchParams.set("state", a.searchParams.get("state")!);
        void fetch(cb);
      })),
    ).rejects.toThrow(/rechazada: access_denied/);
  });
});

describe("loginLoopback: iss (RFC 9207)", () => {
  const tokenRoute = (u: URL) =>
    u.pathname === "/oauth/token" ? json({ access_token: "AT", token_type: "Bearer", expires_in: 60 }) : undefined;
  const callback = (extra: Record<string, string>) =>
    io((u) => {
      const a = new URL(u);
      const cb = new URL(a.searchParams.get("redirect_uri")!);
      cb.searchParams.set("code", "CODE");
      cb.searchParams.set("state", a.searchParams.get("state")!);
      for (const [k, v] of Object.entries(extra)) cb.searchParams.set(k, v);
      void fetch(cb);
    });

  it("acepta iss igual al issuer", async () => {
    const f = fakeFetch(tokenRoute);
    const creds = await loginLoopback({ ...metadata, authorization_response_iss_parameter_supported: true }, mkNet(f), callback({ iss: GATEWAY }));
    expect(creds.access_token).toBe("AT");
  });

  it("iss distinto => aborta sin intercambiar el code", async () => {
    const f = fakeFetch(tokenRoute);
    await expect(loginLoopback(metadata, mkNet(f), callback({ iss: "https://evil.example" }))).rejects.toMatchObject({
      details: { error: "issuer_mismatch" },
    });
    expect(f.calls.some((c) => c.url.endsWith("/oauth/token"))).toBe(false);
  });

  it("iss ausente: aborta si el AS lo anuncia; se tolera si no", async () => {
    const f = fakeFetch(tokenRoute);
    await expect(
      loginLoopback({ ...metadata, authorization_response_iss_parameter_supported: true }, mkNet(f), callback({})),
    ).rejects.toMatchObject({ details: { error: "issuer_mismatch" } });
    expect((await loginLoopback(metadata, mkNet(fakeFetch(tokenRoute)), callback({}))).access_token).toBe("AT");
  });

  it("también valida iss en respuestas de error", async () => {
    const f = fakeFetch(tokenRoute);
    await expect(loginLoopback(metadata, mkNet(f), callback({ iss: "https://evil.example", error: "access_denied" }))).rejects.toMatchObject({
      details: { error: "issuer_mismatch" },
    });
  });
});

describe("discover: iss", () => {
  it("conserva authorization_response_iss_parameter_supported", async () => {
    const f = fakeFetch(() => json({ ...metadata, authorization_response_iss_parameter_supported: true }));
    expect((await discover(GATEWAY, mkNet(f))).authorization_response_iss_parameter_supported).toBe(true);
  });
});

describe("loginDevice", () => {
  it("muestra verification_uri + user_code y NO usa verification_uri_complete", async () => {
    clock.t = 0;
    const f = fakeFetch((u) => {
      if (u.pathname === "/oauth/device") {
        return json({ device_code: "DC", user_code: "ABCD-1234", verification_uri: `${GATEWAY}/device`, verification_uri_complete: `${GATEWAY}/device?user_code=ABCD-1234`, expires_in: 600, interval: 1 });
      }
      if (u.pathname === "/oauth/token") return json({ access_token: "AT", token_type: "Bearer", expires_in: 60 });
    });
    const lines: string[] = [];
    await loginDevice(metadata, mkNet(f), { log: (l) => lines.push(l), openBrowser: () => assert.fail("no debe abrir navegador") });
    const out = lines.join("\n");
    expect(out).toContain(`${GATEWAY}/device`);
    expect(out).toContain("ABCD-1234");
    expect(out).not.toContain("?user_code");
    expect(out).not.toContain("verification_uri_complete");
  });

  it("rechaza un verification_uri de otro origen", async () => {
    const f = fakeFetch((u) =>
      u.pathname === "/oauth/device"
        ? json({ device_code: "d", user_code: "u", verification_uri: "https://evil.example/device", expires_in: 600 })
        : undefined,
    );
    await expect(loginDevice(metadata, mkNet(f), io())).rejects.toThrow(/otro origen/);
  });

  it("rate_limited con retry_after => exit 4 y mensaje (al iniciar y al hacer polling)", async () => {
    const limited = json({ error: "rate_limited", retry_after: 42 }, 429);
    await expect(loginDevice(metadata, mkNet(fakeFetch((u) => (u.pathname === "/oauth/device" ? limited.clone() : undefined))), io())).rejects.toMatchObject({
      exitCode: 4,
      message: expect.stringContaining("42s"),
      details: { error: "rate_limited", retry_after: 42 },
    });
    const poll = fakeFetch((u) =>
      u.pathname === "/oauth/device"
        ? json({ device_code: "d", user_code: "u", verification_uri: `${GATEWAY}/device`, expires_in: 600, interval: 1 })
        : u.pathname === "/oauth/token" ? limited.clone() : undefined,
    );
    await expect(loginDevice(metadata, mkNet(poll), io())).rejects.toMatchObject({ exitCode: 4 });
  });

  it("429 sin cuerpo usa la cabecera Retry-After", async () => {
    const f = fakeFetch((u) =>
      u.pathname === "/oauth/device" ? new Response("", { status: 429, headers: { "retry-after": "9" } }) : undefined,
    );
    await expect(loginDevice(metadata, mkNet(f), io())).rejects.toMatchObject({ exitCode: 4, details: { retry_after: 9 } });
  });

  it("hace polling respetando interval y slow_down", async () => {
    clock.t = 0;
    const polls: number[] = [];
    const answers = ["authorization_pending", "slow_down", "authorization_pending", "ok"];
    const f = fakeFetch((u, init) => {
      if (u.pathname === "/oauth/device") {
        return json({ device_code: "DC", user_code: "ABCD-1234", verification_uri: `${GATEWAY}/device`, verification_uri_complete: `${GATEWAY}/device?c=ABCD-1234`, expires_in: 600, interval: 5 });
      }
      if (u.pathname === "/oauth/token") {
        expect((init.body as URLSearchParams).get("device_code")).toBe("DC");
        polls.push(clock.t);
        const a = answers.shift()!;
        return a === "ok" ? json({ access_token: "AT", token_type: "Bearer", expires_in: 3600, refresh_token: "RT" }) : json({ error: a }, 400);
      }
    });
    const lines: string[] = [];
    const creds = await loginDevice(metadata, mkNet(f), { log: (l) => lines.push(l), openBrowser: () => {} });
    expect(creds.refresh_token).toBe("RT");
    // intervalos: 5s, 5s (luego slow_down => +5), 10s, 10s
    expect(polls.map((t, i) => (i === 0 ? t : t - polls[i - 1]!))).toEqual([5000, 5000, 10000, 10000]);
    expect(lines.join("\n")).toContain("ABCD-1234");
    expect(lines.join("\n")).toContain(`${GATEWAY}/device`);
  });

  it("falla con access_denied y con código expirado", async () => {
    const mk = (error: string) =>
      mkNet(fakeFetch((u) =>
        u.pathname === "/oauth/device"
          ? json({ device_code: "d", user_code: "u", verification_uri: `${GATEWAY}/device`, expires_in: 600, interval: 1 })
          : u.pathname === "/oauth/token" ? json({ error }, 400) : undefined,
      ));
    await expect(loginDevice(metadata, mk("access_denied"), io())).rejects.toThrow(/denegada/);
    await expect(loginDevice(metadata, mk("expired_token"), io())).rejects.toThrow(/expiró/);
  });
});

describe("refresh con rotación", () => {
  it("refreshTokens devuelve el refresh nuevo (o conserva el viejo si no rota)", async () => {
    const f = fakeFetch((u) =>
      u.pathname === "/oauth/token" ? json({ access_token: "AT2", token_type: "Bearer", expires_in: 3600, refresh_token: "RT2" }) : undefined,
    );
    expect((await refreshTokens(metadata, mkNet(f), "RT1")).refresh_token).toBe("RT2");
    const g = fakeFetch((u) => (u.pathname === "/oauth/token" ? json({ access_token: "AT3", expires_in: 10 }) : undefined));
    expect((await refreshTokens(metadata, mkNet(g), "RT1")).refresh_token).toBe("RT1");
  });

  it("invalid_grant => exit 3", async () => {
    const f = fakeFetch((u) => (u.pathname === "/oauth/token" ? json({ error: "invalid_grant" }, 400) : undefined));
    await expect(refreshTokens(metadata, mkNet(f), "RT1")).rejects.toMatchObject({ exitCode: 3 });
  });

  it("la sesión refresca un token vencido y persiste la rotación", async () => {
    clock.t = 10_000_000;
    const store = memoryStore({ access_token: "OLD", refresh_token: "RT1", expires_at: clock.t - 1 });
    const f = fakeFetch(discoveryRoute, (u) =>
      u.pathname === "/oauth/token" ? json({ access_token: "NEW", token_type: "Bearer", expires_in: 3600, refresh_token: "RT2" }) : undefined,
    );
    const session = createSession(GATEWAY, store, mkNet(f));
    expect(await session.accessToken()).toBe("NEW");
    expect(store.creds).toMatchObject({ access_token: "NEW", refresh_token: "RT2" });
  });

  it("sin credenciales => exit 3", async () => {
    const session = createSession(GATEWAY, memoryStore(), mkNet(fakeFetch()));
    await expect(session.accessToken()).rejects.toMatchObject({ exitCode: 3 });
  });
});
