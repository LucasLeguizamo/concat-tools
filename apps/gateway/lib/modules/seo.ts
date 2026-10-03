// Workflows SEO v1.1 (alto nivel sobre GSC + GA4). Viven en el modulo `gsc` (se exponen como `gsc_*`):
// asi heredan visibilidad (solo si GSC esta conectado), rate limit y manejo de errores del modulo.
// La logica de calculo es pura y esta en ../seo/*; aqui solo hay I/O contra Google y la definicion de tools.
import { z } from "zod";
import { cannibalization, aggregateQueries, contentDecay, ctrGaps, joinLandings, lostQueries, pageKey, strikingDistance, zeroClick } from "../seo/workflows";
import type { Ga4LandingRow, PageRow, QueryPageRow } from "../seo/workflows";
import { buildCtrCurve } from "../seo/stats";
import { normalizeUrl, parseSite } from "../seo/url";
import { ga4Module } from "./ga4";
import { ActionableException, connectUrl, GoogleApiError, googleFetch } from "./errors";
import type { ToolContext, ToolDef, ToolResult } from "./types";
import { asArray, asNumber, asRecord, asString, dayRange } from "./util";

const GSC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const GA4_DATA = "https://analyticsdata.googleapis.com/v1beta";

/** Igual que gsc.ts: datos `final` llevan ~3 dias de retraso. (No se importa de gsc.ts: gsc.ts importa este archivo.) */
const FINAL_DATA_LAG_DAYS = 3;
/** Limite de Search Analytics por request (doc oficial: rowLimit 1-25.000). */
const GSC_PAGE_SIZE = 25_000;
/** GA4 runReport admite hasta 250.000 filas por request; se pide menos para acotar respuesta y cuota. */
const GA4_PAGE_SIZE = 25_000;
const GA4_MAX_ROWS = 100_000;
const ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

// --- Schemas -------------------------------------------------------------------------------------

// Copia de siteSchema de gsc.ts (mismo motivo: dependencia circular).
const site = z
  .string()
  .min(1)
  .max(2048)
  .refine((s) => /^(sc-domain:[^\s/]+|https?:\/\/\S+)$/.test(s), {
    message: "site debe ser `sc-domain:dominio.com` o una URL `https://dominio.com/` (son propiedades distintas)",
  })
  .describe("Propiedad de Search Console exacta: `sc-domain:dominio.com` o `https://dominio.com/`");

const noControl = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);

const listing = {
  limit: z.number().int().min(1).max(100).default(20).describe("Filas por respuesta (por defecto 20, maximo 100)"),
  cursor: z.string().regex(/^\d{1,6}$/).optional().describe("`meta.next_cursor` de la respuesta anterior"),
};

const gscCommon = {
  site,
  days: z.number().int().min(1).max(240).default(28).describe("Ultimos N dias (con ~3 dias de retraso). Por defecto 28"),
  brand_regex: z
    .string()
    .max(200)
    .refine(noControl, "brand_regex no admite caracteres de control")
    .optional()
    .describe("Regex RE2 de marca, p. ej. `concat|onconcat`. Se excluye de las queries en Google (no se ejecuta aqui)"),
  page_contains: z.string().max(200).refine(noControl, "page_contains no admite caracteres de control").optional().describe("Solo paginas cuya URL contiene este texto (p. ej. `/blog/`)"),
  max_rows: z
    .number()
    .int()
    .min(1000)
    .max(100_000)
    .default(25_000)
    .describe("Filas maximas a leer de Search Console (por defecto 25000 = 1 request; ordenadas por clicks)"),
  ...listing,
};

// --- Helpers de salida ---------------------------------------------------------------------------

function paginate<T>(items: readonly T[], limit: number, cursor: string | undefined) {
  const offset = cursor ? Number(cursor) : 0;
  const page = items.slice(offset, offset + limit);
  return { page, total: items.length, next: offset + limit < items.length ? String(offset + limit) : null };
}

