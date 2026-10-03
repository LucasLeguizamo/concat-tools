// Estadistica pura para los workflows SEO. Sin I/O.

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Posicion media ponderada por impresiones (nunca promedio simple). */
export function weightedPosition(items: ReadonlyArray<{ position: number; impressions: number }>): number {
  let imp = 0;
  let acc = 0;
  for (const i of items) {
    imp += i.impressions;
    acc += i.position * i.impressions;
  }
  return imp > 0 ? acc / imp : 0;
}

export const CTR_BUCKETS = ["1", "2", "3", "4-5", "6-10", "11-20"] as const;
export type CtrBucket = (typeof CTR_BUCKETS)[number];

export function bucketOf(position: number): CtrBucket | null {
  const p = Math.max(1, Math.round(position));
  if (p <= 3) return String(p) as CtrBucket;
  if (p <= 5) return "4-5";
  if (p <= 10) return "6-10";
  if (p <= 20) return "11-20";
  return null;
}

/** Solo si el sitio no tiene datos suficientes en un bucket. Conservadores (era AIO); siempre con warning. */
export const FALLBACK_CTR: Readonly<Record<CtrBucket, number>> = {
  "1": 0.25,
  "2": 0.13,
  "3": 0.09,
  "4-5": 0.06,
  "6-10": 0.03,
  "11-20": 0.01,
};

export interface CtrCurve {
  ctr: Record<CtrBucket, number>;
  /** Buckets que usan FALLBACK_CTR por falta de muestra. */
  fallback: CtrBucket[];
}

export interface CurveInput {
  clicks: number;
  impressions: number;
  position: number;
}

/** Curva de CTR esperado del propio sitio: mediana por bucket (queries non-brand con impresiones suficientes). */
export function buildCtrCurve(rows: readonly CurveInput[], opts: { minImpressions?: number; minSamples?: number } = {}): CtrCurve {
  const minImpressions = opts.minImpressions ?? 50;
  const minSamples = opts.minSamples ?? 5;
  const byBucket = new Map<CtrBucket, number[]>();
  for (const r of rows) {
    if (r.impressions < minImpressions) continue;
    const b = bucketOf(r.position);
    if (!b) continue;
    const list = byBucket.get(b) ?? [];
    list.push(r.clicks / r.impressions);
    byBucket.set(b, list);
  }
  const ctr = { ...FALLBACK_CTR };
  const fallback: CtrBucket[] = [];
  for (const b of CTR_BUCKETS) {
    const list = byBucket.get(b) ?? [];
    const m = list.length >= minSamples ? median(list) : undefined;
    if (m === undefined || m <= 0) fallback.push(b);
    else ctr[b] = m;
  }
  return { ctr, fallback };
}
