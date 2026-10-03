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
