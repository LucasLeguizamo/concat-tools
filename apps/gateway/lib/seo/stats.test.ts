import { describe, expect, it } from "vitest";
import { bucketOf, buildCtrCurve, FALLBACK_CTR, median, weightedPosition } from "./stats";

describe("stats", () => {
  it("median", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("posicion ponderada por impresiones (no promedio simple)", () => {
    const w = weightedPosition([
      { position: 1, impressions: 900 },
      { position: 11, impressions: 100 },
    ]);
    expect(w).toBeCloseTo(2, 5);
    expect(weightedPosition([])).toBe(0);
  });

  it("buckets", () => {
    expect([0.6, 1.4, 1.6, 2.5, 3.2, 4.6, 5.6, 10.4, 10.6, 20.4, 20.6].map(bucketOf)).toEqual([
      "1", "1", "2", "3", "3", "4-5", "6-10", "6-10", "11-20", "11-20", null,
    ]);
  });

  it("curva: mediana por bucket del propio sitio; fallback con poca muestra o sin datos", () => {
    const rows = [
      ...[0.2, 0.3, 0.25, 0.28, 0.22].map((c) => ({ position: 1, impressions: 1000, clicks: c * 1000 })),
      { position: 1, impressions: 10, clicks: 10 }, // bajo minImpressions: ignorado
      ...[0.1, 0.2].map((c) => ({ position: 2, impressions: 1000, clicks: c * 1000 })), // < minSamples
    ];
    const curve = buildCtrCurve(rows);
    expect(curve.ctr["1"]).toBeCloseTo(0.25, 5);
    expect(curve.ctr["2"]).toBe(FALLBACK_CTR["2"]);
    expect(curve.fallback).toEqual(["2", "3", "4-5", "6-10", "11-20"]);
  });
});
