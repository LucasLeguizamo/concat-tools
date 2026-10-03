import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  CLI_CLIENT_ID,
  createClientResolver,
  isCliLoopbackRedirect,
  isPrivateIp,
  matchesDeclaredRedirect,
  pinnedFetch,
  pinnedLookup,
  parseCimdClientId,
  redirectAllowed,
} from "./clients";
import { OAuthError } from "./http";

describe("redirect loopback del CLI (RFC 8252)", () => {
  it("acepta http://127.0.0.1:<puerto>/callback", () => {
    expect(isCliLoopbackRedirect("http://127.0.0.1:53682/callback")).toBe(true);
    expect(isCliLoopbackRedirect("http://127.0.0.1:1/callback")).toBe(true);
  });

  it.each([
    "http://localhost:5000/callback",
    "http://127.0.0.1/callback", // sin puerto
    "http://127.0.0.1:0/callback",
    "http://127.0.0.1:70000/callback",
    "https://127.0.0.1:5000/callback",
    "http://127.0.0.1:5000/otro",
    "http://127.0.0.1:5000/callback?x=1",
    "http://127.0.0.1:5000/callback#f",
    "http://user:pw@127.0.0.1:5000/callback",
    "http://127.0.0.1.evil.com:5000/callback",
    "http://evil.com:5000/callback",
    "no-es-url",
  ])("rechaza %s", (uri) => {
    expect(isCliLoopbackRedirect(uri)).toBe(false);
  });

  it("el cliente integrado se resuelve sin red y valida el redirect", async () => {
    const r = createClientResolver({
      fetch: () => {
        throw new Error("no debe hacer fetch");
      },
    });
    const c = await r.resolve(CLI_CLIENT_ID);
    expect(redirectAllowed(c, "http://127.0.0.1:4000/callback")).toBe(true);
    expect(redirectAllowed(c, "https://evil.com/callback")).toBe(false);
  });
});

