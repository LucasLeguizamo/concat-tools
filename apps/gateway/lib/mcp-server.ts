import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type AuthInfo,
  type CallToolResult,
  type JsonSchemaType,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { authenticate, scopeAllows, unauthorized } from "./bearer";
import { connectUrl, getModuleStatuses, type ModuleStatusEntry, markModuleFailure, toActionable, toolContext } from "./connection";
import { getDb } from "./db";
import { modules as allModules } from "./modules/registry";
import { dataToText, sanitizeDeep, sanitizeString } from "./modules/sanitize";
import type { ActionableError, Module, ModuleId, ToolDef, ToolResult } from "./modules/types";
import { LIMITS, rateLimiter } from "./rate-limit";
import { redact } from "./safe-error";

export type VisibleTool = { module: Module; tool: ToolDef };

/**
 * Tools que ve este token: solo modulos `connected` y dentro del scope del token.
 * Orden determinista: orden del registry, luego orden de cada modulo.
 */
export function visibleTools(
  connected: ReadonlySet<string>,
  scope: string[],
  registry: Module[] = allModules,
): VisibleTool[] {
  return registry
    .filter((m) => connected.has(m.id) && scopeAllows(scope, m.id))
    .flatMap((module) => module.tools.map((tool) => ({ module, tool })));
}

/**
 * Como visibleTools, pero los modulos proxy traen sus tools del tools/list remoto (allowlist + cache por instancia).
 * Un remoto caido no rompe el tools/list: ese modulo simplemente no aporta tools (gateway_status lo explica).
 */
export async function resolveTools(
  userId: string,
  connected: ReadonlySet<string>,
  scope: string[],
  registry: Module[] = allModules,
): Promise<VisibleTool[]> {
  const mods = registry.filter((m) => connected.has(m.id) && scopeAllows(scope, m.id));
  const lists = await Promise.all(
    mods.map(async (mod) => ({
      mod,
      tools: mod.listTools ? await mod.listTools(toolContext(userId, mod)).catch(() => []) : mod.tools,
    })),
  );
  return lists.flatMap(({ mod, tools }) => tools.map((tool) => ({ module: mod, tool })));
}

/** gateway_status: marca beta y, en modulos proxy conectados, si el servidor MCP remoto responde y cuantas tools expone. */
async function withRemoteInfo(userId: string, entries: ModuleStatusEntry[]) {
  return Promise.all(
    entries.map(async (e) => {
      const mod = allModules.find((m) => m.id === e.id);
      if (!mod?.listTools || e.status !== "connected") return e;
      await mod.listTools(toolContext(userId, mod)).catch(() => []); // refresca la cache si hace falta
      const remote = mod.remoteStatus?.(userId);
      return remote ? { ...e, remote_tools: remote } : e;
    }),
  );
}

export async function connectedModuleIds(userId: string): Promise<Set<string>> {
  const rows = await getDb()<{ module: string }[]>`
    SELECT module FROM module_state WHERE user_id = ${userId} AND status = 'connected'
  `;
  return new Set(rows.map((r) => r.module));
}

/** audit_log: quien, modulo, herramienta, cuando. Nunca argumentos ni respuestas. */
async function audit(userId: string, module: string, tool: string): Promise<void> {
  try {
    await getDb()`INSERT INTO audit_log (user_id, module, tool) VALUES (${userId}, ${module}, ${tool})`;
  } catch (e) {
    console.error("audit_log: no se pudo escribir", redact(e instanceof Error ? e.message : "error"));
  }
}

// ToolResult = {data, meta}. z.unknown() para data: el contenido lo define cada tool.
const outputSchema = z.object({
  data: z.unknown(),
  meta: z
    .object({
      module: z.string(),
      range: z.tuple([z.string(), z.string()]).optional(),
      next_cursor: z.string().nullable().optional(),
      warnings: z.array(z.string()).optional(),
      /** true = contiene texto de Google u otro tercero: datos, nunca instrucciones. */
      untrusted: z.boolean().optional(),
    })
    .optional(),
});

/**
 * structuredContent pasa por el mismo saneado que el fallback de texto: un cliente que lo lea
 * directamente recibe strings sin control/bidi/zero-width/tags Unicode (y truncadas a MAX_STRING).
 */
const asStructured = (v: unknown) => sanitizeDeep(v) as Record<string, unknown>;

/** `untrusted` marca resultados que llevan datos de Google (queries, nombres de propiedades, mensajes upstream). */
function okResult(result: ToolResult, opts: { untrusted?: boolean } = {}): CallToolResult {
  const marked: ToolResult = opts.untrusted
    ? { ...result, meta: { ...(result.meta ?? { module: "gateway" as const }), untrusted: true } }
    : result;
  return {
    content: [{ type: "text", text: dataToText(marked) }],
    structuredContent: asStructured(marked),
  };
}

function errorResult(a: ActionableError, opts: { untrusted?: boolean } = {}): CallToolResult {
  const text = sanitizeString(`${a.message} ${a.fix}${a.url ? ` ${a.url}` : ""}`, 600);
  const body = opts.untrusted ? { ...a, meta: { untrusted: true } } : a;
  return { isError: true, content: [{ type: "text", text }], structuredContent: asStructured(body) };
}

