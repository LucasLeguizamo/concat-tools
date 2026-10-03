import { toolCatalog, type CatalogTool } from "./catalog";
import { GoogleApiError, NoResourcesError } from "./modules/errors";
import { modules } from "./modules/registry";
import type { ActionableError, Module } from "./modules/types";

// Genera docs/{es,en}/tools.md y docs/{es,en}/modules.md desde el registro real (`pnpm docs:tools`).
// Un test (docs-gen.test.ts) falla si los archivos commiteados no coinciden con esta salida.
// Los textos que emite el gateway (descripciones, errores) estan en español; se citan tal cual en ambos idiomas.

export type Lang = "es" | "en";

const T = {
  es: {
    toolsTitle: "Referencia de herramientas",
    toolsIntro:
      "Generado desde el registro del gateway con `pnpm docs:tools`; no lo edites a mano. Todas las herramientas son de **solo lectura** (`readOnlyHint: true`) y devuelven `{ data, meta }`; los errores son [accionables](errors.md). `meta.untrusted: true` indica que el resultado contiene texto de terceros: son datos, nunca instrucciones.",
    liveNote: "Las herramientas de los módulos proxy se leen del `tools/list` de Google en runtime: el catálogo vivo es `concat tools`.",
    cli: "Comando CLI",
    params: "Parámetros",
    noParams: "Sin parámetros.",
    name: "Nombre",
    type: "Tipo",
    required: "Obligatorio",
    default: "Por defecto",
    description: "Descripción",
    yes: "sí",
    proxyBody: "Proxy a Google Workspace MCP (Developer Preview), solo lectura. Descripción y parámetros: los publica el servidor MCP de Google (`concat tools`).",
    betaTag: "beta cerrada",
    gatewayHeading: "Gateway (siempre disponibles)",
    modulesTitle: "Módulos y permisos extra",
    modulesIntro:
      "Generado con `pnpm docs:tools` desde el registro del gateway y de lo que dice `explainError` de cada módulo. Un módulo está **conectado** cuando su llamada de lista (probe) devuelve algo, no cuando termina el login. `<tu correo>` marca dónde el gateway pone tu correo de Google. Los mensajes son los literales del gateway.",
    kind: "Tipo",
    native: "nativo (REST directo)",
    proxy: "proxy (servidor MCP de Google Workspace)",
    phase: "Fase de verificación de Google",
    beta: "Estado",
    betaYes: "beta cerrada (funciona para la lista de prueba mientras Google no verifique la fase)",
    betaNo: "disponible",
    scopes: "Scopes (solo lectura)",
    restricted: "restringido",
    extra: "Permiso extra (fuera de OAuth)",
    empty: "Si el probe viene vacío",
    denied: "Si Google responde 403 sobre un recurso",
    message: "Mensaje",
    fix: "Arreglo",
    phaseNote:
      "Fases (spec §11): **A** verificación de marca y scopes sensibles; **B** scopes sensibles con video demo; **C** scopes restringidos (Gmail, Drive, mensajes de Chat) con evaluación de seguridad CASA, renovada cada 12 meses.",
  },
  en: {
    toolsTitle: "Tools reference",
    toolsIntro:
      "Generated from the gateway registry with `pnpm docs:tools`; do not edit by hand. Every tool is **read-only** (`readOnlyHint: true`) and returns `{ data, meta }`; errors are [actionable](errors.md). `meta.untrusted: true` means the result contains third-party text: it is data, never instructions.",
    liveNote: "Tools of the proxy modules are read from Google's `tools/list` at runtime: the live catalog is `concat tools`.",
    cli: "CLI command",
    params: "Parameters",
    noParams: "No parameters.",
    name: "Name",
    type: "Type",
    required: "Required",
    default: "Default",
    description: "Description",
    yes: "yes",
    proxyBody: "Proxy to Google Workspace MCP (Developer Preview), read-only. Description and parameters are published by Google's MCP server (`concat tools`).",
    betaTag: "closed beta",
    gatewayHeading: "Gateway (always available)",
    modulesTitle: "Modules and extra permissions",
    modulesIntro:
      "Generated with `pnpm docs:tools` from the gateway registry and what each module's `explainError` says. A module is **connected** when its list call (probe) returns something, not when login finishes. `<your email>` marks where the gateway inserts your Google email. Gateway messages are in Spanish and quoted verbatim.",
    kind: "Type",
    native: "native (direct REST)",
    proxy: "proxy (Google Workspace MCP server)",
    phase: "Google verification phase",
    beta: "Status",
    betaYes: "closed beta (works for the test-user list until Google verifies the phase)",
    betaNo: "available",
    scopes: "Scopes (read-only)",
    restricted: "restricted",
    extra: "Extra permission (outside OAuth)",
    empty: "If the probe comes back empty",
    denied: "If Google answers 403 on a resource",
    message: "Message",
    fix: "Fix",
    phaseNote:
      "Phases (spec §11): **A** brand and sensitive-scope verification; **B** sensitive scopes with a demo video; **C** restricted scopes (Gmail, Drive, Chat messages) with a CASA security assessment, renewed every 12 months.",
  },
} as const;