const FINAL_WARNING = `dataState=final: los ultimos ~${FINAL_DATA_LAG_DAYS} dias aun no estan consolidados y se excluyen.`;

function result(
  data: Record<string, unknown>,
  range: [string, string],
  next: string | null,
  warnings: string[],
): ToolResult {
  return { data, meta: { module: "gsc", range, next_cursor: next, warnings } };
}

// --- Search Analytics ----------------------------------------------------------------------------

interface GscFilter {
  dimension: "query" | "page";
  operator: "contains" | "includingRegex" | "excludingRegex";
  expression: string;
}

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

interface Fetched<T> {
  rows: T[];
  /** Se alcanzo max_rows con la ultima pagina llena: puede haber mas filas (cola larga). */
  truncated: boolean;
}

function filtersOf(args: { brand_regex?: string; page_contains?: string }): GscFilter[] {
  return [
    ...(args.brand_regex ? [{ dimension: "query" as const, operator: "excludingRegex" as const, expression: args.brand_regex }] : []),
    ...(args.page_contains ? [{ dimension: "page" as const, operator: "contains" as const, expression: args.page_contains }] : []),
  ];
}

/** Search Analytics paginado (startRow + rowLimit 25.000) hasta `maxRows`. */
async function searchAnalytics(
  ctx: ToolContext,
  siteUrl: string,
  range: [string, string],
  dimensions: Array<"query" | "page">,
  filters: GscFilter[],
  maxRows: number,
): Promise<Fetched<GscRow>> {
  const token = await ctx.getAccessToken();
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows: GscRow[] = [];
  let truncated = false;
  while (rows.length < maxRows) {
    const rowLimit = Math.min(GSC_PAGE_SIZE, maxRows - rows.length);
    let body: Record<string, unknown>;
    try {
      body = asRecord(
        await googleFetch(url, token, {
          method: "POST",
          body: {
            startDate: range[0],
            endDate: range[1],
            dimensions,
            ...(filters.length ? { dimensionFilterGroups: [{ groupType: "and", filters }] } : {}),
            rowLimit,
            startRow: rows.length,
            dataState: "final",
          },
        }),
      );
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 400) {
        throw new ActionableException({
          error: "invalid_argument",
          module: "gsc",
          message: `Search Console rechazo la consulta: ${e.safe.message}`,
          fix: "Revisa brand_regex (sintaxis RE2), page_contains y el rango de dias (maximo ~16 meses de historia).",
          next_action: "none",
        });
      }
      throw e;
    }
    const batch = asArray(body.rows).map((raw) => {
      const r = asRecord(raw);
      return {
        keys: asArray(r.keys).map((k) => asString(k) ?? ""),
        clicks: asNumber(r.clicks) ?? 0,
        impressions: asNumber(r.impressions) ?? 0,
        position: asNumber(r.position) ?? 0,
      };
    });
    rows.push(...batch);
    if (batch.length < rowLimit) break;
    if (rows.length >= maxRows) truncated = true;
  }
  return { rows, truncated };
}

const toQueryPage = (r: GscRow): QueryPageRow => ({ query: r.keys[0] ?? "", page: r.keys[1] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position });
const toPage = (r: GscRow): PageRow => ({ page: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position });

const truncationWarning = (maxRows: number) =>
  `Se leyeron ${maxRows} filas (ordenadas por clicks): la cola larga de baja demanda puede faltar. Sube max_rows (hasta 100000) o acota con page_contains/days.`;

const NO_BRAND_WARNING = "Sin brand_regex: las queries de marca no se excluyen y pueden inflar clicks/CTR. Pasa brand_regex (p. ej. `marca|marca.com`).";

const ANON_WARNING = "Search Console omite queries anonimizadas: los totales por query no suman el total de la propiedad.";

type CommonArgs = z.infer<z.ZodObject<typeof gscCommon>>;

