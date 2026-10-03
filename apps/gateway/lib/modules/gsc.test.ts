import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gscModule } from "./gsc";
import { ActionableException, fillEmail, googleFetch, GoogleApiError, NoResourcesError } from "./errors";
import { mockFetch, setTestEnv, TEST_ACCESS_TOKEN, testCtx } from "./test-utils";
import type { ToolDef } from "./types";

const tool = (name: string): ToolDef => {
  const t = gscModule.tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name}`);
  return t;
};

beforeEach(() => {
  setTestEnv();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const g403Resource = {
  error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permission for site 'sc-domain:x.com'. See also: https://support.google.com/webmasters/answer/2451999." },
};

describe("gsc: definicion", () => {
  it("scope de solo lectura y todas las tools readOnly/openWorld", () => {
    expect(gscModule.scopes.read).toEqual(["https://www.googleapis.com/auth/webmasters.readonly"]);
    expect(gscModule.scopes.write).toEqual([]);
    expect(gscModule.tools.map((t) => t.name).slice(0, 3)).toEqual(["gsc_list_sites", "gsc_performance", "gsc_list_sitemaps"]);
    for (const t of gscModule.tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });
});

describe("gsc_list_sites / probe", () => {
  it("lista sitios con Bearer y probe cuenta >= 1", async () => {
    const calls = mockFetch([
      { body: { siteEntry: [{ siteUrl: "sc-domain:onconcat.com", permissionLevel: "siteOwner" }] } },
      { body: { siteEntry: [{ siteUrl: "https://a.com/", permissionLevel: "siteFullUser" }] } },
    ]);
    const res = await tool("gsc_list_sites").handler(testCtx, {});
    expect(res.data).toEqual([{ site: "sc-domain:onconcat.com", permission_level: "siteOwner" }]);
    expect(calls[0]!.url).toBe("https://searchconsole.googleapis.com/webmasters/v3/sites");
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(await gscModule.probe(testCtx)).toEqual({ count: 1, sample: ["https://a.com/"] });
  });

  it("probe con 0 sitios -> count 0", async () => {
    mockFetch([{ body: {} }]);
    expect((await gscModule.probe(testCtx)).count).toBe(0);
  });
});

describe("gsc_performance", () => {
  const schema = tool("gsc_performance").inputSchema;

  it("aplica defaults (by=query, days=28, limit=50) y valida limites", () => {
    expect(schema.parse({ site: "sc-domain:x.com" })).toEqual({ site: "sc-domain:x.com", by: "query", days: 28, limit: 50 });
    expect(() => schema.parse({ site: "sc-domain:x.com", limit: 1001 })).toThrow();
    expect(() => schema.parse({ site: "x.com" })).toThrow(); // ni sc-domain: ni https://
    expect(() => schema.parse({ site: "sc-domain:x.com", by: "device" })).not.toThrow();
    expect(() => schema.parse({ site: "sc-domain:x.com", by: "date" })).toThrow();
  });

  it("consulta con dataState final, rango con retraso y redondea posicion", async () => {
    const calls = mockFetch([
      {
        body: {
          rows: [
            { keys: ["agencia seo"], clicks: 12, impressions: 340, ctr: 0.0352941, position: 7.4567 },
            { keys: ["otra"], clicks: 1, impressions: 20, ctr: 0.05, position: 12 },
          ],
        },
      },
    ]);
    const args = schema.parse({ site: "sc-domain:onconcat.com", by: "query", limit: 2 });
    const res = await tool("gsc_performance").handler(testCtx, args);

    expect(calls[0]!.url).toBe(
      "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aonconcat.com/searchAnalytics/query",
    );
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({
      startDate: "2026-09-03",
      endDate: "2026-09-30",
      dimensions: ["query"],
      rowLimit: 2,
      dataState: "final",
    });
    expect(res.data).toEqual([
      { query: "agencia seo", clicks: 12, impressions: 340, ctr: 0.0353, position: 7.5 },
      { query: "otra", clicks: 1, impressions: 20, ctr: 0.05, position: 12 },
    ]);
    expect(res.meta?.range).toEqual(["2026-09-03", "2026-09-30"]);
    expect(res.meta?.warnings?.some((w) => w.includes("limit=2"))).toBe(true);
  });

  it("403 de permiso de recurso -> GoogleApiError saneado -> missing_resource_permission con nota sc-domain", async () => {
    mockFetch([{ status: 403, body: g403Resource }]);
    const args = schema.parse({ site: "sc-domain:x.com" });
    const err = await tool("gsc_performance").handler(testCtx, args).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    const a = fillEmail(gscModule.explainError(err), "lucas@x.com");
    expect(a).toMatchObject({ error: "missing_resource_permission", module: "gsc", next_action: "fix_resource_permission" });
    expect(a.message).toContain("lucas@x.com");
    expect(a.fix).toContain("Search Console → Configuración → Usuarios y permisos");
    expect(a.fix).toContain("`sc-domain:dominio` y `https://dominio/` son propiedades distintas");
  });

  it("403 por scope insuficiente -> scope_lost con url de reconexion", async () => {
    mockFetch([
      {
        status: 403,
        body: { error: { code: 403, status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } },
      },
    ]);
    const err = await tool("gsc_list_sites").handler(testCtx, {}).catch((e: unknown) => e);
    const a = gscModule.explainError(err);
    expect(a).toMatchObject({ error: "scope_lost", next_action: "reconnect_module", url: "https://gw.example.com/google/start?module=gsc" });
  });

  it("429 -> quota_exceeded retry con retry-after", async () => {
    mockFetch([{ status: 429, headers: { "retry-after": "30" }, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } } }]);
    const err = await tool("gsc_list_sites").handler(testCtx, {}).catch((e: unknown) => e);
    const a = gscModule.explainError(err);
    expect(a).toMatchObject({ error: "quota_exceeded", next_action: "retry" });
    expect(a.message).toContain("30s");
  });
});

