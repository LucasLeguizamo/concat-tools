import { z } from "zod";
import { gatewayConnectUrlTool, gatewayStatusTool } from "./gateway-tools";
import { modules } from "./modules/registry";
import type { ModuleId } from "./modules/types";
import { WORKSPACE_DEFS } from "./modules/workspace-proxy";

// Catalogo estatico de tools para docs y evals, leido del registro real. Los modulos proxy (Workspace) traen sus
// tools y esquemas del `tools/list` remoto en runtime: aqui solo se conoce la allowlist (nombre), no el esquema.

export type CatalogTool = {
  name: string;
  module: ModuleId | "gateway";
  description: string;
  /** JSON Schema de entrada; `null` si solo existe en runtime (tools proxy). */
  inputSchema: Record<string, unknown> | null;
  proxy: boolean;
  beta: boolean;
};

const toJson = (schema: z.ZodType) => {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
};

export function toolCatalog(): CatalogTool[] {
  const out: CatalogTool[] = [];
  for (const m of modules) {
    if (m.kind === "native") {
      for (const t of m.tools) {
        out.push({ name: t.name, module: m.id, description: t.description, inputSchema: toJson(t.inputSchema), proxy: false, beta: m.beta === true });
      }
    } else {
      const def = WORKSPACE_DEFS.find((d) => d.id === m.id);
      for (const remote of def?.allow ?? []) {
        out.push({ name: `${m.id}_${remote}`, module: m.id, description: "", inputSchema: null, proxy: true, beta: m.beta === true });
      }
    }
  }
  for (const t of [gatewayStatusTool, gatewayConnectUrlTool]) {
    out.push({ name: t.name, module: "gateway", description: t.description, inputSchema: toJson(t.inputSchema), proxy: false, beta: false });
  }
  return out;
}
