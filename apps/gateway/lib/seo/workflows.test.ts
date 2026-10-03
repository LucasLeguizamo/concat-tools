import { describe, expect, it } from "vitest";
import { FALLBACK_CTR, type CtrCurve } from "./stats";
import {
  aggregateQueries,
  cannibalization,
  contentDecay,
  ctrGaps,
  joinLandings,
  lostQueries,
  strikingDistance,
  zeroClick,
  type Ga4LandingRow,
  type QueryPageRow,
} from "./workflows";
import { parseSite } from "./url";

const curve: CtrCurve = { ctr: { ...FALLBACK_CTR, "3": 0.1, "1": 0.3, "4-5": 0.06 }, fallback: [] };
const qp = (query: string, page: string, clicks: number, impressions: number, position: number): QueryPageRow => ({ query, page, clicks, impressions, position });

describe("aggregateQueries", () => {
  it("suma, pondera la posicion y elige la pagina con mas impresiones", () => {
    const [a] = aggregateQueries([qp("q", "https://x.com/a", 5, 900, 10), qp("q", "https://x.com/b", 1, 100, 20)]);
    expect(a).toMatchObject({ query: "q", page: "https://x.com/a", clicks: 6, impressions: 1000 });
    expect(a!.position).toBeCloseTo(11, 5);
  });
});

describe("strikingDistance", () => {
  it("filtra por posicion 8-20 e impresiones, calcula potencial vs CTR pos 3 y ordena", () => {
    const aggs = aggregateQueries([
      qp("alta", "/a", 10, 1000, 9), // potencial 1000*0.1-10 = 90, tier high
      qp("media", "/b", 0, 200, 15), // 20
      qp("pocas impresiones", "/c", 0, 99, 12),
      qp("ya top", "/d", 50, 1000, 3),
      qp("lejos", "/e", 0, 5000, 25),
      qp("sin potencial", "/f", 50, 400, 9), // 40-50 < 0
    ]);
    const out = strikingDistance(aggs, curve);
    expect(out.map((i) => [i.query, i.potential_clicks, i.tier])).toEqual([
      ["alta", 90, "high"],
      ["media", 20, "normal"],
    ]);
  });
});

describe("ctrGaps / zeroClick", () => {
  it("CTR < 0.6x el esperado del bucket, pos<=10, impr>=500", () => {
    const aggs = aggregateQueries([
      qp("malo", "/a", 10, 1000, 1), // ctr 1% vs 30% -> gap
      qp("ok", "/b", 250, 1000, 1), // 25% >= 18%
      qp("pocas", "/c", 0, 400, 1),
      qp("pos 12", "/d", 0, 1000, 12),
    ]);
    const out = ctrGaps(aggs, curve);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ query: "malo", ctr: 0.01, expected_ctr: 0.3, potential_clicks: 290 });
  });

  it("zero click separa snippet (pos<=10) de ranking (>10)", () => {
    const aggs = aggregateQueries([qp("a", "/a", 0, 800, 4), qp("b", "/b", 0, 900, 14), qp("c", "/c", 1, 5000, 3), qp("d", "/d", 0, 100, 2)]);
    expect(zeroClick(aggs).map((z) => [z.query, z.cause])).toEqual([
      ["b", "ranking"],
      ["a", "snippet"],
    ]);
  });
});

