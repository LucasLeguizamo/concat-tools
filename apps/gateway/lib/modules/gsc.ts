import { z } from "zod";
import {
  ActionableException,
  classifyGoogleError,
  commonActionable,
  googleFetch,
  NoResourcesError,
  scopeLostActionable,
} from "./errors";
import type { ActionableError, Module, ProbeResult, ToolContext, ToolDef, ToolResult } from "./types";
import { asArray, asNumber, asRecord, asString, dayRange, round } from "./util";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const BASE = "https://searchconsole.googleapis.com/webmasters/v3";

const SITE_NOTE = "Ojo: `sc-domain:dominio` y `https://dominio/` son propiedades distintas.";
const USERS_PATH = `Search Console → Configuración → Usuarios y permisos. ${SITE_NOTE}`;

/** Datos `final` de GSC llevan ~2-3 dias de retraso: el rango termina 3 dias antes de hoy. */
const FINAL_DATA_LAG_DAYS = 3;

const siteSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((s) => /^(sc-domain:[^\s/]+|https?:\/\/\S+)$/.test(s), {
    message: "site debe ser `sc-domain:dominio.com` o una URL `https://dominio.com/` (son propiedades distintas)",
  })
  .describe("Propiedad de Search Console exacta: `sc-domain:dominio.com` o `https://dominio.com/`");

async function listSites(ctx: ToolContext): Promise<Array<{ site: string; permission_level: string }>> {
  const body = asRecord(await googleFetch(`${BASE}/sites`, await ctx.getAccessToken()));
  return asArray(body.siteEntry).map((e) => {
    const r = asRecord(e);
    return { site: asString(r.siteUrl) ?? "", permission_level: asString(r.permissionLevel) ?? "unknown" };
  });
}

const listSitesTool = {
  name: "gsc_list_sites",
  title: "Search Console: listar sitios",
  description: "Lista las propiedades de Search Console a las que tiene acceso el usuario y su nivel de permiso.",
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(ctx: ToolContext): Promise<ToolResult> {
    const sites = await listSites(ctx);
    return { data: sites, meta: { module: "gsc", next_cursor: null, warnings: [] } };
  },
} satisfies ToolDef;

const performanceSchema = z.object({
  site: siteSchema,
  by: z.enum(["query", "page", "country", "device"]).default("query").describe("Dimension de agrupacion"),
  days: z.number().int().min(1).max(486).default(28).describe("Ultimos N dias (por defecto 28)"),
  limit: z.number().int().min(1).max(1000).default(50).describe("Maximo de filas (por defecto 50, maximo 1000)"),
});

const performanceTool: ToolDef<typeof performanceSchema> = {
  name: "gsc_performance",
  title: "Search Console: rendimiento",
  description:
    "Clicks, impresiones, CTR y posicion media agrupados por query, page, country o device. Datos finales (dataState=final): terminan ~3 dias antes de hoy.",
  inputSchema: performanceSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(ctx, args): Promise<ToolResult> {
    const [startDate, endDate] = dayRange(args.days, FINAL_DATA_LAG_DAYS);
    const body = asRecord(
      await googleFetch(`${BASE}/sites/${encodeURIComponent(args.site)}/searchAnalytics/query`, await ctx.getAccessToken(), {
        method: "POST",
        body: { startDate, endDate, dimensions: [args.by], rowLimit: args.limit, dataState: "final" },
      }),
    );
    const rows = asArray(body.rows).map((raw) => {
      const r = asRecord(raw);
      return {
        [args.by]: asString(asArray(r.keys)[0]) ?? "",
        clicks: asNumber(r.clicks) ?? 0,
        impressions: asNumber(r.impressions) ?? 0,
        ctr: round(asNumber(r.ctr) ?? 0, 4),
        position: round(asNumber(r.position) ?? 0, 1),
      };
    });
    const warnings = [`dataState=final: los ultimos ~${FINAL_DATA_LAG_DAYS} dias aun no estan consolidados y se excluyen.`];
    if (rows.length === args.limit) warnings.push(`Se alcanzo limit=${args.limit}; puede haber mas filas.`);
    return { data: rows, meta: { module: "gsc", range: [startDate, endDate], next_cursor: null, warnings } };
  },
};

const sitemapsSchema = z.object({ site: siteSchema });

const listSitemapsTool: ToolDef<typeof sitemapsSchema> = {
  name: "gsc_list_sitemaps",
  title: "Search Console: listar sitemaps",
  description: "Sitemaps de una propiedad con ultimo envio, ultima descarga, errores y avisos.",
  inputSchema: sitemapsSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(ctx, args): Promise<ToolResult> {
    const body = asRecord(
      await googleFetch(`${BASE}/sites/${encodeURIComponent(args.site)}/sitemaps`, await ctx.getAccessToken()),
    );
    const data = asArray(body.sitemap).map((raw) => {
      const r = asRecord(raw);
      return {
        path: asString(r.path) ?? "",
        type: asString(r.type) ?? null,
        last_submitted: asString(r.lastSubmitted) ?? null,
        last_downloaded: asString(r.lastDownloaded) ?? null,
        is_pending: r.isPending === true,
        is_sitemaps_index: r.isSitemapsIndex === true,
        errors: asNumber(r.errors) ?? 0,
        warnings: asNumber(r.warnings) ?? 0,
      };
    });
    return { data, meta: { module: "gsc", next_cursor: null, warnings: [] } };
  },
};

function explainError(err: unknown): ActionableError {
  if (err instanceof ActionableException) return err.actionable;
  if (err instanceof NoResourcesError) {
    return {
      error: "no_resources",
      module: "gsc",
      message: "Tu correo {email} no es usuario de ninguna propiedad.",
      fix: USERS_PATH,
      next_action: "fix_resource_permission",
    };
  }
  const kind = classifyGoogleError(err);
  const common = commonActionable("gsc", err, kind);
  if (common) return common;
  if (kind === "scope_lost") return scopeLostActionable("gsc");
  if (kind === "resource_permission") {
    return {
      error: "missing_resource_permission",
      module: "gsc",
      message: "Tu correo {email} no tiene permiso sobre esa propiedad de Search Console.",
      fix: USERS_PATH,
      next_action: "fix_resource_permission",
    };
  }
  return {
    error: "not_found",
    module: "gsc",
    message: "No se encontro esa propiedad o ese recurso en Search Console.",
    fix: `Usa gsc_list_sites y copia el valor exacto de \`site\`. ${SITE_NOTE}`,
    next_action: "none",
  };
}

async function probe(ctx: ToolContext): Promise<ProbeResult> {
  const sites = await listSites(ctx);
  return { count: sites.length, sample: sites.slice(0, 3).map((s) => s.site) };
}

export const gscModule: Module = {
  id: "gsc",
  kind: "native",
  scopes: { read: [GSC_SCOPE], write: [] },
  extraPermission: "Tu correo debe ser usuario de la propiedad en Search Console. `sc-domain:` y `https://` son propiedades distintas.",
  probe,
  tools: [listSitesTool, performanceTool, listSitemapsTool] as ToolDef[],
  explainError,
};
