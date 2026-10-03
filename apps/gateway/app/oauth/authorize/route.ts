import { NextResponse, type NextRequest } from "next/server";
import { resolveClientForRedirect } from "../../../lib/auth/clients";
import { clientIp, htmlError, mcpResource, OAuthError, publicUrl, redirectWithParams } from "../../../lib/auth/http";
import { isValidChallenge, oauthServer, parseScope } from "../../../lib/auth/oauth-server";
import { limitByIp } from "../../../lib/auth/rate-guard";
import { LIMITS } from "../../../lib/rate-limit";
import { toSafeError } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * Valida la peticion de autorizacion y la deja "pendiente"; el login (si hace falta)
 * y la aprobacion ocurren en /oauth/consent. Nunca se emite un code aqui.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state");

  // Antes de resolver el cliente (que puede hacer un fetch CIMD saliente).
  const limited = await limitByIp(req, "authorize", LIMITS.authorizeIp);
  if (limited) {
    return htmlError(limited.description, 429, { "retry-after": String(limited.retryAfter ?? 60) });
  }

  // Hasta validar cliente y redirect_uri NO se redirige: se muestra el error.
  try {
    if (!clientId || !redirectUri) throw new OAuthError("invalid_request", "Faltan client_id o redirect_uri");
    await resolveClientForRedirect(clientId, redirectUri);
  } catch (e) {
    return htmlError(e instanceof OAuthError ? e.description : toSafeError(e).message);
  }

  const fail = (error: string, description: string) =>
    NextResponse.redirect(redirectWithParams(redirectUri, { error, error_description: description, state }));

  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Solo response_type=code");
  if (state && state.length > 1024) return fail("invalid_request", "state demasiado largo");
  const challenge = q.get("code_challenge") ?? "";
  if (!isValidChallenge(challenge) || q.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE S256 es obligatorio");
  }
  const resource = q.get("resource");
  if (resource && resource !== mcpResource()) return fail("invalid_target", "resource desconocido");

  let scope: string[];
  try {
    scope = parseScope(q.get("scope"));
  } catch (e) {
    return fail("invalid_scope", e instanceof OAuthError ? e.description : "scope invalido");
  }

  let pendingId: string;
  try {
    pendingId = await oauthServer().startAuthorization({
      clientId,
      redirectUri,
      codeChallenge: challenge,
      scope,
      state,
      ip: clientIp(req),
    });
  } catch (e) {
    if (e instanceof OAuthError) return fail(e.code, e.description);
    throw e;
  }
  return NextResponse.redirect(`${publicUrl()}/oauth/consent?pending=${pendingId}`, 303);
}
