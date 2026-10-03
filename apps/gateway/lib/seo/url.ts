// Normalizador unico para el join GSC <-> GA4 (y para agrupar URLs en los workflows). Funcion pura.
// Reglas documentadas en NOTES.md (v1.1).

export interface UrlOptions {
  /** Parametros de query que se conservan (el resto se descarta). Por defecto ninguno. */
  keepParams?: readonly string[];
}

export interface NormalizedUrl {
  host: string;
  path: string;
  /** `host + path + params`: clave de join. */
  key: string;
}

const INDEX_RE = /\/index\.(html?|php)$/;

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Acepta URL absoluta (GSC `page`) o ruta relativa con `hostName` aparte (GA4 `landingPagePlusQueryString`).
 * Devuelve null para vacios, `(not set)` y entradas no parseables.
 */
export function normalizeUrl(input: string, opts: UrlOptions = {}, hostName?: string): NormalizedUrl | null {
  const raw = input.trim();
  if (!raw || raw === "(not set)" || hostName === "(not set)") return null;
  let u: URL;
  try {
    u = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw, `https://${hostName ?? ""}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || host === "(not set)") return null;

  let path = u.pathname
    .split("/")
    .map((s) => decodeSegment(s).toLowerCase())
    .join("/")
    .replace(/\/{2,}/g, "/")
    .replace(INDEX_RE, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (!path.startsWith("/")) path = `/${path}`;

  const keep = new Set(opts.keepParams ?? []);
  const params = [...u.searchParams.entries()].filter(([k]) => keep.has(k)).sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const qs = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";

  return { host, path, key: `${host}${path}${qs}` };
}

export interface SiteScope {
  /** Host sin `www.`. */
  host: string;
  /** `domain`: incluye subdominios. `prefix`: solo ese host y ruta. */
  kind: "domain" | "prefix";
  /** Solo en `prefix`, sin slash final ("" = todo el host). */
  pathPrefix: string;
}

/** `sc-domain:x.com` o `https://x.com/blog/` -> alcance. null si no es valido. */
export function parseSite(site: string): SiteScope | null {
  if (site.startsWith("sc-domain:")) {
    const host = site.slice("sc-domain:".length).toLowerCase().replace(/^www\./, "");
    return host ? { host, kind: "domain", pathPrefix: "" } : null;
  }
  const n = normalizeUrl(site);
  if (!n) return null;
  return { host: n.host, kind: "prefix", pathPrefix: n.path === "/" ? "" : n.path };
}

export function inScope(scope: SiteScope, u: NormalizedUrl): boolean {
  if (scope.kind === "domain") return u.host === scope.host || u.host.endsWith(`.${scope.host}`);
  if (u.host !== scope.host) return false;
  return scope.pathPrefix === "" || u.path === scope.pathPrefix || u.path.startsWith(`${scope.pathPrefix}/`);
}
