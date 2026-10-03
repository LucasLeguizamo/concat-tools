import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionableException } from "./errors";
import { gscModule } from "./gsc";
import { seoTools } from "./seo";
import { mockFetch, setTestEnv, TEST_ACCESS_TOKEN, testCtx } from "./test-utils";
import type { ToolContext, ToolDef } from "./types";

const tool = (name: string): ToolDef => {
  const t = seoTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name}`);
  return t;
};
const run = (name: string, args: unknown, ctx: ToolContext = testCtx) => {
  const t = tool(name);
  return t.handler(ctx, t.inputSchema.parse(args));
};

const GA4_TOKEN = "ya29.ga4-token-should-never-leak";
const bothCtx: ToolContext = { ...testCtx, getAccessTokenFor: async () => GA4_TOKEN };

beforeEach(() => {
  setTestEnv();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const QUERY_URL = "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aonconcat.com/searchAnalytics/query";
const row = (keys: string[], clicks: number, impressions: number, position: number) => ({ keys, clicks, impressions, ctr: clicks / impressions, position });

describe("seo tools: definicion", () => {
  it("se exponen en el modulo gsc, solo lectura, con prefijo gsc_", () => {
    expect(seoTools.map((t) => t.name)).toEqual([
      "gsc_striking_distance",
      "gsc_ctr_gaps",
      "gsc_zero_click",
      "gsc_cannibalization",
      "gsc_content_decay",
      "gsc_landing_conversions",
    ]);
    for (const t of seoTools) {
      expect(gscModule.tools).toContain(t);
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
    expect(gscModule.scopes.write).toEqual([]);
  });

  it("validacion de entradas", () => {
    const s = tool("gsc_striking_distance").inputSchema;
    expect(s.parse({ site: "sc-domain:x.com" })).toMatchObject({ days: 28, limit: 20, max_rows: 25000 });
    expect(() => s.parse({ site: "x.com" })).toThrow();
    expect(() => s.parse({ site: "sc-domain:x.com", limit: 101 })).toThrow();
    expect(() => s.parse({ site: "sc-domain:x.com", cursor: "abc" })).toThrow();
    expect(() => s.parse({ site: "sc-domain:x.com", brand_regex: "a\nb" })).toThrow();
    expect(() => s.parse({ site: "sc-domain:x.com", max_rows: 100001 })).toThrow();
    const l = tool("gsc_landing_conversions").inputSchema;
    expect(() => l.parse({ site: "sc-domain:x.com" })).toThrow(); // falta ga4_property
    expect(() => l.parse({ site: "sc-domain:x.com", ga4_property: "abc" })).toThrow();
  });
});

describe("searchAnalytics: filtros, rango, paginacion", () => {
  it("envia brand_regex como excludingRegex (RE2 en Google), dataState final y rango con retraso", async () => {
    const calls = mockFetch([{ body: { rows: [row(["a b", "https://onconcat.com/x"], 1, 200, 10)] } }]);
    const res = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", brand_regex: "concat", page_contains: "/blog/" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(QUERY_URL);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(calls[0]!.body).toEqual({
      startDate: "2026-09-03",
      endDate: "2026-09-30",
      dimensions: ["query", "page"],
      dimensionFilterGroups: [
        {
          groupType: "and",
          filters: [
            { dimension: "query", operator: "excludingRegex", expression: "concat" },
            { dimension: "page", operator: "contains", expression: "/blog/" },
          ],
        },
      ],
      rowLimit: 25000,
      startRow: 0,
      dataState: "final",
    });
    expect(res.meta?.range).toEqual(["2026-09-03", "2026-09-30"]);
    expect(res.meta?.warnings?.some((w) => w.includes("Sin brand_regex"))).toBe(false);
  });

  it("sin brand_regex avisa; un lote parcial (< rowLimit) corta la paginacion", async () => {
    const part = Array.from({ length: 1000 }, (_, i) => row([`q${i}`, "https://onconcat.com/x"], 1, 10, 5));
    const calls = mockFetch([{ body: { rows: part } }]);
    const res = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", max_rows: 2000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ startRow: 0, rowLimit: 2000 });
    expect(res.meta?.warnings?.some((w) => w.includes("Sin brand_regex"))).toBe(true);
    expect(res.meta?.warnings?.some((w) => w.includes("Se leyeron"))).toBe(false);
  });

  it("pagina de 25000 en 25000 y marca truncado al llegar a max_rows", async () => {
    const page = Array.from({ length: 25000 }, (_, i) => row([`q${i}`, "https://onconcat.com/x"], 0, 1, 5));
    const calls = mockFetch([{ body: { rows: page } }, { body: { rows: page } }]);
    const res = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", max_rows: 50000, brand_regex: "x" });
    expect(calls.map((c) => (c.body as { startRow: number }).startRow)).toEqual([0, 25000]);
    expect(res.meta?.warnings?.some((w) => w.includes("Se leyeron 50000 filas"))).toBe(true);
  });

  it("400 de Google (regex invalida) -> ActionableException invalid_argument sin eco de token", async () => {
    mockFetch([{ status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT", message: `Invalid regex Bearer ${TEST_ACCESS_TOKEN}` } } }]);
    const err = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", brand_regex: "(" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActionableException);
    const a = (err as ActionableException).actionable;
    expect(a).toMatchObject({ error: "invalid_argument", next_action: "none" });
    expect(JSON.stringify(a)).not.toContain("ya29.test-access-token");
  });
});

describe("workflows via tools", () => {
  it("striking: un request, items paginados con next_cursor", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row([`q${i}`, `https://onconcat.com/p${i}`], 0, 200 + i * 100, 12));
    mockFetch([{ body: { rows } }, { body: { rows } }]);
    const first = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", brand_regex: "x", limit: 2 });
    expect((first.data as { total: number; items: unknown[] }).total).toBe(5);
    expect((first.data as { items: Array<{ query: string }> }).items.map((i) => i.query)).toEqual(["q4", "q3"]); // mayor potencial primero
    expect(first.meta?.next_cursor).toBe("2");
    const second = await run("gsc_striking_distance", { site: "sc-domain:onconcat.com", brand_regex: "x", limit: 2, cursor: "2" });
    expect((second.data as { items: Array<{ query: string }> }).items.map((i) => i.query)).toEqual(["q2", "q1"]);
  });

  it("decay: dos periodos contiguos y lost_queries", async () => {
    const calls = mockFetch([
      { body: { rows: [row(["https://onconcat.com/a"], 20, 1000, 8)] } }, // now (page)
      { body: { rows: [row(["https://onconcat.com/a"], 200, 4000, 3)] } }, // prev (page)
      { body: { rows: [row(["q1", "https://onconcat.com/a"], 20, 1000, 8)] } }, // now (query,page)
      { body: { rows: [row(["q1", "https://onconcat.com/a"], 150, 3000, 3), row(["q2", "https://onconcat.com/a"], 50, 1000, 3)] } },
    ]);
    const res = await run("gsc_content_decay", { site: "sc-domain:onconcat.com", brand_regex: "x" });
    const b = (i: number) => calls[i]!.body as { startDate: string; endDate: string; dimensions: string[] };
    expect([b(0).startDate, b(0).endDate]).toEqual(["2026-07-03", "2026-09-30"]);
    expect([b(1).startDate, b(1).endDate]).toEqual(["2026-04-04", "2026-07-02"]); // 90 dias justo antes
    const items = (res.data as { items: Array<Record<string, unknown>> }).items;
    expect(items[0]).toMatchObject({ page: "https://onconcat.com/a", cause: "ranking", clicks_prev: 200, clicks_now: 20 });
    expect(items[0]!.lost_queries).toEqual([
      { query: "q1", clicks_lost: 130 },
      { query: "q2", clicks_lost: 50 },
    ]);
  });
});

