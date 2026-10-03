import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { z } from "zod";
import { OAuthError } from "./http";

export const CLI_CLIENT_ID = "concat-cli";

export type OAuthClient = {
  id: string;
  /** Nombre para la pantalla de consentimiento (sanitizado). */
  name: string;
  kind: "builtin" | "cimd";
  /** Solo CIMD: redirect_uris declarados en el documento. */
  redirectUris: string[];
};

const FETCH_TIMEOUT_MS = 5_000;
const MAX_DOC_BYTES = 5_120; // recomendacion de la spec CIMD
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** RFC 8252 §7.3: `http://127.0.0.1:<puerto>/callback`, sin query, hash ni credenciales. */
export function isCliLoopbackRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  return (
    u.protocol === "http:" &&
    u.hostname === "127.0.0.1" &&
    /^[1-9]\d{0,4}$/.test(u.port) &&
    Number(u.port) <= 65535 &&
    u.pathname === "/callback" &&
    u.search === "" &&
    u.hash === "" &&
    u.username === "" &&
    u.password === ""
  );
}

function parseRedirect(uri: string): URL | null {
  try {
    const u = new URL(uri);
    if (u.username || u.password || u.hash) return null;
    return u;
  } catch {
    return null;
  }
}

/** redirect_uri declarable en un documento CIMD: https, o http en loopback. */
function isAcceptableDeclaredRedirect(uri: string): boolean {
  const u = parseRedirect(uri);
  if (!u) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname);
}

/**
 * Coincidencia EXACTA con un redirect declarado. Unica excepcion (RFC 8252 §7.3):
 * si el declarado es loopback, el puerto solicitado puede variar (mismo host y path).
 */
export function matchesDeclaredRedirect(declared: string[], requested: string): boolean {
  const req = parseRedirect(requested);
  if (!req) return false;
  return declared.some((d) => {
    if (d === requested) return true;
    const dec = parseRedirect(d);
    if (!dec || dec.protocol !== "http:" || !LOOPBACK_HOSTS.has(dec.hostname)) return false;
    return (
      req.protocol === "http:" &&
      req.hostname === dec.hostname &&
      req.pathname === dec.pathname &&
      req.search === dec.search
    );
  });
}

export function redirectAllowed(client: OAuthClient, redirectUri: string): boolean {
  return client.kind === "builtin"
    ? isCliLoopbackRedirect(redirectUri)
    : matchesDeclaredRedirect(client.redirectUris, redirectUri);
}

function isPrivateIpv4(a: number, b: number, c: number): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a === 127 ||
    (a === 169 && b === 254) || // link-local (incl. metadata cloud)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24, TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast + reservado + broadcast
  );
}

/** Expande una IPv6 valida a 8 grupos de 16 bits (admite `::` y cola IPv4 punteada; ignora zone id). */
function expandIpv6(ip: string): number[] | null {
  let addr = ip.split("%")[0]!.toLowerCase();
  const tail = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [x = 0, y = 0, z = 0, w = 0] = tail.slice(1).map(Number);
    addr = addr.slice(0, tail.index) + ((x << 8) | y).toString(16) + ":" + ((z << 8) | w).toString(16);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** IPs no enrutables publicamente (anti-SSRF). Ante la duda (formato raro, prefijos de traduccion), se bloquea. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
    return isPrivateIpv4(a, b, c);
  }
  if (v === 6) {
    const g = expandIpv6(ip);
    if (!g) return true;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
    // ::/96 = no especificada (::), loopback (::1) y compatible-IPv4 obsoleto (::a.b.c.d): nada es publico.
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true;
    // IPv4-mapped ::ffff:a.b.c.d (tambien en forma hex ::ffff:7f00:1): se juzga la IPv4 embebida.
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
      return isPrivateIpv4(g6 >> 8, g6 & 255, g7 >> 8);
    }
    if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64 64:ff9b::/96 y 64:ff9b:1::/48
    if (g0 === 0x2002) return true; // 6to4 2002::/16 (embebe una IPv4 arbitraria)
    if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true; // Teredo 2001::/32, documentacion 2001:db8::/32
    if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard 100::/64
    if ((g0 & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
    if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
    return false;
  }
  return true; // no es una IP valida: tratar como no seguro
}

/**
 * `connect.lookup` de undici que NO consulta DNS: devuelve siempre las IPs ya validadas.
 * Asi la conexion va exactamente a lo que se valido (sin DNS-rebinding entre validar y conectar);
 * TLS sigue verificando el certificado contra el hostname original.
 */
export function pinnedLookup(addresses: string[]) {
  const entries: LookupAddress[] = addresses.map((address) => ({ address, family: isIP(address) }));
  return (
    _hostname: string,
    options: LookupOptions,
    cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    const family = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0;
    const usable = family ? entries.filter((e) => e.family === family) : entries;
    if (usable.length === 0) {
      cb(Object.assign(new Error("sin direcciones validadas"), { code: "ENOTFOUND" }), []);
    } else if (options.all) {
      cb(null, usable);
    } else {
      cb(null, usable[0]!.address, usable[0]!.family);
    }
  };
}

