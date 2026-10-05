import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { usageError } from "./errors.js";

export const DEFAULT_GATEWAY = "https://gw.onconcat.com";
export const CLIENT_ID = "concat-cli";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Gateway efectivo: --gateway > CONCAT_GATEWAY_URL > default.
 * Devuelve el origin sin barra final. Exige https salvo loopback (los tokens
 * viajan en Authorization).
 */
export function resolveGateway(flag: string | undefined, env: NodeJS.ProcessEnv): string {
  const raw = flag ?? env.CONCAT_GATEWAY_URL ?? DEFAULT_GATEWAY;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw usageError(`URL de gateway inválida: ${raw}`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw usageError("El gateway debe usar https (http solo en localhost).");
  }
  return url.origin;
}

const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export const PROFILE_FILE = ".concat-profile";

/** Busca `.concat-profile` desde `cwd` hacia arriba: un perfil (cuenta) por proyecto. */
function profileFromFile(cwd: string): string | undefined {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    try {
      const v = readFileSync(join(dir, PROFILE_FILE), "utf8").trim();
      if (v) return v;
    } catch {
      // sin archivo en este nivel
    }
    if (dirname(dir) === dir) return undefined;
  }
}

/**
 * Perfil efectivo: --profile > CONCAT_PROFILE > `.concat-profile` > ninguno (sesión por defecto).
 * Cada perfil es una sesión independiente (otra cuenta de Google) en el mismo gateway.
 */
export function resolveProfile(flag: string | undefined, env: NodeJS.ProcessEnv, cwd: string): string | undefined {
  const raw = flag ?? (env.CONCAT_PROFILE?.trim() || undefined) ?? profileFromFile(cwd);
  if (raw === undefined || raw === "default") return undefined;
  if (!PROFILE_RE.test(raw)) throw usageError(`Perfil inválido: ${raw} (letras, números, "_", "-", ".").`);
  return raw;
}

/** Clave en el almacén de credenciales: el gateway, o `gateway#perfil`. */
export const storeKey = (gateway: string, profile?: string): string => (profile ? `${gateway}#${profile}` : gateway);
