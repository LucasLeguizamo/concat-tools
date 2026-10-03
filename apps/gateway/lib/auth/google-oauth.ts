import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { getEnv } from "../env";
import { toSafeError } from "../safe-error";
import { randomToken } from "./gateway-token";
import { deriveKey, type KeyPurpose } from "./keys";

// Capa B, parte de protocolo: gateway <-> Google. Los tokens de Google viven
// solo en variables locales de estas funciones; los errores pasan por toSafeError().

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const TIMEOUT_MS = 10_000;

export const LOGIN_SCOPES = ["openid", "email", "profile"];

const SCOPE_ALIASES: Record<string, string> = {
  email: "https://www.googleapis.com/auth/userinfo.email",
  profile: "https://www.googleapis.com/auth/userinfo.profile",
};

/** Google devuelve `email`/`profile` como URL larga o corta segun el caso: se guardan en forma canonica. */
export const normalizeScope = (s: string) => SCOPE_ALIASES[s] ?? s;

/** Scopes OTORGADOS, leidos del campo `scope` de la respuesta de token (nunca asumidos). */
export function parseGrantedScopes(scopeField: string | undefined): string[] {
  return [...new Set((scopeField ?? "").split(" ").filter(Boolean).map(normalizeScope))].sort();
}

export function hasAllScopes(granted: string[], required: string[]): boolean {
  const set = new Set(granted.map(normalizeScope));
  return required.every((s) => set.has(normalizeScope(s)));
}

export const redirectUri = () => `${getEnv().PUBLIC_URL}/google/callback`;

// ---------- PKCE + state firmado ----------

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

const TX_TTL_S = 600;
async function signPurpose(purpose: KeyPurpose, aud: string, payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(getEnv().PUBLIC_URL)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${TX_TTL_S}s`)
    .sign(deriveKey(purpose));
}

async function verifyPurpose(purpose: KeyPurpose, aud: string, token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, deriveKey(purpose), {
      algorithms: ["HS256"],
      issuer: getEnv().PUBLIC_URL,
      audience: aud,
    });
    return payload;
  } catch {
    return null;
  }
}

export type GoogleState = {
  nonce: string;
  /** Presente = consent incremental de un modulo (requiere sesion). Ausente = login. */
  module?: string;
  /** Solo login: ruta relativa a la que volver. */
  next?: string;
  /** Solo connect: usuario que inicio el flujo; el callback exige que siga siendo el de la sesion. */
  uid?: string;
  /** Segundo intento con prompt=consent porque Google no devolvio refresh_token. */
  retry?: boolean;
};

export const signState = (s: GoogleState) => signPurpose("google-state", "concat-google-state", { ...s });

export async function verifyState(token: string): Promise<GoogleState | null> {
  const p = await verifyPurpose("google-state", "concat-google-state", token);
  if (!p || typeof p.nonce !== "string") return null;
  return {
    nonce: p.nonce,
    module: typeof p.module === "string" ? p.module : undefined,
    next: typeof p.next === "string" ? p.next : undefined,
    uid: typeof p.uid === "string" ? p.uid : undefined,
    retry: p.retry === true ? true : undefined,
  };
}

/** Contenido de la cookie de transaccion: el code_verifier NUNCA viaja por la URL. */
export const signTx = (tx: { nonce: string; verifier: string }) => signPurpose("google-tx", "concat-google-tx", { ...tx });

export async function verifyTx(token: string): Promise<{ nonce: string; verifier: string } | null> {
  const p = await verifyPurpose("google-tx", "concat-google-tx", token);
  return p && typeof p.nonce === "string" && typeof p.verifier === "string"
    ? { nonce: p.nonce, verifier: p.verifier }
    : null;
}

// ---------- Google ----------

export function buildAuthUrl(p: {
  state: string;
  nonce: string;
  codeChallenge: string;
  scopes: string[];
  loginHint?: string;
  forceConsent?: boolean;
}): string {
  const q = new URLSearchParams({
    client_id: getEnv().GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: p.scopes.join(" "),
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
  });
  if (p.forceConsent) q.set("prompt", "consent");
  if (p.loginHint) q.set("login_hint", p.loginHint);
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

function fail(err: unknown): never {
  const s = toSafeError(err);
  throw new GoogleOAuthError(s.message, s.status, s.code);
}

async function postForm(url: string, body: Record<string, string>): Promise<{ status: number; data: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch (e) {
    return fail(e);
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* cuerpo no JSON: toSafeError lo trata como texto y lo redacta */
  }
  return { status: res.status, data };
}

export type GoogleTokens = {
  /** Ausente en consent incremental o relogin sin prompt=consent. */
  refreshToken?: string;
  scopes: string[];
  idToken: string;
};

/** Canjea el code (con PKCE). El access token se descarta: solo hace falta el refresh token. */
export async function exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokens> {
  const env = getEnv();
  const { status, data } = await postForm(TOKEN_ENDPOINT, {
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  if (status !== 200) return fail({ response: { status, data } });
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof d.id_token !== "string") return fail("Google no devolvio id_token");
  return {
    refreshToken: typeof d.refresh_token === "string" && d.refresh_token ? d.refresh_token : undefined,
    scopes: parseGrantedScopes(typeof d.scope === "string" ? d.scope : undefined),
    idToken: d.id_token,
  };
}

const jwks = createRemoteJWKSet(JWKS_URL, { timeoutDuration: TIMEOUT_MS });

/** Verifica firma (JWKS de Google), iss, aud, exp y nonce. Exige email verificado. */
export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<{ sub: string; email: string }> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: getEnv().GOOGLE_CLIENT_ID,
    });
    if (payload.nonce !== expectedNonce) throw new Error("nonce no coincide");
    if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) {
      throw new Error("id_token sin email verificado");
    }
    return { sub: payload.sub, email: payload.email };
  } catch (e) {
    return fail(e);
  }
}

/** Revoca un token (refresh o access) en Google. Ya revocado/invalido (400) cuenta como exito. */
export async function revokeGoogleToken(token: string): Promise<void> {
  const { status, data } = await postForm(REVOKE_ENDPOINT, { token });
  if (status === 200) return;
  const code = (data as { error?: unknown } | null)?.error;
  if (status === 400 && code === "invalid_token") return;
  return fail({ response: { status, data } });
}
