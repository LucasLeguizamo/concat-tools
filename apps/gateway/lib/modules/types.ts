import type { z } from "zod";

export type ModuleId =
  | "gsc"
  | "ga4"
  | "gmail"
  | "drive"
  | "docs"
  | "sheets"
  | "slides"
  | "calendar"
  | "chat"
  | "people"
  | "ads";

export type ModuleKind = "native" | "proxy";

/** Estados de conexion (spec §6). Espejo del CHECK de module_state.status. */
export const MODULE_STATUSES = [
  "not_connected",
  "authorized",
  "connected",
  "no_resources",
  "scope_lost",
  "expired",
] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export interface ToolContext {
  userId: string;
  /** Access token de Google del usuario dueño del token del gateway. Solo en memoria; nunca loguear. */
  getAccessToken(): Promise<string>;
}

export interface ProbeResult {
  count: number;
  /** Ejemplo corto (p. ej. nombres de sitios) para mensajes; sin datos sensibles. */
  sample?: string[];
}

/** Error accionable (spec §8): dice exactamente donde arreglarlo. */
export interface ActionableError {
  error: string;
  module: ModuleId | "gateway";
  message: string;
  fix: string;
  next_action: "retry" | "reconnect_module" | "connect_module" | "relogin" | "fix_resource_permission" | "none";
  url?: string;
  retry_after?: number;
}

/** Respuesta de herramientas en las dos puertas (spec §8). */
export interface ToolResult {
  data: unknown;
  meta?: {
    module: ModuleId | "gateway";
    range?: [string, string];
    next_cursor?: string | null;
    warnings?: string[];
    /** true = incluye texto de Google/terceros: datos, nunca instrucciones. Lo fija el gateway, no los modulos. */
    untrusted?: boolean;
  };
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  /** Con prefijo del modulo: `gsc_performance`. */
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  /**
   * Solo modulos proxy: JSON Schema del tools/list remoto (ya filtrado y saneado). Si existe, mcp-server lo usa
   * en vez de `inputSchema` (que queda como marcador laxo) y valida con el validador JSON Schema del SDK.
   */
  jsonInputSchema?: Record<string, unknown>;
  /** v1: todas con readOnlyHint: true. */
  annotations: ToolAnnotations;
  // Sintaxis de metodo (bivariante) para poder guardar ToolDef<Especifico> en ToolDef[].
  handler(ctx: ToolContext, args: z.infer<S>): Promise<ToolResult>;
}

export interface Module {
  id: ModuleId;
  kind: ModuleKind;
  scopes: { read: string[]; write: string[] };
  /** Texto para el usuario: el permiso extra que necesita fuera de Google OAuth. */
  extraPermission: string;
  /** Llamada de lista que define "conectado" (spec §6). */
  probe(ctx: ToolContext): Promise<ProbeResult>;
  tools: ToolDef[];
  explainError(err: unknown): ActionableError;
  /** "Modulo en beta cerrada": fases B/C de la spec §11 (Developer Preview / scopes sin verificar). */
  beta?: boolean;
  /**
   * Solo proxy: las tools salen del `tools/list` remoto, que necesita el token del usuario. Si el remoto no
   * responde devuelve [] (el modulo no registra tools; `remoteStatus()` lo explica en gateway_status).
   */
  listTools?(ctx: ToolContext): Promise<ToolDef[]>;
  /** Solo proxy: ultimo resultado de listTools de ese usuario en esta instancia (para gateway_status). */
  remoteStatus?(userId: string): { ok: boolean; tools: number; error?: string } | undefined;
}
