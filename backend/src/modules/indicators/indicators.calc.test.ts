import { describe, it } from "node:test";
import assert from "node:assert";
import {
  computeBase100,
  computeDxyProxy,
  computeSpreadTenYearTwoYear,
  freshOrStale,
  pctChange,
  rangeStart,
  roundTo,
  sparklineFrom,
  toDateKey,
} from "./indicators.calc";
import { isMarketOpen } from "./indicators.config";
import { FmpProvider, IndicatorsProviderError } from "./indicators.provider";

describe("indicators.calc", () => {
  it("calcula el spread 10Y-2Y", () => {
    assert.strictEqual(roundTo(computeSpreadTenYearTwoYear(4.99, 4.7), 2), 0.29);
    assert.strictEqual(roundTo(computeSpreadTenYearTwoYear(3.5, 4.2), 2), -0.7);
  });

  it("pctChange devuelve variacion porcentual o null con previo invalido", () => {
    assert.strictEqual(pctChange(110, 100), 10);
    assert.strictEqual(pctChange(90, 100), -10);
    assert.strictEqual(pctChange(100, 0), null);
  });

  it("computeDxyProxy calcula con la formula renormalizada (caso dorado)", () => {
    const dxy = computeDxyProxy({
      eurusd: 1.11624,
      usdjp: 157.937,
      gbpusd: 1.33612,
      usdcad: 1.3983,
      usdchf: 0.82627,
    });
    assert.ok(Math.abs(dxy - 94.26) < 0.1, `dxy=${dxy}`);
  });

  it("normaliza series a base 100 y calcula variacion del periodo", () => {
    const { series, changePeriodPct } = computeBase100([
      { t: "2026-01-05", v: 50 },
      { t: "2026-01-06", v: 60 },
      { t: "2026-01-07", v: 75 },
    ]);
    assert.deepStrictEqual(
      series.map((p) => Math.round(p.v)),
      [100, 120, 150],
    );
    assert.strictEqual(changePeriodPct, 50);
  });

  it("base 100 devuelve null sin suficientes puntos", () => {
    const result = computeBase100([{ t: "2026-01-05", v: 50 }]);
    assert.strictEqual(result.changePeriodPct, null);
    assert.strictEqual(result.series[0]?.v, 100);
  });

  it("roundTo respeta decimales", () => {
    assert.strictEqual(roundTo(4.95671, 2), 4.96);
    assert.strictEqual(roundTo(1.11624, 4), 1.1162);
  });

  it("freshOrStale marca stale al superar intervalo x margen", () => {
    const now = new Date("2026-10-29T15:00:00Z");
    const asOf19 = new Date("2026-10-29T14:41:00Z");
    const asOf21 = new Date("2026-10-29T14:39:00Z");
    assert.strictEqual(freshOrStale(asOf19, 10, 2, now), "fresh");
    assert.strictEqual(freshOrStale(asOf21, 10, 2, now), "stale");
    assert.strictEqual(freshOrStale(new Date(), 0, 2, now), "stale");
  });

  it("rangeStart y toDateKey trabajan con UTC", () => {
    const now = new Date("2026-10-29T15:00:00Z");
    const from = rangeStart(now, "1M");
    assert.strictEqual(toDateKey(from), "2026-09-28");
    assert.strictEqual(Math.round((now.getTime() - from.getTime()) / 86400000), 31);
  });

  it("sparklineFrom conserva los puntos mas recientes", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      asOf: new Date(Date.UTC(2026, 0, 1, index)),
      value: index,
    }));
    const points = sparklineFrom(rows, 24);
    assert.strictEqual(points.length, 24);
    assert.strictEqual(points[0]?.v, 6);
    assert.strictEqual(points[points.length - 1]?.v, 29);
  });

  it("sparklineFrom no recorta si hay menos puntos que el maximo", () => {
    const rows = [{ asOf: new Date("2026-10-29T00:00:00Z"), value: 1 }];
    assert.deepStrictEqual(sparklineFrom(rows), [{ t: "2026-10-29T00:00:00.000Z", v: 1 }]);
  });
});

describe("indicators.config", () => {
  it("isMarketOpen respeta dias y ventana UTC", () => {
    assert.strictEqual(isMarketOpen(new Date("2026-10-29T14:00:00Z"), "13:30", "20:00"), true);
    assert.strictEqual(isMarketOpen(new Date("2026-10-29T13:29:00Z"), "13:30", "20:00"), false);
    assert.strictEqual(isMarketOpen(new Date("2026-10-29T20:00:00Z"), "13:30", "20:00"), false);
    assert.strictEqual(isMarketOpen(new Date("2026-10-31T15:00:00Z"), "13:30", "20:00"), false);
    assert.strictEqual(isMarketOpen(new Date("2026-11-01T15:00:00Z"), "13:30", "20:00"), false);
  });
});