/** Descarga query x page, agrega por query y construye la curva de CTR del propio sitio. */
async function loadQueryAggs(ctx: ToolContext, args: CommonArgs) {
  const range = dayRange(args.days, FINAL_DATA_LAG_DAYS);
  const { rows, truncated } = await searchAnalytics(ctx, args.site, range, ["query", "page"], filtersOf(args), args.max_rows);
  const aggs = aggregateQueries(rows.map(toQueryPage));
  const curve = buildCtrCurve(aggs);
  const warnings = [FINAL_WARNING, ANON_WARNING];
  if (!args.brand_regex) warnings.push(NO_BRAND_WARNING);
  if (truncated) warnings.push(truncationWarning(args.max_rows));
  if (curve.fallback.length > 0) {
    warnings.push(`Curva de CTR: poca muestra en los tramos ${curve.fallback.join(", ")}; se uso una curva por defecto conservadora en ellos.`);
  }
  return { range, aggs, curve, warnings };
}

// --- Tools GSC (una sola fuente) -----------------------------------------------------------------

const strikingSchema = z.object(gscCommon);
const strikingTool: ToolDef<typeof strikingSchema> = {
  name: "gsc_striking_distance",
  title: "SEO: striking distance",
  description:
    "Queries en posicion 8-20 con >=100 impresiones (una pagina por query) ordenadas por clicks potenciales si subieran a la posicion 3 (CTR esperado del propio sitio). Usa brand_regex para excluir marca.",
  inputSchema: strikingSchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const { range, aggs, curve, warnings } = await loadQueryAggs(ctx, args);
    const all = strikingDistance(aggs, curve);
    const p = paginate(all, args.limit, args.cursor);
    return result({ total: p.total, items: p.page }, range, p.next, warnings);
  },
};

const ctrSchema = z.object(gscCommon);
const ctrGapsTool: ToolDef<typeof ctrSchema> = {
  name: "gsc_ctr_gaps",
  title: "SEO: brechas de CTR",
  description:
    "Queries en posicion <=10 con >=500 impresiones y CTR < 0.6x el esperado segun la curva de CTR del propio sitio (no curvas genericas). Sugiere reescribir title/snippet.",
  inputSchema: ctrSchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const { range, aggs, curve, warnings } = await loadQueryAggs(ctx, args);
    const p = paginate(ctrGaps(aggs, curve), args.limit, args.cursor);
    return result({ total: p.total, items: p.page }, range, p.next, warnings);
  },
};

const zeroSchema = z.object(gscCommon);
const zeroClickTool: ToolDef<typeof zeroSchema> = {
  name: "gsc_zero_click",
  title: "SEO: impresiones sin clicks",
  description:
    "Queries con >=500 impresiones y 0 clicks. cause=snippet (posicion <=10: titulo/intencion/AI Overview) o ranking (posicion >10). Indica donde hay demanda sin trafico.",
  inputSchema: zeroSchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const { range, aggs, warnings } = await loadQueryAggs(ctx, args);
    const p = paginate(zeroClick(aggs), args.limit, args.cursor);
    return result({ total: p.total, items: p.page }, range, p.next, warnings);
  },
};

const cannibalSchema = z.object(gscCommon);
const cannibalTool: ToolDef<typeof cannibalSchema> = {
  name: "gsc_cannibalization",
  title: "SEO: canibalizacion",
  description:
    "Queries donde >=2 URLs tienen >=10% de las impresiones cada una (>=10 clicks combinados, posicion <=30, sin home). Sugiere la URL principal (mas clicks).",
  inputSchema: cannibalSchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const range = dayRange(args.days, FINAL_DATA_LAG_DAYS);
    const { rows, truncated } = await searchAnalytics(ctx, args.site, range, ["query", "page"], filtersOf(args), args.max_rows);
    const warnings = [FINAL_WARNING, ANON_WARNING];
    if (!args.brand_regex) warnings.push(NO_BRAND_WARNING);
    if (truncated) warnings.push(truncationWarning(args.max_rows));
    const p = paginate(cannibalization(rows.map(toQueryPage)), args.limit, args.cursor);
    return result({ total: p.total, items: p.page }, range, p.next, warnings);
  },
};

