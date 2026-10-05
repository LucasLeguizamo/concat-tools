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

const profileNote = (ctx: Ctx): string => (ctx.profile ? ` (perfil ${ctx.profile})` : "");

/** Abre la URL, o con --copy la copia al portapapeles para abrirla en otro navegador/perfil. */
const opener = (ctx: Ctx, copy: boolean | undefined) => async (url: string) => {
  if (!copy) return ctx.deps.openBrowser(url);
  log(
    ctx,
    (await ctx.deps.copy(url))
      ? "Link copiado al portapapeles: pégalo en el navegador o perfil con la cuenta que quieres usar."
      : "No se pudo copiar al portapapeles: copia el link de arriba a mano.",
  );
};

export async function login(ctx: Ctx, args: string[]): Promise<number> {
  const { values } = parse(args, { device: { type: "boolean" }, copy: { type: "boolean" } });
  if (values.device && values.copy) throw usageError("Usa --device o --copy, no ambos.");
  const md = await discover(ctx.gateway, ctx.deps.net);
  if (ctx.profile) log(ctx, `Perfil: ${ctx.profile}. Inicia sesión con la cuenta de Google de este perfil.`);
  const io = { log: (l: string) => log(ctx, l), openBrowser: opener(ctx, values.copy) };
  const creds = values.device
    ? await loginDevice(md, ctx.deps.net, io)
    : await loginLoopback(md, ctx.deps.net, io);
  await ctx.deps.store.save(ctx.key, creds);
  done(ctx, `Sesión iniciada en ${ctx.gateway}${profileNote(ctx)}.`, {
    logged_in: true,
    gateway: ctx.gateway,
    profile: ctx.profile ?? null,
  });
  return EXIT.OK;
}

export async function logout(ctx: Ctx, args: string[]): Promise<number> {
  parse(args, {});
  const creds = await ctx.deps.store.load(ctx.key);
  const token = creds?.refresh_token ?? creds?.access_token;
  if (token) {
    try {
      await revokeToken(await discover(ctx.gateway, ctx.deps.net), ctx.deps.net, token);
    } catch {
      // sin red o sin metadata: igual se borra la copia local
    }
  }
  await ctx.deps.store.clear(ctx.key);
  done(ctx, `Sesión cerrada${profileNote(ctx)}.`, { logged_in: false, gateway: ctx.gateway, profile: ctx.profile ?? null });
  return EXIT.OK;
}

interface ModuleRow {
  id: string;
  status: string;
  beta?: boolean;
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
    if (ctx.profile) log(ctx, `Perfil: ${ctx.profile}`);
    ctx.deps.stdout.write(
      `${renderTable(
        modules.map((m) => ({
          module: m.beta ? `${m.id} (beta)` : m.id,
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
  const { values, positionals } = parse(args, { timeout: { type: "string" }, copy: { type: "boolean" } }, true);
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
    if (before.beta) log(ctx, `${id}: módulo en beta cerrada (solo cuentas de la lista de prueba de Google).`);
    const url = `${ctx.gateway}/google/start?module=${encodeURIComponent(id)}`;
    log(ctx, `${id}: autoriza en el navegador. Si no se abre, visita:`);
    log(ctx, `  ${url}`);
    await opener(ctx, values.copy)(url);

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

/** Desconecta módulos: el gateway revoca en Google solo si ningún otro módulo usa el permiso. */
export async function disconnect(ctx: Ctx, args: string[]): Promise<number> {
  const { positionals } = parse(args, {}, true);
  if (positionals.length === 0) throw usageError("Uso: concat disconnect <módulo...>");
  for (const m of positionals) if (!MODULE_ID.test(m)) throw usageError(`Módulo inválido: ${m}`);
  const results: Array<{ module: string; disconnected: boolean; revoked_at_google: boolean }> = [];
  for (const id of positionals) {
    const body = (await ctx.session.api(`/api/modules/${encodeURIComponent(id)}`, { method: "DELETE" })) as {
      revoked_at_google?: boolean;
    };
    results.push({ module: id, disconnected: true, revoked_at_google: body?.revoked_at_google === true });
  }
  if (ctx.json) emit(ctx, { modules: results });
  else {
    for (const r of results) {
      log(ctx, `${r.module}: desconectado${r.revoked_at_google ? " (acceso revocado en Google)" : ""}.`);
    }
  }
  return EXIT.OK;
}

interface TokenRow {
  id: string;
  name: string | null;
  scope: string[];
  created_at?: string;
  expires_at?: string;
  token?: string;
}

const EXPIRES = /^(\d{1,3})d?$/;

/** `concat tokens create|list|revoke`: tokens del gateway para n8n/CI (el secreto se muestra una sola vez). */
export async function tokens(ctx: Ctx, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === "create") {
    const { values } = parse(rest, { name: { type: "string" }, scope: { type: "string" }, expires: { type: "string" } });
    if (!values.name) throw usageError("Uso: concat tokens create --name <nombre> [--scope gsc,ga4] [--expires 90d]");
    const m = EXPIRES.exec(values.expires ?? "90d");
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 365) throw usageError("--expires debe ser de 1d a 365d (p. ej. 90d).");
    const scope = (values.scope ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
    for (const s of scope) if (s !== "*" && !MODULE_ID.test(s)) throw usageError(`Módulo inválido en --scope: ${s}`);
    const created = (await ctx.session.api("/api/tokens", {
      method: "POST",
      body: { name: values.name, scope, expires_in_days: Number(m[1]) },
    })) as TokenRow;
    if (ctx.json) emit(ctx, created);
    else {
      // Secreto solo a stdout (puede capturarse con $(...)); el aviso va a stderr.
      ctx.deps.stdout.write(`${created.token ?? ""}\n`);
      log(ctx, `Token "${created.name ?? values.name}" (id ${created.id}) creado. Guárdalo ahora: no se vuelve a mostrar.`);
    }
    return EXIT.OK;
  }
  if (sub === "list") {
    parse(rest, {});
    const body = (await ctx.session.api("/api/tokens")) as { tokens?: TokenRow[] };
    const list = body?.tokens ?? [];
    if (ctx.json) emit(ctx, { tokens: list });
    else {
      ctx.deps.stdout.write(
        `${renderTable(list.map((t) => ({ id: t.id, name: t.name ?? "", scope: t.scope.join(","), expires: t.expires_at ?? "" })))}\n`,
      );
    }
    return EXIT.OK;
  }
  if (sub === "revoke") {
    const { positionals } = parse(rest, {}, true);
    if (positionals.length !== 1) throw usageError("Uso: concat tokens revoke <id>");
    const id = positionals[0]!;
    await ctx.session.api(`/api/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    done(ctx, `Token ${id} revocado.`, { revoked: true, id });
    return EXIT.OK;
  }
  throw usageError("Uso: concat tokens create|list|revoke ...");
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
