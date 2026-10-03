import { readFileSync } from "node:fs";
import { toolCatalog, type CatalogTool } from "../lib/catalog";

// Casos de tarea: pregunta del usuario -> tool esperada (y args clave). Los usa el test de validez (vitest, sin red)
// y el runner opcional `pnpm eval:tasks`, que se los da a un modelo con el catalogo real.

export type TaskExpect = {
  /** Primera tool que debe elegir el modelo; un array = cualquiera de ellas; `null` = NO debe llamar a ninguna (p. ej. pedir una escritura). */
  tool: string | string[] | null;
  /** Subconjunto de argumentos que deben coincidir (cadenas sin distinguir mayusculas). */
  args?: Record<string, string | number | boolean>;
};
export type Task = { id: string; prompt: string; /** Modulos conectados: solo sus tools (mas gateway_*) se le ofrecen al modelo. */ modules: string[]; expect: TaskExpect };

export const loadTasks = (): Task[] => JSON.parse(readFileSync(new URL("./tasks.json", import.meta.url), "utf8")) as Task[];

/** Lo que vería el agente en tools/list con esos modulos conectados. */
export function toolsFor(task: Pick<Task, "modules">, catalog: CatalogTool[] = toolCatalog()): CatalogTool[] {
  return catalog.filter((t) => t.module === "gateway" || task.modules.includes(t.module));
}

export type ToolCall = { name: string; input: Record<string, unknown> } | null;
export type Score = { pass: boolean; reason?: string };

const same = (a: unknown, b: string | number | boolean) =>
  typeof a === "string" && typeof b === "string" ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b;

export function scoreCase(expect: TaskExpect, call: ToolCall): Score {
  if (expect.tool === null) return call ? { pass: false, reason: `llamo a ${call.name} y no debia llamar a ninguna tool` } : { pass: true };
  if (!call) return { pass: false, reason: "no llamo a ninguna tool" };
  const allowed = Array.isArray(expect.tool) ? expect.tool : [expect.tool];
  if (!allowed.includes(call.name)) return { pass: false, reason: `eligio ${call.name}, esperaba ${allowed.join(" | ")}` };
  for (const [k, want] of Object.entries(expect.args ?? {})) {
    if (!same(call.input[k], want)) return { pass: false, reason: `arg ${k}=${JSON.stringify(call.input[k])}, esperaba ${JSON.stringify(want)}` };
  }
  return { pass: true };
}
