import { describe, expect, it } from "vitest";
import { MAX_GAQL_LENGTH, validateGaql } from "./gaql";

const ok = (q: string) => {
  const r = validateGaql(q);
  expect(r.ok, q).toBe(true);
  return r as Extract<typeof r, { ok: true }>;
};
const bad = (q: string) => {
  const r = validateGaql(q);
  expect(r.ok, q).toBe(false);
  return (r as Extract<typeof r, { ok: false }>).reason;
};

describe("validateGaql: consultas legitimas", () => {
  it("acepta SELECT/FROM con WHERE, ORDER BY, LIMIT y PARAMETERS", () => {
    ok("SELECT campaign.name, metrics.clicks FROM campaign");
    ok("select campaign.id\nfrom campaign\nwhere segments.date DURING LAST_7_DAYS and campaign.status != 'REMOVED'");
    ok("SELECT campaign.name FROM campaign WHERE campaign.name LIKE '%rebajas; 2026%' ORDER BY metrics.clicks DESC LIMIT 10");
    ok("SELECT campaign.name FROM campaign WHERE metrics.cost_micros > -5 AND campaign.id IN (1, 2, 3)");
    ok('SELECT ad_group.name FROM ad_group WHERE ad_group.name = "it\'s"');
    ok("SELECT campaign.id FROM campaign PARAMETERS include_drafts=true");
  });

  it("marca hasLimit y la posicion de PARAMETERS (sobre el texto original, aunque haya literales)", () => {
    expect(ok("SELECT a FROM b LIMIT 5").hasLimit).toBe(true);
    expect(ok("SELECT a FROM b").hasLimit).toBe(false);
    const q = "SELECT a FROM b WHERE c = 'xx PARAMETERS yy' PARAMETERS include_drafts=true";
    const r = ok(q);
    expect(q.slice(r.parametersAt)).toBe("PARAMETERS include_drafts=true");
  });

  it("un literal con palabras reservadas no cuenta como sentencia", () => {
    ok("SELECT campaign.name FROM campaign WHERE campaign.name = 'SELECT x FROM y; DROP TABLE z'");
  });
});

describe("validateGaql: inyeccion y sentencias distintas de SELECT", () => {
  it("rechaza todo lo que no empiece por SELECT", () => {
    for (const q of [
      "DELETE FROM campaign",
      "UPDATE campaign SET name = 'x'",
      "INSERT INTO campaign VALUES (1)",
      "MUTATE campaign",
      "WITH x AS (SELECT 1) SELECT a FROM b",
      "FROM campaign SELECT campaign.name",
      "selectcampaign.name FROM campaign",
    ]) {
      expect(bad(q)).toMatch(/SELECT/);
    }
  });

  it("rechaza `;` fuera de literales (sentencia encadenada)", () => {
    bad("SELECT campaign.id FROM campaign; DELETE FROM campaign");
    bad("SELECT campaign.id FROM campaign;");
    bad("SELECT campaign.id FROM campaign ;SELECT 1 FROM customer");
  });

  it("rechaza comentarios que esconden otra sentencia", () => {
    bad("SELECT campaign.id FROM campaign -- ; DROP");
    bad("SELECT campaign.id FROM campaign --\nDELETE FROM campaign");
    bad("SELECT campaign.id /* FROM x */ FROM campaign");
    bad("SELECT campaign.id FROM campaign // otra");
    bad("SELECT campaign.id FROM campaign # otra");
    bad("SELECT campaign.id FROM campaign WHERE a = 1 /*");
  });

  it("rechaza varias sentencias SELECT o varios FROM aunque no haya `;`", () => {
    expect(bad("SELECT a FROM b SELECT c FROM d")).toMatch(/una sola/);
    expect(bad("SELECT a FROM b WHERE x IN (SELECT y FROM z)")).toMatch(/una sola/);
    expect(bad("SELECT a, FROM b FROM c")).toMatch(/FROM/);
    expect(bad("SELECT a")).toMatch(/FROM/);
  });

  it("un literal sin cerrar o con escape final no puede ocultar el resto", () => {
    bad("SELECT a FROM b WHERE c = 'abc");
    bad("SELECT a FROM b WHERE c = 'abc\\'");
    bad("SELECT a FROM b WHERE c = \"abc");
  });

  it("las comillas cerradas con escape no terminan el literal prematuramente", () => {
    // 'a\'b' es un solo literal; lo que sigue ya esta fuera: aqui `; DROP` debe detectarse.
    bad("SELECT a FROM b WHERE c = 'a\\'b'; DROP");
    ok("SELECT a FROM b WHERE c = 'a\\'; DROP'");
  });

  it("rechaza Unicode y caracteres invisibles fuera de literales", () => {
    const ch = (cp: number) => String.fromCodePoint(cp);
    for (const cp of [0xa0, 0x2028, 0x200b, 0x202e, 0x037e, 0x0b, 0x0c, 0x00, 0xfeff, 0xff1b]) {
      // 0x037e = punto y coma griego y 0xff1b = punto y coma de ancho completo (look-alikes de `;`)
      bad(`SELECT a FROM b${ch(cp)}WHERE c = 1`);
      bad(`SELECT a${ch(cp)} FROM b`);
    }
  });

  it("rechaza controles y caracteres ocultos dentro de literales", () => {
    const ch = (cp: number) => String.fromCodePoint(cp);
    bad("SELECT a FROM b WHERE c = 'x" + ch(0x0a) + "y'");
    bad("SELECT a FROM b WHERE c = 'x" + ch(0x202e) + "y'");
    bad("SELECT a FROM b WHERE c = 'x" + ch(0x200b) + "y'");
    bad("SELECT a FROM b WHERE c = 'x" + ch(0xe0041) + "'");
    bad("SELECT a FROM b WHERE c = 'x\\" + ch(0x0a) + "y'"); // ni siquiera escapado
  });

  it("`-` solo como signo de numero", () => {
    bad("SELECT a FROM b WHERE c = 1 - 2");
    bad("SELECT a FROM b WHERE c = --1");
    bad("SELECT a - b FROM c");
  });

  it("rechaza vacio, solo espacios y consultas demasiado largas", () => {
    bad("");
    bad("   \n\t ");
    bad(`SELECT ${"a, ".repeat(MAX_GAQL_LENGTH)}x FROM b`);
  });

  it("rechaza otros caracteres de sintaxis ajenos a GAQL", () => {
    for (const c of ["`", "$", "@", "{", "}", "|", "&", "\\", "~", "^", "%", "+", ":"]) {
      bad(`SELECT a FROM b WHERE c = 1 ${c} 2`);
    }
  });
});