describe("client_id CIMD", () => {
  it("acepta URL https con path, rechaza el resto", () => {
    expect(parseCimdClientId("https://app.example.com/oauth/client.json").hostname).toBe("app.example.com");
    for (const bad of [
      "http://app.example.com/c.json",
      "https://app.example.com/",
      "https://app.example.com",
      "https://app.example.com:8443/c.json",
      "https://user@app.example.com/c.json",
      "https://app.example.com/c.json#frag",
      "https://127.0.0.1/c.json",
      "https://[::1]/c.json",
      "https://app.example.com/a/../c.json",
      "https://APP.example.com/c.json",
      "javascript:alert(1)",
    ]) {
      expect(() => parseCimdClientId(bad), bad).toThrow(OAuthError);
    }
  });

  it("isPrivateIp: NAT64, 6to4, IPv4-mapped/compat (punteada y hex), CGNAT, 0/8, link-local, ULA, multicast", () => {
    const priv = [
      "64:ff9b::7f00:1", "64:ff9b::8.8.8.8", "64:ff9b:1::1", // NAT64
      "2002:7f00:1::1", "2002:0a00:0001::", "2002::", // 6to4
      "::127.0.0.1", "::8.8.8.8", "::1", "::", "0:0:0:0:0:0:0:1", // ::/96 compat
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::FFFF:10.0.0.1", "0:0:0:0:0:ffff:c0a8:1", // mapped
      "100.64.0.1", "100.127.255.255", "0.1.2.3", "0.0.0.0", "169.254.0.1", "224.0.0.1", "255.255.255.255", "240.0.0.1",
      "fc00::1", "fdff::1", "fe80::1", "febf::1", "ff02::1", "ff00::", "2001::1", "2001:db8::1", "100::1",
      "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1",
    ];
    for (const ip of priv) expect(isPrivateIp(ip), ip).toBe(true);
    const pub = ["::ffff:8.8.8.8", "::ffff:808:808", "100.63.255.255", "100.128.0.1", "2606:4700::1111", "2a00:1450:4001::200e", "1.1.1.1", "223.255.255.255", "fec0::1"];
    for (const ip of pub) expect(isPrivateIp(ip), ip).toBe(false);
    for (const bad of ["no-ip", "", "1.2.3", "::g", "1:2:3:4:5:6:7:8:9"]) expect(isPrivateIp(bad), bad).toBe(true);
  });

  it("isPrivateIp cubre loopback, RFC1918, link-local, CGNAT y IPv6 locales", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "93.184.216.34", "2606:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe("redirect_uris declarados: exactos", () => {
  const declared = ["https://app.example.com/cb", "http://127.0.0.1/cb"];
  it("exacto para https; solo el puerto puede variar en loopback", () => {
    expect(matchesDeclaredRedirect(declared, "https://app.example.com/cb")).toBe(true);
    expect(matchesDeclaredRedirect(declared, "https://app.example.com/cb2")).toBe(false);
    expect(matchesDeclaredRedirect(declared, "https://app.example.com/cb?x=1")).toBe(false);
    expect(matchesDeclaredRedirect(declared, "https://app.example.com:444/cb")).toBe(false);
    expect(matchesDeclaredRedirect(declared, "http://127.0.0.1:9999/cb")).toBe(true);
    expect(matchesDeclaredRedirect(declared, "http://127.0.0.1:9999/otro")).toBe(false);
    expect(matchesDeclaredRedirect(declared, "http://localhost:9999/cb")).toBe(false);
  });
});

describe("descarga CIMD", () => {
  const ID = "https://app.example.com/client.json";
  const doc = { client_id: ID, client_name: "Mi Agente", redirect_uris: ["https://app.example.com/cb"] };
  const publicLookup = async () => ["93.184.216.34"];
  const jsonRes = (body: unknown, init: ResponseInit = {}) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });
  const resolverWith = (fetchImpl: typeof fetch, extra: { lookup?: () => Promise<string[]>; now?: () => number } = {}) =>
    createClientResolver({ fetch: fetchImpl, lookup: extra.lookup ?? publicLookup, now: extra.now });
  const reason = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return e instanceof OAuthError ? `${e.code}: ${e.description}` : String(e);
    }
    return "no-error";
  };

  it("descarga, valida y cachea", async () => {
    let calls = 0;
    let t = 0;
    const r = resolverWith(async () => (calls++, jsonRes(doc)), { now: () => t });
    const c = await r.resolve(ID);
    expect(c).toMatchObject({ id: ID, name: "Mi Agente", kind: "cimd", redirectUris: ["https://app.example.com/cb"] });
    await r.resolve(ID);
    expect(calls).toBe(1);
    t += 6 * 60_000; // cache corta (5 min)
    await r.resolve(ID);
    expect(calls).toBe(2);
  });

  it("pasa redirect:error y un signal de timeout al fetch", async () => {
    let init: RequestInit | undefined;
    await resolverWith(async (_u, i) => ((init = i), jsonRes(doc))).resolve(ID);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("el fetch recibe EXACTAMENTE las IPs validadas (pin): no se vuelve a resolver el host", async () => {
    let pinned: string[] | undefined;
    let lookups = 0;
    const r = createClientResolver({
      lookup: async () => (lookups++, ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]),
      fetch: async (_u, _i, addrs) => ((pinned = addrs), jsonRes(doc)),
    });
    await r.resolve(ID);
    expect(pinned).toEqual(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]);
    expect(lookups).toBe(1);
  });

  it("rechaza si UNA de las IPs resueltas es privada (mezcla publica+privada)", async () => {
    let fetched = false;
    const r = resolverWith(async () => ((fetched = true), jsonRes(doc)), { lookup: async () => ["93.184.216.34", "::ffff:7f00:1"] });
    expect(await reason(r.resolve(ID))).toMatch(/invalid_client/);
    expect(fetched).toBe(false);
  });

  it("rechaza host que resuelve a IP privada (SSRF) sin hacer fetch", async () => {
    let fetched = false;
    const r = resolverWith(async () => ((fetched = true), jsonRes(doc)), { lookup: async () => ["10.0.0.5"] });
    expect(await reason(r.resolve(ID))).toMatch(/invalid_client/);
    expect(fetched).toBe(false);
  });

  it("rechaza documento mayor al maximo (content-length y streaming)", async () => {
    const big = JSON.stringify({ ...doc, client_name: "x".repeat(6000) });
    expect(await reason(resolverWith(async () => jsonRes(big, { headers: { "content-type": "application/json", "content-length": String(big.length) } })).resolve(ID))).toMatch(/grande/);
    expect(await reason(resolverWith(async () => jsonRes(big)).resolve(ID))).toMatch(/grande/);
  });

  it("rechaza client_id distinto, no-JSON, status != 200 y redirect_uris inseguros", async () => {
    expect(await reason(resolverWith(async () => jsonRes({ ...doc, client_id: "https://evil.com/x.json" })).resolve(ID))).toMatch(/no coincide/);
    expect(await reason(resolverWith(async () => jsonRes(doc, { headers: { "content-type": "text/html" } })).resolve(ID))).toMatch(/no es JSON/);
    expect(await reason(resolverWith(async () => jsonRes(doc, { status: 404 })).resolve(ID))).toMatch(/descargar/);
    expect(await reason(resolverWith(async () => jsonRes(doc, { status: 404 })).resolve(ID))).not.toMatch(/404/); // sin status upstream
    expect(await reason(resolverWith(async () => jsonRes("no json")).resolve(ID))).toMatch(/invalido/);
    for (const uri of ["http://evil.com/cb", "javascript:alert(1)", "myapp://cb", "https://a.com/cb#x"]) {
      expect(await reason(resolverWith(async () => jsonRes({ ...doc, redirect_uris: [uri] })).resolve(ID)), uri).toMatch(/redirect_uris/);
    }
    expect(await reason(resolverWith(async () => jsonRes({ ...doc, token_endpoint_auth_method: "client_secret_basic" })).resolve(ID))).toMatch(/publicos/);
  });

  it("errores de red/timeout salen como invalid_client sin filtrar detalle; client_id desconocido (no URL) falla", async () => {
    const boom = resolverWith(async () => {
      throw new Error("ECONNRESET secreto");
    });
    const r = await reason(boom.resolve(ID));
    expect(r).toMatch(/invalid_client/);
    expect(r).not.toMatch(/secreto/);
    expect(await reason(resolverWith(async () => jsonRes(doc)).resolve("cliente-raro"))).toMatch(/desconocido/);
  });

  it("limpia el nombre mostrado (control/bidi) y usa el host si falta", async () => {
    const c = await resolverWith(async () => jsonRes({ ...doc, client_name: "Ev‮il\u0000 App" })).resolve(ID);
    expect(c.name).toBe("Evil App");
    const c2 = await resolverWith(async () => jsonRes({ ...doc, client_name: undefined })).resolve(ID);
    expect(c2.name).toBe("app.example.com");
  });
});

