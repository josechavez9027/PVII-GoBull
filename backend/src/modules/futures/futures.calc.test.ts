import { describe, it } from "node:test";
import assert from "node:assert";
import {
  futuresPctChange,
  periodChange,
  periodReferenceDate,
  sortByChangeDesc,
  type ClosePoint,
} from "./futures.calc";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const point = (iso: string, close: number): ClosePoint => ({ date: day(iso), close });

describe("futures.calc", () => {
  it("calcula el cambio diario contra el cierre anterior", () => {
    const rows = [point("2026-01-02", 90), point("2026-01-05", 99)];
    assert.strictEqual(periodChange(rows, "1D"), 10);
  });

  it("usa el cierre en o antes de la fecha objetivo para 1M y 3M", () => {
    const rows = [
      point("2025-10-01", 80),
      point("2025-12-05", 100),
      point("2026-01-05", 110),
    ];
    assert.strictEqual(periodChange(rows, "1M")?.toFixed(2), "10.00");
    assert.strictEqual(periodChange(rows, "3M")?.toFixed(2), "37.50");
  });

  it("YTD toma como base el ultimo cierre del ano anterior", () => {
    const rows = [
      point("2025-12-30", 95),
      point("2025-12-31", 100),
      point("2026-01-02", 105),
      point("2026-02-01", 120),
    ];
    assert.strictEqual(periodChange(rows, "YTD"), 20);
    assert.strictEqual(
      periodReferenceDate("YTD", day("2026-02-01")).toISOString(),
      "2025-12-31T00:00:00.000Z",
    );
  });

  it("devuelve null sin base suficiente o sin serie", () => {
    assert.strictEqual(periodChange([], "1D"), null);
    assert.strictEqual(periodChange([point("2026-01-05", 100)], "1M"), null);
    assert.strictEqual(periodChange([point("2026-01-05", 100)], "YTD"), null);
    assert.strictEqual(periodChange([point("2025-01-01", 50), point("2026-01-05", 100)], "YTD"), 100);
    assert.strictEqual(futuresPctChange(10, 0), null);
  });

  it("ordena por rendimiento descendente y deja los sin dato al final", () => {
    const sorted = sortByChangeDesc([
      { name: "A", changePct: null },
      { name: "B", changePct: 1.5 },
      { name: "C", changePct: -2 },
      { name: "D", changePct: 8 },
    ]);
    assert.deepStrictEqual(
      sorted.map((item) => item.name),
      ["D", "B", "C", "A"],
    );
  });
});
