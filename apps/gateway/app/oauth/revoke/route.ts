import { json, OAuthError, oauthErrorResponse, preflight, readForm } from "../../../lib/auth/http";
import { oauthServer } from "../../../lib/auth/oauth-server";
import { toSafeError } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/** RFC 7009. Revoca refresh tokens del gateway; los access tokens (1 h) expiran solos. Siempre 200. */
export async function POST(req: Request) {
  try {
    const token = (await readForm(req)).get("token");
    if (token) await oauthServer().revoke(token);
    return json({});
  } catch (e) {
    if (e instanceof OAuthError) return oauthErrorResponse(e);
    console.error("oauth/revoke", toSafeError(e));
    return oauthErrorResponse(new OAuthError("server_error", "Error interno", 500));
  }
}

export const OPTIONS = preflight;