describe("pin de conexion (anti DNS-rebinding)", () => {
  it("pinnedLookup devuelve solo las IPs validadas, en ambos formatos de callback de Node, sin DNS", () => {
    const lookup = pinnedLookup(["93.184.216.34", "2606:4700::1111"]);
    let single: unknown[] = [];
    lookup("evil.example.com", {}, (...a) => (single = a));
    expect(single).toEqual([null, "93.184.216.34", 4]);
    let all: unknown[] = [];
    lookup("evil.example.com", { all: true }, (...a) => (all = a));
    expect(all).toEqual([null, [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700::1111", family: 6 }]]);
    let v6: unknown[] = [];
    lookup("evil.example.com", { family: 6 }, (...a) => (v6 = a));
    expect(v6).toEqual([null, "2606:4700::1111", 6]);
    let none: unknown[] = [];
    pinnedLookup(["93.184.216.34"])("x", { family: 6 }, (...a) => (none = a));
    expect((none[0] as Error).message).toMatch(/sin direcciones/);
  });

  it("pinnedFetch conecta a la IP fijada aunque el hostname no resuelva por DNS (.invalid)", async () => {
    const srv = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end('{"ok":true}');
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    try {
      const { port } = srv.address() as AddressInfo;
      // Sin el pin, "rebind.invalid" jamas resolveria; con el pin, el socket va a 127.0.0.1.
      const res = await pinnedFetch(`http://rebind.invalid:${port}/`, {}, ["127.0.0.1"]);
      expect(await res.json()).toEqual({ ok: true });
      // Sin IPs validadas no hay conexion posible (nunca cae a DNS).
      await expect(pinnedFetch(`http://rebind.invalid:${port}/`, {}, [])).rejects.toThrow();
    } finally {
      srv.close();
    }
  });

  it("pinnedFetch corta cuerpos mayores al tope (no bufferiza lo que mande un host hostil)", async () => {
    const srv = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.write("x".repeat(2000));
      res.write("x".repeat(2000));
      res.end("x".repeat(2000));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    try {
      const { port } = srv.address() as AddressInfo;
      await expect(pinnedFetch(`http://rebind.invalid:${port}/`, {}, ["127.0.0.1"])).rejects.toThrow(/grande/);
    } finally {
      srv.close();
    }
  });

  it("pinnedFetch no sigue redirects", async () => {
    const srv = createServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "http://169.254.169.254/latest/meta-data");
      res.end();
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    try {
      const { port } = srv.address() as AddressInfo;
      await expect(
        pinnedFetch(`http://rebind.invalid:${port}/`, { redirect: "error" }, ["127.0.0.1"]),
      ).rejects.toThrow();
    } finally {
      srv.close();
    }
  });
});
