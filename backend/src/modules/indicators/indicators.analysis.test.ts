import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ANALYSIS_DISCLAIMER,
  buildAnalysis,
  computeWeeklyChangePct,
  type AnalysisInputItem,
  type AnalysisNewsInput,
} from "./indicators.analysis";

const UNIT_BY_CODE: Record<string, string> = {
  VIX: "index",
  SPX: "index",
  DXY: "index",
  US10Y: "pct",
  SPREAD_10Y2Y: "pct",
  GOLD: "usd",
  BTC: "usd",
  EURUSD: "fx",
};

function item(
  code: string,
  name: string,
  value: number,
  weeklyChangePct: number | null,
): AnalysisInputItem {
  return {
    code,
    name,
    value,
    weeklyChangePct,
    decimals: 2,
    unit: UNIT_BY_CODE[code] ?? "index",
    asOf: "2026-11-06T15:00:00.000Z",
  };
}

function news(sentiment: number): AnalysisNewsInput {
  return {
    title: `Noticia macro ${sentiment}`,
    source: "Reuters",
    url: `https://example.com/${sentiment}`,
    publishedAt: "2026-11-05T12:00:00.000Z",
    sentiment,
  };
}

function riskOffInput() {
  return {
    generatedAt: "2026-11-06T15:00:00.000Z",
    items: [
      item("VIX", "VIX", 32, 25),
      item("SPX", "S&P 500", 5200, -4),
      item("DXY", "Dólar Index (aprox.)", 105, 2),
      item("US10Y", "US Treasury 10Y", 4.6, 4),
      item("SPREAD_10Y2Y", "Spread 10Y-2Y", -0.5, null),
      item("GOLD", "Oro (GCUSD)", 2600, 3),
      item("BTC", "Bitcoin", 68000, -6),
      item("EURUSD", "EUR/USD", 1.05, -1.5),
    ],
    news: [news(-0.6), news(-0.3)],
  };
}