describe("fmp provider errores", () => {
  const makeProvider = (text: string, status = 200) =>
    new FmpProvider({
      apiKey: "k",
      baseUrl: "https://financialmodelingprep.com/stable",
      fetchFn: (async () =>
        new Response(text, {
          status,
          headers: { "content-type": status === 200 ? "text/plain" : "application/json" },
        })) as typeof fetch,
    });

  it("detecta endpoint premium en texto plano", async () => {
    await assert.rejects(
      makeProvider(
        "Premium Query Parameter: 'Special Endpoint : This value set for 'symbol' is not available'",
      ).fetchQuote("^VIX"),
      (error: unknown) => {
        assert.ok(error instanceof IndicatorsProviderError);
        assert.strictEqual(error.kind, "PREMIUM");
        return true;
      },
    );
  });

  it("detecta respuesta invalida", async () => {
    await assert.rejects(
      makeProvider("cuerpo inesperado del proveedor").fetchQuote("^GSPC"),
      (error: unknown) => {
        assert.ok(error instanceof IndicatorsProviderError);
        assert.strictEqual(error.kind, "INVALID_RESPONSE");
        return true;
      },
    );
  });

  it("mapea 429 a rate limited", async () => {
    await assert.rejects(
      makeProvider("{}", 429).fetchQuote("^GSPC"),
      (error: unknown) => {
        assert.ok(error instanceof IndicatorsProviderError);
        assert.strictEqual(error.kind, "RATE_LIMITED");
        return true;
      },
    );
  });

  it("mapea 403 a auth error", async () => {
    await assert.rejects(
      makeProvider("{}", 403).fetchQuote("^GSPC"),
      (error: unknown) => {
        assert.ok(error instanceof IndicatorsProviderError);
        assert.strictEqual(error.kind, "AUTH_ERROR");
        return true;
      },
    );
  });

  it("mapea 402 a premium", async () => {
    await assert.rejects(
      makeProvider("{}", 402).fetchQuote("^GSPC"),
      (error: unknown) => {
        assert.ok(error instanceof IndicatorsProviderError);
        assert.strictEqual(error.kind, "PREMIUM");
        assert.strictEqual(error.status, 402);
        return true;
      },
    );
  });
});

describe("fmp provider parseo", () => {
  it("parsea quote valida", async () => {
    const provider = new FmpProvider({
      apiKey: "k",
      baseUrl: "https://financialmodelingprep.com/stable",
      fetchFn: (async () =>
        new Response(
          JSON.stringify([
            {
              symbol: "^VIX",
              name: "CBOE Volatility Index",
              price: 17.03,
              changePercentage: 0.70964,
              change: 0.12,
              volume: 0,
              timestamp: 1793299141,
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    const quote = await provider.fetchQuote("^VIX");
    assert.strictEqual(quote.symbol, "^VIX");
    assert.strictEqual(quote.price, 17.03);
    assert.strictEqual(quote.changePct, 0.70964);
    assert.strictEqual(new Date(1793299141 * 1000).getTime(), quote.ts.getTime());
  });

  it("parsea fila de treasury", async () => {
    const provider = new FmpProvider({
      apiKey: "k",
      baseUrl: "https://financialmodelingprep.com/stable",
      fetchFn: (async () =>
        new Response(
          JSON.stringify([
            { date: "2026-10-27", year2: 4.7, year10: 4.99, year30: 5.3, month1: 4.1 },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    const rows = await provider.fetchTreasury();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.year2, 4.7);
    assert.strictEqual(rows[0]?.year10, 4.99);
  });

  it("ordena el treasury de mas antiguo a mas reciente", async () => {
    const provider = new FmpProvider({
      apiKey: "k",
      baseUrl: "https://financialmodelingprep.com/stable",
      fetchFn: (async () =>
        new Response(
          JSON.stringify([
            { date: "2026-10-29", year2: 4.7, year10: 4.99, year30: 5.3 },
            { date: "2026-10-27", year2: 4.68, year10: 4.95, year30: 5.28 },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    const rows = await provider.fetchTreasury();
    assert.deepStrictEqual(
      rows.map((row) => row.date.toISOString().slice(0, 10)),
      ["2026-10-27", "2026-10-29"],
    );
  });
});
