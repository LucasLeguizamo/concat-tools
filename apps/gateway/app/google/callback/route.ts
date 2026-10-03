import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "../../../lib/auth/oauth-server";
import {
  exchangeCode,
  hasAllScopes,
  verifyIdToken,
  verifyState,
  verifyTx,
  type GoogleState,
} from "../../../lib/auth/google-oauth";
import { getUser, hasGrant, markModuleAuthorized, saveGrant, upsertUser } from "../../../lib/auth/grants";
import { publicUrl, safeNext } from "../../../lib/auth/http";
import {
  cookieOptions,
  createSessionToken,
  getSessionUser,
  SESSION_TTL_S,
  sessionCookieName,
  TX_COOKIE_PATH,
  txCookieName,
} from "../../../lib/auth/session";
import { runProbe } from "../../../lib/connection";
import { getModule } from "../../../lib/modules/registry";
import { toSafeError } from "../../../lib/safe-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  // La cookie de transaccion es de un solo uso: se borra en TODA salida.
  const redirect = (path: string) => {
    const res = NextResponse.redirect(`${publicUrl()}${path}`, 303);
    res.cookies.set(txCookieName(), "", cookieOptions(0, TX_COOKIE_PATH));
    return res;
  };

  const stateRaw = q.get("state");
  const txRaw = req.cookies.get(txCookieName())?.value;
  const state = stateRaw ? await verifyState(stateRaw) : null;
  const tx = txRaw ? await verifyTx(txRaw) : null;
  // Anti-CSRF: el state firmado debe corresponder a la transaccion iniciada en ESTE navegador.
  if (!state || !tx || !safeEqual(state.nonce, tx.nonce)) return redirect("/login?error=state");

  const fail = (code: string) =>
    redirect(state.module ? `/connect/${encodeURIComponent(state.module)}?error=${code}` : `/login?error=${code}`);

  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "denied" : "google");
  const code = q.get("code");
  if (!code) return fail("google");

  try {
    const tokens = await exchangeCode(code, tx.verifier);
    const identity = await verifyIdToken(tokens.idToken, tx.nonce);
    return state.module
      ? await handleConnect(state, state.module, tokens, identity, redirect, fail)
      : await handleLogin(state, tokens, identity, redirect, fail);
  } catch (e) {
    // toSafeError: nunca tokens ni cuerpos de Google en logs ni en la respuesta.
    console.error("google/callback", toSafeError(e));
    return fail("google");
  }
}

type Tokens = Awaited<ReturnType<typeof exchangeCode>>;
type Identity = Awaited<ReturnType<typeof verifyIdToken>>;
type Redirect = (path: string) => NextResponse;

async function handleLogin(
  state: GoogleState,
  tokens: Tokens,
  identity: Identity,
  redirect: Redirect,
  fail: (code: string) => NextResponse,
) {
  const user = await upsertUser(identity.sub, identity.email);
  const next = safeNext(state.next);

  if (!tokens.refreshToken && !(await hasGrant(user.id))) {
    // Google solo entrega refresh_token en el primer consent: se fuerza prompt=consent UNA vez.
    if (state.retry) return fail("no_refresh");
    return redirect(`/google/start?retry=1&next=${encodeURIComponent(next)}`);
  }
  await saveGrant(user.id, { refreshToken: tokens.refreshToken, scopes: tokens.scopes });

  const res = redirect(next);
  res.cookies.set(sessionCookieName(), await createSessionToken(user.id, user.email), cookieOptions(SESSION_TTL_S));
  return res;
}

async function handleConnect(
  state: GoogleState,
  moduleId: string,
  tokens: Tokens,
  identity: Identity,
  redirect: Redirect,
  fail: (code: string) => NextResponse,
) {
  const session = await getSessionUser();
  const mod = getModule(moduleId);
  if (!session || session.id !== state.uid || !mod) return fail("session");

  // Una cuenta de Google por usuario: el consent incremental no puede traer otra cuenta.
  const user = await getUser(session.id);
  if (!user || user.google_sub !== identity.sub) return fail("account_mismatch");

  const scopes = await saveGrant(user.id, { refreshToken: tokens.refreshToken, scopes: tokens.scopes });

  // Consentimiento granular: el usuario pudo desmarcar el scope del modulo.
  if (!hasAllScopes(scopes, mod.scopes.read)) return fail("scopes_missing");

  await markModuleAuthorized(user.id, mod.id);
  try {
    await runProbe(user.id, mod.id);
  } catch (e) {
    // El estado real lo muestra el dashboard; el fallo del probe no tumba la conexion.
    console.error("runProbe", toSafeError(e));
  }
  return redirect(`/dashboard?module=${encodeURIComponent(mod.id)}`);
}
