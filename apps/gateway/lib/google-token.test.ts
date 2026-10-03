import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionableException } from "./modules/errors";
import { mockFetch, setTestEnv } from "./modules/test-utils";

const GSC = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4 = "https://www.googleapis.com/auth/analytics.readonly";

const db = { rows: [] as Array<Record<string, unknown>>, queries: 0 };
vi.mock("./db", () => ({
  getDb: () => (strings: TemplateStringsArray) => {
    db.queries++;
    return Promise.resolve(strings.join("?").includes("FROM google_grants") ? db.rows : []);
  },
}));

const { encrypt } = await import("./vault");
const { getAccessToken, clearTokenCache } = await import("./google-token");

function grant(opts: { scopes: string[]; userId?: string; aad?: string; updatedAt?: Date; token?: string }) {
  const sealed = encrypt(opts.token ?? "1//refresh-token-secret", opts.aad ?? opts.userId ?? "u1");
  db.rows = [
    {
      refresh_token_ct: sealed.ct,
      nonce: sealed.nonce,
      key_version: sealed.keyVersion,
      scopes: opts.scopes,
      updated_at: opts.updatedAt ?? new Date("2026-10-01T00:00:00Z"),
    },
  ];
}

const caught = async (p: Promise<unknown>) => (await p.then(() => undefined, (e: unknown) => e)) as ActionableException;

beforeEach(() => {
  setTestEnv();
  clearTokenCache();
  db.rows = [];
  db.queries = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("getAccessToken", () => {
  it("descifra con aad=userId, refresca contra Google y cachea hasta expirar", async () => {
    grant({ scopes: [GSC] });
    const calls = mockFetch([{ body: { access_token: "ya29.one", expires_in: 3600, scope: GSC } }]);
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.one");
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.one"); // cache: sin 2da llamada a Google
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(calls[0]!.body as URLSearchParams);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("1//refresh-token-secret");
  });

  it("re-refresca cuando el token esta por expirar", async () => {
    grant({ scopes: [GSC] });
    mockFetch([
      { body: { access_token: "ya29.a", expires_in: 30, scope: GSC } }, // < skew de 60s
      { body: { access_token: "ya29.b", expires_in: 3600, scope: GSC } },
    ]);
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.a");
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.b");
  });

  it("un re-consent (updated_at nuevo) invalida el cache", async () => {
    grant({ scopes: [GSC] });
    mockFetch([
      { body: { access_token: "ya29.a", expires_in: 3600, scope: GSC } },
      { body: { access_token: "ya29.b", expires_in: 3600, scope: `${GSC} ${GA4}` } },
    ]);
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.a");
    grant({ scopes: [GSC, GA4], updatedAt: new Date("2026-10-02T00:00:00Z") });
    expect(await getAccessToken("u1", [GA4])).toBe("ya29.b");
  });

  it("scope faltante en el grant -> scope_lost con url de reconexion del modulo, sin llamar a Google", async () => {
    grant({ scopes: [GSC] });
    const calls = mockFetch([]);
    const e = await caught(getAccessToken("u1", [GA4]));
    expect(e).toBeInstanceOf(ActionableException);
    expect(e.actionable).toMatchObject({
      error: "scope_lost",
      module: "ga4",
      next_action: "reconnect_module",
      url: "https://gw.example.com/google/start?module=ga4",
    });
    expect(calls).toHaveLength(0);
  });

  it("scope revocado en Google (la respuesta de refresh ya no lo trae) -> scope_lost", async () => {
    grant({ scopes: [GSC, GA4] });
    mockFetch([{ body: { access_token: "ya29.x", expires_in: 3600, scope: GSC } }]);
    const e = await caught(getAccessToken("u1", [GA4]));
    expect(e.actionable).toMatchObject({ error: "scope_lost", module: "ga4", next_action: "reconnect_module" });
    // y el scope vigente sigue funcionando desde cache
    expect(await getAccessToken("u1", [GSC])).toBe("ya29.x");
  });

  it("invalid_grant -> relogin (session_expired)", async () => {
    grant({ scopes: [GSC] });
    mockFetch([{ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }]);
    const e = await caught(getAccessToken("u1", [GSC]));
    expect(e.actionable).toMatchObject({ error: "session_expired", next_action: "relogin" });
  });

  it("sin grant -> relogin (not_connected)", async () => {
    const e = await caught(getAccessToken("u1", [GSC]));
    expect(e.actionable).toMatchObject({ error: "not_connected", next_action: "relogin" });
  });

  it("ciphertext ligado a otro usuario (aad distinto) no se descifra", async () => {
    grant({ scopes: [GSC], aad: "otro-usuario" });
    mockFetch([]);
    const e = await caught(getAccessToken("u1", [GSC]));
    expect(e.actionable).toMatchObject({ error: "grant_unreadable", next_action: "relogin" });
  });

  it("errores de Google nunca filtran tokens ni secretos", async () => {
    grant({ scopes: [GSC], token: "1//SUPERSECRETREFRESH" });
    mockFetch([
      { status: 500, body: { error: "server_error", error_description: "falla refresh_token=1//SUPERSECRETREFRESH client_secret=client-secret" } },
    ]);
    const e = await caught(getAccessToken("u1", [GSC]));
    const blob = JSON.stringify(e.actionable) + e.message;
    expect(blob).not.toContain("SUPERSECRETREFRESH");
    expect(blob).not.toContain("client-secret");
    expect(e.actionable.next_action).toBe("retry");
  });
});