describe("gsc: errores y secretos", () => {
  it("el mensaje del error nunca contiene tokens aunque Google los eco", async () => {
    mockFetch([
      { status: 500, body: { error: { code: 500, message: "boom Bearer ya29.SECRETSECRET refresh 1//0gREFRESHSECRET" } } },
    ]);
    const err = await googleFetch("https://x.test", TEST_ACCESS_TOKEN).catch((e: unknown) => e);
    const a = gscModule.explainError(err);
    const blob = JSON.stringify([a, (err as Error).message]);
    expect(blob).not.toContain("SECRETSECRET");
    expect(blob).not.toContain("REFRESHSECRET");
    expect(blob).not.toContain(TEST_ACCESS_TOKEN);
  });

  it("probe vacio: mensaje exacto de la spec §6", () => {
    const a = fillEmail(gscModule.explainError(new NoResourcesError()), "ana@x.com");
    expect(`${a.message} ${a.fix}`).toBe(
      "Tu correo ana@x.com no es usuario de ninguna propiedad. Search Console → Configuración → Usuarios y permisos. Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.",
    );
  });

  it("ActionableException pasa tal cual", () => {
    const inner = { error: "scope_lost", module: "gsc", message: "m", fix: "f", next_action: "reconnect_module" } as const;
    expect(gscModule.explainError(new ActionableException(inner))).toEqual(inner);
  });
});

describe("gsc_list_sitemaps", () => {
  it("mapea sitemaps con numeros (Google serializa como string)", async () => {
    const calls = mockFetch([
      {
        body: {
          sitemap: [
            { path: "https://onconcat.com/sitemap.xml", lastSubmitted: "2026-09-01T10:00:00Z", lastDownloaded: "2026-09-30T04:00:00Z", isPending: false, isSitemapsIndex: false, type: "sitemap", warnings: "2", errors: "0" },
          ],
        },
      },
    ]);
    const res = await tool("gsc_list_sitemaps").handler(testCtx, { site: "https://onconcat.com/" });
    expect(calls[0]!.url).toBe("https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fonconcat.com%2F/sitemaps");
    expect(res.data).toEqual([
      { path: "https://onconcat.com/sitemap.xml", type: "sitemap", last_submitted: "2026-09-01T10:00:00Z", last_downloaded: "2026-09-30T04:00:00Z", is_pending: false, is_sitemaps_index: false, errors: 0, warnings: 2 },
    ]);
  });
});
