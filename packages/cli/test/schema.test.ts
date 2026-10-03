import { describe, expect, it } from "vitest";
import { parseFlags, renderHelp, schemaToFlags, type JsonSchema } from "../src/schema.js";

const schema: JsonSchema = {
  type: "object",
  properties: {
    site: { type: "string", description: "Sitio" },
    start_date: { type: ["string", "null"] },
    by: { type: "string", enum: ["query", "page"], default: "query" },
    limit: { type: "integer" },
    ratio: { type: "number" },
    dryRun: { type: "boolean" },
    dimensions: { type: "array", items: { type: "string", enum: ["a", "b", "c"] } },
    ids: { type: "array", items: { type: "integer" } },
    filter: { anyOf: [{ type: "object" }, { type: "null" }] },
    json: { type: "string" }, // colisiona con --json: se omite
  },
  required: ["site"],
};

const flags = schemaToFlags(schema);

describe("schemaToFlags", () => {
  it("deriva nombres kebab-case y tipos", () => {
    const by = Object.fromEntries(flags.map((f) => [f.flag, f]));
    expect(Object.keys(by)).toEqual(["site", "start-date", "by", "limit", "ratio", "dry-run", "dimensions", "ids", "filter"]);
    expect(by.site).toMatchObject({ type: "string", required: true });
    expect(by["start-date"]).toMatchObject({ prop: "start_date", type: "string", required: false });
    expect(by.by).toMatchObject({ enum: ["query", "page"], default: "query" });
    expect(by["dry-run"]?.type).toBe("boolean");
    expect(by.filter?.type).toBe("json");
    expect(by.ids).toMatchObject({ type: "array", itemType: "integer" });
  });
});

describe("parseFlags", () => {
  it("coacciona string/number/integer/boolean/enum/array", () => {
    const { args } = parseFlags(flags, [
      "--site", "sc-domain:onconcat.com", "--by", "page", "--limit", "20", "--ratio=0.5",
      "--dry-run", "--dimensions", "a,b", "--dimensions", "c", "--ids", "1,2", "--start-date", "2026-09-01",
      "--filter", '{"x":1}',
    ]);
    expect(args).toEqual({
      site: "sc-domain:onconcat.com", by: "page", limit: 20, ratio: 0.5, dryRun: true,
      dimensions: ["a", "b", "c"], ids: [1, 2], start_date: "2026-09-01", filter: { x: 1 },
    });
  });

  it("--no-<flag> da false", () => {
    expect(parseFlags(flags, ["--site", "x", "--no-dry-run"]).args.dryRun).toBe(false);
  });

  it("exige las required", () => {
    expect(() => parseFlags(flags, ["--limit", "1"])).toThrow(/--site/);
  });

  it("rechaza enum, número y entero inválidos y flags desconocidas", () => {
    expect(() => parseFlags(flags, ["--site", "x", "--by", "zzz"])).toThrow(/Valores permitidos: query, page/);
    expect(() => parseFlags(flags, ["--site", "x", "--limit", "abc"])).toThrow(/no es un número/);
    expect(() => parseFlags(flags, ["--site", "x", "--limit", "1.5"])).toThrow(/no es un entero/);
    expect(() => parseFlags(flags, ["--site", "x", "--dimensions", "a,z"])).toThrow(/inválido/);
    expect(() => parseFlags(flags, ["--site", "x", "--nope", "1"])).toThrow();
    expect(() => parseFlags(flags, ["--site", "x", "suelto"])).toThrow();
    expect(() => parseFlags(flags, ["--site", "x", "--filter", "{malo"])).toThrow(/JSON/);
  });

  it("los errores de uso llevan exitCode 2", () => {
    try {
      parseFlags(flags, []);
      expect.unreachable();
    } catch (e) {
      expect((e as { exitCode: number }).exitCode).toBe(2);
    }
  });

  it("--help corta antes de validar required", () => {
    expect(parseFlags(flags, ["--help"]).help).toBe(true);
  });
});

describe("renderHelp", () => {
  it("incluye descripción, flags, obligatorias y defaults", () => {
    const h = renderHelp("gsc performance", "Rendimiento.", flags);
    expect(h).toContain("concat gsc performance");
    expect(h).toContain("Rendimiento.");
    expect(h).toMatch(/--site <string>\s+Sitio \(obligatoria\)/);
    expect(h).toMatch(/--by <query\|page>.*\(default: "query"\)/);
    expect(h).toContain("--dry-run / --no-dry-run");
    expect(h).toContain("--dimensions <a|b|c>");
    expect(h).toContain("--json");
  });
});
