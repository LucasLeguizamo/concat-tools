import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { redact, toSafeError } from "../safe-error";
import {
  ActionableException,
  classifyGoogleError,
  commonActionable,
  GoogleApiError,
  googleFetch,
  NoResourcesError,
  scopeLostActionable,
} from "./errors";
import { sanitizeDeep, sanitizeString } from "./sanitize";
import type { ActionableError, Module, ModuleId, ProbeResult, ToolContext, ToolDef, ToolResult } from "./types";
import { asArray, asRecord, asString } from "./util";

// Modulos proxy (spec §7): el gateway abre un cliente MCP hacia el servidor remoto de Workspace con el access token
// del usuario como Bearer, re-expone SOLO las tools de la allowlist (prefijo del modulo) y reenvia tools/call.
// Una tool nueva que publique Google no aparece hasta que se agrega aqui.

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
/** tools/list remoto cacheado por instancia y usuario. */
const TOOLS_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const MAX_CACHE_USERS = 200;
const MAX_DESCRIPTION = 800;

export type RemoteTool = { name: string; description?: string; inputSchema: Record<string, unknown> };
export type RemoteResult = { isError: boolean; structured?: unknown; text: string };

/** Superficie minima del cliente MCP remoto (se sustituye por un fake en tests). */
export interface RemoteClient {
  listTools(): Promise<RemoteTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<RemoteResult>;
  close(): Promise<void>;
}
export type RemoteConnect = (endpoint: string, accessToken: string) => Promise<RemoteClient>;

/** Cliente real (`@modelcontextprotocol/client`). El token solo viaja en el header Authorization. */
export const connectRemote: RemoteConnect = async (endpoint, accessToken) => {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    authProvider: { token: async () => accessToken },
  });
  const client = new Client({ name: "concat-google-gateway", version: "0.1.0" });
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  } catch (e) {
    await client.close().catch(() => undefined);
    throw e;
  }
  return {
    async listTools() {
      const out: RemoteTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CONNECT_TIMEOUT_MS });
        for (const t of page.tools) {
          out.push({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> });
        }
        cursor = page.nextCursor;
      } while (cursor && out.length < 200);
      return out;
    },
    async callTool(name, args) {
      const res = await client.callTool({ name, arguments: args }, { timeout: CALL_TIMEOUT_MS });
      const text = res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      return { isError: res.isError === true, structured: res.structuredContent, text };
    },
    close: () => client.close(),
  };
};

export interface WorkspaceDef {
  id: ModuleId;
  /** ponytail: endpoints y nombres de tools verificados contra developers.google.com/workspace/guides/configure-mcp-servers (2026-10-03); falta validar con cuenta real. */
  endpoint: string;
  /** Solo scopes de lectura. */
  scopes: string[];
  extraPermission: string;
  /** Nombres EXACTOS del tools/list remoto que se re-exponen (spec §7). */
  allow: readonly string[];
  /** Fases B/C de la spec §11. */
  beta: boolean;
  /** Llamada de lista que define "conectado" (spec §6). `remote` lista las tools del servidor MCP (cuando no hay REST con el scope del modulo). */
  probe(ctx: ToolContext, remote: () => Promise<number>): Promise<ProbeResult>;
  /** Mensaje especifico cuando el recurso no es accesible (p. ej. Chat app no disponible). */
  noAccess?: { message: string; fix: string };
}

const sanitizeSchema = (schema: unknown): Record<string, unknown> => {
  const s = asRecord(sanitizeDeep(schema));
  // El validador del SDK no resuelve `$schema` externos; el resto del JSON Schema se conserva.
  delete s.$schema;
  return s.type === "object" ? s : { type: "object", properties: {} };
};

/** Error del transporte o del remoto -> GoogleApiError saneado (nunca el token) para que explainError lo clasifique. */
function asGoogleError(e: unknown): unknown {
  if (e instanceof GoogleApiError || e instanceof ActionableException) return e;
  return new GoogleApiError(toSafeError(e));
}

/** Texto de un resultado `isError` del remoto -> GoogleApiError con un status inferido del texto. */
function remoteToolError(text: string): GoogleApiError {
  const status = /quota|rate.?limit|resource.?exhausted/i.test(text)
    ? 429
    : /permission|forbidden|denied/i.test(text)
      ? 403
      : /not.?found/i.test(text)
        ? 404
        : undefined;
  return new GoogleApiError({ message: redact(text).slice(0, 500) || "El servidor remoto devolvio un error", ...(status ? { status } : {}) });
}

function dataFrom(res: RemoteResult): unknown {
  if (res.structured !== undefined && res.structured !== null) return res.structured;
  const t = res.text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t);
    } catch {
      /* texto plano */
    }
  }
  return t;
}

/**
 * Reenvia un tools/call al servidor remoto. La allowlist se comprueba AQUI, no solo al registrar las tools:
 * un nombre fuera de la lista nunca llega al remoto.
 */