describe("indicators.analysis", () => {
  it("escenario risk-off: sesgo bajista, riesgo extremo y señal crítica", () => {
    const result = buildAnalysis(riskOffInput());
    assert.strictEqual(result.bias, "bajista");
    assert.strictEqual(result.riskLevel, "extremo");
    assert.strictEqual(result.signals[0]?.severity, "critica");
    assert.match(result.summary, /Lectura semanal: sesgo bajista con riesgo extremo/);
    assert.match(result.summary, /próxima semana/);
    assert.ok(result.signals.length >= 3);
  });

  it("escenario risk-on: sesgo alcista y riesgo bajo", () => {
    const result = buildAnalysis({
      generatedAt: "2026-11-06T15:00:00.000Z",
      items: [
        item("VIX", "VIX", 11, -8),
        item("SPX", "S&P 500", 6000, 3),
        item("DXY", "Dólar Index (aprox.)", 98, -1.5),
        item("US10Y", "US Treasury 10Y", 4.1, -3),
        item("SPREAD_10Y2Y", "Spread 10Y-2Y", 0.8, null),
        item("GOLD", "Oro (GCUSD)", 2500, -3),
        item("BTC", "Bitcoin", 90000, 5),
        item("EURUSD", "EUR/USD", 1.12, 1.2),
      ],
      news: [news(0.5), news(0.3)],
    });
    assert.strictEqual(result.bias, "alcista");
    assert.strictEqual(result.riskLevel, "bajo");
    assert.match(result.summary, /continuidad al alza/);
    assert.strictEqual(result.news.label, "positivo");
  });

  it("escenario neutral: sin señales de indicadores y riesgo moderado", () => {
    const result = buildAnalysis({
      generatedAt: "2026-11-06T15:00:00.000Z",
      items: [
        item("VIX", "VIX", 15, 1),
        item("SPX", "S&P 500", 5500, 0.5),
        item("DXY", "Dólar Index (aprox.)", 101, 0.2),
        item("US10Y", "US Treasury 10Y", 4.2, 0.5),
        item("SPREAD_10Y2Y", "Spread 10Y-2Y", 0.3, null),
        item("GOLD", "Oro (GCUSD)", 2550, 0.4),
        item("BTC", "Bitcoin", 70000, 1),
        item("EURUSD", "EUR/USD", 1.08, 0.3),
      ],
      news: [news(0.05)],
    });
    assert.strictEqual(result.bias, "neutral");
    assert.strictEqual(result.riskLevel, "moderado");
    assert.strictEqual(result.signals.length, 0);
    assert.match(result.summary, /No hay una dirección dominante|no hay una dirección dominante/);
  });

  it("sin datos no lanza y devuelve interpretaciones neutrales", () => {
    const result = buildAnalysis({
      generatedAt: "2026-11-06T15:00:00.000Z",
      items: [],
      news: [],
    });
    assert.strictEqual(result.bias, "neutral");
    assert.strictEqual(result.riskLevel, "bajo");
    assert.strictEqual(result.signals.length, 0);
    assert.match(result.summary, /Sin datos suficientes/);
    assert.strictEqual(result.interpretations.length, 8);
    for (const interpretation of result.interpretations) {
      assert.strictEqual(interpretation.stance, "neutral");
    }
    assert.strictEqual(result.news.count, 0);
    assert.strictEqual(result.news.averageSentiment, null);
  });

  it("incluye el disclaimer y una interpretación por indicador curado", () => {
    const result = buildAnalysis(riskOffInput());
    assert.strictEqual(result.disclaimer, ANALYSIS_DISCLAIMER);
    assert.strictEqual(result.interpretations.length, 8);
    assert.deepStrictEqual(
      result.interpretations.map((interpretation) => interpretation.code),
      ["VIX", "SPX", "DXY", "US10Y", "SPREAD_10Y2Y", "GOLD", "BTC", "EURUSD"],
    );
    const vix = result.interpretations.find((interpretation) => interpretation.code === "VIX");
    assert.strictEqual(vix?.stance, "negativo");
    assert.match(vix?.text ?? "", /en la semana/);
  });

  it("resume las noticias macro recientes y las usa como señal", () => {
    const result = buildAnalysis(riskOffInput());
    assert.strictEqual(result.news.count, 2);
    assert.strictEqual(result.news.label, "negativo");
    assert.strictEqual(result.news.averageSentiment, -0.45);
    assert.strictEqual(result.news.items.length, 2);
    const newsSignal = result.signals.find((signal) => signal.code === "NEWS");
    assert.ok(newsSignal);
    assert.match(result.summary, /noticias macro/i);
  });

  it("computeWeeklyChangePct usa la referencia de hace siete dias", () => {
    const weekStart = new Date("2026-10-30T15:00:00.000Z");
    const rows = [
      { asOf: new Date("2026-10-23T15:00:00.000Z"), value: 90 },
      { asOf: new Date("2026-10-30T15:00:00.000Z"), value: 100 },
      { asOf: new Date("2026-11-05T15:00:00.000Z"), value: 120 },
    ];
    const result = computeWeeklyChangePct(rows, weekStart);
    assert.ok(result !== null);
    assert.ok(Math.abs(result - 20) < 0.0001, `change=${result}`);
  });

  it("computeWeeklyChangePct devuelve null sin referencia o con dato viejo", () => {
    const weekStart = new Date("2026-10-30T15:00:00.000Z");
    const onlyRecent = [
      { asOf: new Date("2026-11-04T15:00:00.000Z"), value: 100 },
      { asOf: new Date("2026-11-05T15:00:00.000Z"), value: 120 },
    ];
    assert.strictEqual(computeWeeklyChangePct(onlyRecent, weekStart), null);

    const stale = [{ asOf: new Date("2026-10-20T15:00:00.000Z"), value: 100 }];
    assert.strictEqual(computeWeeklyChangePct(stale, weekStart), null);
    assert.strictEqual(computeWeeklyChangePct([], weekStart), null);
  });
});
