import { json, OAuthError, oauthErrorResponse, preflight, readForm } from "../../../lib/auth/http";
import { oauthServer } from "../../../lib/auth/oauth-server";
import { limitByIp } from "../../../lib/auth/rate-guard";
import { LIMITS } from "../../../lib/rate-limit";
import { toSafeError } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export async function POST(req: Request) {
  try {
    const limited = await limitByIp(req, "token", LIMITS.tokenIp);
    if (limited) return oauthErrorResponse(limited);
    const form = await readForm(req);
    const get = (k: string) => form.get(k) ?? "";
    const clientId = get("client_id");
    if (!clientId) throw new OAuthError("invalid_request", "Falta client_id");
    const server = oauthServer();

    // Clientes publicos (sin secreto): la identidad del cliente se ata al code/refresh/device_code emitido.
    switch (get("grant_type")) {
      case "authorization_code": {
        const code = get("code");
        const redirectUri = get("redirect_uri");
        const codeVerifier = get("code_verifier");
        if (!code || !redirectUri || !codeVerifier) {
          throw new OAuthError("invalid_request", "Faltan code, redirect_uri o code_verifier");
        }
        return json(await server.exchangeCode({ code, clientId, redirectUri, codeVerifier }));
      }
      case "refresh_token": {
        const refreshToken = get("refresh_token");
        if (!refreshToken) throw new OAuthError("invalid_request", "Falta refresh_token");
        return json(await server.exchangeRefresh({ refreshToken, clientId, scope: form.get("scope") }));
      }
      case DEVICE_GRANT: {
        const deviceCode = get("device_code");
        if (!deviceCode) throw new OAuthError("invalid_request", "Falta device_code");
        return json(await server.pollDevice({ deviceCode, clientId }));
      }
      default:
        throw new OAuthError("unsupported_grant_type", "grant_type no soportado");
    }
  } catch (e) {
    if (e instanceof OAuthError) return oauthErrorResponse(e);
    // Nunca se devuelve el mensaje interno: pasa por toSafeError() solo para el log.
    console.error("oauth/token", toSafeError(e));
    return oauthErrorResponse(new OAuthError("server_error", "Error interno", 500));
  }
}

export const OPTIONS = preflight;