export async function callAllowedTool(
  def: Pick<WorkspaceDef, "id" | "endpoint" | "allow">,
  connect: RemoteConnect,
  ctx: ToolContext,
  remoteName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (!def.allow.includes(remoteName)) {
    throw new ActionableException({
      error: "tool_not_allowed",
      module: def.id,
      message: `La herramienta ${sanitizeString(remoteName, 60)} no esta permitida en el modulo ${def.id}.`,
      fix: "Solo se exponen las herramientas de solo lectura del catalogo (concat tools).",
      next_action: "none",
    });
  }
  let client: RemoteClient | undefined;
  try {
    client = await connect(def.endpoint, await ctx.getAccessToken());
    const res = await client.callTool(remoteName, args);
    if (res.isError) throw remoteToolError(res.text);
    return { data: dataFrom(res), meta: { module: def.id, next_cursor: null, warnings: [] } };
  } catch (e) {
    throw asGoogleError(e);
  } finally {
    await client?.close().catch(() => undefined);
  }
}

export function createWorkspaceModule(def: WorkspaceDef, connect: RemoteConnect = connectRemote): Module {
  const allow = new Set(def.allow);
  type Entry = { at: number; ttl: number; ok: boolean; tools: RemoteTool[]; error?: string };
  const cache = new Map<string, Entry>();

  /** tools/list remoto filtrado por la allowlist: lo no listado se ignora. Lanza si el remoto falla. */
  async function fetchAllowed(ctx: ToolContext): Promise<RemoteTool[]> {
    let client: RemoteClient | undefined;
    try {
      client = await connect(def.endpoint, await ctx.getAccessToken());
      return (await client.listTools()).filter((t) => allow.has(t.name));
    } catch (e) {
      throw asGoogleError(e);
    } finally {
      await client?.close().catch(() => undefined);
    }
  }

  function toToolDef(rt: RemoteTool): ToolDef {
    return {
      name: `${def.id}_${rt.name}`,
      title: `${def.id}: ${rt.name}`,
      description: `${sanitizeString(rt.description ?? "", MAX_DESCRIPTION)} (Proxy a Google Workspace MCP, Developer Preview; solo lectura.)`.trim(),
      inputSchema: z.object({}).loose(),
      jsonInputSchema: sanitizeSchema(rt.inputSchema),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: (ctx, args) => callAllowedTool(def, connect, ctx, rt.name, asRecord(args)),
    };
  }

  const remember = (userId: string, e: Entry) => {
    if (cache.size >= MAX_CACHE_USERS && !cache.has(userId)) cache.delete(cache.keys().next().value as string);
    cache.set(userId, e);
  };

  return {
    id: def.id,
    kind: "proxy",
    beta: def.beta,
    scopes: { read: def.scopes, write: [] },
    extraPermission: def.extraPermission,
    tools: [],

    async listTools(ctx) {
      const hit = cache.get(ctx.userId);
      if (hit && Date.now() - hit.at < hit.ttl) return hit.tools.map(toToolDef);
      try {
        const tools = await fetchAllowed(ctx);
        remember(ctx.userId, { at: Date.now(), ttl: TOOLS_TTL_MS, ok: true, tools });
        return tools.map(toToolDef);
      } catch (e) {
        // Remoto caido o sin acceso: el modulo no registra tools y gateway_status lo explica.
        const message = e instanceof ActionableException ? e.actionable.message : toSafeError(e instanceof GoogleApiError ? e.safe : e).message;
        remember(ctx.userId, { at: Date.now(), ttl: FAILURE_TTL_MS, ok: false, tools: [], error: sanitizeString(message, 300) });
        return [];
      }
    },

    remoteStatus(userId) {
      const hit = cache.get(userId);
      if (!hit) return undefined;
      return { ok: hit.ok, tools: hit.tools.length, ...(hit.error ? { error: hit.error } : {}) };
    },

    probe: (ctx) => def.probe(ctx, async () => (await fetchAllowed(ctx)).length),

    explainError(err): ActionableError {
      if (err instanceof ActionableException) return err.actionable;
      if (err instanceof NoResourcesError) {
        return {
          error: "no_resources",
          module: def.id,
          message: def.noAccess?.message ?? `{email} no tiene recursos accesibles en ${def.id}.`,
          fix: def.noAccess?.fix ?? def.extraPermission,
          next_action: "fix_resource_permission",
        };
      }
      const kind = classifyGoogleError(err);
      const common = commonActionable(def.id, err, kind);
      if (common) return common;
      if (kind === "scope_lost") return scopeLostActionable(def.id);
      return {
        error: "missing_resource_permission",
        module: def.id,
        message: def.noAccess?.message ?? `{email} no tiene acceso al recurso pedido en ${def.id}, o el servidor MCP de Google rechazo la solicitud.`,
        fix:
          def.noAccess?.fix ??
          `Comprueba que {email} puede abrir ese recurso. Si es de todos los recursos, el operador del gateway debe tener el proyecto inscrito en el Developer Preview de Workspace MCP y la API ${new URL(def.endpoint).hostname} habilitada.`,
        next_action: "fix_resource_permission",
      };
    },
  };
}

