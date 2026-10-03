import { z } from "zod";
import {
  ActionableException,
  classifyGoogleError,
  commonActionable,
  GoogleApiError,
  googleFetch,
  NoResourcesError,
  scopeLostActionable,
} from "./errors";
import type { ActionableError, Module, ProbeResult, ToolContext, ToolDef, ToolResult } from "./types";
import { asArray, asNumber, asRecord, asString, dayRange } from "./util";

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

const VIEWER_FIX = "GA4 → Admin → Gestión de acceso a la propiedad → agrega {email} como Viewer.";

type PropertySummary = { account: string; account_name: string; property: string; property_name: string; property_type: string | null };

const MAX_SUMMARY_PAGES = 10;

async function listProperties(ctx: ToolContext): Promise<PropertySummary[]> {
  const token = await ctx.getAccessToken();
  const out: PropertySummary[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_SUMMARY_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
    const body = asRecord(await googleFetch(`${ADMIN}/accountSummaries?${qs}`, token));
    for (const raw of asArray(body.accountSummaries)) {
      const acc = asRecord(raw);
      for (const p of asArray(acc.propertySummaries)) {
        const prop = asRecord(p);
        out.push({
          account: asString(acc.account) ?? "",
          account_name: asString(acc.displayName) ?? "",
          property: (asString(prop.property) ?? "").replace(/^properties\//, ""),
          property_name: asString(prop.displayName) ?? "",
          property_type: asString(prop.propertyType) ?? null,
        });
      }
    }
    pageToken = asString(body.nextPageToken) || undefined;
    if (!pageToken) break;
  }
  return out;
}

const listPropertiesTool = {
  name: "ga4_list_properties",
  title: "GA4: listar propiedades",
  description: "Cuentas y propiedades de Google Analytics 4 a las que tiene acceso el usuario (accountSummaries.list).",
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(ctx: ToolContext): Promise<ToolResult> {
    const data = await listProperties(ctx);
    return { data, meta: { module: "ga4", next_cursor: null, warnings: [] } };
  },
} satisfies ToolDef;

const reportSchema = z.object({
  property: z
    .string()
    .regex(/^(properties\/)?\d{1,20}$/, "property debe ser el id numerico de la propiedad GA4 (p. ej. 123456789)")
    .describe("Id numerico de la propiedad GA4 (ver ga4_list_properties)"),
  days: z.number().int().min(1).max(365).default(28).describe("Ultimos N dias, hasta ayer (por defecto 28)"),
});

const METRICS = ["sessions", "totalUsers", "keyEvents"] as const;

const dailyReportTool: ToolDef<typeof reportSchema> = {
  name: "ga4_daily_report",
  title: "GA4: reporte diario",
  description:
    "Sesiones, usuarios y key events por dia de una propiedad GA4. Expone en meta.warnings si hay thresholding o muestreo.",
  inputSchema: reportSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(ctx, args): Promise<ToolResult> {
    const property = args.property.replace(/^properties\//, "");
    const [startDate, endDate] = dayRange(args.days, 1);
    let body: Record<string, unknown>;
    try {
      body = asRecord(
        await googleFetch(`${DATA}/properties/${property}:runReport`, await ctx.getAccessToken(), {
          method: "POST",
          body: {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "date" }],
            metrics: METRICS.map((name) => ({ name })),
            orderBys: [{ dimension: { dimensionName: "date" } }],
            limit: String(args.days),
          },
        }),
      );
    } catch (e) {
      if (e instanceof GoogleApiError) e.resource = property;
      throw e;
    }

    const data = asArray(body.rows).map((raw) => {
      const r = asRecord(raw);
      const d = asString(asRecord(asArray(r.dimensionValues)[0]).value) ?? "";
      const m = asArray(r.metricValues).map((v) => asNumber(asRecord(v).value) ?? 0);
      return {
        date: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d,
        sessions: m[0] ?? 0,
        total_users: m[1] ?? 0,
        key_events: m[2] ?? 0,
      };
    });

    const metadata = asRecord(body.metadata);
    const warnings: string[] = [];
    if (metadata.subjectToThresholding === true) {
      warnings.push("subjectToThresholding=true: Google omitio datos de usuarios por umbrales de privacidad; los totales pueden ser menores.");
    }
    const sampling = asArray(metadata.samplingMetadatas);
    if (sampling.length > 0) {
      const s = asRecord(sampling[0]);
      warnings.push(
        `Muestreo aplicado: ${asString(s.samplesReadCount) ?? "?"} de ${asString(s.samplingSpaceSize) ?? "?"} eventos leidos.`,
      );
    }
    if (metadata.dataLossFromOtherRow === true) warnings.push("dataLossFromOtherRow=true: hay filas agrupadas en (other).");
    return { data, meta: { module: "ga4", range: [startDate, endDate], next_cursor: null, warnings } };
  },
};

function explainError(err: unknown): ActionableError {
  if (err instanceof ActionableException) return err.actionable;
  if (err instanceof NoResourcesError) {
    return {
      error: "no_resources",
      module: "ga4",
      message: "Falta el rol Viewer.",
      fix: "GA4 → Admin → Gestión de acceso a la propiedad → agrega {email}.",
      next_action: "fix_resource_permission",
    };
  }
  const kind = classifyGoogleError(err);
  const common = commonActionable("ga4", err, kind);
  if (common) return common;
  if (kind === "scope_lost") return scopeLostActionable("ga4");
  const resource = err instanceof GoogleApiError ? err.resource : undefined;
  if (kind === "resource_permission" || kind === "not_found") {
    return {
      error: "missing_resource_permission",
      module: "ga4",
      message: `Tu correo {email} no tiene rol Viewer en la propiedad${resource ? ` ${resource}` : ""}.`,
      fix: VIEWER_FIX,
      next_action: "fix_resource_permission",
    };
  }
  return commonActionable("ga4", err, "upstream") as ActionableError;
}

async function probe(ctx: ToolContext): Promise<ProbeResult> {
  const props = await listProperties(ctx);
  return { count: props.length, sample: props.slice(0, 3).map((p) => p.property_name || p.property) };
}

export const ga4Module: Module = {
  id: "ga4",
  kind: "native",
  scopes: { read: [GA4_SCOPE], write: [] },
  extraPermission: "Tu correo debe tener rol Viewer (o superior) en la propiedad de GA4.",
  probe,
  tools: [listPropertiesTool, dailyReportTool] as ToolDef[],
  explainError,
};
