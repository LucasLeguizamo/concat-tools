/** YYYY-MM-DD en UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rango de `days` dias terminando `endOffsetDays` dias antes de hoy (UTC). Inclusive en ambos extremos. */
export function dayRange(days: number, endOffsetDays: number, now: Date = new Date()): [string, string] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - endOffsetDays));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return [isoDate(start), isoDate(end)];
}

export const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Numero desde number o string numerica (Google serializa int64 como string). */
export const asNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
