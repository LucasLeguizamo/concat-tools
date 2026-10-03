import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "../../lib/auth/http";
import { cookieOptions, revokeSessionToken, sessionCookieName } from "../../lib/auth/session";
import { toSafeError } from "../../lib/safe-error";

export const dynamic = "force-dynamic";

/** Revoca la sesion en DB (el `sid` deja de valer aunque alguien conserve la cookie) y borra la cookie. Solo POST. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(sessionCookieName())?.value;
  if (token) {
    try {
      await revokeSessionToken(token);
    } catch (e) {
      console.error("logout", toSafeError(e));
    }
  }
  const res = NextResponse.redirect(`${publicUrl()}/login`, 303);
  res.cookies.set(sessionCookieName(), "", cookieOptions(0));
  return res;
}
