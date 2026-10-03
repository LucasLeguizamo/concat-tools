import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { fakeClient, gscPerformance, GATEWAY, harness, json, type Route } from "./helpers.js";

const okResult = { data: [{ query: "concat", clicks: 3 }], meta: { module: "gsc" } };
const okClient = () =>
  fakeClient([gscPerformance, { name: "gsc_list_sites", inputSchema: { type: "object" } }], () => ({
    isError: false,
    structured: okResult,
  }));

const statusRoute = (modules: unknown[]): Route => (u) =>
  u.pathname === "/api/status" ? json({ modules }) : undefined;

describe("comandos generados", () => {
  it("concat gsc performance --flags llama a la tool y emite JSON si no es TTY", async () => {
    const client = okClient();
    const h = harness({ client });
    const code = await run(["gsc", "performance", "--site", "sc-domain:onconcat.com", "--by", "query", "--limit", "20"], h.deps);
    expect(code).toBe(0);
    expect(client.calls).toEqual([{ name: "gsc_performance", args: { site: "sc-domain:onconcat.com", by: "query", limit: 20 } }]);
    expect(JSON.parse(h.out.join(""))).toEqual(okResult);
  });

  it("tabla en TTY y --json lo fuerza", async () => {
    const tty = harness({ client: okClient(), tty: true });
    await run(["gsc", "performance", "--site", "x"], tty.deps);
    expect(tty.out.join("")).toMatch(/query\s+clicks/);
    const forced = harness({ client: okClient(), tty: true });
    await run(["gsc", "performance", "--site", "x", "--json"], forced.deps);
    expect(JSON.parse(forced.out.join(""))).toEqual(okResult);
  });

  it("--help se genera desde el schema", async () => {
    const h = harness({ client: okClient(), tty: true });
    expect(await run(["gsc", "performance", "--help"], h.deps)).toBe(0);
    const text = h.out.join("");
    expect(text).toContain("Rendimiento de Search Console.");
    expect(text).toContain("--site <string>");
    expect(text).toContain("--by <query|page>");
  });

  it("flag obligatoria faltante => exit 2", async () => {
    const h = harness({ client: okClient() });
    expect(await run(["gsc", "performance"], h.deps)).toBe(2);
    expect(JSON.parse(h.out.join("")).error).toBe("usage");
  });

  it("acción desconocida de un grupo existente => exit 2 con la lista", async () => {
    const h = harness({ client: okClient(), tty: true });
    expect(await run(["gsc", "nope"], h.deps)).toBe(2);
    expect(h.err.join("")).toContain("gsc list-sites");
  });

  it("grupo desconocido => exit 2", async () => {
    const h = harness({ client: okClient(), routes: [statusRoute([{ id: "gsc", status: "connected" }])] });
    expect(await run(["zzz", "x"], h.deps)).toBe(2);
  });

  it("módulo no conectado => exit 5 con fix y url", async () => {
    const client = fakeClient([], () => ({ isError: false }));
    const h = harness({
      client,
      tty: true,
      routes: [statusRoute([{ id: "ga4", status: "not_connected", connect_url: `${GATEWAY}/google/start?module=ga4` }])],
    });
    expect(await run(["ga4", "daily-report"], h.deps)).toBe(5);
    const err = h.err.join("");
    expect(err).toContain("concat connect ga4");
    expect(err).toContain(`${GATEWAY}/google/start?module=ga4`);
  });
});

describe("errores accionables de las tools => exit codes", () => {
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ["permiso de recurso", { error: "missing_resource_permission", module: "ga4", message: "Sin rol Viewer", fix: "Agrega Viewer", next_action: "fix_resource_permission" }, 6],
    ["cuota", { error: "quota_exceeded", module: "gsc", message: "Cuota", fix: "Espera", next_action: "retry", retry_after: 30 }, 4],
    ["rate_limited", { error: "rate_limited", module: "gateway", message: "Demasiadas solicitudes", fix: "Espera", next_action: "retry", retry_after: 30 }, 4],
    ["scope_lost", { error: "scope_lost", module: "gsc", message: "Perdiste el permiso", fix: "Reconecta", next_action: "reconnect_module", url: "https://gw/x" }, 5],
    ["relogin", { error: "invalid_grant", module: "gateway", message: "Sesión inválida", fix: "concat login", next_action: "relogin" }, 3],
    ["otro", { error: "internal", module: "gsc", message: "Falló", fix: "Reintenta", next_action: "retry" }, 1],
  ];
  it.each(cases)("%s", async (_n, actionable, expected) => {
    const client = fakeClient([gscPerformance], () => ({ isError: true, structured: actionable }));
    const h = harness({ client, tty: true });
    expect(await run(["gsc", "performance", "--site", "x"], h.deps)).toBe(expected);
    const err = h.err.join("");
    expect(err).toContain(String(actionable.message));
    expect(err).toContain(String(actionable.fix));
    if (actionable.url) expect(err).toContain(String(actionable.url));
    if (actionable.retry_after) expect(err).toContain("30s");
  });

  it("en modo JSON el error accionable va a stdout", async () => {
    const client = fakeClient([gscPerformance], () => ({ isError: true, structured: { error: "scope_lost", message: "m", fix: "f", url: "https://gw/x" } }));
    const h = harness({ client });
    expect(await run(["gsc", "performance", "--site", "x"], h.deps)).toBe(5);
    expect(JSON.parse(h.out.join(""))).toMatchObject({ error: "scope_lost", fix: "f", url: "https://gw/x" });
  });
});

