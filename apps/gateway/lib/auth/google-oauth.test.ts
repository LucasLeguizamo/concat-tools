import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { deriveKey } from "./keys";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../env";
import { mergeScopes } from "./grants";
import {
  buildAuthUrl,
  hasAllScopes,
  newPkce,
  parseGrantedScopes,
  signState,
  signTx,
  verifyState,
  verifyTx,
} from "./google-oauth";
import { s256 } from "./oauth-server";
import { safeNext } from "./http";

beforeEach(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x",
    GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "sec",
    PUBLIC_URL: "https://gw.example.com",
    VAULT_KEYS: `v1:${randomBytes(32).toString("base64")}`,
    CRON_SECRET: "c".repeat(16),
    JWT_SECRET: randomBytes(48).toString("base64url"),
  });
  resetEnvCache();
});

describe("buildAuthUrl", () => {
  const url = (over = {}) =>
    new URL(
      buildAuthUrl({
        state: "S",
        nonce: "N",
        codeChallenge: "C",
        scopes: ["openid", "email", "https://www.googleapis.com/auth/webmasters.readonly"],
        ...over,
      }),
    );

  it("PKCE S256, offline, include_granted_scopes, nonce y redirect al callback; sin prompt por defecto", () => {
    const q = url().searchParams;
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toBe("C");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("include_granted_scopes")).toBe("true");
    expect(q.get("nonce")).toBe("N");
    expect(q.get("state")).toBe("S");
    expect(q.get("redirect_uri")).toBe("https://gw.example.com/google/callback");
    expect(q.get("scope")).toBe("openid email https://www.googleapis.com/auth/webmasters.readonly");
    expect(q.has("prompt")).toBe(false);
    expect(q.has("client_secret")).toBe(false);
  });

  it("prompt=consent solo si se fuerza; login_hint opcional", () => {
    expect(url({ forceConsent: true }).searchParams.get("prompt")).toBe("consent");
    expect(url({ loginHint: "a@b.com" }).searchParams.get("login_hint")).toBe("a@b.com");
  });

  it("newPkce: challenge = S256(verifier)", () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(s256(verifier));
  });
});

describe("scopes otorgados", () => {
  it("se leen del campo scope (nunca asumidos) y se normalizan", () => {
    expect(parseGrantedScopes("openid email profile https://www.googleapis.com/auth/webmasters.readonly")).toEqual([
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "openid",
    ]);
    expect(parseGrantedScopes(undefined)).toEqual([]);
  });

  it("hasAllScopes detecta el scope desmarcado (consentimiento granular)", () => {
    const granted = parseGrantedScopes("openid https://www.googleapis.com/auth/analytics.readonly");
    expect(hasAllScopes(granted, ["https://www.googleapis.com/auth/analytics.readonly"])).toBe(true);
    expect(hasAllScopes(granted, ["https://www.googleapis.com/auth/webmasters.readonly"])).toBe(false);
  });

  it("mergeScopes: une sin refresh nuevo; reemplaza con refresh nuevo", () => {
    expect(mergeScopes(["a", "b"], ["c"], false)).toEqual(["a", "b", "c"]);
    expect(mergeScopes(["a", "b"], ["c", "a"], true)).toEqual(["a", "c"]);
    expect(mergeScopes(["email"], ["https://www.googleapis.com/auth/userinfo.email"], false)).toEqual([
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });
});

describe("state y cookie de transaccion firmados", () => {
  it("roundtrip del state; manipulado, de otra clave o de otro proposito => null", async () => {
    const s = await signState({ nonce: "n1", module: "gsc", uid: "u1" });
    expect(await verifyState(s)).toMatchObject({ nonce: "n1", module: "gsc", uid: "u1" });
    expect(await verifyState(s.slice(0, -2) + "xx")).toBeNull();
    const tx = await signTx({ nonce: "n1", verifier: "v" });
    expect(await verifyState(tx)).toBeNull(); // la cookie no vale como state
    expect(await verifyTx(s)).toBeNull(); // ni el state como cookie

    const forged = await new SignJWT({ nonce: "n1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://gw.example.com")
      .setAudience("concat-google-state")
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(randomBytes(48).toString("base64url")));
    expect(await verifyState(forged)).toBeNull();
  });

  it("el state expirado se rechaza", async () => {
    const expired = await new SignJWT({ nonce: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://gw.example.com")
      .setAudience("concat-google-state")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(deriveKey("google-state"));
    expect(await verifyState(expired)).toBeNull();
  });

  it("el verifier no aparece en el state (que viaja por la URL)", async () => {
    const s = await signState({ nonce: "n1" });
    expect(Buffer.from(s.split(".")[1]!, "base64url").toString()).not.toContain("verifier");
  });
});

describe("safeNext (anti open-redirect)", () => {
  it("solo rutas del propio origen", () => {
    expect(safeNext("/oauth/consent?pending=abc")).toBe("/oauth/consent?pending=abc");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined), String(bad)).toBe("/dashboard");
    }
    expect(safeNext("//x", "/y")).toBe("/y");
  });
});
