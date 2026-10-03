import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, LOGIN_SCOPES, newPkce, signState, signTx } from "../../../lib/auth/google-oauth";
import { randomToken } from "../../../lib/auth/gateway-token";
import { htmlError, publicUrl, safeNext } from "../../../lib/auth/http";
import { cookieOptions, getSessionUser, TX_COOKIE_PATH, txCookieName } from "../../../lib/auth/session";
import { hasGrant } from "../../../lib/auth/grants";
import { getModule } from "../../../lib/modules/registry";

export const dynamic = "force-dynamic";

/**
 * Sin `module`: login (openid email profile). Con `module`: consent incremental con los
 * scopes de LECTURA de ese modulo; exige sesion y fija el usuario en el state.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const moduleId = q.get("module");
  const retry = q.get("retry") === "1";

  let scopes = LOGIN_SCOPES;
  let uid: string | undefined;
  let loginHint: string | undefined;
  // Tras desconectar el ultimo modulo el grant se borra (y se revoca en Google): Google solo devuelve un
  // refresh token nuevo con prompt=consent.
  let forceConsent = retry;

  if (moduleId) {
    const user = await getSessionUser();
    if (!user) {
      const back = `/google/start?module=${encodeURIComponent(moduleId)}`;
      return NextResponse.redirect(`${publicUrl()}/login?next=${encodeURIComponent(back)}`, 303);
    }
    const mod = getModule(moduleId);
    if (!mod) return htmlError("Modulo desconocido.", 404);
    // openid+email (ya otorgados, no piden nada nuevo) hacen que Google devuelva id_token
    // para comprobar que es la MISMA cuenta de Google del usuario.
    scopes = ["openid", "email", ...mod.scopes.read];
    uid = user.id;
    loginHint = user.email;
    if (!(await hasGrant(user.id))) forceConsent = true;
  }

  const { verifier, challenge } = newPkce();
  const nonce = randomToken(16);
  const state = await signState({
    nonce,
    module: moduleId ?? undefined,
    next: moduleId ? undefined : safeNext(q.get("next")),
    uid,
    retry: retry || undefined,
  });

  const res = NextResponse.redirect(
    buildAuthUrl({ state, nonce, codeChallenge: challenge, scopes, loginHint, forceConsent }),
    303,
  );
  res.cookies.set(txCookieName(), await signTx({ nonce, verifier }), cookieOptions(600, TX_COOKIE_PATH));
  return res;
}
