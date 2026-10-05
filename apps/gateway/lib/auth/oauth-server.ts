import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import { API_TOKEN_CLIENT_ID } from "./api-tokens";
import { CLI_CLIENT_ID } from "./clients";
import { ACCESS_TOKEN_TTL_SECONDS, hashToken, randomToken, signAccessToken } from "./gateway-token";
import { OAuthError } from "./http";
import { createPgStore, type OAuthStore } from "./oauth-store";

// Gateway como Authorization Server OAuth 2.1 (capa A). Toda la logica de
// protocolo vive aqui, sobre un `OAuthStore` inyectable (Postgres en prod, memoria en tests).

export const PENDING_TTL_S = 600;
export const CODE_TTL_S = 60;
export const REFRESH_TTL_S = 30 * 24 * 3600;
/** Vida absoluta de una familia de refresh (un login); no se reinicia al rotar. */
export const FAMILY_TTL_S = 90 * 24 * 3600;
/** Tras rotar, reusar el refresh viejo durante este margen no es robo (reintentos de red, requests en paralelo). */
export const REFRESH_GRACE_S = 30;
export const DEVICE_TTL_S = 600;
/** Topes de solicitudes pendientes (anti-llenado de tablas). */
export const MAX_PENDING_PER_IP = 20;
export const MAX_PENDING_PER_CLIENT = 200;
export const MAX_DEVICE_PENDING_PER_IP = 10;
export const MAX_DEVICE_PENDING_PER_CLIENT = 500;
export const DEVICE_INTERVAL_S = 5;

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type DeviceAuthorization = {
  device_code: string;
  user_code: string;
  /**
   * Sin `verification_uri_complete` (opcional en RFC 8628 §3.2): un enlace con el codigo incrustado
   * es el vector del phishing de device code; el usuario debe teclear el codigo en /device.
   */
  verification_uri: string;
  expires_in: number;
  interval: number;
};

/** Comparacion en tiempo constante (longitudes distintas = false sin filtrar el contenido). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ---------- PKCE (RFC 7636, solo S256) ----------

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const isValidChallenge = (c: string) => /^[A-Za-z0-9_-]{43}$/.test(c);
const isValidVerifier = (v: string) => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);

export function verifyPkce(verifier: string, challenge: string): boolean {
  return isValidVerifier(verifier) && safeEqual(s256(verifier), challenge);
}

// ---------- scope = ids de modulo separados por espacio, o `*` ----------

export function parseScope(raw: string | null | undefined): string[] {
  const tokens = (raw ?? "").split(" ").filter(Boolean);
  if (tokens.length === 0) return ["*"];
  for (const t of tokens) {
    if (t !== "*" && !/^[a-z][a-z0-9_]{0,31}$/.test(t)) {
      throw new OAuthError("invalid_scope", "scope invalido: usa ids de modulo separados por espacio, o *");
    }
  }
  if (tokens.includes("*")) return ["*"];
  return [...new Set(tokens)].sort();
}

/** `requested` cabe dentro de `granted` (`*` otorga cualquiera). */
export function isScopeSubset(requested: string[], granted: string[]): boolean {
  return granted.includes("*") || requested.every((s) => s !== "*" && granted.includes(s));
}

// ---------- user_code (RFC 8628 §6.1): sin vocales ni caracteres ambiguos ----------

const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

export function generateUserCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]!;
  const part = () => Array.from({ length: 4 }, pick).join("");
  return `${part()}-${part()}`;
}

/** Acepta "abcd efgh", "ABCD-EFGH", etc. Devuelve el formato canonico o null. */
export function normalizeUserCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.length !== 8 || [...clean].some((c) => !USER_CODE_ALPHABET.includes(c))) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

// ---------- servidor ----------

