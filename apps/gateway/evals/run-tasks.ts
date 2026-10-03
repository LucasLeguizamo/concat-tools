// `pnpm eval:tasks`: da el catalogo real de tools a un modelo y mide si elige la correcta para cada caso de tasks.json.
// Requiere ANTHROPIC_API_KEY (sin ella sale con codigo 0 para no romper CI). Variables opcionales:
//   EVAL_MODEL (default claude-sonnet-5-5), EVAL_MIN_PASS (0-1, default 0.85), EVAL_ONLY (ids separados por coma).
import Anthropic from "@anthropic-ai/sdk";
import { loadTasks, scoreCase, toolsFor, type ToolCall } from "./tasks";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("eval:tasks omitido: define ANTHROPIC_API_KEY para ejecutar los evals de tareas contra el modelo.");
  process.exit(0);
}

const model = process.env.EVAL_MODEL ?? "claude-sonnet-5-5";
const minPass = Number(process.env.EVAL_MIN_PASS ?? "0.85");
const only = process.env.EVAL_ONLY?.split(",").map((s) => s.trim());
const client = new Anthropic({ apiKey });

const SYSTEM =
  "Eres un agente con acceso a las herramientas de CONCAT Google Gateway (solo lectura). " +
  "Si la peticion se puede resolver con una herramienta, llamala; si no hay ninguna herramienta que pueda hacerlo (p. ej. enviar, borrar o editar), explicalo sin llamar a ninguna.";

async function firstToolCall(prompt: string, modules: string[]): Promise<ToolCall> {
  const tools = toolsFor({ modules }).map((t) => ({
    name: t.name,
    description: t.description || "Herramienta de solo lectura de Google Workspace (proxy MCP).",
    input_schema: (t.inputSchema ?? { type: "object", additionalProperties: true }) as Anthropic.Tool.InputSchema,
  }));
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM,
    tools,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  return block?.type === "tool_use" ? { name: block.name, input: (block.input ?? {}) as Record<string, unknown> } : null;
}

const tasks = loadTasks().filter((t) => !only || only.includes(t.id));
let passed = 0;
for (const task of tasks) {
  let line: string;
  try {
    const score = scoreCase(task.expect, await firstToolCall(task.prompt, task.modules));
    if (score.pass) passed++;
    line = `${score.pass ? "PASS" : "FAIL"}  ${task.id}${score.reason ? `  (${score.reason})` : ""}`;
  } catch (e) {
    // Mensaje del SDK: nunca incluye la API key.
    line = `ERROR ${task.id}  (${e instanceof Error ? e.message : "error"})`;
  }
  console.log(line);
}
const rate = tasks.length ? passed / tasks.length : 0;
console.log(`\n${passed}/${tasks.length} (${(rate * 100).toFixed(0)}%) con ${model}; minimo ${(minPass * 100).toFixed(0)}%`);
process.exit(rate >= minPass ? 0 : 1);
