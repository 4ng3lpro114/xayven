import { describe, it, expect } from "vitest";
import {
  bucketLabel,
  bucketStartFor,
  enumerateBuckets,
  resolvePeriodRange,
  resolvePreviousPeriodRange,
} from "@/lib/statistics/period";

const NOW = new Date("2026-08-12T12:00:00.000Z");

describe("resolvePeriodRange", () => {
  it("7d → 7 días atrás, bucket diario", () => {
    const range = resolvePeriodRange("7d", NOW);
    expect(range.bucket).toBe("day");
    expect(range.start).not.toBeNull();
    expect(NOW.getTime() - range.start!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(range.end).toEqual(NOW);
  });

  it("30d → bucket diario", () => {
    expect(resolvePeriodRange("30d", NOW).bucket).toBe("day");
  });

  it("3m y 6m → bucket semanal", () => {
    expect(resolvePeriodRange("3m", NOW).bucket).toBe("week");
    expect(resolvePeriodRange("6m", NOW).bucket).toBe("week");
  });

  it("1y → bucket mensual", () => {
    expect(resolvePeriodRange("1y", NOW).bucket).toBe("month");
  });

  it("all → sin límite inferior (start null), bucket mensual", () => {
    const range = resolvePeriodRange("all", NOW);
    expect(range.start).toBeNull();
    expect(range.bucket).toBe("month");
  });
});

describe("resolvePreviousPeriodRange", () => {
  it("30d → ventana anterior de exactamente 30 días, inmediatamente antes", () => {
    const prev = resolvePreviousPeriodRange("30d", NOW)!;
    const current = resolvePeriodRange("30d", NOW);
    expect(prev.end).toEqual(current.start);
    expect(prev.end.getTime() - prev.start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("all → null (no existe 'período anterior' significativo)", () => {
    expect(resolvePreviousPeriodRange("all", NOW)).toBeNull();
  });
});

describe("enumerateBuckets", () => {
  it("día: genera un bucket por cada día en el rango, inclusive", () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-08-05T00:00:00.000Z");
    const buckets = enumerateBuckets(start, end, "day");
    expect(buckets.map((b) => b.toISOString().slice(0, 10))).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("nunca genera un arreglo vacío, incluso con start === end", () => {
    const d = new Date("2026-08-01T00:00:00.000Z");
    expect(enumerateBuckets(d, d, "day").length).toBeGreaterThan(0);
  });

  it("mes: agrupa por primer día de cada mes calendario", () => {
    const start = new Date("2026-06-15T00:00:00.000Z");
    const end = new Date("2026-08-20T00:00:00.000Z");
    const buckets = enumerateBuckets(start, end, "month");
    expect(buckets.map((b) => b.toISOString().slice(0, 7))).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});

describe("bucketStartFor", () => {
  it("día: dos timestamps del mismo día UTC caen en el mismo bucket", () => {
    const seriesStart = new Date("2026-08-01T00:00:00.000Z");
    const a = bucketStartFor(new Date("2026-08-03T02:00:00.000Z"), seriesStart, "day");
    const b = bucketStartFor(new Date("2026-08-03T22:00:00.000Z"), seriesStart, "day");
    expect(a.getTime()).toBe(b.getTime());
  });

  it("mes: dos timestamps del mismo mes caen en el mismo bucket, sin importar el día", () => {
    const seriesStart = new Date("2026-06-01T00:00:00.000Z");
    const a = bucketStartFor(new Date("2026-07-01T00:00:00.000Z"), seriesStart, "month");
    const b = bucketStartFor(new Date("2026-07-28T23:00:00.000Z"), seriesStart, "month");
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("bucketLabel", () => {
  it("produce una etiqueta corta no vacía para día y mes", () => {
    const d = new Date("2026-08-12T00:00:00.000Z");
    expect(bucketLabel(d, "day").length).toBeGreaterThan(0);
    expect(bucketLabel(d, "month").length).toBeGreaterThan(0);
  });
});
