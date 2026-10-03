import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "../env";
import { deriveKey } from "./keys";
import { createWebSession, isWebSessionActive, revokeWebSession } from "./web-sessions";

// Sesion web del gateway: JWT HS256 en cookie httpOnly. Audiencia propia para que
// un access token del gateway (aud = /mcp) nunca valga como sesion ni al reves.

const SESSION_AUD = "concat-gateway-session";
const ALG = "HS256";
export const SESSION_TTL_S = 7 * 24 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `Secure` siempre, salvo en desarrollo contra http://localhost (Safari rechaza
 * cookies Secure sobre http). En produccion PUBLIC_URL es https.
 */
export function cookieSecure(): boolean {
  const { PUBLIC_URL } = getEnv();
  return !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(PUBLIC_URL);
}

/** `__Host-` (path=/, sin Domain) cuando es Secure: el navegador impide que otro subdominio la pise. */
export function sessionCookieName(): string {
  return cookieSecure() ? "__Host-concat_session" : "concat_session";
}

export function cookieOptions(maxAge: number, path = "/") {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path,
    maxAge,
  };
}

/** Crea la fila `web_sessions` (revocable) y firma el JWT de cookie con su `sid`. */
export async function createSessionToken(userId: string, email: string): Promise<string> {
  const sid = await createWebSession(userId, SESSION_TTL_S);
  return new SignJWT({ email, sid })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(userId)
    .setIssuer(getEnv().PUBLIC_URL)
    .setAudience(SESSION_AUD)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(deriveKey("session"));
}

/** Verifica el JWT (clave "session") y que la sesion siga vigente en DB (no revocada). */
export async function verifySessionToken(token: string): Promise<{ id: string; email: string } | null> {
  const parsed = await verifySessionJwt(token);
  if (!parsed || !(await isWebSessionActive(parsed.sid, parsed.id))) return null;
  return { id: parsed.id, email: parsed.email };
}

async function verifySessionJwt(token: string): Promise<{ id: string; email: string; sid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, deriveKey("session"), {
      algorithms: [ALG],
      issuer: getEnv().PUBLIC_URL,
      audience: SESSION_AUD,
      requiredClaims: ["sub", "exp"],
    });
    if (!payload.sub || typeof payload.email !== "string") return null;
    if (typeof payload.sid !== "string" || !UUID.test(payload.sid)) return null;
    return { id: payload.sub, email: payload.email, sid: payload.sid };
  } catch {
    return null;
  }
}

/** Usuario de la sesion web actual, o null. B lo usa en app/dashboard. */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token ? verifySessionToken(token) : null;
}

export async function setSession(userId: string, email: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), await createSessionToken(userId, email), cookieOptions(SESSION_TTL_S));
}

/** Revoca en DB la sesion de este token (si el JWT es valido). Idempotente. */
export async function revokeSessionToken(token: string): Promise<void> {
  const parsed = await verifySessionJwt(token);
  if (parsed) await revokeWebSession(parsed.sid);
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(sessionCookieName(), "", cookieOptions(0));
}

// ---------- confirmacion del device flow ----------
// Tras teclear un user_code valido, /device guarda una cookie firmada (5 min, ligada al usuario y al codigo).
// Un enlace de terceros no puede plantarla: solo existe si ESTE navegador tecleo el codigo.

const DEVICE_CONFIRM_AUD = "concat-device-confirm";
export const DEVICE_CONFIRM_TTL_S = 300;
export const deviceConfirmCookieName = () => (cookieSecure() ? "__Host-concat_device" : "concat_device");

export async function signDeviceConfirm(userId: string, userCode: string): Promise<string> {
  return new SignJWT({ uc: userCode })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuer(getEnv().PUBLIC_URL)
    .setAudience(DEVICE_CONFIRM_AUD)
    .setIssuedAt()
    .setExpirationTime(`${DEVICE_CONFIRM_TTL_S}s`)
    .sign(deriveKey("device-confirm"));
}

/** user_code confirmado por este usuario, o null (firma, exp o usuario distinto). */
export async function verifyDeviceConfirm(token: string, userId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, deriveKey("device-confirm"), {
      algorithms: [ALG],
      issuer: getEnv().PUBLIC_URL,
      audience: DEVICE_CONFIRM_AUD,
      subject: userId,
      requiredClaims: ["sub", "exp"],
    });
    return typeof payload.uc === "string" ? payload.uc : null;
  } catch {
    return null;
  }
}

/** Cookie de la transaccion con Google (code_verifier + nonce). Solo la lee /google/callback. */
export function txCookieName(): string {
  return cookieSecure() ? "__Secure-concat_gtx" : "concat_gtx";
}
export const TX_COOKIE_PATH = "/google/callback";