const decaySchema = z.object({
  ...gscCommon,
  days: z.number().int().min(7).max(240).default(90).describe("Longitud de cada periodo (por defecto 90): se compara con los N dias anteriores"),
  with_queries: z.boolean().default(true).describe("Incluir las queries que mas clicks perdio cada pagina (2 requests extra)"),
});
const decayTool: ToolDef<typeof decaySchema> = {
  name: "gsc_content_decay",
  title: "SEO: paginas que pierden trafico",
  description:
    "Paginas con caida de clicks >=30% (y >=20 clicks perdidos, >=50 en el periodo previo) frente a los N dias anteriores. cause: ranking (posicion +2 o peor), demand (impresiones -30% con posicion estable), snippet (CTR cae con posicion estable), disappeared, mixed.",
  inputSchema: decaySchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const now = dayRange(args.days, FINAL_DATA_LAG_DAYS);
    const prev = dayRange(args.days, FINAL_DATA_LAG_DAYS + args.days);
    const filters = filtersOf(args);
    const cur = await searchAnalytics(ctx, args.site, now, ["page"], filters, args.max_rows);
    const before = await searchAnalytics(ctx, args.site, prev, ["page"], filters, args.max_rows);
    const warnings = [FINAL_WARNING, `Comparacion ${prev[0]}..${prev[1]} vs ${now[0]}..${now[1]}. No cubre estacionalidad (YoY no incluido).`];
    if (cur.truncated || before.truncated) warnings.push(truncationWarning(args.max_rows));
    const all = contentDecay(before.rows.map(toPage), cur.rows.map(toPage));
    const p = paginate(all, args.limit, args.cursor);

    let items: unknown[] = p.page;
    if (args.with_queries && p.page.length > 0) {
      const qNow = await searchAnalytics(ctx, args.site, now, ["query", "page"], filters, args.max_rows);
      const qPrev = await searchAnalytics(ctx, args.site, prev, ["query", "page"], filters, args.max_rows);
      if (qNow.truncated || qPrev.truncated) warnings.push("lost_queries calculado con filas truncadas por max_rows: puede ser incompleto.");
      const lost = lostQueries(qPrev.rows.map(toQueryPage), qNow.rows.map(toQueryPage), p.page.map((i) => i.page));
      items = p.page.map((i) => ({ ...i, lost_queries: lost.get(pageKey(i.page)) ?? [] }));
    }
    return result({ total: p.total, items }, now, p.next, warnings);
  },
};

// --- Join GSC <-> GA4 ----------------------------------------------------------------------------

const ga4Property = z
  .string()
  .regex(/^(properties\/)?\d{1,20}$/, "ga4_property debe ser el id numerico de la propiedad GA4 (p. ej. 123456789)")
  .describe("Id numerico de la propiedad GA4 (ver ga4_list_properties)");

const landingSchema = z.object({
  site,
  ga4_property: ga4Property,
  days: z.number().int().min(1).max(240).default(28),
  url: z.string().max(2048).optional().describe("Solo esta URL (cualquier variante http/https, www, slash final o parametros)"),
  keep_params: z.array(z.string().min(1).max(64)).max(10).default([]).describe("Parametros de query que SI distinguen paginas (p. ej. `page`). El resto se descarta al unir"),
  with_queries: z.boolean().default(true).describe("Incluir top 3 queries por landing"),
  ...listing,
});

