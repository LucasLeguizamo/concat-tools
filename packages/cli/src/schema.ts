import { parseArgs } from "node:util";
import { usageError } from "./errors.js";

/** Subconjunto de JSON Schema que usan los inputSchema del gateway. */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  default?: unknown;
}

export type FlagType = "string" | "number" | "integer" | "boolean" | "array" | "json";
type Scalar = "string" | "number" | "integer";

export interface FlagDef {
  prop: string;
  flag: string;
  type: FlagType;
  /** Solo para type === "array". */
  itemType?: Scalar;
  enum?: string[];
  required: boolean;
  description?: string;
  default?: unknown;
}

// Flags propias del CLI: una propiedad con estos nombres solo es accesible con `concat call`.
const RESERVED = new Set(["help", "json", "gateway"]);

export const flagName = (prop: string): string =>
  prop
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();

/** Aplana nullable (`type: [x, "null"]`, `anyOf: [x, {type:"null"}]`) a su variante útil. */
function resolve(schema: JsonSchema): JsonSchema {
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const real = variants.find((v) => v.type !== "null");
    if (real) return { ...resolve(real), description: schema.description ?? real.description, default: schema.default ?? real.default };
  }
  if (Array.isArray(schema.type)) {
    const t = schema.type.find((x) => x !== "null");
    return { ...schema, type: t };
  }
  return schema;
}

const scalarOf = (t: string | string[] | undefined): Scalar =>
  t === "number" || t === "integer" ? t : "string";

const enumOf = (s: JsonSchema): string[] | undefined => {
  const vals = s.enum?.filter((v): v is string | number => typeof v === "string" || typeof v === "number");
  return vals && vals.length > 0 ? vals.map(String) : undefined;
};

export function schemaToFlags(schema: JsonSchema | undefined): FlagDef[] {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const out: FlagDef[] = [];
  for (const [prop, raw] of Object.entries(props)) {
    const flag = flagName(prop);
    if (RESERVED.has(flag)) continue;
    const s = resolve(raw);
    const def: FlagDef = { prop, flag, type: "string", required: required.has(prop) };
    if (s.description) def.description = s.description;
    if (s.default !== undefined) def.default = s.default;
    const e = enumOf(s);
    if (e) def.enum = e;
    switch (s.type) {
      case "boolean":
        def.type = "boolean";
        break;
      case "number":
      case "integer":
        def.type = s.type;
        break;
      case "array": {
        def.type = "array";
        const item = resolve(s.items ?? {});
        def.itemType = scalarOf(item.type);
        const ie = enumOf(item);
        if (ie) def.enum = ie;
        else delete def.enum;
        break;
      }
      case "object":
        def.type = "json";
        break;
      default:
        def.type = "string";
    }
    out.push(def);
  }
  return out;
}

export interface ParsedFlags {
  help: boolean;
  args: Record<string, unknown>;
}

function coerceScalar(def: FlagDef, type: Scalar, raw: string): string | number {
  if (def.enum && !def.enum.includes(raw)) {
    throw usageError(`--${def.flag}: valor inválido "${raw}". Valores permitidos: ${def.enum.join(", ")}.`);
  }
  if (type === "string") return raw;
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) throw usageError(`--${def.flag}: "${raw}" no es un número.`);
  if (type === "integer" && !Number.isInteger(n)) throw usageError(`--${def.flag}: "${raw}" no es un entero.`);
  return n;
}

/** Parsea `argv` (sin grupo/acción) con las flags derivadas del schema. */
export function parseFlags(defs: FlagDef[], argv: string[]): ParsedFlags {
  const options: Record<string, { type: "boolean" | "string"; multiple?: boolean; short?: string }> = {
    help: { type: "boolean", short: "h" },
  };
  for (const d of defs) {
    if (d.type === "boolean") {
      options[d.flag] = { type: "boolean" };
      options[`no-${d.flag}`] = { type: "boolean" };
    } else {
      options[d.flag] = d.type === "array" ? { type: "string", multiple: true } : { type: "string" };
    }
  }

  let values: Record<string, unknown>;
  try {
    values = parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }
  if (values.help === true) return { help: true, args: {} };

  const args: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const d of defs) {
    const v = values[d.flag];
    if (d.type === "boolean") {
      if (values[`no-${d.flag}`] === true && v === true) throw usageError(`--${d.flag} y --no-${d.flag} son incompatibles.`);
      if (v === true) args[d.prop] = true;
      else if (values[`no-${d.flag}`] === true) args[d.prop] = false;
    } else if (v === undefined) {
      continue;
    } else if (d.type === "array") {
      const items = (v as string[])
        .flatMap((s) => s.split(","))
        .map((s) => s.trim())
        .filter((s) => s !== "");
      args[d.prop] = items.map((s) => coerceScalar(d, d.itemType ?? "string", s));
    } else if (d.type === "json") {
      try {
        args[d.prop] = JSON.parse(v as string);
      } catch {
        throw usageError(`--${d.flag}: se esperaba JSON válido.`);
      }
    } else {
      args[d.prop] = coerceScalar(d, d.type, v as string);
    }
  }
  for (const d of defs) if (d.required && args[d.prop] === undefined) missing.push(`--${d.flag}`);
  if (missing.length > 0) throw usageError(`Faltan flags obligatorias: ${missing.join(", ")}.`);
  return { help: false, args };
}

const typeHint = (d: FlagDef): string => {
  if (d.enum) return `<${d.enum.join("|")}>`;
  switch (d.type) {
    case "boolean":
      return "";
    case "array":
      return `<${d.itemType ?? "string"},...>`;
    case "json":
      return "<json>";
    default:
      return `<${d.type}>`;
  }
};

/** `--help` de un comando generado: descripción + flags desde el schema. */
export function renderHelp(command: string, description: string | undefined, defs: FlagDef[]): string {
  const lines = [`concat ${command}`];
  if (description) lines.push("", description);
  lines.push("", "Flags:");
  const rows = defs.map((d) => {
    const left = d.type === "boolean" ? `--${d.flag} / --no-${d.flag}` : `--${d.flag} ${typeHint(d)}`;
    const notes = [d.required ? "(obligatoria)" : "", d.default !== undefined ? `(default: ${JSON.stringify(d.default)})` : ""]
      .filter(Boolean)
      .join(" ");
    return [left, [d.description, notes].filter(Boolean).join(" ")] as const;
  });
  rows.push(["--json", "Salida JSON aunque stdout sea una terminal."], ["--gateway <url>", "URL del gateway."], ["-h, --help", "Esta ayuda."]);
  const width = Math.max(...rows.map(([l]) => l.length));
  for (const [l, r] of rows) lines.push(`  ${l.padEnd(width)}  ${r}`.trimEnd());
  return lines.join("\n");
}
