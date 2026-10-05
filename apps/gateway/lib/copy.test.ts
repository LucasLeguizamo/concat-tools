import { describe, expect, it } from "vitest";
import { en, es, pickLang } from "./copy";

/** Todas las claves (anidadas) de un objeto de textos, con el tipo de cada valor. */
const shape = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object"
    ? Object.entries(o).flatMap(([k, v]) => shape(v, `${prefix}${k}.`))
    : [`${prefix}:${typeof o}`];

describe("copy ES + EN", () => {
  it("en tiene exactamente las mismas claves y tipos que es", () => {
    expect(shape(en).sort()).toEqual(shape(es).sort());
  });

  it("las funciones de texto de ambos idiomas devuelven texto no vacio", () => {
    for (const t of [es, en]) {
      expect(t.dashboard.attention(2)).not.toBe("");
      expect(t.connect.title("Gmail")).toContain("Gmail");
      expect(t.scope("*")).not.toBe(t.scope("gsc"));
    }
  });

  it("idioma: cookie > Accept-Language > espanol", () => {
    expect(pickLang("en", "es-AR,es;q=0.9")).toBe("en");
    expect(pickLang(undefined, "en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLang(undefined, "fr-FR,es;q=0.5")).toBe("es");
    expect(pickLang("xx", null)).toBe("es");
  });
});