/** fetch con la conexion fijada a `addresses`. Sin redirects (los trata como error por quien llama). */
export async function pinnedFetch(url: string, init: RequestInit, addresses: string[]): Promise<Response> {
  const agent = new Agent({ connect: { lookup: pinnedLookup(addresses) }, maxRedirections: 0 } as ConstructorParameters<typeof Agent>[0]);
  try {
    const res = await undiciFetch(url, { ...(init as object), dispatcher: agent } as Parameters<typeof undiciFetch>[1]);
    // El cuerpo se lee (con tope) dentro de `try`: el agente no se destruye hasta tenerlo, y un host
    // hostil no puede hacernos bufferizar mas de MAX_DOC_BYTES.
    const body = await readCapped(res as unknown as Response, MAX_DOC_BYTES);
    return new Response(body, { status: res.status, headers: res.headers as HeadersInit });
  } finally {
    await agent.destroy().catch(() => undefined); // destroy (no close): no espera conexiones colgadas tras un abort/timeout
  }
}

/** client_id CIMD valido: URL https, con path, sin puerto/credenciales/fragmento, ya normalizada. */
export function parseCimdClientId(clientId: string): URL {
  const bad = (why: string) => new OAuthError("invalid_client", `client_id invalido: ${why}`);
  if (clientId.length > 512) throw bad("demasiado largo");
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    throw bad("no es una URL");
  }
  if (u.protocol !== "https:") throw bad("debe ser https");
  if (u.username || u.password) throw bad("sin credenciales");
  if (u.hash) throw bad("sin fragmento");
  if (u.port) throw bad("solo el puerto 443");
  if (u.pathname === "/") throw bad("debe incluir un path");
  if (isIP(u.hostname.replace(/^\[|\]$/g, ""))) throw bad("el host no puede ser una IP");
  if (u.href !== clientId) throw bad("URL no normalizada");
  return u;
}

const docSchema = z.object({
  client_id: z.string(),
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(2048)).min(1).max(20),
  token_endpoint_auth_method: z.string().optional(),
});

function cleanName(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, 100);
}

async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new OAuthError("invalid_client", "Documento de cliente demasiado grande");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new OAuthError("invalid_client", "Documento de cliente demasiado grande");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type ClientDeps = {
  /** Recibe las IPs ya validadas a las que DEBE conectar (el default las fija con un dispatcher undici). */
  fetch?: (url: string, init: RequestInit, addresses: string[]) => Promise<Response>;
  lookup?: (host: string) => Promise<string[]>;
  now?: () => number;
};

const defaultLookup = async (host: string) => (await dnsLookup(host, { all: true })).map((r) => r.address);

export function createClientResolver(deps: ClientDeps = {}) {
  const doFetch = deps.fetch ?? pinnedFetch;
  const lookup = deps.lookup ?? defaultLookup;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { client: OAuthClient; exp: number }>();

  async function fetchCimd(clientId: string): Promise<OAuthClient> {
    const url = parseCimdClientId(clientId);

    // Se resuelve UNA vez, se valida, y la conexion se fija a esas IPs (sin segunda resolucion = sin rebinding).
    let addrs: string[];
    try {
      addrs = await lookup(url.hostname);
    } catch {
      throw new OAuthError("invalid_client", "No se pudo resolver el host del client_id");
    }
    if (addrs.length === 0 || addrs.some(isPrivateIp)) {
      throw new OAuthError("invalid_client", "El host del client_id no es publico");
    }

    let text: string;
    try {
      const res = await doFetch(
        url.href,
        { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json" } },
        addrs,
      );
      // Mensaje generico: no se filtra el status de un host arbitrario (oraculo para sondear la red).
      if (!res.ok) throw new OAuthError("invalid_client", "No se pudo descargar el documento del cliente");
      if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
        throw new OAuthError("invalid_client", "El documento del cliente no es JSON");
      }
      text = await readCapped(res, MAX_DOC_BYTES);
    } catch (e) {
      if (e instanceof OAuthError) throw e;
      throw new OAuthError("invalid_client", "No se pudo descargar el documento del cliente");
    }

    let parsed: z.infer<typeof docSchema>;
    try {
      parsed = docSchema.parse(JSON.parse(text));
    } catch {
      throw new OAuthError("invalid_client", "Documento de cliente invalido");
    }
    if (parsed.client_id !== clientId) {
      throw new OAuthError("invalid_client", "client_id del documento no coincide con su URL");
    }
    if (parsed.token_endpoint_auth_method && parsed.token_endpoint_auth_method !== "none") {
      throw new OAuthError("invalid_client", "Solo se admiten clientes publicos (auth method none)");
    }
    if (!parsed.redirect_uris.every(isAcceptableDeclaredRedirect)) {
      throw new OAuthError("invalid_client", "redirect_uris debe ser https o loopback http");
    }
    return {
      id: clientId,
      name: cleanName(parsed.client_name ?? "") || url.hostname,
      kind: "cimd",
      redirectUris: parsed.redirect_uris,
    };
  }

  return {
    async resolve(clientId: string): Promise<OAuthClient> {
      if (clientId === CLI_CLIENT_ID) {
        return { id: CLI_CLIENT_ID, name: "CONCAT CLI", kind: "builtin", redirectUris: [] };
      }
      const hit = cache.get(clientId);
      if (hit && hit.exp > now()) return hit.client;
      if (!clientId.startsWith("https://")) {
        throw new OAuthError("invalid_client", "client_id desconocido");
      }
      const client = await fetchCimd(clientId);
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(clientId, { client, exp: now() + CACHE_TTL_MS });
      return client;
    },
  };
}

const defaultResolver = createClientResolver();

export const resolveClient = (clientId: string) => defaultResolver.resolve(clientId);

/** Resuelve el cliente y exige que `redirectUri` sea valido para el. */
export async function resolveClientForRedirect(clientId: string, redirectUri: string): Promise<OAuthClient> {
  const client = await resolveClient(clientId);
  if (!redirectAllowed(client, redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri no registrado para este cliente");
  }
  return client;
}
