import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderModulesDoc, renderToolsDoc, type Lang } from "./docs-gen";
import { modules } from "./modules/registry";

const read = (lang: Lang, file: string) => readFileSync(new URL(`../../../docs/${lang}/${file}`, import.meta.url), "utf8");

describe.each(["es", "en"] as Lang[])("docs generadas (%s)", (lang) => {
  it("tools.md y modules.md commiteados coinciden con el registro (corre `pnpm docs:tools`)", () => {
    expect(read(lang, "tools.md")).toBe(renderToolsDoc(lang));
    expect(read(lang, "modules.md")).toBe(renderModulesDoc(lang));
  });

  it("documentan todas las tools y todos los modulos del registro", () => {
    const tools = read(lang, "tools.md");
    for (const m of modules) {
      expect(modules.find((x) => x.id === m.id)).toBeDefined();
      expect(read(lang, "modules.md")).toContain(`## \`${m.id}\``);
      for (const t of m.tools) expect(tools).toContain(`### \`${t.name}\``);
    }
    expect(tools).toContain("### `gateway_status`");
    expect(tools).toContain("concat gsc performance");
  });

  it("no incluyen secretos ni marcadores sin rellenar", () => {
    for (const f of ["tools.md", "modules.md"]) {
      const text = read(lang, f);
      expect(text).not.toMatch(/ya29\.|1\/\/0|eyJ[A-Za-z0-9_-]{10,}/);
      expect(text).not.toContain("{email}");
    }
  });
});

describe("enlaces relativos de la documentacion", () => {
  it("todos los .md enlazados existen", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const root = new URL("../../../", import.meta.url).pathname;
    const files = [join(root, "README.md"), ...(["es", "en"] as const).flatMap((l) => readdirSync(join(root, "docs", l)).map((f) => join(root, "docs", l, f)))];
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        expect(existsSync(join(dirname(file), m[1]!)), `${file} -> ${m[1]}`).toBe(true);
      }
    }
  });
});
