import { emit, type Ctx } from "./context.js";
import { asActionable, CliError, EXIT, exitCodeForActionable, scrub, usageError } from "./errors.js";
import { findTool, toolToCommand } from "./mapping.js";
import type { ToolCallResult, ToolInfo } from "./mcp.js";
import { parseFlags, renderHelp, schemaToFlags } from "./schema.js";

const tryJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Convierte el resultado de una tool en salida, o lanza CliError si isError. */
export function handleResult(ctx: Ctx, result: ToolCallResult): void {
  const value = result.structured ?? (result.text !== undefined ? (tryJson(result.text) ?? result.text) : null);
  if (result.isError) {
    const a = asActionable(value);
    if (a) throw new CliError(scrub(a.message), exitCodeForActionable(a), a);
    throw new CliError(scrub(typeof value === "string" ? value : "La herramienta devolvió un error."), EXIT.OTHER);
  }
  emit(ctx, value);
}

const commandOf = (t: ToolInfo): string => {
  const c = toolToCommand(t.name);
  return c ? `${c.group} ${c.action}` : t.name;
};

/** El grupo no tiene tools: ¿módulo no conectado (exit 5) o comando inexistente (exit 2)? */
async function notFound(ctx: Ctx, group: string, action: string | undefined, tools: ToolInfo[]): Promise<never> {
  const siblings = tools.filter((t) => toolToCommand(t.name)?.group === group);
  if (siblings.length > 0) {
    const list = siblings.map((t) => `  ${commandOf(t)}`).join("\n");
    throw usageError(`Acción desconocida${action ? ` "${action}"` : ""} para ${group}. Disponibles:\n${list}`);
  }
  let modules: unknown[] = [];
  try {
    const body = (await ctx.session.api("/api/status")) as { modules?: unknown[] };
    if (Array.isArray(body.modules)) modules = body.modules;
  } catch (err) {
    if (err instanceof CliError && err.exitCode === EXIT.UNAUTHENTICATED) throw err;
  }
  const mod = modules.find(
    (m): m is Record<string, unknown> => typeof m === "object" && m !== null && (m as { id?: unknown }).id === group,
  );
  if (mod && mod.status !== "connected") {
    const status = String(mod.status);
    const reconnect = status === "scope_lost" || status === "expired";
    throw new CliError(`El módulo ${group} no está conectado (estado: ${status}).`, EXIT.MODULE, {
      error: reconnect ? "scope_lost" : "module_not_connected",
      module: group,
      fix: `Ejecuta: concat connect ${group}`,
      next_action: reconnect ? "reconnect_module" : "connect_module",
      ...(typeof mod.connect_url === "string" ? { url: mod.connect_url } : {}),
    });
  }
  throw usageError(`Comando desconocido: ${[group, action].filter(Boolean).join(" ")}. Prueba: concat tools`);
}

/** `concat <grupo> <accion> --flags`: el comando se resuelve contra el catálogo vivo. */
export async function runGenerated(ctx: Ctx, group: string, rest: string[]): Promise<number> {
  const client = await ctx.deps.connectTools(ctx.session);
  try {
    const tools = await client.listTools();
    const [action, ...flagArgs] = rest;
    if (action === undefined || action.startsWith("-")) {
      const siblings = tools.filter((t) => toolToCommand(t.name)?.group === group);
      if (siblings.length === 0) return await notFound(ctx, group, undefined, tools);
      ctx.deps.stdout.write(`${siblings.map((t) => `concat ${commandOf(t)}  ${t.description?.split("\n")[0] ?? ""}`.trimEnd()).join("\n")}\n`);
      return action === undefined ? EXIT.USAGE : EXIT.OK;
    }
    const tool = findTool(tools, group, action);
    if (!tool) return await notFound(ctx, group, action, tools);

    const flags = schemaToFlags(tool.inputSchema);
    const parsed = parseFlags(flags, flagArgs);
    if (parsed.help) {
      ctx.deps.stdout.write(`${renderHelp(commandOf(tool), tool.description, flags)}\n`);
      return EXIT.OK;
    }
    handleResult(ctx, await client.callTool(tool.name, parsed.args));
    return EXIT.OK;
  } finally {
    await client.close().catch(() => {});
  }
}

/** `concat call <tool> '<json>'`: escape genérico sin schema local. */
export async function runCall(ctx: Ctx, positionals: string[]): Promise<number> {
  const [tool, raw, ...extra] = positionals;
  if (!tool || extra.length > 0) throw usageError("Uso: concat call <tool> '<json>'");
  let args: unknown = {};
  if (raw !== undefined) {
    try {
      args = JSON.parse(raw);
    } catch {
      throw usageError("Los argumentos deben ser JSON válido.");
    }
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw usageError("Los argumentos deben ser un objeto JSON.");
  }
  const client = await ctx.deps.connectTools(ctx.session);
  try {
    handleResult(ctx, await client.callTool(tool, args as Record<string, unknown>));
    return EXIT.OK;
  } finally {
    await client.close().catch(() => {});
  }
}