describe("gsc_landing_conversions (join GSC + GA4)", () => {
  const args = { site: "sc-domain:onconcat.com", ga4_property: "properties/123456789" };

  it("exige ga4: sin scope -> module_required con connect_module y url, antes de llamar a Google", async () => {
    const calls = mockFetch([]);
    const ctx: ToolContext = {
      ...testCtx,
      getAccessTokenFor: async () => {
        throw new ActionableException({ error: "scope_lost", module: "ga4", message: "m", fix: "f", next_action: "reconnect_module", url: "u" });
      },
    };
    const err = await run("gsc_landing_conversions", args, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActionableException);
    expect((err as ActionableException).actionable).toMatchObject({
      error: "module_required",
      module: "ga4",
      next_action: "connect_module",
      url: "https://gw.example.com/google/start?module=ga4",
    });
    expect(calls).toHaveLength(0);
  });

  it("une GSC y GA4, filtra GA4 a Organic Search + google y reporta match_rate y warnings", async () => {
    const calls = mockFetch([
      { body: { rows: [row(["https://onconcat.com/blog/x"], 120, 3000, 6), row(["https://onconcat.com/huerfana"], 10, 100, 4)] } },
      { body: { rows: [row(["automatizar", "https://onconcat.com/blog/x"], 100, 2000, 6)] } },
      {
        body: {
          rowCount: 2,
          metadata: { subjectToThresholding: true },
          rows: [
            { dimensionValues: [{ value: "www.onconcat.com" }, { value: "/blog/x/?utm_source=google" }], metricValues: [{ value: "110" }, { value: "80" }, { value: "6" }, { value: "0" }] },
            { dimensionValues: [{ value: "onconcat.com" }, { value: "(not set)" }], metricValues: [{ value: "3" }, { value: "0" }, { value: "0" }, { value: "0" }] },
          ],
        },
      },
    ]);
    const res = await run("gsc_landing_conversions", args, bothCtx);

    // GSC usa el token de gsc; GA4 el de ga4
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(calls[2]!.headers.authorization).toBe(`Bearer ${GA4_TOKEN}`);
    expect(calls[2]!.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport");
    const ga4Body = calls[2]!.body as { dateRanges: unknown; dimensions: unknown; dimensionFilter: unknown; offset: string };
    expect(ga4Body.dateRanges).toEqual([{ startDate: "2026-09-03", endDate: "2026-09-30" }]);
    expect(ga4Body.dimensions).toEqual([{ name: "hostName" }, { name: "landingPagePlusQueryString" }]);
    expect(JSON.stringify(ga4Body.dimensionFilter)).toContain('"Organic Search"');
    expect(JSON.stringify(ga4Body.dimensionFilter)).toContain('"google"');
    expect(ga4Body.offset).toBe("0");

    const d = res.data as { match_rate: number; items: Array<Record<string, unknown>>; unmatched_gsc: unknown[] };
    expect(d.match_rate).toBe(0.923); // 120 / 130 clicks
    expect(d.items[0]).toMatchObject({
      url: "https://onconcat.com/blog/x",
      sessions: 110,
      key_events: 6,
      sessions_per_click: 0.92,
      top_queries: [{ query: "automatizar", clicks: 100 }],
    });
    expect(d.unmatched_gsc).toEqual([{ url: "https://onconcat.com/huerfana", clicks: 10 }]);
    const w = (res.meta?.warnings ?? []).join(" | ");
    expect(w).toContain("subjectToThresholding");
    expect(w).toContain("1 filas descartadas");
    expect(w).toContain("Queries anonimizadas"); // 100/130 clicks = 77%
  });

  it("filtro url: cualquier variante de la URL encuentra la misma landing", async () => {
    mockFetch([
      { body: { rows: [row(["https://onconcat.com/blog/x"], 120, 3000, 6), row(["https://onconcat.com/otra"], 50, 500, 3)] } },
      { body: { rows: [] } },
      { body: { rowCount: 0, rows: [] } },
    ]);
    const res = await run("gsc_landing_conversions", { ...args, url: "http://www.onconcat.com/blog/x/#top" }, bothCtx);
    const items = (res.data as { items: Array<{ url: string }> }).items;
    expect(items.map((i) => i.url)).toEqual(["https://onconcat.com/blog/x"]);
  });

  it("error de GA4 (403) se explica con el modulo ga4, no con texto de Search Console, y sin tokens", async () => {
    mockFetch([
      { body: { rows: [row(["https://onconcat.com/a"], 10, 100, 3)] } },
      { body: { rows: [] } },
      { status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: `User does not have sufficient permissions for properties/123456789 ${GA4_TOKEN}` } } },
    ]);
    const err = await run("gsc_landing_conversions", args, bothCtx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActionableException);
    const a = (err as ActionableException).actionable;
    expect(a).toMatchObject({ error: "missing_resource_permission", module: "ga4", next_action: "fix_resource_permission" });
    expect(a.message).toContain("123456789");
    const blob = JSON.stringify(a);
    expect(blob).not.toContain("ya29.");
    expect(blob).not.toContain("Search Console");
  });

  it("scope insuficiente en GA4 no se reporta como scope_lost (marcaria gsc como perdido)", async () => {
    mockFetch([
      { body: { rows: [] } },
      { body: { rows: [] } },
      { status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } } },
    ]);
    const err = await run("gsc_landing_conversions", args, bothCtx).catch((e: unknown) => e);
    expect((err as ActionableException).actionable).toMatchObject({
      error: "module_required",
      module: "ga4",
      next_action: "reconnect_module",
      url: "https://gw.example.com/google/start?module=ga4",
    });
  });

  it("pagina GA4 con offset cuando rowCount supera el lote", async () => {
    const ga = (n: number) => ({
      rowCount: 30000,
      rows: Array.from({ length: n }, (_, i) => ({ dimensionValues: [{ value: "onconcat.com" }, { value: `/p${i}` }], metricValues: [{ value: "1" }, { value: "1" }, { value: "0" }, { value: "0" }] })),
    });
    const calls = mockFetch([{ body: { rows: [] } }, { body: { rows: [] } }, { body: ga(25000) }, { body: ga(5000) }]);
    await run("gsc_landing_conversions", args, bothCtx);
    expect(calls.slice(2).map((c) => (c.body as { offset: string }).offset)).toEqual(["0", "25000"]);
  });
});