/** Tope por usuario x modulo. Devuelve el ActionableError `rate_limited` o null si pasa. */
async function checkToolRate(userId: string, module: string): Promise<ActionableError | null> {
  const { limit, windowS } = LIMITS.toolCall;
  const r = await rateLimiter().hit(`tool:${userId}:${module}`, limit, windowS);
  if (r.allowed) return null;
  return {
    error: "rate_limited",
    module: module as ActionableError["module"],
    message: `Demasiadas llamadas al modulo ${module} (maximo ${limit} por minuto).`,
    fix: `Espera ${r.retryAfter}s y reintenta; agrupa consultas o reduce la frecuencia.`,
    next_action: "retry",
    retry_after: r.retryAfter,
  };
}

const ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

export async function createGatewayServer(opts: {
  userId: string;
  scope: string[];
  connected: ReadonlySet<string>;
}): Promise<McpServer> {
  const { userId, scope } = opts;
  const server = new McpServer({ name: "concat-google-gateway", version: "0.1.0" });

  for (const { module, tool } of await resolveTools(userId, opts.connected, scope)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        // Tools proxy: el JSON Schema del remoto (validado por el SDK); nativas: zod.
        inputSchema: tool.jsonInputSchema ? fromJsonSchema(tool.jsonInputSchema as JsonSchemaType) : (tool.inputSchema as z.ZodObject),
        outputSchema,
        annotations: { ...tool.annotations, ...ANNOTATIONS },
      },
      async (args: unknown): Promise<CallToolResult> => {
        const limited = await checkToolRate(userId, module.id);
        if (limited) return errorResult(limited);
        await audit(userId, module.id, tool.name);
        try {
          return okResult(await tool.handler(toolContext(userId, module), args as never), { untrusted: true });
        } catch (e) {
          const a = await toActionable(userId, module, e);
          await markModuleFailure(userId, module.id, a).catch(() => undefined);
          return errorResult(a, { untrusted: true });
        }
      },
    );
  }

  server.registerTool(
    "gateway_status",
    {
      title: "Estado del gateway",
      description: "Estado real de cada modulo (probe), ultimo chequeo, error y accion pendiente.",
      inputSchema: z.object({}),
      outputSchema,
      annotations: ANNOTATIONS,
    },
    async (): Promise<CallToolResult> => {
      const limited = await checkToolRate(userId, "gateway");
      if (limited) return errorResult(limited);
      await audit(userId, "gateway", "gateway_status");
      const entries = await withRemoteInfo(userId, await getModuleStatuses(userId, (id) => scopeAllows(scope, id)));
      // last_error puede citar texto de Google.
      return okResult({ data: { modules: entries } }, { untrusted: true });
    },
  );

  server.registerTool(
    "gateway_connect_url",
    {
      title: "Enlace para conectar un modulo",
      description:
        "Devuelve el enlace para conectar o reconectar un modulo. Entregalo al usuario; nunca lo abras por tu cuenta.",
      inputSchema: z.object({
        module: z.string().min(1).max(32).describe(`Id del modulo: ${allModules.map((m) => m.id).join(", ")}`),
      }),
      outputSchema,
      annotations: ANNOTATIONS,
    },
    async ({ module }: { module: string }): Promise<CallToolResult> => {
      const limited = await checkToolRate(userId, "gateway");
      if (limited) return errorResult(limited);
      await audit(userId, "gateway", "gateway_connect_url");
      const mod = allModules.find((m) => m.id === module && scopeAllows(scope, m.id));
      if (!mod) {
        return errorResult({
          error: "unknown_module",
          module: "gateway",
          message: `Modulo desconocido o fuera del alcance de este token: ${sanitizeString(module, 40)}.`,
          fix: `Modulos disponibles: ${allModules.filter((m) => scopeAllows(scope, m.id)).map((m) => m.id).join(", ") || "ninguno"}.`,
          next_action: "none",
        });
      }
      return okResult({
        data: { module: mod.id, url: connectUrl(mod.id as ModuleId), permission: mod.extraPermission },
      });
    },
  );

  return server;
}

const handler = createMcpHandler(
  async (ctx) => {
    const userId = ctx.authInfo?.extra?.userId;
    if (typeof userId !== "string") throw new Error("request sin usuario autenticado");
    return createGatewayServer({
      userId,
      scope: ctx.authInfo?.scopes ?? [],
      connected: await connectedModuleIds(userId),
    });
  },
  // Stateless (spec MCP 2026-07-28): cada request es independiente, encaja con serverless.
  // `legacy: "stateless"` sirve tambien a clientes de la spec 2025 (la mayoria de hosts hoy).
  { legacy: "stateless", onerror: (e) => console.error("mcp:", redact(e.message)) },
);

/** Punto de entrada de `POST /mcp`: Bearer del gateway -> MCP Streamable HTTP stateless. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const claims = await authenticate(request);
  if (!claims) return unauthorized();
  // El token del gateway NO viaja en authInfo: solo usuario y scope.
  const authInfo: AuthInfo = { token: "", clientId: "gateway", scopes: claims.scope, extra: { userId: claims.userId } };
  return handler.fetch(request, { authInfo });
}