describe("contentDecay", () => {
  const prev = [
    { page: "https://x.com/rank", clicks: 200, impressions: 4000, position: 4 },
    { page: "https://x.com/demand", clicks: 200, impressions: 4000, position: 4 },
    { page: "https://x.com/snippet", clicks: 200, impressions: 4000, position: 4 },
    { page: "https://x.com/gone", clicks: 100, impressions: 2000, position: 5 },
    { page: "https://x.com/small", clicks: 40, impressions: 800, position: 5 }, // prev < 50
    { page: "https://x.com/stable", clicks: 200, impressions: 4000, position: 4 },
    { page: "https://x.com/few", clicks: 60, impressions: 800, position: 4 }, // cae 40% pero solo 24 perdidos... 
  ];
  const now = [
    { page: "https://x.com/rank/", clicks: 80, impressions: 3800, position: 7.5 },
    { page: "https://x.com/demand", clicks: 100, impressions: 2000, position: 4.2 },
    { page: "https://x.com/snippet", clicks: 100, impressions: 4000, position: 4.1 },
    { page: "https://x.com/small", clicks: 0, impressions: 800, position: 5 },
    { page: "https://x.com/stable", clicks: 190, impressions: 3900, position: 4 },
    { page: "https://x.com/few", clicks: 41, impressions: 800, position: 4 },
  ];

  it("detecta caidas y clasifica la causa; normaliza URLs entre periodos", () => {
    const out = contentDecay(prev, now);
    expect(Object.fromEntries(out.map((d) => [d.page.replace("https://x.com/", ""), d.cause]))).toEqual({
      rank: "ranking",
      demand: "demand",
      snippet: "snippet",
      gone: "disappeared",
    });
    expect(out[0]!.page).toBe("https://x.com/rank"); // mas clicks perdidos (120)
    expect(out.find((d) => d.page.endsWith("/rank"))).toMatchObject({ clicks_prev: 200, clicks_now: 80, delta_pct: -0.6, position_now: 7.5 });
    expect(out.find((d) => d.page.endsWith("/gone"))).toMatchObject({ position_now: null, clicks_now: 0 });
  });

  it("lostQueries: top queries que perdieron mas clicks por pagina", () => {
    const l = lostQueries(
      [qp("a", "https://x.com/rank", 100, 1000, 3), qp("b", "https://x.com/rank", 50, 500, 3), qp("c", "https://x.com/other", 99, 900, 3)],
      [qp("a", "https://x.com/rank/", 20, 900, 8), qp("b", "https://x.com/rank", 60, 500, 3)],
      ["https://x.com/rank"],
    );
    expect(l.get("x.com/rank")).toEqual([{ query: "a", clicks_lost: 80 }]);
    expect(l.has("x.com/other")).toBe(false);
  });
});

describe("cannibalization", () => {
  it("2+ URLs con >=10% de impresiones, clicks combinados, pos<=30, sin home", () => {
    const rows = [
      qp("seo", "https://x.com/a", 30, 600, 5),
      qp("seo", "https://x.com/b", 10, 400, 7),
      qp("seo", "https://x.com/c", 0, 20, 30), // 2% share: no cuenta
      qp("dominante", "https://x.com/a", 50, 950, 3),
      qp("dominante", "https://x.com/b", 1, 50, 9), // 5% share
      qp("marca", "https://x.com/", 40, 600, 1), // home excluida
      qp("marca", "https://x.com/a", 10, 400, 4),
      qp("pocos clicks", "https://x.com/a", 3, 500, 4),
      qp("pocos clicks", "https://x.com/b", 2, 500, 4),
      qp("lejos", "https://x.com/a", 20, 500, 40),
      qp("lejos", "https://x.com/b", 20, 500, 40),
    ];
    const out = cannibalization(rows);
    expect(out.map((c) => c.query)).toEqual(["seo"]);
    expect(out[0]).toMatchObject({ clicks: 40, impressions: 1000, suggested_primary: "https://x.com/a" });
    expect(out[0]!.urls.map((u) => [u.page, u.share])).toEqual([
      ["https://x.com/a", 0.588], // share sobre TODAS las impresiones de la query (incluye /c)
      ["https://x.com/b", 0.392],
    ]);
  });
});

