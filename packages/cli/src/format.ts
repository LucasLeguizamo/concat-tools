export interface OutputOptions {
  json: boolean;
  isTTY: boolean;
}

const MAX_CELL = 60;

// Los datos (queries de GSC, nombres de campañas...) son input no confiable
// (spec §9): se neutralizan los caracteres de control para que no inyecten
// secuencias de escape en la terminal.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

export function cell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else s = JSON.stringify(value);
  s = s.replace(CONTROL, " ");
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Tabla simple alineada; columnas = unión de claves en orden de aparición. */
export function renderTable(rows: Record<string, unknown>[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  if (cols.length === 0) return "(sin datos)";
  const body = rows.map((r) => cols.map((c) => cell(r[c])));
  const head = cols.map((c) => cell(c));
  const widths = cols.map((_, i) => Math.max(head[i]!.length, ...body.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]!))
      .join("  ")
      .trimEnd();
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}

const isRowArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every(isRecord);

/** Objeto plano a tabla clave/valor. */
const keyValue = (o: Record<string, unknown>): string =>
  renderTable(Object.entries(o).map(([key, value]) => ({ key, value })));

function metaLine(meta: unknown): string | undefined {
  if (!isRecord(meta)) return undefined;
  const parts: string[] = [];
  if (typeof meta.module === "string") parts.push(cell(meta.module));
  if (Array.isArray(meta.range)) parts.push(`${cell(meta.range[0])}..${cell(meta.range[1])}`);
  if (typeof meta.next_cursor === "string") parts.push(`next_cursor: ${cell(meta.next_cursor)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Texto (stdout) y avisos (stderr) para un valor de salida. */
export function formatOutput(value: unknown, opts: OutputOptions): { stdout: string; stderr: string[] } {
  if (opts.json || !opts.isTTY) return { stdout: JSON.stringify(value, null, 2), stderr: [] };

  // ToolResult { data, meta }
  const result = isRecord(value) && "data" in value ? value : undefined;
  const data = result ? result.data : value;
  const stderr: string[] = [];
  let out: string;
  if (isRowArray(data)) out = renderTable(data);
  else if (Array.isArray(data) && data.length === 0) out = "(sin datos)";
  else if (isRecord(data)) out = keyValue(data);
  else if (typeof data === "string") out = data.replace(CONTROL, " ");
  else out = JSON.stringify(data, null, 2);

  if (result) {
    const m = metaLine(result.meta);
    if (m) out += `\n\n${m}`;
    const warnings = isRecord(result.meta) && Array.isArray(result.meta.warnings) ? result.meta.warnings : [];
    for (const w of warnings) stderr.push(`Aviso: ${cell(w)}`);
  }
  return { stdout: out, stderr };
}
