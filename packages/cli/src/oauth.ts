import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CLIENT_ID } from "./config.js";
import { CliError, EXIT, notAuthenticated } from "./errors.js";
import type { Credentials } from "./store.js";

export interface Net {
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface ServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint?: string;
  revocation_endpoint?: string;
  /** RFC 9207: el AS incluye `iss` en la respuesta de autorización. */
  authorization_response_iss_parameter_supported?: boolean;
}

const REQUEST_TIMEOUT_MS = 30_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Descubre el AS (RFC 8414). Los endpoints deben ser del mismo origin que el gateway. */
export async function discover(gateway: string, net: Net): Promise<ServerMetadata> {
  let body: unknown;
  try {
    const res = await net.fetch(`${gateway}/.well-known/oauth-authorization-server`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    const why = err instanceof Error ? err.message : "error de red";
    throw new CliError(`No se pudo descubrir el servidor OAuth en ${gateway} (${why}).`, EXIT.OTHER);
  }
  const m = isRecord(body) ? body : {};
  const md: Partial<ServerMetadata> = {
    issuer: str(m.issuer),
    authorization_endpoint: str(m.authorization_endpoint),
    token_endpoint: str(m.token_endpoint),
    device_authorization_endpoint: str(m.device_authorization_endpoint),
    revocation_endpoint: str(m.revocation_endpoint),
  };
  if (!md.issuer || !md.authorization_endpoint || !md.token_endpoint) {
    throw new CliError("Metadata OAuth del gateway incompleta.", EXIT.OTHER);
  }
  if (m.authorization_response_iss_parameter_supported === true) {
    md.authorization_response_iss_parameter_supported = true;
  }
  const origin = new URL(gateway).origin;
  for (const [k, v] of Object.entries(md)) {
    if (typeof v !== "string") continue;
    let o: string;
    try {
      o = new URL(v).origin;
    } catch {
      throw new CliError(`Metadata OAuth inválida: ${k}.`, EXIT.OTHER);
    }
    if (o !== origin) throw new CliError(`Metadata OAuth sospechosa: ${k} apunta a otro origen.`, EXIT.OTHER);
  }
  return md as ServerMetadata;
}

interface FormResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  /** Cabecera Retry-After en segundos, si vino. */
  retryAfterHeader?: number;
}

async function postForm(net: Net, url: string, params: Record<string, string>): Promise<FormResponse> {
  try {
    const res = await net.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const parsed: unknown = await res.json().catch(() => ({}));
    const header = Number(res.headers.get("retry-after"));
    return {
      ok: res.ok,
      status: res.status,
      body: isRecord(parsed) ? parsed : {},
      ...(Number.isFinite(header) && header > 0 ? { retryAfterHeader: Math.ceil(header) } : {}),
    };
  } catch {
    throw new CliError("No se pudo conectar con el gateway.", EXIT.OTHER);
  }
}

/** Solo `error` y `error_description` del gateway llegan al usuario. */
function oauthError(r: FormResponse): CliError {
  const code = str(r.body.error) ?? `http_${r.status}`;
  const desc = str(r.body.error_description);
  const message = desc ? `${code}: ${desc}` : code;
  if (code === "rate_limited" || r.status === 429) {
    const bodyRetry = typeof r.body.retry_after === "number" && r.body.retry_after > 0 ? r.body.retry_after : undefined;
    const retryAfter = bodyRetry ?? r.retryAfterHeader;
    return new CliError(
      `Demasiados intentos${retryAfter ? `; reintenta en ${retryAfter}s` : ""}.`,
      EXIT.QUOTA,
      { error: "rate_limited", next_action: "retry", ...(retryAfter ? { retry_after: retryAfter } : {}) },
    );
  }
  if (code === "invalid_grant" || code === "invalid_token") {
    return new CliError(message, EXIT.UNAUTHENTICATED, {
      error: code,
      fix: "Ejecuta: concat login",
      next_action: "relogin",
    });
  }
  return new CliError(message, EXIT.OTHER, { error: code });
}

function toCredentials(body: Record<string, unknown>, now: number, previousRefresh?: string): Credentials {
  const access = str(body.access_token);
  if (!access) throw new CliError("Respuesta de token inválida del gateway.", EXIT.OTHER);
  const type = str(body.token_type);
  if (type && type.toLowerCase() !== "bearer") throw new CliError("Tipo de token no soportado.", EXIT.OTHER);
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  const creds: Credentials = { access_token: access, expires_at: now + expiresIn * 1000 };
  const refresh = str(body.refresh_token) ?? previousRefresh;
  if (refresh) creds.refresh_token = refresh;
  const scope = str(body.scope);
  if (scope) creds.scope = scope;
  return creds;
}

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

const b64url = (b: Buffer): string => b.toString("base64url");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface LoginIO {
  /** Mensajes para el humano (van a stderr). */
  log(line: string): void;
  openBrowser(url: string): void;
}

