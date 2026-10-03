import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionableException, GoogleApiError } from "./modules/errors";
import { setTestEnv } from "./modules/test-utils";
import type { ModuleStatus } from "./modules/types";

const store = {
  previous: undefined as ModuleStatus | undefined,
  upserts: [] as Array<{ status: unknown; lastError: unknown; count: unknown }>,
};
vi.mock("./db", () => ({
  getDb: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("INSERT INTO module_state")) {
      store.upserts.push({ status: values[2], lastError: values[3], count: values[4] });
      return Promise.resolve([]);
    }
    if (q.includes("SELECT status FROM module_state")) return Promise.resolve(store.previous ? [{ status: store.previous }] : []);
    if (q.includes("SELECT email")) return Promise.resolve([{ email: "lucas@x.com" }]);
    return Promise.resolve([]);
  },
}));

const token = { fn: async (): Promise<string> => "ya29.fake" };
vi.mock("./google-token", () => ({ getAccessToken: () => token.fn() }));

const { runProbe, statusFromError, connectUrl } = await import("./connection");
const { modules } = await import("./modules/registry");
const gsc = modules.find((m) => m.id === "gsc")!;

const realProbe = gsc.probe;
beforeEach(() => {
  setTestEnv();
  store.previous = undefined;
  store.upserts = [];
  token.fn = async () => "ya29.fake";
});
afterEach(() => {
  gsc.probe = realProbe;
  vi.unstubAllGlobals();
});

describe("connectUrl", () => {
  it("apunta a /google/start del gateway", () => {
    expect(connectUrl("gsc")).toBe("https://gw.example.com/google/start?module=gsc");
  });
});

describe("statusFromError", () => {
  it("mapea codigos accionables a estados de la spec §6", () => {
    expect(statusFromError("scope_lost", "connected")).toBe("scope_lost");
    expect(statusFromError("scope_lost", undefined)).toBe("not_connected"); // nunca conectado
    expect(statusFromError("session_expired", "connected")).toBe("expired");
    expect(statusFromError("missing_resource_permission", "authorized")).toBe("no_resources");
    expect(statusFromError("quota_exceeded", "connected")).toBe("connected"); // transitorio: no degrada
    expect(statusFromError("upstream_error", undefined)).toBe("authorized");
  });
});

describe("runProbe", () => {
  it("probe >= 1 -> connected con resource_count", async () => {
    gsc.probe = async () => ({ count: 3, sample: ["a"] });
    expect(await runProbe("u1", "gsc")).toBe("connected");
    expect(store.upserts[0]).toEqual({ status: "connected", lastError: null, count: 3 });
  });

  it("probe = 0 -> no_resources con la instruccion exacta (incluye correo y nota sc-domain)", async () => {
    gsc.probe = async () => ({ count: 0 });
    expect(await runProbe("u1", "gsc")).toBe("no_resources");
    const u = store.upserts[0]!;
    expect(u.count).toBe(0);
    expect(u.lastError).toContain("Tu correo lucas@x.com no es usuario de ninguna propiedad.");
    expect(u.lastError).toContain("`sc-domain:dominio` y `https://dominio/` son propiedades distintas");
  });

  it("scope_lost de getAccessToken sobre modulo previamente conectado -> scope_lost", async () => {
    store.previous = "connected";
    gsc.probe = async () => {
      throw new ActionableException({ error: "scope_lost", module: "gsc", message: "falta permiso", fix: "reconecta", next_action: "reconnect_module" });
    };
    expect(await runProbe("u1", "gsc")).toBe("scope_lost");
    expect(store.upserts[0]!.lastError).toBe("falta permiso reconecta");
  });

  it("session_expired -> expired", async () => {
    gsc.probe = async () => {
      throw new ActionableException({ error: "session_expired", module: "gateway", message: "expiro", fix: "login", next_action: "relogin" });
    };
    expect(await runProbe("u1", "gsc")).toBe("expired");
  });

  it("403 de recurso en el probe -> no_resources; 5xx conserva estado previo", async () => {
    gsc.probe = async () => {
      throw new GoogleApiError({ status: 403, code: "PERMISSION_DENIED", message: "denied" });
    };
    expect(await runProbe("u1", "gsc")).toBe("no_resources");

    store.previous = "connected";
    gsc.probe = async () => {
      throw new GoogleApiError({ status: 503, message: "unavailable" });
    };
    expect(await runProbe("u1", "gsc")).toBe("connected");
    expect(store.upserts[1]!.lastError).toContain("unavailable");
  });

  it("last_error nunca contiene tokens (redactado)", async () => {
    gsc.probe = async () => {
      throw new ActionableException({ error: "upstream_error", module: "gsc", message: "fallo con ya29.SECRETTOKEN123 y 1//0gREFRESHSECRET", fix: "reintenta", next_action: "retry" });
    };
    await runProbe("u1", "gsc");
    const le = String(store.upserts[0]!.lastError);
    expect(le).not.toContain("SECRETTOKEN123");
    expect(le).not.toContain("REFRESHSECRET");
  });
});
