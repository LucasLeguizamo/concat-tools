// Workflows SEO: calculo puro sobre filas ya descargadas (sin I/O, sin Google). Umbrales segun spec v1.1,
// todos sobreescribibles via `opts`. Posicion siempre ponderada por impresiones.
import { round } from "../modules/util";
import { bucketOf, median, weightedPosition, type CtrCurve } from "./stats";
import { inScope, normalizeUrl, type SiteScope, type UrlOptions } from "./url";

export interface QueryPageRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface QueryAgg {
  query: string;
  /** Pagina con mas impresiones para la query ("una pagina por query"). */
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** query x page -> una fila por query (sumas + posicion ponderada). */
export function aggregateQueries(rows: readonly QueryPageRow[]): QueryAgg[] {
  const groups = new Map<string, QueryPageRow[]>();
  for (const r of rows) {
    const g = groups.get(r.query);
    if (g) g.push(r);
    else groups.set(r.query, [r]);
  }
  return [...groups.entries()].map(([query, g]) => {
    const top = g.reduce((a, b) => (b.impressions > a.impressions ? b : a));
    return {
      query,
      page: top.page,
      clicks: g.reduce((n, r) => n + r.clicks, 0),
      impressions: g.reduce((n, r) => n + r.impressions, 0),
      position: weightedPosition(g),
    };
  });
}

const ctrOf = (a: { clicks: number; impressions: number }) => (a.impressions > 0 ? a.clicks / a.impressions : 0);

// --- Striking distance ---------------------------------------------------------------------------

export interface StrikingItem {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number;
  potential_clicks: number;
  tier: "high" | "normal";
}

/** pos ponderada 8-20 e impresiones >= 100 (alto >= 500). potential = impr x CTR esperado en pos 3 - clicks. */
export function strikingDistance(
  aggs: readonly QueryAgg[],
  curve: CtrCurve,
  opts: { minImpressions?: number; highImpressions?: number; minPosition?: number; maxPosition?: number } = {},
): StrikingItem[] {
  const { minImpressions = 100, highImpressions = 500, minPosition = 8, maxPosition = 20 } = opts;
  return aggs
    .filter((a) => a.impressions >= minImpressions && a.position >= minPosition && a.position <= maxPosition)
    .map((a) => ({
      query: a.query,
      page: a.page,
      impressions: a.impressions,
      clicks: a.clicks,
      position: round(a.position, 1),
      potential_clicks: Math.round(a.impressions * curve.ctr["3"] - a.clicks),
      tier: a.impressions >= highImpressions ? ("high" as const) : ("normal" as const),
    }))
    .filter((i) => i.potential_clicks > 0)
    .sort((a, b) => b.potential_clicks - a.potential_clicks);
}

// --- CTR gaps / zero click -----------------------------------------------------------------------

export interface CtrGapItem {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  expected_ctr: number;
  position: number;
  potential_clicks: number;
}

/** pos <= 10, impresiones >= 500 y CTR < 0.6 x esperado (curva del propio sitio). */
export function ctrGaps(
  aggs: readonly QueryAgg[],
  curve: CtrCurve,
  opts: { minImpressions?: number; maxPosition?: number; ratio?: number } = {},
): CtrGapItem[] {
  const { minImpressions = 500, maxPosition = 10, ratio = 0.6 } = opts;
  const out: CtrGapItem[] = [];
  for (const a of aggs) {
    if (a.impressions < minImpressions || a.position > maxPosition + 0.5) continue;
    const bucket = bucketOf(a.position);
    if (!bucket) continue;
    const expected = curve.ctr[bucket];
    const ctr = ctrOf(a);
    if (ctr >= ratio * expected) continue;
    out.push({
      query: a.query,
      page: a.page,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: round(ctr, 4),
      expected_ctr: round(expected, 4),
      position: round(a.position, 1),
      potential_clicks: Math.round(a.impressions * (expected - ctr)),
    });
  }
  return out.filter((i) => i.potential_clicks > 0).sort((a, b) => b.potential_clicks - a.potential_clicks);
}

export interface ZeroClickItem {
  query: string;
  page: string;
  impressions: number;
  position: number;
  /** `snippet`: pos <= 10 (titulo/intencion/AIO). `ranking`: pos > 10. */
  cause: "snippet" | "ranking";
}

export function zeroClick(aggs: readonly QueryAgg[], opts: { minImpressions?: number; nearPosition?: number } = {}): ZeroClickItem[] {
  const { minImpressions = 500, nearPosition = 10 } = opts;
  return aggs
    .filter((a) => a.clicks === 0 && a.impressions >= minImpressions)
    .map((a) => ({
      query: a.query,
      page: a.page,
      impressions: a.impressions,
      position: round(a.position, 1),
      cause: a.position <= nearPosition + 0.5 ? ("snippet" as const) : ("ranking" as const),
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

// --- Content decay -------------------------------------------------------------------------------

export type DecayCause = "ranking" | "demand" | "snippet" | "disappeared" | "mixed";

export interface DecayItem {
  page: string;
  clicks_prev: number;
  clicks_now: number;
  delta_pct: number;
  position_prev: number;
  position_now: number | null;
  impressions_prev: number;
  impressions_now: number;
  cause: DecayCause;
}

/**
 * Caida de clicks <= -30%, >= 20 clicks perdidos y prev >= 50. Causa: pos +2 o peor -> ranking;
 * impresiones <= -30% con posicion estable -> demand; CTR <= -20% con posicion estable -> snippet.
 */
export function contentDecay(
  prev: readonly PageRow[],
  now: readonly PageRow[],
  opts: { minPrevClicks?: number; minDropPct?: number; minLost?: number; positionWorse?: number } = {},
): DecayItem[] {
  const { minPrevClicks = 50, minDropPct = 0.3, minLost = 20, positionWorse = 2 } = opts;
  const nowByKey = new Map<string, PageRow>();
  for (const r of now) {
    const k = pageKey(r.page);
    const e = nowByKey.get(k);
    nowByKey.set(k, e ? mergePage(e, r) : r);
  }
  const out: DecayItem[] = [];
  for (const p of mergePages(prev)) {
    if (p.clicks < minPrevClicks) continue;
    const n = nowByKey.get(pageKey(p.page));
    const clicksNow = n?.clicks ?? 0;
    const lost = p.clicks - clicksNow;
    if (lost < minLost || lost / p.clicks < minDropPct) continue;
    let cause: DecayCause;
    if (!n || n.impressions === 0) cause = "disappeared";
    else {
      const posDelta = n.position - p.position;
      const imprDelta = (n.impressions - p.impressions) / p.impressions;
      const ctrDelta = ctrOf(p) > 0 ? (ctrOf(n) - ctrOf(p)) / ctrOf(p) : 0;
      if (posDelta >= positionWorse) cause = "ranking";
      else if (imprDelta <= -0.3) cause = "demand";
      else if (ctrDelta <= -0.2) cause = "snippet";
      else cause = "mixed";
    }
    out.push({
      page: p.page,
      clicks_prev: p.clicks,
      clicks_now: clicksNow,
      delta_pct: round(-lost / p.clicks, 3),
      position_prev: round(p.position, 1),
      position_now: n ? round(n.position, 1) : null,
      impressions_prev: p.impressions,
      impressions_now: n?.impressions ?? 0,
      cause,
    });
  }
  return out.sort((a, b) => b.clicks_prev - b.clicks_now - (a.clicks_prev - a.clicks_now));
}

const pageKey = (page: string): string => normalizeUrl(page)?.key ?? page;

function mergePage(a: PageRow, b: PageRow): PageRow {
  return {
    page: a.clicks >= b.clicks ? a.page : b.page,
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
    position: weightedPosition([a, b]),
  };
}

function mergePages(rows: readonly PageRow[]): PageRow[] {
  const m = new Map<string, PageRow>();
  for (const r of rows) {
    const k = pageKey(r.page);
    const e = m.get(k);
    m.set(k, e ? mergePage(e, r) : r);
  }
  return [...m.values()];
}

export interface LostQuery {
  query: string;
  clicks_lost: number;
}

/** Queries que mas clicks perdio cada pagina (query x page de ambos periodos). */
export function lostQueries(
  prev: readonly QueryPageRow[],
  now: readonly QueryPageRow[],
  pages: readonly string[],
  topN = 3,
): Map<string, LostQuery[]> {
  const wanted = new Set(pages.map(pageKey));
  const cur = new Map<string, number>();
  for (const r of now) cur.set(`${pageKey(r.page)}\u0000${r.query}`, (cur.get(`${pageKey(r.page)}\u0000${r.query}`) ?? 0) + r.clicks);
  const lost = new Map<string, Map<string, number>>();
  for (const r of prev) {
    const pk = pageKey(r.page);
    if (!wanted.has(pk)) continue;
    const m = lost.get(pk) ?? new Map<string, number>();
    m.set(r.query, (m.get(r.query) ?? 0) + r.clicks);
    lost.set(pk, m);
  }
  const out = new Map<string, LostQuery[]>();
  for (const [pk, queries] of lost) {
    const list = [...queries.entries()]
      .map(([query, c]) => ({ query, clicks_lost: c - (cur.get(`${pk}\u0000${query}`) ?? 0) }))
      .filter((q) => q.clicks_lost > 0)
      .sort((a, b) => b.clicks_lost - a.clicks_lost)
      .slice(0, topN);
    out.set(pk, list);
  }
  return out;
}

export { pageKey };

// --- Canibalizacion ------------------------------------------------------------------------------

export interface CannibalUrl {
  page: string;
  clicks: number;
  impressions: number;
  share: number;
  position: number;
}

export interface CannibalItem {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  urls: CannibalUrl[];
  suggested_primary: string;
}

/** >= 2 URLs con >= 10% de las impresiones de la query, >= 10 clicks combinados, pos <= 30, sin home. */
export function cannibalization(
  rows: readonly QueryPageRow[],
  opts: { minShare?: number; minClicks?: number; maxPosition?: number; maxUrls?: number } = {},
): CannibalItem[] {
  const { minShare = 0.1, minClicks = 10, maxPosition = 30, maxUrls = 3 } = opts;
  const byQuery = new Map<string, QueryPageRow[]>();
  for (const r of rows) {
    if (normalizeUrl(r.page)?.path === "/") continue;
    const g = byQuery.get(r.query);
    if (g) g.push(r);
    else byQuery.set(r.query, [r]);
  }
  const out: CannibalItem[] = [];
  for (const [query, g] of byQuery) {
    if (g.length < 2) continue;
    const total = g.reduce((n, r) => n + r.impressions, 0);
    if (total === 0) continue;
    const urls = g
      .map((r) => ({ ...r, share: r.impressions / total }))
      .filter((r) => r.share >= minShare)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    if (urls.length < 2) continue;
    const clicks = urls.reduce((n, r) => n + r.clicks, 0);
    const position = weightedPosition(urls);
    if (clicks < minClicks || position > maxPosition) continue;
    out.push({
      query,
      impressions: urls.reduce((n, r) => n + r.impressions, 0),
      clicks,
      position: round(position, 1),
      urls: urls.slice(0, maxUrls).map((u) => ({
        page: u.page,
        clicks: u.clicks,
        impressions: u.impressions,
        share: round(u.share, 3),
        position: round(u.position, 1),
      })),
      suggested_primary: urls[0]!.page,
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

// --- Join GSC <-> GA4 ----------------------------------------------------------------------------

export interface Ga4LandingRow {
  hostName: string;
  landingPagePlusQueryString: string;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
  revenue: number;
}

export interface LandingItem {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
  sessions: number | null;
  engagement_rate: number | null;
  key_events: number | null;
  key_event_rate: number | null;
  revenue: number | null;
  sessions_per_click: number | null;
  top_queries?: Array<{ query: string; clicks: number }>;
  flags: Array<"no_convierte" | "empujar_seo" | "tracking_mismatch" | "sin_match_ga4">;
}

export interface LandingJoin {
  items: LandingItem[];
  /** Clicks de GSC cuya pagina tiene fila en GA4 / clicks totales de GSC (0-1). */
  match_rate: number;
  /** Sesiones de GA4 (en el sitio) asignadas a una pagina de GSC / sesiones totales (0-1). */
  ga4_match_rate: number;
  median_key_event_rate: number | null;
  unmatched_gsc: Array<{ url: string; clicks: number }>;
  unmatched_ga4: Array<{ url: string; sessions: number }>;
  /** Filas de GA4 descartadas por ser de otro host/ruta que la propiedad de GSC, o sin URL ((not set)). */
  ga4_rows_out_of_scope: number;
}

interface Acc {
  sessions: number;
  engaged: number;
  keyEvents: number;
  revenue: number;
  label: string;
}

export interface JoinOpts extends UrlOptions {
  minClicks?: number;
  /** Rango aceptable de sessions/clicks. */
  sessionsPerClick?: readonly [number, number];
}

/**
 * Une GSC (page, URL completa) con GA4 (hostName + landingPagePlusQueryString) por clave normalizada
 * (`normalizeUrl`). Varias filas que colapsan a la misma clave se suman. `queries` = filas query x page.
 */
export function joinLandings(
  scope: SiteScope,
  gscPages: readonly PageRow[],
  ga4: readonly Ga4LandingRow[],
  queries: readonly QueryPageRow[] = [],
  opts: JoinOpts = {},
): LandingJoin {
  const { minClicks = 100, sessionsPerClick = [0.5, 1.5] } = opts;

  const ga = new Map<string, Acc>();
  let outOfScope = 0;
  for (const r of ga4) {
    const n = normalizeUrl(r.landingPagePlusQueryString, opts, r.hostName);
    if (!n || !inScope(scope, n)) {
      outOfScope++;
      continue;
    }
    const e = ga.get(n.key) ?? { sessions: 0, engaged: 0, keyEvents: 0, revenue: 0, label: n.path };
    e.sessions += r.sessions;
    e.engaged += r.engagedSessions;
    e.keyEvents += r.keyEvents;
    e.revenue += r.revenue;
    ga.set(n.key, e);
  }

  const gsc = new Map<string, PageRow & { key: string }>();
  for (const p of gscPages) {
    const n = normalizeUrl(p.page, opts);
    if (!n) continue;
    const e = gsc.get(n.key);
    gsc.set(n.key, e ? { ...mergePage(e, p), key: n.key } : { ...p, key: n.key });
  }

  const topQ = new Map<string, Map<string, number>>();
  for (const q of queries) {
    const n = normalizeUrl(q.page, opts);
    if (!n) continue;
    const m = topQ.get(n.key) ?? new Map<string, number>();
    m.set(q.query, (m.get(q.query) ?? 0) + q.clicks);
    topQ.set(n.key, m);
  }

  const matchedRates: number[] = [];
  const rateOf = (a: Acc) => (a.sessions > 0 ? a.keyEvents / a.sessions : 0);
  for (const [key, p] of gsc) {
    const a = ga.get(key);
    if (a && p.clicks >= minClicks) matchedRates.push(rateOf(a));
  }
  const med = median(matchedRates);
  const hasConversions = med !== undefined && [...ga.values()].some((a) => a.keyEvents > 0);

  let totalClicks = 0;
  let matchedClicks = 0;
  const items: LandingItem[] = [];
  const unmatchedGsc: Array<{ url: string; clicks: number }> = [];
  for (const [key, p] of gsc) {
    totalClicks += p.clicks;
    const a = ga.get(key);
    const queriesTop = [...(topQ.get(key) ?? [])].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([query, clicks]) => ({ query, clicks }));
    const item: LandingItem = {
      url: p.page,
      clicks: p.clicks,
      impressions: p.impressions,
      position: round(p.position, 1),
      sessions: null,
      engagement_rate: null,
      key_events: null,
      key_event_rate: null,
      revenue: null,
      sessions_per_click: null,
      ...(topQ.size > 0 ? { top_queries: queriesTop } : {}),
      flags: [],
    };
    if (!a) {
      item.flags.push("sin_match_ga4");
      unmatchedGsc.push({ url: p.page, clicks: p.clicks });
    } else {
      matchedClicks += p.clicks;
      const rate = rateOf(a);
      item.sessions = a.sessions;
      item.engagement_rate = a.sessions > 0 ? round(a.engaged / a.sessions, 3) : null;
      item.key_events = a.keyEvents;
      item.key_event_rate = round(rate, 4);
      item.revenue = a.revenue > 0 ? round(a.revenue, 2) : null;
      item.sessions_per_click = p.clicks > 0 ? round(a.sessions / p.clicks, 2) : null;
      if (p.clicks >= minClicks) {
        const ratio = a.sessions / p.clicks;
        if (ratio < sessionsPerClick[0] || ratio > sessionsPerClick[1]) item.flags.push("tracking_mismatch");
        if (hasConversions && med! > 0) {
          if (rate < 0.5 * med!) item.flags.push("no_convierte");
          else if (rate >= 2 * med! && p.position > 5) item.flags.push("empujar_seo");
        }
      }
    }
    items.push(item);
  }

  let totalSessions = 0;
  let matchedSessions = 0;
  const unmatchedGa4: Array<{ url: string; sessions: number }> = [];
  for (const [key, a] of ga) {
    totalSessions += a.sessions;
    if (gsc.has(key)) matchedSessions += a.sessions;
    else unmatchedGa4.push({ url: a.label, sessions: a.sessions });
  }

  return {
    items: items.sort((a, b) => b.clicks - a.clicks),
    match_rate: totalClicks > 0 ? round(matchedClicks / totalClicks, 3) : 0,
    ga4_match_rate: totalSessions > 0 ? round(matchedSessions / totalSessions, 3) : 0,
    median_key_event_rate: med === undefined ? null : round(med, 4),
    unmatched_gsc: unmatchedGsc.sort((a, b) => b.clicks - a.clicks).slice(0, 5),
    unmatched_ga4: unmatchedGa4.sort((a, b) => b.sessions - a.sessions).slice(0, 5),
    ga4_rows_out_of_scope: outOfScope,
  };
}
