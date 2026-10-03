import type { Deps } from "./deps.js";
import { usageError } from "./errors.js";
import { formatOutput } from "./format.js";
import { API_TOKEN_RE, createSession, type Session } from "./session.js";

export interface Ctx {
  deps: Deps;
  gateway: string;
  /** --json explícito o stdout no es TTY. */
  json: boolean;
  session: Session;
}

export function createCtx(deps: Deps, gateway: string, jsonFlag: boolean): Ctx {
  const apiToken = deps.env.CONCAT_TOKEN?.trim() || undefined;
  if (apiToken && !API_TOKEN_RE.test(apiToken)) {
    throw usageError("CONCAT_TOKEN no tiene formato de token de API (cgw_…).");
  }
  return {
    deps,
    gateway,
    json: jsonFlag || !deps.stdout.isTTY,
    session: createSession(gateway, deps.store, deps.net, apiToken),
  };
}

/** Escribe un valor a stdout (JSON o tabla) y los avisos a stderr. */
export function emit(ctx: Ctx, value: unknown): void {
  const out = formatOutput(value, { json: ctx.json, isTTY: ctx.deps.stdout.isTTY });
  ctx.deps.stdout.write(`${out.stdout}\n`);
  for (const line of out.stderr) ctx.deps.stderr.write(`${line}\n`);
}

/** Mensaje de progreso para el humano (stderr, nunca contamina stdout). */
export const log = (ctx: Ctx, line: string): void => void ctx.deps.stderr.write(`${line}\n`);
