import { CLI_CLIENT_ID } from "../../../lib/auth/clients";
import { clientCountry, clientIp, json, OAuthError, oauthErrorResponse, readForm } from "../../../lib/auth/http";
import { oauthServer, parseScope } from "../../../lib/auth/oauth-server";
import { limitByIp } from "../../../lib/auth/rate-guard";
import { LIMITS } from "../../../lib/rate-limit";
import { toSafeError } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** RFC 8628 §3.1: la CLI sin navegador pide un device_code + user_code. Solo para `concat-cli`. */
export async function POST(req: Request) {
  try {
    const limited = await limitByIp(req, "device", LIMITS.deviceIp);
    if (limited) return oauthErrorResponse(limited);
    const form = await readForm(req);
    const clientId = form.get("client_id") ?? "";
    if (!clientId) throw new OAuthError("invalid_request", "Falta client_id");
    // Antes de tocar nada (ni resolver CIMD, ni hacer fetch): otros clientes no tienen device flow.
    if (clientId !== CLI_CLIENT_ID) {
      throw new OAuthError("unauthorized_client", "Este cliente no puede usar el device flow");
    }
    const scope = parseScope(form.get("scope"));
    return json(await oauthServer().startDevice({ clientId, scope, ip: clientIp(req), country: clientCountry(req) }));
  } catch (e) {
    if (e instanceof OAuthError) return oauthErrorResponse(e);
    console.error("oauth/device", toSafeError(e));
    return oauthErrorResponse(new OAuthError("server_error", "Error interno", 500));
  }
}