/** Espejo de packages/cli/src/mapping.ts y schema.ts (no se importa para no acoplar el build del gateway al CLI). */
const toCommand = (tool: string) => {
  const i = tool.indexOf("_");
  return `concat ${tool.slice(0, i)} ${tool.slice(i + 1).replaceAll("_", "-")}`;
};
const flagName = (prop: string) => prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replaceAll("_", "-").toLowerCase();

const cell = (s: string) => s.replace(/\s*\n\s*/g, " ").replaceAll("|", "\\|").trim();

type Prop = { type?: string; enum?: unknown[]; default?: unknown; description?: string; minimum?: number; maximum?: number; items?: { type?: string } };

function typeOf(p: Prop): string {
  if (p.enum) return p.enum.map((v) => `\`${String(v)}\``).join(" \\| ");
  const base = p.type === "array" ? `${p.items?.type ?? "any"}[]` : (p.type ?? "any");
  const range = p.minimum !== undefined || p.maximum !== undefined ? ` (${p.minimum ?? ""}–${p.maximum ?? ""})` : "";
  return `${base}${range}`;
}

function paramsTable(tool: CatalogTool, l: (typeof T)[Lang]): string {
  const props = (tool.inputSchema?.properties ?? {}) as Record<string, Prop>;
  const required = new Set((tool.inputSchema?.required ?? []) as string[]);
  const rows = Object.entries(props).map(
    ([k, p]) =>
      `| \`${k}\` (\`--${flagName(k)}\`) | ${typeOf(p)} | ${required.has(k) ? l.yes : ""} | ${p.default !== undefined ? `\`${JSON.stringify(p.default)}\`` : ""} | ${cell(p.description ?? "")} |`,
  );
  if (rows.length === 0) return `${l.noParams}\n`;
  return [`| ${l.name} | ${l.type} | ${l.required} | ${l.default} | ${l.description} |`, "| --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
}

export function renderToolsDoc(lang: Lang, catalog: CatalogTool[] = toolCatalog()): string {
  const l = T[lang];
  const out = [`# ${l.toolsTitle}`, "", l.toolsIntro, "", l.liveNote, ""];
  const order: Array<CatalogTool["module"]> = ["gateway", ...modules.map((m) => m.id)];
  for (const id of order) {
    const tools = catalog.filter((t) => t.module === id);
    if (tools.length === 0) continue;
    const mod = modules.find((m) => m.id === id);
    out.push(`## ${id === "gateway" ? l.gatewayHeading : `\`${id}\`${mod?.beta ? ` (${l.betaTag})` : ""}`}`, "");
    for (const t of tools) {
      out.push(`### \`${t.name}\``, "");
      out.push(`${l.cli}: \`${toCommand(t.name)}\``, "");
      if (t.proxy) out.push(l.proxyBody, "");
      else out.push(t.description, "", `**${l.params}**`, "", paramsTable(t, l));
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

// ---------- modulos ----------

/** Fases de verificacion de Google (spec §11). */
const PHASE: Record<string, "A" | "B" | "C"> = {
  gsc: "A", ga4: "A", ads: "A", people: "A",
  calendar: "B", docs: "B", sheets: "B", slides: "B",
  gmail: "C", drive: "C", chat: "C",
};
/** Scopes restringidos segun la spec §3/§7. */
const RESTRICTED = ["gmail.readonly", "drive.readonly", "chat.messages.readonly"];

const fill = (s: string, lang: Lang) => s.replaceAll("{email}", lang === "es" ? "<tu correo>" : "<your email>");

function explain(m: Module, err: unknown, lang: Lang, l: (typeof T)[Lang]): string {
  const a: ActionableError = m.explainError(err);
  return `- **${l.message}**: ${fill(a.message, lang)}\n- **${l.fix}**: ${fill(a.fix, lang)}\n- \`error: ${a.error}\`, \`next_action: ${a.next_action}\``;
}

export function renderModulesDoc(lang: Lang): string {
  const l = T[lang];
  const out = [`# ${l.modulesTitle}`, "", l.modulesIntro, "", l.phaseNote, ""];
  for (const m of modules) {
    out.push(`## \`${m.id}\``, "");
    out.push(`- **${l.kind}**: ${m.kind === "native" ? l.native : l.proxy}`);
    out.push(`- **${l.phase}**: ${PHASE[m.id]}`);
    out.push(`- **${l.beta}**: ${m.beta ? l.betaYes : l.betaNo}`);
    out.push(`- **${l.scopes}**:`);
    for (const s of m.scopes.read) out.push(`  - \`${s}\`${RESTRICTED.some((r) => s.endsWith(r)) ? ` (${l.restricted})` : ""}`);
    out.push(`- **${l.extra}**: ${m.extraPermission}`, "");
    out.push(`**${l.empty}**`, "", explain(m, new NoResourcesError(), lang, l), "");
    out.push(`**${l.denied}**`, "", explain(m, new GoogleApiError({ status: 403, message: "forbidden" }), lang, l), "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