export function createOAuthServer(store: OAuthStore, clock: () => number = Date.now) {
  const nowDate = () => new Date(clock());
  const after = (seconds: number) => new Date(clock() + seconds * 1000);

  const busy = (what: string) =>
    new OAuthError("temporarily_unavailable", `Demasiadas solicitudes ${what} pendientes; reintenta en unos minutos`, 429, 60);

  /** Sin `family`: login nuevo = familia nueva con vida absoluta de 90 d. Con `family`: rotacion dentro de la familia. */
  async function issueTokens(
    userId: string,
    clientId: string,
    scope: string[],
    family?: { id: string; expiresAt: Date },
  ): Promise<TokenResponse> {
    const refresh = randomToken();
    const fam = family ?? { id: randomUUID(), expiresAt: after(FAMILY_TTL_S) };
    await store.insertRefresh(hashToken(refresh), {
      userId,
      clientId,
      scope: scope.join(" "),
      // Nunca vive mas que la familia.
      expiresAt: new Date(Math.min(after(REFRESH_TTL_S).getTime(), fam.expiresAt.getTime())),
      familyId: fam.id,
      familyExpiresAt: fam.expiresAt,
    });
    return {
      access_token: await signAccessToken({ userId, scope }),
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh,
      scope: scope.join(" "),
    };
  }

  return {
    // --- authorization code ---

    /** Guarda los parametros YA validados de /oauth/authorize mientras el usuario inicia sesion y aprueba. */
    async startAuthorization(p: {
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      scope: string[];
      state: string | null;
      ip: string;
    }): Promise<string> {
      const now = nowDate();
      if (
        (await store.countPending({ ip: p.ip }, now)) >= MAX_PENDING_PER_IP ||
        (await store.countPending({ clientId: p.clientId }, now)) >= MAX_PENDING_PER_CLIENT
      ) {
        throw busy("de autorizacion");
      }
      return store.insertPending({
        ip: p.ip,
        clientId: p.clientId,
        redirectUri: p.redirectUri,
        codeChallenge: p.codeChallenge,
        scope: p.scope.join(" "),
        state: p.state,
        expiresAt: after(PENDING_TTL_S),
      });
    },

    getPending: (id: string) => store.getPending(id, nowDate()),

    /** Consume el pending (una sola vez) y emite el code. null si expiro o ya se uso. */
    async approveAuthorization(pendingId: string, userId: string) {
      const p = await store.takePending(pendingId, nowDate());
      if (!p) return null;
      const code = randomToken();
      await store.insertCode(hashToken(code), {
        clientId: p.clientId,
        userId,
        redirectUri: p.redirectUri,
        codeChallenge: p.codeChallenge,
        scope: p.scope,
        expiresAt: after(CODE_TTL_S),
      });
      return { code, redirectUri: p.redirectUri, state: p.state };
    },

    async denyAuthorization(pendingId: string) {
      const p = await store.takePending(pendingId, nowDate());
      return p ? { redirectUri: p.redirectUri, state: p.state } : null;
    },

    async exchangeCode(p: {
      code: string;
      clientId: string;
      redirectUri: string;
      codeVerifier: string;
    }): Promise<TokenResponse> {
      // takeCode borra: el code es de un solo uso aunque la validacion posterior falle.
      const rec = await store.takeCode(hashToken(p.code));
      const invalid = () => new OAuthError("invalid_grant", "code invalido, expirado o ya usado");
      if (!rec || rec.expiresAt.getTime() <= clock()) throw invalid();
      if (rec.clientId !== p.clientId || rec.redirectUri !== p.redirectUri) throw invalid();
      if (!verifyPkce(p.codeVerifier, rec.codeChallenge)) throw invalid();
      return issueTokens(rec.userId, rec.clientId, parseScope(rec.scope));
    },

    // --- refresh con rotacion ---

    async exchangeRefresh(p: { refreshToken: string; clientId: string; scope?: string | null }): Promise<TokenResponse> {
      const invalid = () => new OAuthError("invalid_grant", "refresh_token invalido, expirado o revocado");
      const hash = hashToken(p.refreshToken);
      let rec = await store.findRefresh(hash);
      // Los tokens de API (n8n/CI) no se rotan ni se canjean por access tokens: solo valen como Bearer.
      if (!rec || rec.clientId !== p.clientId || rec.clientId === API_TOKEN_CLIENT_ID) throw invalid();
      // La vida absoluta de la familia manda aunque el token en si siga vigente.
      if (rec.familyExpiresAt.getTime() <= clock()) throw invalid();

      if (!rec.revokedAt) {
        if (rec.expiresAt.getTime() <= clock()) throw invalid();
        // Rotar es atomico: si dos requests lo usan a la vez, solo una gana; la otra cae en la gracia de abajo.
        const consumed = await store.consumeRefresh(hash, nowDate());
        if (!consumed) {
          rec = await store.findRefresh(hash);
          if (!rec) throw invalid();
        }
      }

      if (rec.revokedAt) {
        const inGrace =
          rec.rotatedAt !== null && clock() - rec.rotatedAt.getTime() <= REFRESH_GRACE_S * 1000;
        if (!inGrace) {
          // Reuso fuera de gracia (o token revocado a proposito): probable robo. Se revoca SOLO esta familia.
          await store.revokeFamily(rec.familyId, nowDate());
          throw invalid();
        }
        // Dentro de gracia: se entrega un par nuevo en la misma familia, sin revocar nada.
      }

      const granted = parseScope(rec.scope);
      const scope = p.scope ? parseScope(p.scope) : granted;
      if (!isScopeSubset(scope, granted)) {
        throw new OAuthError("invalid_scope", "scope excede el otorgado originalmente");
      }
      return issueTokens(rec.userId, rec.clientId, scope, { id: rec.familyId, expiresAt: rec.familyExpiresAt });
    },

    /** RFC 7009: siempre exito para el llamante, exista o no el token. */
    async revoke(token: string): Promise<void> {
      const rec = await store.findRefresh(hashToken(token));
      if (rec) await store.revokeFamily(rec.familyId, nowDate());
    },

    // --- device flow (RFC 8628) ---

    async startDevice(p: {
      clientId: string;
      scope: string[];
      /** IP y pais de quien inicia el flujo: se muestran en la pantalla de aprobacion. */
      ip: string;
      country: string | null;
    }): Promise<DeviceAuthorization> {
      const { PUBLIC_URL } = getEnv();
      // El device flow es solo para la CLI propia: con un client_id CIMD cualquiera, un tercero
      // podria presentar a la victima una pantalla de aprobacion con SU nombre/marca.
      if (p.clientId !== CLI_CLIENT_ID) {
        throw new OAuthError("unauthorized_client", "Este cliente no puede usar el device flow");
      }
      const now = nowDate();
      if (
        (await store.countPendingDevices({ ip: p.ip }, now)) >= MAX_DEVICE_PENDING_PER_IP ||
        (await store.countPendingDevices({ clientId: p.clientId }, now)) >= MAX_DEVICE_PENDING_PER_CLIENT
      ) {
        throw busy("de dispositivo");
      }
      const deviceCode = randomToken();
      const hash = hashToken(deviceCode);
      for (let i = 0; i < 5; i++) {
        const userCode = generateUserCode();
        const ok = await store.insertDevice(hash, {
          userCode,
          clientId: p.clientId,
          scope: p.scope.join(" "),
          expiresAt: after(DEVICE_TTL_S),
          initIp: p.ip,
          initCountry: p.country,
        });
        if (ok) {
          return {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${PUBLIC_URL}/device`,
            expires_in: DEVICE_TTL_S,
            interval: DEVICE_INTERVAL_S,
          };
        }
      }
      throw new OAuthError("server_error", "No se pudo generar un user_code", 500);
    },

    /** Datos para la pantalla de confirmacion de /device (no modifica nada). */
    async lookupDevice(userCodeInput: string) {
      const userCode = normalizeUserCode(userCodeInput);
      if (!userCode) return null;
      const rec = await store.getDeviceByUserCode(userCode, nowDate());
      return rec && !rec.userId
        ? {
            userCode,
            clientId: rec.clientId,
            scope: rec.scope,
            createdAt: rec.createdAt,
            initIp: rec.initIp,
            initCountry: rec.initCountry,
          }
        : null;
    },

    async approveDevice(userCodeInput: string, userId: string): Promise<boolean> {
      const userCode = normalizeUserCode(userCodeInput);
      return userCode ? store.approveDevice(userCode, userId, nowDate()) : false;
    },

    async denyDevice(userCodeInput: string): Promise<boolean> {
      const userCode = normalizeUserCode(userCodeInput);
      return userCode ? store.denyDevice(userCode, nowDate()) : false;
    },

    async pollDevice(p: { deviceCode: string; clientId: string }): Promise<TokenResponse> {
      const hash = hashToken(p.deviceCode);
      const rec = await store.getDevice(hash);
      if (!rec || rec.clientId !== p.clientId) {
        throw new OAuthError("invalid_grant", "device_code invalido");
      }
      if (rec.expiresAt.getTime() <= clock()) {
        await store.deleteDevice(hash);
        throw new OAuthError("expired_token", "El device_code expiro");
      }
      if (rec.lastPolledAt && clock() - rec.lastPolledAt.getTime() < DEVICE_INTERVAL_S * 1000) {
        await store.touchDevice(hash, nowDate());
        throw new OAuthError("slow_down", "Consulta con menos frecuencia (suma 5 s al intervalo)");
      }
      if (rec.deniedAt) {
        await store.deleteDevice(hash);
        throw new OAuthError("access_denied", "El usuario denego la autorizacion");
      }
      await store.touchDevice(hash, nowDate());
      if (!rec.userId) throw new OAuthError("authorization_pending", "Esperando que el usuario apruebe");

      // takeApprovedDevice borra: si dos polls llegan a la vez, solo uno emite tokens.
      const taken = await store.takeApprovedDevice(hash);
      if (!taken?.userId) throw new OAuthError("invalid_grant", "device_code ya usado");
      return issueTokens(taken.userId, taken.clientId, parseScope(taken.scope));
    },
  };
}

export type OAuthServer = ReturnType<typeof createOAuthServer>;

let cached: OAuthServer | undefined;
export function oauthServer(): OAuthServer {
  return (cached ??= createOAuthServer(createPgStore()));
}
