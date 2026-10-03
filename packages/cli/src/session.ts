import { discover, refreshTokens, type Net, type ServerMetadata } from "./oauth.js";
import { asActionable, CliError, EXIT, exitCodeForActionable, notAuthenticated, scrub } from "./errors.js";
import type { CredentialStore, Credentials } from "./store.js";

/** Margen para refrescar antes de que expire. */
const SKEW_MS = 60_000;

export interface Session {
  gateway: string;
  metadata(): Promise<ServerMetadata>;
  /** Access token vigente; refresca (y persiste la rotación) si hace falta. */
  accessToken(force?: boolean): Promise<string>;
  /** GET autenticado a la API del gateway; devuelve JSON. */
  api(path: string): Promise<unknown>;
}

export function createSession(gateway: string, store: CredentialStore, net: Net): Session {
  let md: ServerMetadata | undefined;
  let current: Credentials | null | undefined;

  const metadata = async () => (md ??= await discover(gateway, net));
  const fresh = (c: Credentials) => c.expires_at - SKEW_MS > net.now();

  async function accessToken(force = false): Promise<string> {
    current ??= await store.load(gateway);
    if (!current) throw notAuthenticated();
    if (!force && fresh(current)) return current.access_token;
    const used = current.refresh_token;
    if (!used) throw notAuthenticated("La sesión expiró.");
    try {
      current = await refreshTokens(await metadata(), net, used);
      await store.save(gateway, current);
      return current.access_token;
    } catch (err) {
      // Con rotación, otro proceso pudo refrescar antes que nosotros.
      const other = await store.load(gateway);
      if (other && other.refresh_token !== used && fresh(other)) {
        current = other;
        return other.access_token;
      }
      throw err;
    }
  }

  async function api(path: string): Promise<unknown> {
    const call = async (token: string) => {
      try {
        return await net.fetch(`${gateway}${path}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new CliError("No se pudo conectar con el gateway.", EXIT.OTHER);
      }
    };
    let res = await call(await accessToken());
    if (res.status === 401) res = await call(await accessToken(true));
    if (res.status === 401) throw notAuthenticated("El gateway rechazó tu sesión.");
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const a = asActionable(body);
      if (a) throw new CliError(scrub(a.message), exitCodeForActionable(a), a);
      throw new CliError(`El gateway respondió HTTP ${res.status}.`, EXIT.OTHER);
    }
    return body;
  }

  return { gateway, metadata, accessToken, api };
}
