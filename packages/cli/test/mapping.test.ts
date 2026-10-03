import { describe, expect, it } from "vitest";
import { commandToTool, findTool, toolToCommand } from "../src/mapping.js";

describe("mapeo tool <-> comando", () => {
  it("el primer _ separa grupo; el resto _ pasa a -", () => {
    expect(toolToCommand("gsc_performance")).toEqual({ group: "gsc", action: "performance" });
    expect(toolToCommand("gsc_list_sites")).toEqual({ group: "gsc", action: "list-sites" });
    expect(toolToCommand("ga4_daily_report")).toEqual({ group: "ga4", action: "daily-report" });
    expect(toolToCommand("gateway_connect_url")).toEqual({ group: "gateway", action: "connect-url" });
  });

  it("tools de ads y de los proxies de Workspace", () => {
    const cases: Array<[string, string, string]> = [
      ["ads_list_customers", "ads", "list-customers"],
      ["ads_search", "ads", "search"],
      ["gmail_search_threads", "gmail", "search-threads"],
      ["gmail_get_thread", "gmail", "get-thread"],
      ["drive_read_file_content", "drive", "read-file-content"],
      ["docs_read_doc", "docs", "read-doc"],
      ["sheets_get_values", "sheets", "get-values"],
      ["slides_read_presentation", "slides", "read-presentation"],
      ["calendar_list_events", "calendar", "list-events"],
      ["chat_search_messages", "chat", "search-messages"],
      ["people_get_user_profile", "people", "get-user-profile"],
    ];
    for (const [tool, group, action] of cases) {
      expect(toolToCommand(tool)).toEqual({ group, action });
      expect(commandToTool(group, action)).toBe(tool);
    }
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
