import { describe, expect, it } from "vitest";
import { commandToTool, findTool, toolToCommand } from "../src/mapping.js";

describe("mapeo tool <-> comando", () => {
  it("el primer _ separa grupo; el resto _ pasa a -", () => {
    expect(toolToCommand("gsc_performance")).toEqual({ group: "gsc", action: "performance" });
    expect(toolToCommand("gsc_list_sites")).toEqual({ group: "gsc", action: "list-sites" });
    expect(toolToCommand("ga4_daily_report")).toEqual({ group: "ga4", action: "daily-report" });
    expect(toolToCommand("gateway_connect_url")).toEqual({ group: "gateway", action: "connect-url" });
  });

  it("nombres sin grupo/acción no mapean", () => {
    expect(toolToCommand("ping")).toBeNull();
    expect(toolToCommand("_x")).toBeNull();
    expect(toolToCommand("x_")).toBeNull();
  });

  it("es reversible", () => {
    for (const t of ["gsc_list_sitemaps", "ga4_list_properties", "gsc_performance"]) {
      const c = toolToCommand(t)!;
      expect(commandToTool(c.group, c.action)).toBe(t);
    }
  });

  it("findTool resuelve contra el catálogo", () => {
    const tools = [{ name: "gsc_list_sites" }, { name: "ga4_daily_report" }];
    expect(findTool(tools, "gsc", "list-sites")).toBe(tools[0]);
    expect(findTool(tools, "gsc", "nope")).toBeUndefined();
  });
});
