import { getDb } from "./db";
import { getAccessToken } from "./google-token";
import { ActionableException, connectUrl, fillEmail, NoResourcesError } from "./modules/errors";
import { getModule, modules } from "./modules/registry";
import type { ActionableError, Module, ModuleId, ModuleStatus, ToolContext } from "./modules/types";
import { redact, toSafeError } from "./safe-error";

export { connectUrl };

const MAX_LAST_ERROR = 500;

/** Un modulo concreto del registry; falla claro si el id no existe. */
function requireModule(id: ModuleId): Module {
  const mod = getModule(id);
  if (!mod) throw new Error(`modulo desconocido: ${id}`);
  return mod;
}

export function toolContext(userId: string, mod: Module): ToolContext {
  return {
    userId,
    getAccessToken: () => getAccessToken(userId, mod.scopes.read),
    getAccessTokenFor: (id) => getAccessToken(userId, requireModule(id).scopes.read),
  };
}

async function emailOf(userId: string): Promise<string | undefined> {
  const rows = await getDb()<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}`;
  return rows[0]?.email;
}

/**
 * Cualquier error -> ActionableError listo para el agente (con el correo del usuario rellenado).
 * Los errores de Google ya pasaron por toSafeError() al crearse; lo desconocido se sanea aqui.
 */
export async function toActionable(userId: string, mod: Module, err: unknown): Promise<ActionableError> {
  let actionable: ActionableError;
  if (err instanceof ActionableException) {
    actionable = err.actionable;
  } else {
    try {
      actionable = mod.explainError(err);
    } catch (inner) {
      actionable = {
        error: "internal_error",
        module: mod.id,
        message: toSafeError(inner).message,
        fix: "Reintenta; si persiste, avisa al administrador del gateway.",
        next_action: "retry",
      };
    }
  }
  return fillEmail(actionable, await emailOf(userId).catch(() => undefined));
}

/** Estado de modulo derivado de un error accionable. */
export function statusFromError(code: string, previous: ModuleStatus | undefined): ModuleStatus {
  switch (code) {
    case "scope_lost":
      // Nunca conectado (p. ej. el usuario desmarco el permiso en el consentimiento granular): sigue sin conectar.
      return !previous || previous === "not_connected" ? "not_connected" : "scope_lost";
    case "session_expired":
    case "grant_unreadable":
      return "expired";
    case "not_connected":
      return "not_connected";
    case "missing_resource_permission":
    case "no_resources":
      return "no_resources";
    default:
      // Fallo transitorio (cuota, 5xx): no degradar un estado conocido.
      return !previous || previous === "not_connected" ? "authorized" : previous;
  }
}

async function previousStatus(userId: string, moduleId: ModuleId): Promise<ModuleStatus | undefined> {
  const rows = await getDb()<{ status: ModuleStatus }[]>`
    SELECT status FROM module_state WHERE user_id = ${userId} AND module = ${moduleId}
  `;
  return rows[0]?.status;
}

/**
 * Corre el probe del modulo (llamada de lista) y persiste el estado real (spec §6):
 * connected (>=1), no_resources (0), scope_lost, expired. `last_error` siempre saneado.
 */
export async function runProbe(userId: string, moduleId: ModuleId): Promise<ModuleStatus> {
  const mod = requireModule(moduleId);
  const sql = getDb();
  const previous = await previousStatus(userId, moduleId);

  let status: ModuleStatus;
  let lastError: string | null = null;
  let resourceCount: number | null = null;

  try {
    const res = await mod.probe(toolContext(userId, mod));
    resourceCount = res.count;
    if (res.count >= 1) {
      status = "connected";
    } else {
      status = "no_resources";
      const a = await toActionable(userId, mod, new NoResourcesError());
      lastError = `${a.message} ${a.fix}`;
    }
  } catch (e) {
    const a = await toActionable(userId, mod, e);
    status = statusFromError(a.error, previous);
    lastError = `${a.message} ${a.fix}`;
  }

  const safeLastError = lastError === null ? null : redact(lastError).slice(0, MAX_LAST_ERROR);
  await sql`
    INSERT INTO module_state (user_id, module, status, last_probe_at, last_error, resource_count)
    VALUES (${userId}, ${moduleId}, ${status}, now(), ${safeLastError}, ${resourceCount})
    ON CONFLICT (user_id, module) DO UPDATE SET
      status = EXCLUDED.status,
      last_probe_at = EXCLUDED.last_probe_at,
      last_error = EXCLUDED.last_error,
      resource_count = COALESCE(EXCLUDED.resource_count, module_state.resource_count)
  `;
  return status;
}

/** Marca un modulo como scope_lost/expired cuando una llamada real lo descubre (sin tocar last_probe_at). */
export async function markModuleFailure(userId: string, moduleId: ModuleId, a: ActionableError): Promise<void> {
  if (a.error !== "scope_lost" && a.error !== "session_expired") return;
  const previous = await previousStatus(userId, moduleId);
  const status = statusFromError(a.error, previous);
  const lastError = redact(`${a.message} ${a.fix}`).slice(0, MAX_LAST_ERROR);
  await getDb()`
    INSERT INTO module_state (user_id, module, status, last_error)
    VALUES (${userId}, ${moduleId}, ${status}, ${lastError})
    ON CONFLICT (user_id, module) DO UPDATE SET status = EXCLUDED.status, last_error = EXCLUDED.last_error
  `;
}

export type ModuleStatusEntry = {
  id: ModuleId;
  status: ModuleStatus;
  last_probe_at: string | null;
  resource_count: number | null;
  last_error: string | null;
  connect_url: string;
  /** true = "modulo en beta cerrada" (fases B/C, spec §11). */
  beta: boolean;
  /** Accion pendiente en una frase (null si no hay). */
  action: string | null;
};

function pendingAction(mod: Module, status: ModuleStatus): string | null {
  switch (status) {
    case "connected":
      return null;
    case "not_connected":
      return `Conectar el modulo ${mod.id} con gateway_connect_url.`;
    case "authorized":
      return "Autorizado pero aun sin verificar; reintenta en unos instantes.";
    case "no_resources":
      return `Falta acceso a recursos: ${mod.extraPermission}`;
    case "scope_lost":
      return `Reconectar el modulo ${mod.id} con gateway_connect_url (solo se pide su permiso).`;
    case "expired":
      return "Volver a iniciar sesion (concat login).";
  }
}

/** Estado por modulo del registry, limitado a los modulos del scope del token. */
export async function getModuleStatuses(userId: string, allowed: (id: ModuleId) => boolean): Promise<ModuleStatusEntry[]> {
  const rows = await getDb()<
    { module: string; status: ModuleStatus; last_probe_at: Date | null; last_error: string | null; resource_count: number | null }[]
  >`SELECT module, status, last_probe_at, last_error, resource_count FROM module_state WHERE user_id = ${userId}`;
  const byModule = new Map(rows.map((r) => [r.module, r]));
  return modules
    .filter((m) => allowed(m.id))
    .map((m) => {
      const r = byModule.get(m.id);
      const status: ModuleStatus = r?.status ?? "not_connected";
      return {
        id: m.id,
        status,
        last_probe_at: r?.last_probe_at ? r.last_probe_at.toISOString() : null,
        resource_count: r?.resource_count ?? null,
        last_error: r?.last_error ?? null,
        connect_url: connectUrl(m.id),
        beta: m.beta === true,
        action: pendingAction(m, status),
      };
    });
}