/** GA4 no conectado -> ActionableError con enlace, sin tocar el estado de GSC. */
async function ga4Token(ctx: ToolContext): Promise<string> {
  if (!ctx.getAccessTokenFor) throw new Error("contexto de tool sin acceso a otros modulos");
  try {
    return await ctx.getAccessTokenFor("ga4");
  } catch (e) {
    if (e instanceof ActionableException && e.actionable.error === "scope_lost") {
      throw new ActionableException({
        error: "module_required",
        module: "ga4",
        message: "Esta herramienta cruza Search Console con GA4 y el modulo ga4 no esta conectado.",
        fix: "Conecta GA4 con el enlace indicado y vuelve a ejecutar la herramienta.",
        next_action: "connect_module",
        url: connectUrl("ga4"),
      });
    }
    throw e;
  }
}

const ORGANIC_GOOGLE = {
  andGroup: {
    expressions: [
      { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
      { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "google" } } },
    ],
  },
};

/** Landings organicas de Google en GA4 (hostName x landingPagePlusQueryString), paginado con offset. */
async function ga4Landings(token: string, property: string, range: [string, string]) {
  const rows: Ga4LandingRow[] = [];
  const warnings: string[] = [];
  let total = Infinity;
  let first = true;
  while (rows.length < Math.min(total, GA4_MAX_ROWS)) {
    let body: Record<string, unknown>;
    try {
      body = asRecord(
        await googleFetch(`${GA4_DATA}/properties/${property}:runReport`, token, {
          method: "POST",
          body: {
            dateRanges: [{ startDate: range[0], endDate: range[1] }],
            dimensions: [{ name: "hostName" }, { name: "landingPagePlusQueryString" }],
            metrics: ["sessions", "engagedSessions", "keyEvents", "totalRevenue"].map((name) => ({ name })),
            dimensionFilter: ORGANIC_GOOGLE,
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            limit: String(GA4_PAGE_SIZE),
            offset: String(rows.length),
          },
        }),
      );
    } catch (e) {
      if (e instanceof GoogleApiError) {
        e.resource = property;
        // Los errores de GA4 se explican con el modulo ga4 (no con el texto de Search Console).
        const a = ga4Module.explainError(e);
        // `scope_lost` marcaria como perdido el modulo gsc (markModuleFailure usa el modulo de la tool): se renombra.
        throw new ActionableException(a.error === "scope_lost" ? { ...a, error: "module_required" } : a);
      }
      throw e;
    }
    const batch = asArray(body.rows).map((raw) => {
      const r = asRecord(raw);
      const d = asArray(r.dimensionValues).map((v) => asString(asRecord(v).value) ?? "");
      const m = asArray(r.metricValues).map((v) => asNumber(asRecord(v).value) ?? 0);
      return { hostName: d[0] ?? "", landingPagePlusQueryString: d[1] ?? "", sessions: m[0] ?? 0, engagedSessions: m[1] ?? 0, keyEvents: m[2] ?? 0, revenue: m[3] ?? 0 };
    });
    rows.push(...batch);
    if (first) {
      first = false;
      total = asNumber(body.rowCount) ?? batch.length;
      const md = asRecord(body.metadata);
      if (md.subjectToThresholding === true) warnings.push("GA4: subjectToThresholding=true: Google omitio datos por umbrales de privacidad; sesiones/eventos pueden ser menores.");
      const s = asArray(md.samplingMetadatas);
      if (s.length > 0) {
        const m = asRecord(s[0]);
        warnings.push(`GA4: muestreo aplicado (${asString(m.samplesReadCount) ?? "?"} de ${asString(m.samplingSpaceSize) ?? "?"} eventos leidos).`);
      }
      if (md.dataLossFromOtherRow === true) warnings.push("GA4: dataLossFromOtherRow=true: hay filas agrupadas en (other).");
    }
    if (batch.length === 0) break;
  }
  if (rows.length < total) warnings.push(`GA4: se leyeron ${rows.length} de ${total} landings (tope ${GA4_MAX_ROWS}); las de menos sesiones quedan fuera.`);
  return { rows, warnings };
}

