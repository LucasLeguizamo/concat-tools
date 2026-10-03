import { describe, expect, it } from "vitest";
import { asActionable, exitCodeForActionable, formatActionable, scrub } from "../src/errors.js";

const e = (over: Record<string, unknown>) => asActionable({ error: "x", message: "m", ...over })!;

describe("exitCodeForActionable (spec §8)", () => {
  it("3: no autenticado", () => {
    expect(exitCodeForActionable(e({ next_action: "relogin" }))).toBe(3);
    expect(exitCodeForActionable(e({ error: "invalid_grant" }))).toBe(3);
  });
  it("4: cuota (con o sin retry_after)", () => {
    expect(exitCodeForActionable(e({ error: "quota_exceeded", next_action: "retry" }))).toBe(4);
    expect(exitCodeForActionable(e({ error: "rate_limited", retry_after: 30 }))).toBe(4);
    expect(exitCodeForActionable(e({ retry_after: 5 }))).toBe(4);
  });
  it("5: módulo no conectado o scope_lost", () => {
    expect(exitCodeForActionable(e({ error: "scope_lost", next_action: "reconnect_module" }))).toBe(5);
    expect(exitCodeForActionable(e({ next_action: "connect_module" }))).toBe(5);
    expect(exitCodeForActionable(e({ error: "module_not_connected" }))).toBe(5);
  });
  it("6: permiso del recurso", () => {
    expect(exitCodeForActionable(e({ error: "missing_resource_permission" }))).toBe(6);
    expect(exitCodeForActionable(e({ next_action: "fix_resource_permission" }))).toBe(6);
  });
  it("1: cualquier otro", () => {
    expect(exitCodeForActionable(e({ error: "internal", next_action: "retry" }))).toBe(1);
  });
});

describe("asActionable", () => {
  it("rechaza lo que no tiene forma de error", () => {
    expect(asActionable(null)).toBeUndefined();
    expect(asActionable({ message: "x" })).toBeUndefined();
    expect(asActionable("texto")).toBeUndefined();
  });
});

describe("formatActionable", () => {
  it("imprime fix, url y retry_after", () => {
    const text = formatActionable(e({ message: "Sin permiso", fix: "Agrega Viewer", url: "https://x/y", retry_after: 7 }));
    expect(text).toContain("Error: Sin permiso");
    expect(text).toContain("Cómo arreglarlo: Agrega Viewer");
    expect(text).toContain("URL: https://x/y");
    expect(text).toContain("7s");
  });
});

describe("scrub", () => {
  it("quita credenciales de textos externos", () => {
    const out = scrub('Bearer abc.def.ghi y refresh_token=sekret y {"access_token":"zzz"} eyJhbGciOi.eyJzdWIi.sig');
    expect(out).not.toMatch(/abc\.def|sekret|zzz|eyJhbGciOi/);
  });
});
