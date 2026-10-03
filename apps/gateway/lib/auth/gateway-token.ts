import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getEnv } from "../env";
import { deriveKey } from "./keys";

// ponytail: HS256 con secreto compartido basta mientras emisor y verificador son
// el mismo deploy. Upgrade path: firma asimetrica (EdDSA/RS256) + endpoint JWKS
// para que terceros (o un proxy MCP separado) verifiquen sin poder emitir.

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
const ALG = "HS256";

export type GatewayClaims = { userId: string; scope: string[] };

// Clave derivada (HKDF) propia de los access tokens: no sirve para firmar sesiones web.
const secret = () => deriveKey("access");

/** Audiencia del recurso MCP: `${PUBLIC_URL}/mcp`. */
export const audience = () => `${getEnv().PUBLIC_URL}/mcp`;

export async function signAccessToken(claims: GatewayClaims): Promise<string> {
  const { PUBLIC_URL } = getEnv();
  return new SignJWT({ scope: claims.scope.join(" ") })
    .setProtectedHeader({ alg: ALG, typ: "at+jwt" })
    .setSubject(claims.userId)
    .setIssuer(PUBLIC_URL)
    .setAudience(audience())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

/** Lanza si la firma, typ, exp, iss o aud no cuadran. scope = ids de modulo. */
export async function verifyAccessToken(token: string): Promise<GatewayClaims> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: [ALG],
    typ: "at+jwt", // RFC 9068: un JWT de otro tipo (p. ej. sesion) nunca vale como access token
    issuer: getEnv().PUBLIC_URL,
    audience: audience(),
    requiredClaims: ["sub", "exp"],
  });
  if (!payload.sub) throw new Error("token sin sub");
  const scope = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
  return { userId: payload.sub, scope };
}

/** sha256 hex. Lo unico que se guarda de codes/refresh/device tokens del gateway. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token opaco aleatorio, base64url (por defecto 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
