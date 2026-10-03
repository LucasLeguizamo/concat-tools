import { isIP } from "node:net";
import { getEnv } from "../env";

/** Respuestas con credenciales o metadata dinamica: nunca cacheables. */
export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

/** Los endpoints OAuth/metadata no usan cookies: CORS abierto es seguro y los hosts MCP en navegador lo necesitan. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
} as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...CORS, ...headers } });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "600" } });
}

/** Error OAuth (RFC 6749 §5.2). `description` nunca debe contener secretos. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly status = 400,
    /** Segundos hasta poder reintentar (cabecera Retry-After). */
    readonly retryAfter?: number,
  ) {
    super(`${code}: ${description}`);
    this.name = "OAuthError";
  }
}

export function oauthErrorResponse(err: OAuthError): Response {
  return json(
    { error: err.code, error_description: err.description },
    err.status,
    err.retryAfter ? { "Retry-After": String(err.retryAfter) } : {},
  );
}

/** Lee un body application/x-www-form-urlencoded (tope de 16 KB) a un mapa plano. */
export async function readForm(req: Request): Promise<URLSearchParams> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new OAuthError("invalid_request", "Content-Type debe ser application/x-www-form-urlencoded");
  }
  const text = await req.text();
  if (text.length > 16_384) throw new OAuthError("invalid_request", "Body demasiado grande");
  return new URLSearchParams(text);
}

/** Control C0/C1 o backslash. Por code point: sin regex con escapes \u (ver NOTES). */
function hasControlOrBackslash(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x5c) return true;
  }
  return false;
}

/**
 * Solo rutas relativas al propio origen (anti open-redirect). Devuelve `fallback`
 * si `raw` es ausente, absoluta, protocol-relative, con backslash o con caracteres de control
 * (el parser URL elimina tab/CR/LF, asi que `/<tab>/evil.com` se volveria `//evil.com`).
 * Tras normalizar se vuelve a comprobar: `/.//evil.com`, `/%2e//evil.com` y `/a/..//evil.com`
 * colapsan a `//evil.com`, que un navegador interpreta como otro host.
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || raw.length > 2048 || !raw.startsWith("/") || raw.startsWith("//") || hasControlOrBackslash(raw)) {
    return fallback;
  }
  try {
    const base = "http://internal.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return fallback;
    const out = u.pathname + u.search;
    if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\") || hasControlOrBackslash(out)) {
      return fallback;
    }
    return out;
  } catch {
    return fallback;
  }
}

/**
 * IP del cliente. En Vercel `x-forwarded-for` lo fija la plataforma (no se reenvia el del cliente);
 * fuera de Vercel esto es spoofable salvo detras de un proxy propio. Se valida el formato.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const candidate =
    h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = candidate.trim();
  return ip.length <= 45 && isIP(ip) ? ip : "unknown";
}

/** Pais aproximado (ISO 3166-1 alfa-2) segun el edge de Vercel, o null. */
export function clientCountry(req: Request): string | null {
  const c = req.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export const publicUrl = () => getEnv().PUBLIC_URL;
export const mcpResource = () => `${getEnv().PUBLIC_URL}/mcp`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Pagina de error para fallos que NO deben redirigir (client_id o redirect_uri no confiables). */
export function htmlError(message: string, status = 400, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Error</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto"><h1>No se pudo continuar</h1><p>${escapeHtml(message)}</p></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-frame-options": "DENY",
        "cache-control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

/** Redirect de error al cliente (RFC 6749 §4.1.2.1 + `iss` de RFC 9207). Solo con redirect_uri ya validado. */
export function redirectWithParams(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set("iss", getEnv().PUBLIC_URL);
  return u.toString();
}
