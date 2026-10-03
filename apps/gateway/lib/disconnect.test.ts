import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionableException } from "./modules/errors";
import { mockFetch, setTestEnv } from "./modules/test-utils";

const GSC = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4 = "https://www.googleapis.com/auth/analytics.readonly";
const CAL_E = "https://www.googleapis.com/auth/calendar.events.readonly";
const CAL_L = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const PROFILE = "https://www.googleapis.com/auth/userinfo.profile";
const CONTACTS = "https://www.googleapis.com/auth/contacts.readonly";

type Row = Record<string, unknown>;
const db = {
  others: [] as Array<{ module: string }>,
  grants: [] as Row[],
  ops: [] as Array<{ q: string; values: unknown[] }>,
};

vi.mock("./db", () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?").replace(/\s+/g, " ").trim();
    db.ops.push({ q, values });
    if (q.startsWith("SELECT module FROM module_state")) return Promise.resolve(db.others);
    if (q.startsWith("SELECT scopes FROM google_grants")) return Promise.resolve(db.grants);
    if (q.startsWith("SELECT refresh_token_ct")) return Promise.resolve(db.grants);
    return Promise.resolve([]);
  };
  return { getDb: () => Object.assign(tag, { begin: async (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag) }) };
});

const { encrypt } = await import("./vault");
const { disconnectModule, scopesToDrop } = await import("./disconnect");

const writes = () => db.ops.filter((o) => /^(UPDATE|DELETE)/.test(o.q)).map((o) => o.q.split(" WHERE")[0]);

function grantRow(scopes: string[], userId = "u1") {
  const s = encrypt("1//refresh-token-secret", userId);
  return { refresh_token_ct: s.ct, nonce: s.nonce, key_version: s.keyVersion, scopes };
}

beforeEach(() => {
  setTestEnv();
  db.others = [];
  db.grants = [];
  db.ops = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("scopesToDrop", () => {
  it("quita los del modulo que nadie mas usa, nunca los de login ni los compartidos", () => {
    expect(scopesToDrop([CAL_E, CAL_L], [])).toEqual([CAL_E, CAL_L]);
    expect(scopesToDrop([CAL_E, CAL_L], [CAL_L])).toEqual([CAL_E]);
    expect(scopesToDrop([CONTACTS, PROFILE], [])).toEqual([CONTACTS]); // userinfo.profile es de login
  });
});

describe("disconnectModule", () => {
  it("ningun otro modulo lo necesita: revoca el refresh token en Google y borra grant + estado", async () => {
    db.grants = [grantRow([GSC, PROFILE])];
    const calls = mockFetch([{ body: {} }]);
    const res = await disconnectModule("u1", "gsc");
    expect(res).toEqual({ module: "gsc", revoked_at_google: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(calls[0]!.method).toBe("POST");
    expect(new URLSearchParams(calls[0]!.body as URLSearchParams).get("token")).toBe("1//refresh-token-secret");
    expect(writes()).toEqual(["DELETE FROM google_grants", "DELETE FROM module_state"]);
  });

  it("otro modulo sigue activo: NO revoca; quita solo los scopes exclusivos y borra el estado del modulo", async () => {
    db.others = [{ module: "ga4" }];
    db.grants = [{ scopes: [GA4, GSC, PROFILE] }];
    const calls = mockFetch([]);
    const res = await disconnectModule("u1", "gsc");
    expect(res).toEqual({ module: "gsc", revoked_at_google: false });
    expect(calls).toHaveLength(0);
    const update = db.ops.find((o) => o.q.startsWith("UPDATE google_grants"))!;
    expect(update.values[0]).toEqual([GA4, PROFILE]);
    const del = db.ops.find((o) => o.q.startsWith("DELETE FROM module_state"))!;
    expect(del.values).toEqual(["u1", "gsc"]);
    expect(db.ops.some((o) => o.q.startsWith("DELETE FROM google_grants"))).toBe(false);
  });

  it("modulos que comparten scope (people y su perfil de login) no pierden el scope compartido", async () => {
    db.others = [{ module: "people" }];
    db.grants = [{ scopes: [CAL_E, CAL_L, CONTACTS, PROFILE] }];
    mockFetch([]);
    await disconnectModule("u1", "calendar");
    const update = db.ops.find((o) => o.q.startsWith("UPDATE google_grants"))!;
    expect(update.values[0]).toEqual([CONTACTS, PROFILE]);
  });

  it("si Google falla al revocar no se borra nada y se puede reintentar", async () => {
    db.grants = [grantRow([GSC])];
    mockFetch([{ status: 500, body: { error: "backend_error", error_description: "Bearer ya29.leak boom" } }]);
    const err = await disconnectModule("u1", "gsc").then(() => undefined, (e: unknown) => e);
    expect(err).toBeInstanceOf(ActionableException);
    expect((err as ActionableException).actionable).toMatchObject({ error: "upstream_error", next_action: "retry" });
    expect(JSON.stringify((err as ActionableException).actionable)).not.toContain("ya29.");
    expect(writes()).toEqual([]);
  });

  it("error de red al revocar tampoco borra; token ya revocado en Google (invalid_token) cuenta como exito", async () => {
    db.grants = [grantRow([GSC])];
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    await expect(disconnectModule("u1", "gsc")).rejects.toBeInstanceOf(ActionableException);
    expect(writes()).toEqual([]);

    db.ops = [];
    mockFetch([{ status: 400, body: { error: "invalid_token", error_description: "Token expired or revoked" } }]);
    expect((await disconnectModule("u1", "gsc")).revoked_at_google).toBe(true);
    expect(writes()).toEqual(["DELETE FROM google_grants", "DELETE FROM module_state"]);
  });

  it("sin grant solo limpia el estado; grant ilegible (aad de otro usuario) se borra sin llamar a Google", async () => {
    const calls = mockFetch([]);
    expect((await disconnectModule("u1", "gsc")).revoked_at_google).toBe(false);
    expect(writes()).toEqual(["DELETE FROM google_grants", "DELETE FROM module_state"]);
    db.ops = [];
    db.grants = [grantRow([GSC], "otro-usuario")];
    expect((await disconnectModule("u1", "gsc")).revoked_at_google).toBe(false);
    expect(calls).toHaveLength(0);
    expect(writes()).toEqual(["DELETE FROM google_grants", "DELETE FROM module_state"]);
  });

  it("es idempotente: desconectar un modulo ya desconectado no falla", async () => {
    mockFetch([]);
    await expect(disconnectModule("u1", "ga4")).resolves.toMatchObject({ module: "ga4" });
  });
});
