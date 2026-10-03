import { describe, expect, it } from "vitest";
import { toolCatalog } from "../lib/catalog";
import { moduleIds } from "../lib/modules/registry";
import { loadTasks, scoreCase, toolsFor, type Task } from "./tasks";

describe("tasks.json", () => {
  const tasks = loadTasks();
  const catalog = toolCatalog();

  it("tiene forma valida, ids unicos y modulos reales", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(20);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    for (const t of tasks) {
      expect(t.prompt.length, t.id).toBeGreaterThan(10);
      expect(t.modules.length, t.id).toBeGreaterThan(0);
      for (const m of t.modules) expect(moduleIds(), `${t.id}: ${m}`).toContain(m);
    }
  });

  it("las tools esperadas existen y estan visibles con los modulos del caso", () => {
    for (const t of tasks) {
      if (t.expect.tool === null) continue;
      const offered = new Set(toolsFor(t, catalog).map((x) => x.name));
      for (const name of Array.isArray(t.expect.tool) ? t.expect.tool : [t.expect.tool]) expect(offered.has(name), `${t.id}: ${name}`).toBe(true);
    }
  });

  it("los args esperados existen en el inputSchema de la tool (y son del tipo declarado)", () => {
    for (const t of tasks) {
      const names = t.expect.tool === null ? [] : Array.isArray(t.expect.tool) ? t.expect.tool : [t.expect.tool];
      for (const [k, v] of Object.entries(t.expect.args ?? {})) {
        for (const name of names) {
          const props = (catalog.find((c) => c.name === name)?.inputSchema?.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>;
          expect(props[k], `${t.id}: ${name}.${k}`).toBeDefined();
          if (props[k]?.enum) expect(props[k].enum, `${t.id}: ${k}`).toContain(v);
          if (props[k]?.type === "integer") expect(typeof v, `${t.id}: ${k}`).toBe("number");
        }
      }
    }
  });

  it("cubre cada tool nativa del gateway y hay casos negativos de escritura", () => {
    const covered = new Set(tasks.flatMap((t) => (t.expect.tool === null ? [] : Array.isArray(t.expect.tool) ? t.expect.tool : [t.expect.tool])));
    for (const t of catalog.filter((c) => !c.proxy)) expect(covered.has(t.name), t.name).toBe(true);
    expect(tasks.filter((t) => t.expect.tool === null).length).toBeGreaterThanOrEqual(3);
  });
});

describe("scoreCase", () => {
  const call = (name: string, input: Record<string, unknown> = {}) => ({ name, input });
  it("tool exacta, alternativas y args (cadenas sin mayusculas, numeros exactos)", () => {
    const e: Task["expect"] = { tool: "gsc_performance", args: { site: "SC-DOMAIN:x.com", days: 90 } };
    expect(scoreCase(e, call("gsc_performance", { site: "sc-domain:x.com", days: 90 })).pass).toBe(true);
    expect(scoreCase(e, call("gsc_performance", { site: "sc-domain:x.com", days: "90" })).pass).toBe(false);
    expect(scoreCase(e, call("gsc_list_sites")).reason).toContain("gsc_list_sites");
    expect(scoreCase({ tool: ["a", "b"] }, call("b")).pass).toBe(true);
    expect(scoreCase({ tool: "a" }, null)).toEqual({ pass: false, reason: "no llamo a ninguna tool" });
  });
  it("tool null = no debe llamar a nada", () => {
    expect(scoreCase({ tool: null }, null).pass).toBe(true);
    expect(scoreCase({ tool: null }, call("gmail_send_message")).pass).toBe(false);
  });
});