const PAGE = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>CONCAT</title><body style="font-family:system-ui;margin:3rem"><h2>${msg}</h2><p>Puedes cerrar esta pestaña.</p>`;

/** Authorization code + PKCE con redirect loopback (RFC 8252). */
export async function loginLoopback(md: ServerMetadata, net: Net, io: LoginIO): Promise<Credentials> {
  const { verifier, challenge } = pkcePair();
  const state = b64url(randomBytes(16));

  let settle!: (r: { code: string } | { error: CliError }) => void;
  const outcome = new Promise<{ code: string } | { error: CliError }>((r) => (settle = r));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const gotState = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    const iss = url.searchParams.get("iss");
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (!safeEqual(gotState, state)) {
      res.writeHead(400).end(PAGE("Solicitud inválida"));
      return; // ignora peticiones ajenas; sigue esperando el callback real
    }
    // RFC 9207 (mix-up): `iss` debe coincidir con el issuer del metadata si viene,
    // y es obligatorio cuando el AS anuncia soportarlo. También en respuestas de error.
    if (iss !== null ? iss !== md.issuer : md.authorization_response_iss_parameter_supported === true) {
      res.writeHead(400).end(PAGE("Emisor inválido"));
      settle({
        error: new CliError("Respuesta de autorización con emisor (iss) inesperado; login abortado.", EXIT.OTHER, {
          error: "issuer_mismatch",
        }),
      });
      return;
    }
    if (err || !code) {
      res.writeHead(400).end(PAGE("Autorización cancelada"));
      settle({ error: new CliError(`Autorización rechazada${err ? `: ${err}` : ""}.`, EXIT.OTHER) });
      return;
    }
    res.writeHead(200).end(PAGE("CONCAT CLI conectado"));
    settle({ code });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  const timer = setTimeout(
    () => settle({ error: new CliError("Tiempo agotado esperando la autorización en el navegador.", EXIT.OTHER) }),
    LOGIN_TIMEOUT_MS,
  );

  try {
    const auth = new URL(md.authorization_endpoint);
    auth.search = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString();
    io.log("Link para iniciar sesión (ábrelo en este equipo; si el navegador no se abre, cópialo):");
    io.log(`  ${auth.toString()}`);
    io.openBrowser(auth.toString());

    const result = await outcome;
    if ("error" in result) throw result.error;

    const r = await postForm(net, md.token_endpoint, {
      grant_type: "authorization_code",
      code: result.code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
    if (!r.ok) throw oauthError(r);
    return toCredentials(r.body, net.now());
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

/** Device flow (RFC 8628): muestra verification_uri + user_code (a escribir a mano) y hace polling. */
export async function loginDevice(md: ServerMetadata, net: Net, io: LoginIO): Promise<Credentials> {
  if (!md.device_authorization_endpoint) {
    throw new CliError("El gateway no soporta device flow.", EXIT.OTHER);
  }
  const start = await postForm(net, md.device_authorization_endpoint, { client_id: CLIENT_ID });
  if (!start.ok) throw oauthError(start);
  const deviceCode = str(start.body.device_code);
  const userCode = str(start.body.user_code);
  // Solo verification_uri + user_code (escrito a mano). Se ignora verification_uri_complete:
  // el gateway no prellena el código, para que el humano lo compare con el de su terminal.
  const uri = str(start.body.verification_uri);
  if (!deviceCode || !userCode || !uri) throw new CliError("Respuesta de device flow inválida.", EXIT.OTHER);
  if (originOf(uri) !== originOf(md.issuer)) {
    throw new CliError("Respuesta de device flow sospechosa: verification_uri apunta a otro origen.", EXIT.OTHER);
  }

  io.log("Para iniciar sesión, en cualquier navegador:");
  io.log(`  1. Abre ${uri}`);
  io.log("  2. Escribe este código a mano:");
  io.log(`       ${userCode}`);
  io.log("Verifica que la URL sea la de tu gateway antes de escribir el código.");

  let interval = typeof start.body.interval === "number" && start.body.interval > 0 ? start.body.interval : 5;
  const expiresIn = typeof start.body.expires_in === "number" && start.body.expires_in > 0 ? start.body.expires_in : 600;
  const deadline = net.now() + expiresIn * 1000;

  while (net.now() < deadline) {
    await net.sleep(interval * 1000);
    const r = await postForm(net, md.token_endpoint, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: CLIENT_ID,
    });
    if (r.ok) return toCredentials(r.body, net.now());
    const code = str(r.body.error);
    if (code === "authorization_pending") continue;
    if (code === "slow_down") {
      interval += 5;
      continue;
    }
    if (code === "access_denied") throw new CliError("Autorización denegada.", EXIT.OTHER);
    if (code === "expired_token") break;
    throw oauthError(r);
  }
  throw new CliError("El código expiró. Ejecuta de nuevo: concat login --device", EXIT.OTHER);
}

/** Refresh con rotación: el refresh token nuevo reemplaza al anterior. */
export async function refreshTokens(md: ServerMetadata, net: Net, refreshToken: string): Promise<Credentials> {
  const r = await postForm(net, md.token_endpoint, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) {
      const e = oauthError(r);
      if (e.exitCode === EXIT.OTHER) throw notAuthenticated("La sesión expiró.");
      throw e;
    }
    throw oauthError(r);
  }
  return toCredentials(r.body, net.now(), refreshToken);
}

/** Best effort: un fallo de red no impide el logout local. */
export async function revokeToken(md: ServerMetadata, net: Net, token: string): Promise<void> {
  if (!md.revocation_endpoint) return;
  try {
    await postForm(net, md.revocation_endpoint, { token, token_type_hint: "refresh_token", client_id: CLIENT_ID });
  } catch {
    // ignorado a propósito
  }
}
