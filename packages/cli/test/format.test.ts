import { describe, expect, it } from "vitest";
import { formatOutput, renderTable } from "../src/format.js";

describe("renderTable", () => {
  it("alinea columnas y usa la unión de claves", () => {
    const t = renderTable([{ site: "a.com", clicks: 10 }, { site: "bb.com", ctr: 0.5 }]);
    expect(t.split("\n")).toEqual([
      "site    clicks  ctr",
      "------  ------  ---",
      "a.com   10",
      "bb.com          0.5",
    ]);
  });

  it("neutraliza caracteres de control y trunca celdas largas", () => {
    const t = renderTable([{ q: "hola\u001b[31m\nmundo", long: "x".repeat(100) }]);
    expect(t).not.toContain("\u001b");
    expect(t.split("\n")).toHaveLength(3);
    expect(t).toContain("…");
  });

  it("serializa objetos anidados y null", () => {
    const t = renderTable([{ a: { b: 1 }, c: null }]);
    expect(t).toContain('{"b":1}');
  });
});

describe("formatOutput", () => {
  const result = { data: [{ id: "gsc", n: 1 }], meta: { module: "gsc", range: ["2026-09-03", "2026-09-30"], warnings: ["ojo"] } };

  it("JSON si no es TTY o --json", () => {
    expect(JSON.parse(formatOutput(result, { json: false, isTTY: false }).stdout)).toEqual(result);
    expect(JSON.parse(formatOutput(result, { json: true, isTTY: true }).stdout)).toEqual(result);
  });

  it("tabla + meta + warnings si es TTY", () => {
    const out = formatOutput(result, { json: false, isTTY: true });
    expect(out.stdout).toContain("id   n");
    expect(out.stdout).toContain("gsc · 2026-09-03..2026-09-30");
    expect(out.stderr).toEqual(["Aviso: ojo"]);
  });

  it("objeto plano como clave/valor y vacío como (sin datos)", () => {
    expect(formatOutput({ data: { a: 1 } }, { json: false, isTTY: true }).stdout).toContain("a    1");
    expect(formatOutput({ data: [] }, { json: false, isTTY: true }).stdout).toBe("(sin datos)");
  });
});