const landingTool: ToolDef<typeof landingSchema> = {
  name: "gsc_landing_conversions",
  title: "SEO: landings GSC + GA4 (query -> landing -> conversion)",
  description:
    "Une Search Console y GA4 por landing: clicks/posicion/top queries (GSC) + sesiones organicas de Google, engagement, key events y revenue (GA4). Une por URL normalizada y reporta match_rate. Flags: no_convierte, empujar_seo, tracking_mismatch. Requiere los modulos gsc y ga4 conectados.",
  inputSchema: landingSchema,
  annotations: ANNOTATIONS,
  async handler(ctx, args) {
    const scope = parseSite(args.site);
    if (!scope) throw new Error("site invalido");
    const property = args.ga4_property.replace(/^properties\//, "");
    const range = dayRange(args.days, FINAL_DATA_LAG_DAYS);
    const opts = { keepParams: args.keep_params };

    const ga4Tok = await ga4Token(ctx); // falla rapido antes de gastar cuota de GSC
    const pages = await searchAnalytics(ctx, args.site, range, ["page"], [], 25_000);
    const queries = args.with_queries ? await searchAnalytics(ctx, args.site, range, ["query", "page"], [], 25_000) : undefined;
    const ga = await ga4Landings(ga4Tok, property, range);

    const pageRows = pages.rows.map(toPage);
    const joined = joinLandings(scope, pageRows, ga.rows, queries?.rows.map(toQueryPage), opts);

    const warnings = [
      FINAL_WARNING,
      "Fechas: GSC usa hora del Pacifico y GA4 la zona horaria de la propiedad; el ultimo dia puede no coincidir.",
      "GSC cuenta solo busqueda web de Google; GA4 se filtra a Organic Search + source google (excluye Discover/News si estan en otros canales).",
      ...ga.warnings,
    ];
    if (pages.truncated) warnings.push("GSC: mas de 25000 paginas; las de menos clicks quedan fuera.");
    if (queries?.truncated) warnings.push("top_queries calculado con las primeras 25000 filas query x page; puede faltar cola larga.");
    if (queries && pages.rows.length > 0) {
      const qClicks = queries.rows.reduce((n, r) => n + r.clicks, 0);
      const pClicks = pages.rows.reduce((n, r) => n + r.clicks, 0);
      if (pClicks > 0 && qClicks / pClicks < 0.8) warnings.push(`Queries anonimizadas: top_queries cubre ${Math.round((100 * qClicks) / pClicks)}% de los clicks.`);
    }
    if (joined.median_key_event_rate === 0) warnings.push("GA4: mediana de key events = 0; sin key events configurados no se calculan flags de conversion.");
    if (joined.match_rate < 0.8) warnings.push(`match_rate bajo (${joined.match_rate}): revisa unmatched_gsc/unmatched_ga4, host o keep_params.`);
    if (joined.ga4_rows_out_of_scope > 0) warnings.push(`GA4: ${joined.ga4_rows_out_of_scope} filas descartadas (otro host/ruta que la propiedad de GSC o (not set)).`);

    let items = joined.items;
    if (args.url) {
      const want = normalizeUrl(args.url, opts)?.key;
      items = want ? items.filter((i) => normalizeUrl(i.url, opts)?.key === want) : [];
      if (items.length === 0) warnings.push("url sin filas en GSC para este rango.");
    }
    const p = paginate(items, args.limit, args.cursor);
    return result(
      {
        match_rate: joined.match_rate,
        ga4_match_rate: joined.ga4_match_rate,
        median_key_event_rate: joined.median_key_event_rate,
        total: p.total,
        items: p.page,
        unmatched_gsc: joined.unmatched_gsc,
        unmatched_ga4: joined.unmatched_ga4,
      },
      range,
      p.next,
      warnings,
    );
  },
};

export const seoTools = [strikingTool, ctrGapsTool, zeroClickTool, cannibalTool, decayTool, landingTool] as ToolDef[];
