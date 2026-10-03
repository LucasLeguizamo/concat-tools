// Validador de GAQL para `ads_search`: SOLO una consulta SELECT. GAQL no tiene sentencias de escritura, pero el
// gateway es de solo lectura por contrato (spec §7), asi que se rechaza todo lo que no sea una consulta simple:
// nada de `;`, comentarios, varias sentencias ni caracteres raros fuera de literales. Es una allowlist lexica,
// no una lista negra de palabras.

export const MAX_GAQL_LENGTH = 5000;

export type GaqlCheck =
  | { ok: true; query: string; hasLimit: boolean; /** indice de PARAMETERS (fuera de literales) o -1 */ parametersAt: number }
  | { ok: false; reason: string };

const fail = (reason: string): GaqlCheck => ({ ok: false, reason });

// Fuera de literales: identificadores (campos, recursos, enums), numeros, espacios y operadores/puntuacion de GAQL.
const OUTSIDE_OK = /[A-Za-z0-9_.,()[\]=!<>\-\s]/;
const WHITESPACE = /[ \t\n\r]/;

export function validateGaql(input: string): GaqlCheck {
  if (typeof input !== "string") return fail("la consulta debe ser texto");
  const query = input.trim();
  if (query.length === 0) return fail("la consulta esta vacia");
  if (query.length > MAX_GAQL_LENGTH) return fail(`la consulta supera ${MAX_GAQL_LENGTH} caracteres`);

  // Una pasada: separa literales de texto "desnudo" y rechaza lo ilegal en cada zona.
  let bare = ""; // texto fuera de literales; cada literal se sustituye por espacios del mismo largo (los indices coinciden)
  let i = 0;
  while (i < query.length) {
    const ch = query[i]!;
    const cp = ch.codePointAt(0)!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      let closed = false;
      let escaped = false;
      while (i < query.length) {
        const code = query.codePointAt(i)!; // por code point: un caracter fuera del BMP no se cuela como dos mitades
        const c = String.fromCodePoint(code);
        // En literales no se admiten saltos de linea ni controles (ocultan texto) ni bidi/zero-width.
        if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || isInvisible(code)) return fail("caracter de control u oculto dentro de un literal");
        i += c.length;
        if (escaped) escaped = false; // el caracter escapado (incluida una comilla) no cierra el literal
        else if (c === "\\") escaped = true;
        else if (c === quote) {
          closed = true;
          break;
        }
      }
      if (!closed) return fail("literal sin cerrar");
      bare += " ".repeat(i - start);
      continue;
    }
    if (ch === ";") return fail("no se admite `;` (una sola sentencia)");
    if (ch === "`" || ch === "#" || ch === "/" || ch === "*" || ch === "$" || ch === "@") {
      return fail(`caracter no permitido fuera de literales: ${ch}`);
    }
    if (ch === "-") {
      // `--` es comentario en SQL; GAQL solo usa `-` como signo de un numero.
      const next = query[i + 1] ?? "";
      if (!/[0-9]/.test(next)) return fail("`-` solo se admite como signo de un numero");
    }
    // Solo ASCII imprimible permitido + espacios simples (rechaza Unicode, NBSP, \v, \f, NUL, bidi...).
    if (cp > 0x7e || !OUTSIDE_OK.test(ch) || (/\s/.test(ch) && !WHITESPACE.test(ch))) {
      return fail("caracter no permitido fuera de literales");
    }
    bare += ch;
    i++;
  }

  const words = [...bare.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)].map((m) => ({ w: m[0].toUpperCase(), at: m.index ?? 0 }));
  if (words[0]?.w !== "SELECT") return fail("solo se admiten consultas que empiecen por SELECT");
  if (words.filter((x) => x.w === "SELECT").length !== 1) return fail("una sola sentencia SELECT (sin subconsultas ni sentencias encadenadas)");
  if (words.filter((x) => x.w === "FROM").length !== 1) return fail("la consulta debe tener exactamente un FROM");

  return {
    ok: true,
    query,
    hasLimit: words.some((x) => x.w === "LIMIT"),
    parametersAt: words.find((x) => x.w === "PARAMETERS")?.at ?? -1,
  };
}

/** Controles de formato que ocultan texto: zero-width, bidi, tags, BOM, separadores de linea. */
function isInvisible(cp: number): boolean {
  return (
    cp === 0xad ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff ||
    (cp >= 0xe0000 && cp <= 0xe007f)
  );
}
