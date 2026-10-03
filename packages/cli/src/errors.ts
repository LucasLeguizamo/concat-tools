/** Exit codes (spec §8). */
export const EXIT = {
  OK: 0,
  OTHER: 1,
  USAGE: 2,
  UNAUTHENTICATED: 3,
  QUOTA: 4,
  MODULE: 5,
  PERMISSION: 6,
} as const;

/** Espejo estructural del ActionableError del gateway (lib/modules/types.ts). */
export interface ActionableError {
  error: string;
  module?: string;
  message: string;
  fix?: string;
  next_action?: string;
  url?: string;
  retry_after?: number;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.OTHER,
    readonly details: Partial<ActionableError> = {},
  ) {
    super(message);
    this.name = "CliError";
  }

  toActionable(): ActionableError {
    return {
      error: this.details.error ?? "cli_error",
      message: this.message,
      ...this.details,
    };
  }
}

export const usageError = (message: string): CliError =>
  new CliError(message, EXIT.USAGE, { error: "usage" });

export const notAuthenticated = (message = "No has iniciado sesión."): CliError =>
  new CliError(message, EXIT.UNAUTHENTICATED, {
    error: "unauthenticated",
    fix: "Ejecuta: concat login",
    next_action: "relogin",
  });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Valida de forma laxa que un valor devuelto por el gateway tiene forma de ActionableError. */
export function asActionable(v: unknown): ActionableError | undefined {
  if (!isRecord(v) || typeof v.error !== "string") return undefined;
  const out: ActionableError = {
    error: v.error,
    message: typeof v.message === "string" ? v.message : v.error,
  };
  if (typeof v.module === "string") out.module = v.module;
  if (typeof v.fix === "string") out.fix = v.fix;
  if (typeof v.next_action === "string") out.next_action = v.next_action;
  if (typeof v.url === "string") out.url = v.url;
  if (typeof v.retry_after === "number") out.retry_after = v.retry_after;
  return out;
}

/** Selección del exit code para un error accionable del gateway (spec §8). */
export function exitCodeForActionable(e: ActionableError): number {
  const code = e.error.toLowerCase();
  const action = e.next_action;
  if (
    action === "relogin" ||
    ["unauthenticated", "unauthorized", "invalid_token", "invalid_grant", "login_required"].includes(code)
  ) {
    return EXIT.UNAUTHENTICATED;
  }
  if (e.retry_after !== undefined || /quota|rate_?limit|too_many/.test(code)) return EXIT.QUOTA;
  if (
    action === "connect_module" ||
    action === "reconnect_module" ||
    ["module_not_connected", "not_connected", "scope_lost", "insufficient_scope"].includes(code)
  ) {
    return EXIT.MODULE;
  }
  if (action === "fix_resource_permission" || /permission/.test(code)) return EXIT.PERMISSION;
  return EXIT.OTHER;
}

/** Texto humano de un error accionable: mensaje, fix y url. */
export function formatActionable(e: ActionableError): string {
  const lines = [`Error: ${e.message}`];
  if (e.retry_after !== undefined) lines.push(`Reintenta en ${e.retry_after}s.`);
  if (e.fix) lines.push(`Cómo arreglarlo: ${e.fix}`);
  if (e.url) lines.push(`URL: ${e.url}`);
  return lines.join("\n");
}

/** Quita credenciales de cualquier texto externo antes de mostrarlo. */
export function scrub(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[REDACTED]")
    .replace(/((?:refresh_token|access_token|id_token|code_verifier|device_code)"?\s*[:=]\s*)("[^"]*"|[^\s&,}]+)/gi, "$1[REDACTED]");
}