describe("joinLandings", () => {
  const scope = parseSite("sc-domain:onconcat.com")!;
  const ga = (host: string, landing: string, sessions: number, keyEvents: number, engaged = sessions): Ga4LandingRow => ({
    hostName: host,
    landingPagePlusQueryString: landing,
    sessions,
    engagedSessions: engaged,
    keyEvents,
    revenue: 0,
  });

  const gsc = [
    { page: "https://onconcat.com/a", clicks: 200, impressions: 5000, position: 3 }, // tasa 5%
    { page: "https://onconcat.com/b/", clicks: 200, impressions: 5000, position: 8 }, // tasa 0 -> no convierte
    { page: "https://onconcat.com/c", clicks: 300, impressions: 9000, position: 9 }, // tasa 3% (mediana 3%)... 
    { page: "https://onconcat.com/d", clicks: 150, impressions: 3000, position: 12 }, // empujar seo
    { page: "https://onconcat.com/e", clicks: 120, impressions: 3000, position: 2 }, // tracking mismatch (sessions 20)
    { page: "https://onconcat.com/sin-ga4", clicks: 30, impressions: 600, position: 4 },
  ];
  const ga4 = [
    ga("www.onconcat.com", "/a?utm_source=google&gclid=1", 150, 6), // 4%
    ga("onconcat.com", "/a/", 50, 2), // se suma a /a: 200 sesiones, 8 eventos -> 4%
    ga("onconcat.com", "/b", 180, 0),
    ga("onconcat.com", "/c", 280, 8), // 2.86%
    ga("onconcat.com", "/d", 140, 20), // 14%
    ga("onconcat.com", "/e", 20, 1),
    ga("onconcat.com", "/solo-ga4", 77, 1),
    ga("otro.com", "/a", 999, 9), // fuera de alcance
    ga("onconcat.com", "(not set)", 5, 0),
  ];

  it("une por clave normalizada, suma duplicados y reporta match_rate", () => {
    const j = joinLandings(scope, gsc, ga4);
    const a = j.items.find((i) => i.url.endsWith("/a"))!;
    expect(a).toMatchObject({ sessions: 200, key_events: 8, key_event_rate: 0.04, sessions_per_click: 1 });
    // clicks con match: 200+200+300+150+120 = 970 de 1000; sesiones en alcance 897, con match 820
    expect(j.match_rate).toBe(0.97);
    expect(j.ga4_match_rate).toBeCloseTo(820 / 897, 3);
    expect(j.unmatched_gsc).toEqual([{ url: "https://onconcat.com/sin-ga4", clicks: 30 }]);
    expect(j.unmatched_ga4).toEqual([{ url: "/solo-ga4", sessions: 77 }]);
    expect(j.ga4_rows_out_of_scope).toBe(2);
    expect(j.items.find((i) => i.url.endsWith("sin-ga4"))!.flags).toEqual(["sin_match_ga4"]);
  });

  it("flags: no_convierte, empujar_seo y tracking_mismatch usan la mediana (clicks>=100)", () => {
    const j = joinLandings(scope, gsc, ga4);
    // tasas con clicks>=100: a 4%, b 0, c 2.857%, d 14.3%, e 5% -> mediana 4%
    expect(j.median_key_event_rate).toBe(0.04);
    const f = (s: string) => j.items.find((i) => i.url.endsWith(s))!.flags;
    expect(f("/b/")).toContain("no_convierte");
    expect(f("/d")).toEqual(["empujar_seo"]);
    expect(f("/e")).toEqual(["tracking_mismatch"]);
    expect(f("/a")).toEqual([]);
    expect(f("/c")).toEqual([]);
  });

  it("sin key events no se calculan flags de conversion", () => {
    const none = ga4.map((r) => ({ ...r, keyEvents: 0 }));
    const j = joinLandings(scope, gsc, none);
    expect(j.items.flatMap((i) => i.flags).filter((f) => f === "no_convierte" || f === "empujar_seo")).toEqual([]);
  });

  it("top_queries por landing con la URL normalizada", () => {
    const j = joinLandings(scope, gsc, ga4, [qp("q1", "https://onconcat.com/a", 5, 50, 3), qp("q2", "https://www.onconcat.com/a/", 9, 90, 3), qp("q3", "https://onconcat.com/b", 1, 10, 3)]);
    expect(j.items.find((i) => i.url.endsWith("/a"))!.top_queries).toEqual([
      { query: "q2", clicks: 9 },
      { query: "q1", clicks: 5 },
    ]);
  });

  it("keepParams distingue paginas con parametros significativos", () => {
    const j = joinLandings(
      scope,
      [{ page: "https://onconcat.com/lista?page=2", clicks: 10, impressions: 100, position: 5 }],
      [ga("onconcat.com", "/lista?page=2&utm_x=1", 9, 0), ga("onconcat.com", "/lista?page=3", 4, 0)],
      [],
      { keepParams: ["page"] },
    );
    expect(j.items[0]!.sessions).toBe(9);
    expect(j.unmatched_ga4).toEqual([{ url: "/lista", sessions: 4 }]);
  });
});