// ---------- probes REST (spec §6) ----------

const rest = async (ctx: ToolContext, url: string): Promise<Record<string, unknown>> =>
  asRecord(await googleFetch(url, await ctx.getAccessToken()));

const gmailProbe: WorkspaceDef["probe"] = async (ctx) => ({
  count: asString((await rest(ctx, "https://gmail.googleapis.com/gmail/v1/users/me/profile")).emailAddress) ? 1 : 0,
});
const driveProbe: WorkspaceDef["probe"] = async (ctx) => ({
  count: asArray((await rest(ctx, "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)")).files).length,
});
const calendarProbe: WorkspaceDef["probe"] = async (ctx) => ({
  count: asArray((await rest(ctx, "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1")).items).length,
});
const chatProbe: WorkspaceDef["probe"] = async (ctx) => ({
  count: asArray((await rest(ctx, "https://chat.googleapis.com/v1/spaces?pageSize=1")).spaces).length,
});
const peopleProbe: WorkspaceDef["probe"] = async (ctx) => ({
  count: asString((await rest(ctx, "https://people.googleapis.com/v1/people/me?personFields=names")).resourceName) ? 1 : 0,
});
// ponytail: Docs/Sheets/Slides con su scope propio no pueden listar Drive (files.list pide drive.readonly). Mientras no
// se valide si sus servidores MCP exigen drive.readonly (spec §7), el probe es el tools/list del propio servidor MCP:
// prueba token + API MCP habilitada + Developer Preview, que es justo lo que puede fallar.
const remoteProbe: WorkspaceDef["probe"] = async (_ctx, remote) => ({ count: await remote() });

const G = "https://www.googleapis.com/auth";
const mcp = (host: string) => `https://${host}.googleapis.com/mcp/v1`;
const NO_EXTRA = "Ninguno adicional: se usa tu propia cuenta de Google.";

export const WORKSPACE_DEFS: WorkspaceDef[] = [
  {
    id: "gmail",
    endpoint: mcp("gmailmcp"),
    scopes: [`${G}/gmail.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada (scope restringido de Gmail).`,
    allow: ["search_threads", "get_thread", "get_message", "list_labels"],
    beta: true,
    probe: gmailProbe,
  },
  {
    id: "drive",
    endpoint: mcp("drivemcp"),
    scopes: [`${G}/drive.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada (scope restringido de Drive).`,
    allow: ["search_files", "list_recent_files", "read_file_content", "get_file_metadata"],
    beta: true,
    probe: driveProbe,
  },
  {
    id: "docs",
    endpoint: mcp("docsmcp"),
    scopes: [`${G}/documents.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada.`,
    allow: ["read_doc"],
    beta: true,
    probe: remoteProbe,
  },
  {
    id: "sheets",
    endpoint: mcp("sheetsmcp"),
    scopes: [`${G}/spreadsheets.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada.`,
    allow: ["get_values", "get_spreadsheet"],
    beta: true,
    probe: remoteProbe,
  },
  {
    id: "slides",
    endpoint: mcp("slidesmcp"),
    scopes: [`${G}/presentations.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada.`,
    allow: ["read_presentation"],
    beta: true,
    probe: remoteProbe,
  },
  {
    id: "calendar",
    endpoint: mcp("calendarmcp"),
    scopes: [`${G}/calendar.events.readonly`, `${G}/calendar.calendarlist.readonly`],
    extraPermission: `${NO_EXTRA} Modulo en beta cerrada.`,
    allow: ["list_calendars", "list_events", "get_event"],
    beta: true,
    probe: calendarProbe,
  },
  {
    id: "chat",
    endpoint: mcp("chatmcp"),
    scopes: [`${G}/chat.spaces.readonly`, `${G}/chat.memberships.readonly`, `${G}/chat.messages.readonly`],
    extraPermission: "La Chat app del gateway debe estar disponible para tu dominio de Google Workspace. Modulo en beta cerrada (scope restringido de mensajes de Chat).",
    allow: ["search_conversations", "list_messages", "search_messages", "list_memberships"],
    beta: true,
    probe: chatProbe,
    noAccess: {
      message: "La Chat app no esta disponible para tu dominio ({email}).",
      fix: "Pide al administrador de Google Workspace de tu dominio que permita la Chat app del gateway (Admin console > Apps > Google Workspace Marketplace apps).",
    },
  },
  {
    id: "people",
    endpoint: "https://people.googleapis.com/mcp/v1",
    scopes: [`${G}/contacts.readonly`, `${G}/userinfo.profile`],
    extraPermission: NO_EXTRA,
    allow: ["get_user_profile", "search_contacts"],
    beta: false,
    probe: peopleProbe,
  },
];

export const workspaceModules: Module[] = WORKSPACE_DEFS.map((d) => createWorkspaceModule(d));
