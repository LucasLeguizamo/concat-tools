import { getEnv } from "../env";
import { toSafeError, type SafeError } from "../safe-error";
import type { ActionableError, ModuleId } from "./types";

/** `${PUBLIC_URL}/google/start?module=<id>` (contrato B -> A). */
export function connectUrl(moduleId: ModuleId): string {
  return `${getEnv().PUBLIC_URL}/google/start?module=${encodeURIComponent(moduleId)}`;
}

/** Excepcion que transporta un ActionableError ya listo para el agente. */
export class ActionableException extends Error {
  constructor(readonly actionable: ActionableError) {
    super(actionable.message);
    this.name = "ActionableException";
  }
}

/** El probe devolvio 0 recursos (estado `no_resources`). explainError() lo convierte en la instruccion exacta. */
export class NoResourcesError extends Error {
  constructor() {
    super("el probe no devolvio recursos");
    this.name = "NoResourcesError";
  }
}

/** Error HTTP de una API de Google. `safe` ya paso por toSafeError(): nunca contiene tokens ni el cuerpo crudo. */
export class GoogleApiError extends Error {
  /** Recurso consultado (p. ej. id de propiedad GA4); lo fija el handler para mensajes accionables. */
  resource?: string;
  constructor(
    readonly safe: SafeError,
    readonly retryAfter?: number,
  ) {
    super(safe.message);
    this.name = "GoogleApiError";
  }
  get status(): number | undefined {
    return this.safe.status;
  }
}

const EMAIL_PLACEHOLDER = "{email}";

/** Los modulos no conocen el correo del usuario: escriben `{email}` y se rellena al entregar el error. */
export function fillEmail(err: ActionableError, email: string | undefined): ActionableError {
  const value = email ?? "tu cuenta de Google";
  const sub = (s: string) => s.split(EMAIL_PLACEHOLDER).join(value);
  return { ...err, message: sub(err.message), fix: sub(err.fix) };
}

/** Texto de error de un fetch fallido -> GoogleApiError (siempre via toSafeError). */
export async function googleApiErrorFrom(res: Response): Promise<GoogleApiError> {
  let data: unknown;
  try {
    data = await res.text();
  } catch {
    data = undefined;
  }
  const safe = toSafeError({ response: { status: res.status, data } });
  const retryAfter = res.headers.get("retry-after");
  return new GoogleApiError(safe, retryAfter && /^\d{1,6}$/.test(retryAfter) ? Number(retryAfter) : undefined);
}

const GOOGLE_FETCH_TIMEOUT_MS = 20_000;

/** fetch hacia una API de Google con el access token. Lanza GoogleApiError si !ok. */
export async function googleFetch(
  url: string,
  accessToken: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    // Errores de red/timeout: mensaje saneado, sin URL ni headers.
    throw new GoogleApiError(toSafeError(e));
  }
  if (!res.ok) throw await googleApiErrorFrom(res);
  try {
    return await res.json();
  } catch {
    throw new GoogleApiError({ message: "Google devolvio una respuesta no JSON", status: res.status });
  }
}

/** Clasificacion comun de errores de Google (la usan explainError de cada modulo). */
export type GoogleErrorKind =
  | "scope_lost"
  | "resource_permission"
  | "quota"
  | "api_disabled"
  | "not_found"
  | "upstream";

export function classifyGoogleError(err: unknown): GoogleErrorKind {
  if (!(err instanceof GoogleApiError)) return "upstream";
  const { status, code, message } = err.safe;
  const text = `${code ?? ""} ${message}`.toLowerCase();
  if (status === 429 || /rate.?limit|quota/.test(text)) return "quota";
  if (/has not been used|is disabled|service_disabled|accessnotconfigured/.test(text)) return "api_disabled";
  if (
    status === 401 ||
    /insufficient authentication scopes|insufficientpermissions|access_token_scope_insufficient|invalid_scope/.test(text)
  ) {
    return "scope_lost";
  }
  if (status === 403 || code === "PERMISSION_DENIED") return "resource_permission";
  if (status === 404) return "not_found";
  return "upstream";
}

export function retryAfterOf(err: unknown): number | undefined {
  return err instanceof GoogleApiError ? err.retryAfter : undefined;
}

/** Errores comunes (cuota, API deshabilitada, upstream) con un `module` dado. Devuelve undefined si es de otro tipo. */
export function commonActionable(module: ModuleId, err: unknown, kind: GoogleErrorKind): ActionableError | undefined {
  if (kind === "quota") {
    const wait = retryAfterOf(err);
    return {
      error: "quota_exceeded",
      module,
      message: `Google limito las solicitudes del modulo ${module} (cuota del proyecto del gateway).${wait ? ` Reintenta en ${wait}s.` : ""}`,
      fix: "Espera unos segundos y reintenta; reduce el rango o el limit si se repite.",
      next_action: "retry",
      ...(wait ? { retry_after: wait } : {}),
    };
  }
  if (kind === "api_disabled") {
    return {
      error: "api_disabled",
      module,
      message: `La API de Google necesaria para ${module} no esta habilitada en el proyecto del gateway.`,
      fix: "Habilitala en Google Cloud Console (APIs y servicios) del proyecto del gateway. No depende de tu cuenta.",
      next_action: "none",
    };
  }
  if (kind === "upstream") {
    return {
      error: "upstream_error",
      module,
      message: err instanceof GoogleApiError ? `Google respondio con un error: ${err.safe.message}` : "Fallo la llamada a Google.",
      fix: "Reintenta en unos instantes. Si persiste, revisa `gateway_status`.",
      next_action: "retry",
    };
  }
  return undefined;
}

export function scopeLostActionable(module: ModuleId): ActionableError {
  return {
    error: "scope_lost",
    module,
    message: `El modulo ${module} perdio el permiso de Google necesario (revocado o no concedido).`,
    fix: "Vuelve a conectar el modulo con el enlace indicado; se pedira unicamente el permiso de este modulo.",
    next_action: "reconnect_module",
    url: connectUrl(module),
  };
}
