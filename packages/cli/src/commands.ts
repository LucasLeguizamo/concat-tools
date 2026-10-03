import { parseArgs } from "node:util";
import { emit, log, type Ctx } from "./context.js";
import { CliError, EXIT, usageError } from "./errors.js";
import { renderTable } from "./format.js";
import { toolToCommand } from "./mapping.js";
import { discover, loginDevice, loginLoopback, revokeToken } from "./oauth.js";

const parse = <O extends Record<string, { type: "boolean" | "string" }>>(args: string[], options: O, positionals = false) => {
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: positionals });
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }
};

/** Mensaje final: texto humano en TTY, JSON en modo máquina. */
const done = (ctx: Ctx, human: string, value: unknown): void => {
  if (ctx.json) emit(ctx, value);
  else ctx.deps.stdout.write(`${human}\n`);
};

export async function login(ctx: Ctx, args: string[]): Promise<number> {
  const { values } = parse(args, { device: { type: "boolean" } });
  const md = await discover(ctx.gateway, ctx.deps.net);
  const io = { log: (l: string) => log(ctx, l), openBrowser: (u: string) => ctx.deps.openBrowser(u) };
  const creds = values.device
    ? await loginDevice(md, ctx.deps.net, io)
    : await loginLoopback(md, ctx.deps.net, io);
  await ctx.deps.store.save(ctx.gateway, creds);
  done(ctx, `Sesión iniciada en ${ctx.gateway}.`, { logged_in: true, gateway: ctx.gateway });
  return EXIT.OK;
}

export async function logout(ctx: Ctx, args: string[]): Promise<number> {
  parse(args, {});
  const creds = await ctx.deps.store.load(ctx.gateway);
  const token = creds?.refresh_token ?? creds?.access_token;
  if (token) {
    try {
      await revokeToken(await discover(ctx.gateway, ctx.deps.net), ctx.deps.net, token);
    } catch {
      // sin red o sin metadata: igual se borra la copia local
    }
  }
  await ctx.deps.store.clear(ctx.gateway);
  done(ctx, "Sesión cerrada.", { logged_in: false, gateway: ctx.gateway });
  return EXIT.OK;
}

interface ModuleRow {
  id: string;
  status: string;
  last_probe_at?: string | null;
  resource_count?: number | null;
  last_error?: string | null;
  connect_url?: string;
}

async function fetchModules(ctx: Ctx): Promise<{ body: unknown; modules: ModuleRow[] }> {
  const body = await ctx.session.api("/api/status");
  const list = (body as { modules?: unknown })?.modules;
  if (!Array.isArray(list)) throw new CliError("Respuesta inválida de /api/status.", EXIT.OTHER);
  return { body, modules: list as ModuleRow[] };
}

export async function status(ctx: Ctx, args: string[]): Promise<number> {
  parse(args, {});
  const { body, modules } = await fetchModules(ctx);
  if (ctx.json) emit(ctx, body);
  else {
    ctx.deps.stdout.write(
      `${renderTable(
        modules.map((m) => ({
          module: m.id,
          status: m.status,
          resources: m.resource_count ?? "",
          "last probe": m.last_probe_at ?? "",
          error: m.last_error ?? "",
        })),
      )}\n`,
    );
  }
  return EXIT.OK;
}

const MODULE_ID = /^[a-z][a-z0-9_]*$/;

/** Abre /google/start por módulo y espera (polling) a que el probe lo deje conectado. */
export async function connect(ctx: Ctx, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, { timeout: { type: "string" } }, true);
  if (positionals.length === 0) throw usageError("Uso: concat connect <módulo...>  (p. ej. gsc ga4)");
  for (const m of positionals) if (!MODULE_ID.test(m)) throw usageError(`Módulo inválido: ${m}`);
  const timeoutS = values.timeout === undefined ? 180 : Number(values.timeout);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) throw usageError("--timeout debe ser un número de segundos > 0.");

  const results: Array<{ module: string; status: string; resources?: number | null }> = [];
  let code: number = EXIT.OK;
  const fail = (c: number) => {
    if (code === EXIT.OK) code = c;
  };

  for (const id of positionals) {
    const before = (await fetchModules(ctx)).modules.find((m) => m.id === id);
    if (!before) throw usageError(`Módulo desconocido: ${id}`);
    if (before.status === "connected") {
      log(ctx, `${id}: ya está conectado.`);
      results.push({ module: id, status: "connected", resources: before.resource_count ?? null });
      continue;
    }
    const url = `${ctx.gateway}/google/start?module=${encodeURIComponent(id)}`;
    log(ctx, `${id}: autoriza en el navegador. Si no se abre, visita:`);
    log(ctx, `  ${url}`);
    ctx.deps.openBrowser(url);

    const deadline = ctx.deps.net.now() + timeoutS * 1000;
    let final: ModuleRow | undefined;
    while (ctx.deps.net.now() < deadline) {
      await ctx.deps.net.sleep(2000);
      const now = (await fetchModules(ctx)).modules.find((m) => m.id === id);
      if (!now) continue;
      // no_resources solo cuenta si hubo un probe nuevo (evita un estado viejo)
      const fresh = now.last_probe_at !== before.last_probe_at;
      if (now.status === "connected" || (now.status === "no_resources" && fresh)) {
        final = now;
        break;
      }
    }
    if (!final) {
      results.push({ module: id, status: "timeout" });
      log(ctx, `${id}: tiempo agotado esperando la autorización.`);
      fail(EXIT.MODULE);
    } else if (final.status === "no_resources") {
      results.push({ module: id, status: "no_resources", resources: final.resource_count ?? 0 });
      log(ctx, `${id}: autorizado, pero tu cuenta no ve ningún recurso. ${final.last_error ?? ""}`.trimEnd());
      fail(EXIT.PERMISSION);
    } else {
      results.push({ module: id, status: "connected", resources: final.resource_count ?? null });
    }
  }
  if (ctx.json) emit(ctx, { modules: results });
  else ctx.deps.stdout.write(`${renderTable(results)}\n`);
  return code;
}

export async function tools(ctx: Ctx, args: string[]): Promise<number> {
  parse(args, {});
  const client = await ctx.deps.connectTools(ctx.session);
  try {
    const list = await client.listTools();
    const rows = list.map((t) => {
      const c = toolToCommand(t.name);
      return { command: c ? `${c.group} ${c.action}` : t.name, tool: t.name, description: t.description?.split("\n")[0] ?? "" };
    });
    if (ctx.json) {
      emit(
        ctx,
        list.map((t, i) => ({ name: t.name, command: rows[i]?.command, description: t.description ?? "", inputSchema: t.inputSchema })),
      );
    } else {
      ctx.deps.stdout.write(`${renderTable(rows)}\n`);
    }
    return EXIT.OK;
  } finally {
    await client.close().catch(() => {});
  }
}
