import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillEmail, GoogleApiError, NoResourcesError } from "./errors";
import { ga4Module } from "./ga4";
import { mockFetch, setTestEnv, TEST_ACCESS_TOKEN, testCtx } from "./test-utils";
import type { ToolDef } from "./types";

const tool = (name: string): ToolDef => {
  const t = ga4Module.tools.find((x) => x.name === name);
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

describe("ga4: definicion", () => {
  it("scope de solo lectura y tools readOnly/openWorld", () => {
    expect(ga4Module.scopes.read).toEqual(["https://www.googleapis.com/auth/analytics.readonly"]);
    expect(ga4Module.scopes.write).toEqual([]);
    expect(ga4Module.tools.map((t) => t.name)).toEqual(["ga4_list_properties", "ga4_daily_report"]);
    for (const t of ga4Module.tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });
});

const summaries = {
  accountSummaries: [
    {
      account: "accounts/1",
      displayName: "CONCAT",
      propertySummaries: [
        { property: "properties/123456789", displayName: "onconcat.com", propertyType: "PROPERTY_TYPE_ORDINARY" },
        { property: "properties/987", displayName: "blog" },
      ],
    },
  ],
};

describe("ga4_list_properties / probe", () => {
  it("aplana cuentas -> propiedades y pagina", async () => {
    const calls = mockFetch([
      { body: { ...summaries, nextPageToken: "p2" } },
      { body: { accountSummaries: [{ account: "accounts/2", displayName: "Otra", propertySummaries: [{ property: "properties/5", displayName: "x" }] }] } },
    ]);
    const res = await tool("ga4_list_properties").handler(testCtx, {});
    expect((res.data as unknown[]).length).toBe(3);
    expect((res.data as Array<{ property: string }>)[0]!.property).toBe("123456789");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?");
    expect(calls[1]!.url).toContain("pageToken=p2");
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });

  it("probe cuenta propiedades; cuentas sin propiedades -> 0", async () => {
    mockFetch([{ body: summaries }, { body: { accountSummaries: [{ account: "accounts/1", displayName: "vacia" }] } }]);
    expect((await ga4Module.probe(testCtx)).count).toBe(2);
    expect((await ga4Module.probe(testCtx)).count).toBe(0);
  });
});

describe("ga4_daily_report", () => {
  const schema = tool("ga4_daily_report").inputSchema;

  it("defaults y validacion de property", () => {
    expect(schema.parse({ property: "123" })).toEqual({ property: "123", days: 28 });
    expect(() => schema.parse({ property: "abc" })).toThrow();
    expect(() => schema.parse({ property: "123", days: 0 })).toThrow();
  });

  it("runReport date x sessions/totalUsers/keyEvents, expone thresholding y sampling", async () => {
    const calls = mockFetch([
      {
        body: {
          rows: [
            { dimensionValues: [{ value: "20260929" }], metricValues: [{ value: "100" }, { value: "80" }, { value: "5" }] },
            { dimensionValues: [{ value: "20260930" }], metricValues: [{ value: "120" }, { value: "90" }, { value: "7" }] },
          ],
          metadata: {
            subjectToThresholding: true,
            samplingMetadatas: [{ samplesReadCount: "500000", samplingSpaceSize: "2000000" }],
          },
        },
      },
    ]);
    const res = await tool("ga4_daily_report").handler(testCtx, schema.parse({ property: "properties/123456789", days: 2 }));
    expect(calls[0]!.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toMatchObject({
      dateRanges: [{ startDate: "2026-10-01", endDate: "2026-10-02" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
    });
    expect(res.data).toEqual([
      { date: "2026-09-29", sessions: 100, total_users: 80, key_events: 5 },
      { date: "2026-09-30", sessions: 120, total_users: 90, key_events: 7 },
    ]);
    expect(res.meta?.range).toEqual(["2026-10-01", "2026-10-02"]);
    const w = res.meta?.warnings ?? [];
    expect(w.some((x) => x.includes("subjectToThresholding"))).toBe(true);
    expect(w.some((x) => x.includes("Muestreo") && x.includes("500000"))).toBe(true);
  });

  it("sin thresholding ni sampling: sin warnings", async () => {
    mockFetch([{ body: { rows: [], metadata: {} } }]);
    const res = await tool("ga4_daily_report").handler(testCtx, schema.parse({ property: "1" }));
    expect(res.meta?.warnings).toEqual([]);
  });

  it("403 -> Viewer en la propiedad (con id y correo)", async () => {
    mockFetch([
      { status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permissions for this property." } } },
    ]);
    const err = await tool("ga4_daily_report").handler(testCtx, schema.parse({ property: "123456789" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    const a = fillEmail(ga4Module.explainError(err), "lucas@x.com");
    expect(a).toMatchObject({ error: "missing_resource_permission", module: "ga4", next_action: "fix_resource_permission" });
    expect(a.message).toBe("Tu correo lucas@x.com no tiene rol Viewer en la propiedad 123456789.");
    expect(a.fix).toContain("GA4 → Admin → Gestión de acceso a la propiedad");
  });

  it("403 de scope insuficiente -> scope_lost", async () => {
    mockFetch([{ status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes." } } }]);
    const err = await tool("ga4_daily_report").handler(testCtx, schema.parse({ property: "1" })).catch((e: unknown) => e);
    expect(ga4Module.explainError(err)).toMatchObject({ error: "scope_lost", url: "https://gw.example.com/google/start?module=ga4" });
  });

  it("probe vacio -> falta rol Viewer", () => {
    const a = fillEmail(ga4Module.explainError(new NoResourcesError()), "ana@x.com");
    expect(`${a.message} ${a.fix}`).toBe("Falta el rol Viewer. GA4 → Admin → Gestión de acceso a la propiedad → agrega ana@x.com.");
  });
});
