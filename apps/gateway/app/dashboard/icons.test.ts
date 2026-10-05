import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { modules } from "../../lib/modules/registry";

describe("dashboard", () => {
  it("cada modulo tiene su logo en public/icons/<id>.svg", () => {
    const missing = modules.map((m) => m.id).filter((id) => !existsSync(join(process.cwd(), "public/icons", `${id}.svg`)));
    expect(missing).toEqual([]);
  });
});