describe("call", () => {
  it("llama a la tool con el JSON dado", async () => {
    const client = okClient();
    const h = harness({ client });
    expect(await run(["call", "gmail_search_threads", '{"query":"factura"}'], h.deps)).toBe(0);
    expect(client.calls).toEqual([{ name: "gmail_search_threads", args: { query: "factura" } }]);
  });
  it("JSON inválido o no-objeto => exit 2", async () => {
    expect(await run(["call", "x", "{mal"], harness({ client: okClient() }).deps)).toBe(2);
    expect(await run(["call", "x", "[1]"], harness({ client: okClient() }).deps)).toBe(2);
    expect(await run(["call"], harness({ client: okClient() }).deps)).toBe(2);
  });
});

describe("tools", () => {
  it("JSON con command, name e inputSchema", async () => {
    const h = harness({ client: okClient() });
    expect(await run(["tools"], h.deps)).toBe(0);
    const list = JSON.parse(h.out.join(""));
    expect(list[0]).toMatchObject({ name: "gsc_performance", command: "gsc performance" });
    expect(list[0].inputSchema.properties.site).toBeDefined();
    expect(list[1].command).toBe("gsc list-sites");
  });
});

describe("status", () => {
  const modules = [
    { id: "gsc", status: "connected", last_probe_at: "2026-10-01T00:00:00Z", resource_count: 3, last_error: null },
    { id: "ga4", status: "not_connected", last_probe_at: null, resource_count: null, last_error: null },
  ];
  it("JSON y tabla; manda Bearer", async () => {
    const h = harness({ routes: [statusRoute(modules)] });
    expect(await run(["status"], h.deps)).toBe(0);
    expect(JSON.parse(h.out.join("")).modules).toHaveLength(2);
    const call = (h.deps.net.fetch as unknown as { calls: Array<{ init: RequestInit }> }).calls.find((c) => (c.init.headers as Record<string, string>)?.authorization);
    expect((call?.init.headers as Record<string, string>).authorization).toBe("Bearer at-1");

    const t = harness({ routes: [statusRoute(modules)], tty: true });
    await run(["status"], t.deps);
    expect(t.out.join("")).toMatch(/gsc\s+connected\s+3/);
  });
  it("sin sesión => exit 3", async () => {
    const h = harness({ creds: null, routes: [statusRoute(modules)] });
    expect(await run(["status"], h.deps)).toBe(3);
  });
  it("401 del gateway tras refresh => exit 3", async () => {
    const h = harness({
      routes: [
        (u) => (u.pathname === "/api/status" ? json({ error: "invalid_token" }, 401) : undefined),
        (u) => (u.pathname === "/oauth/token" ? json({ access_token: "AT2", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-2" }) : undefined),
      ],
    });
    expect(await run(["status"], h.deps)).toBe(3);
    expect(h.store.creds?.refresh_token).toBe("rt-2"); // la rotación se persistió
  });
});

describe("connect", () => {
  it("abre /google/start por módulo y hace polling hasta connected", async () => {
    let polls = 0;
    const h = harness({
      routes: [
        (u) => {
          if (u.pathname !== "/api/status") return undefined;
          polls++;
          const status = polls < 4 ? "authorized" : "connected";
          return json({ modules: [{ id: "gsc", status, last_probe_at: null, resource_count: polls < 4 ? null : 2 }] });
        },
      ],
    });
    expect(await run(["connect", "gsc"], h.deps)).toBe(0);
    expect(h.opened).toEqual([`${GATEWAY}/google/start?module=gsc`]);
    expect(JSON.parse(h.out.join("")).modules).toEqual([{ module: "gsc", status: "connected", resources: 2 }]);
  });

  it("no_resources (con probe nuevo) => exit 6; timeout => exit 5", async () => {
    let n = 0;
    const noRes = harness({
      routes: [(u) => (u.pathname === "/api/status" ? json({ modules: [{ id: "gsc", status: n++ === 0 ? "not_connected" : "no_resources", last_probe_at: n === 1 ? null : "2026-10-03T00:00:00Z", resource_count: 0 }] }) : undefined)],
    });
    expect(await run(["connect", "gsc"], noRes.deps)).toBe(6);

    const stuck = harness({ routes: [statusRoute([{ id: "gsc", status: "authorized", last_probe_at: null }])] });
    expect(await run(["connect", "gsc", "--timeout", "6"], stuck.deps)).toBe(5);
  });

  it("ya conectado no reabre el navegador; módulo inválido/desconocido => exit 2", async () => {
    const h = harness({ routes: [statusRoute([{ id: "gsc", status: "connected", resource_count: 1 }])] });
    expect(await run(["connect", "gsc"], h.deps)).toBe(0);
    expect(h.opened).toEqual([]);
    expect(await run(["connect", "nope"], h.deps)).toBe(2);
    expect(await run(["connect", "../x"], h.deps)).toBe(2);
    expect(await run(["connect"], h.deps)).toBe(2);
  });
});

describe("login / logout / config", () => {
  it("login --device guarda las credenciales", async () => {
    const h = harness({
      creds: null,
      routes: [
        (u) => (u.pathname === "/oauth/device" ? json({ device_code: "d", user_code: "WXYZ-0001", verification_uri: `${GATEWAY}/device`, expires_in: 600, interval: 5 }) : undefined),
        (u) => (u.pathname === "/oauth/token" ? json({ access_token: "AT", token_type: "Bearer", expires_in: 3600, refresh_token: "RT" }) : undefined),
      ],
    });
    expect(await run(["login", "--device"], h.deps)).toBe(0);
    expect(h.err.join("")).toContain("WXYZ-0001");
    expect(h.store.creds).toMatchObject({ access_token: "AT", refresh_token: "RT" });
    expect(h.out.join("")).not.toContain("AT"); // tokens nunca a stdout
  });

  it("login --device con rate_limited => exit 4 y mensaje con retry_after", async () => {
    const h = harness({
      creds: null,
      tty: true,
      routes: [(u) => (u.pathname === "/oauth/device" ? json({ error: "rate_limited", retry_after: 60 }, 429) : undefined)],
    });
    expect(await run(["login", "--device"], h.deps)).toBe(4);
    expect(h.err.join("")).toContain("60s");
    expect(h.store.creds).toBeNull();
  });

  it("logout revoca y borra", async () => {
    const h = harness({ routes: [(u) => (u.pathname === "/oauth/revoke" ? new Response(null, { status: 200 }) : undefined)] });
    expect(await run(["logout"], h.deps)).toBe(0);
    expect(h.store.creds).toBeNull();
    const calls = (h.deps.net.fetch as unknown as { calls: Array<{ url: string; init: RequestInit }> }).calls;
    const revoke = calls.find((c) => c.url.endsWith("/oauth/revoke"))!;
    expect((revoke.init.body as URLSearchParams).get("token")).toBe("rt-1");
  });

  it("--gateway tiene prioridad sobre el entorno; http remoto se rechaza", async () => {
    const h = harness({ routes: [statusRoute([])], env: { CONCAT_GATEWAY_URL: "https://otro.example" } });
    expect(await run(["status", "--gateway", GATEWAY], h.deps)).toBe(0);
    const urls = (h.deps.net.fetch as unknown as { calls: Array<{ url: string }> }).calls.map((c) => c.url);
    expect(urls.every((u) => u.startsWith(GATEWAY))).toBe(true);
    expect(await run(["status", "--gateway=http://evil.example"], h.deps)).toBe(2);
    expect(await run(["status", "--gateway", "http://127.0.0.1:3000"], harness({ routes: [statusRoute([])] }).deps)).toBe(0); // loopback http permitido
  });

  it("sin argumentos muestra ayuda con exit 2; --version => 0", async () => {
    const h = harness();
    expect(await run([], h.deps)).toBe(2);
    expect(h.out.join("")).toContain("concat login");
    expect(await run(["--version"], h.deps)).toBe(0);
  });
});
