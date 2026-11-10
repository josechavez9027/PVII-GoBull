import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert";
import { FuturesService } from "./futures.service";
import { FUTURES_DEFINITIONS } from "./futures.catalog";
import type { FuturesConfig } from "./futures.config";
import type { YahooFuturesProvider } from "./futures.provider";
import * as repo from "./futures.repository";

const CONFIG: FuturesConfig = {
  enabled: false,
  baseUrl: "https://example.test",
  refreshMinutes: 5,
  backfillDays: 365,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r = repo as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function stubRepo(extra: Record<string, Function> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const defaults: Record<string, Function> = {
    latestFutureSnapshots: async () => new Map(),
    previousSnapshot: async () => null,
    referenceSnapshot: async () => null,
    upsertFuturesSnapshots: async () => 0,
  };
  const stubs: Record<string, ReturnType<typeof mock.method>> = {};
  for (const [name, impl] of Object.entries({ ...defaults, ...extra })) {
    stubs[name] = mock.method(r, name, impl);
  }
  return stubs;
}

function fakeProvider(rows: unknown[] = []) {
  const calls: { symbol: string; range: string }[] = [];
  const provider = {
    async fetchDaily(symbol: string, range: string) {
      calls.push({ symbol, range });
      return rows;
    },
  } as unknown as YahooFuturesProvider;
  return { provider, calls };
}

function snapshot(code: string, iso: string, close: number) {
  return { code, asOf: new Date(`${iso}T00:00:00.000Z`), close };
}

describe("FuturesService", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-06T15:00:00.000Z").getTime() });
  });
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("compone el panel con los cuatro periodos y marca los simbolos sin datos", async () => {
    const latest = new Map([
      ["CL", snapshot("CL", "2026-11-05", 110)],
      ["GC", snapshot("GC", "2026-11-05", 90)],
    ]);
    stubRepo({
      latestFutureSnapshots: async () => latest,
      previousSnapshot: async (code: string) =>
        code === "GC" ? snapshot("GC", "2026-11-04", 100) : snapshot("CL", "2026-11-04", 100),
      referenceSnapshot: async (code: string) =>
        code === "CL" ? snapshot("CL", "2026-08-01", 100) : null,
    });
    const { provider } = fakeProvider();
    const service = new FuturesService(CONFIG, provider);

    const panel = await service.panel();
    assert.strictEqual(panel.items.length, FUTURES_DEFINITIONS.length);

    const crude = panel.items.find((item) => item.code === "CL")!;
    assert.strictEqual(crude.changes["1D"], 10);
    assert.strictEqual(crude.changes["1M"], 10);
    assert.strictEqual(crude.changes["3M"], 10);
    assert.strictEqual(crude.changes.YTD, 10);

    const gold = panel.items.find((item) => item.code === "GC")!;
    assert.strictEqual(gold.changes["1D"], -10);
    assert.strictEqual(gold.changes["1M"], null);

    const corn = panel.items.find((item) => item.code === "ZC")!;
    assert.strictEqual(corn.available, false);
    assert.strictEqual(corn.price, null);
    assert.deepStrictEqual(corn.changes, { "1D": null, "1M": null, "3M": null, YTD: null });
    assert.strictEqual(panel.stale, false);
  });

  it("usa la referencia YTD del cierre del ano anterior", async () => {
    stubRepo({
      latestFutureSnapshots: async () => new Map([["6E", snapshot("6E", "2026-03-02", 1.2)]]),
      referenceSnapshot: async (code: string, target: Date) => {
        assert.strictEqual(code, "6E");
        if (target.toISOString() === "2025-12-31T00:00:00.000Z") {
          return snapshot("6E", "2025-12-31", 1);
        }
        return null;
      },
    });
    const service = new FuturesService(CONFIG, fakeProvider().provider);
    const panel = await service.panel();
    const euro = panel.items.find((item) => item.code === "6E")!;
    assert.strictEqual(euro.changes.YTD?.toFixed(2), "20.00");
    assert.strictEqual(euro.changes["1M"], null);
  });

  it("refresca una sola vez por ventana y hace backfill de un ano por simbolo", async () => {
    const config: FuturesConfig = { ...CONFIG, enabled: true };
    const upserts: unknown[][] = [];
    stubRepo({
      upsertFuturesSnapshots: async (rows: unknown[]) => {
        upserts.push(rows);
        return rows.length;
      },
      latestFutureSnapshots: async () => new Map(),
    });
    const { provider, calls } = fakeProvider([
      { date: new Date("2026-11-05T00:00:00.000Z"), close: 100 },
    ]);
    const service = new FuturesService(config, provider);
    const total = FUTURES_DEFINITIONS.length;

    await service.panel();
    await service.panel();

    assert.strictEqual(calls.length, total);
    assert.ok(calls.every((call) => call.range === "1y"));
    assert.strictEqual(upserts.length, total);

    mock.timers.tick(6 * 60 * 1000);
    await service.panel();
    assert.strictEqual(calls.length, total * 2);
    assert.ok(calls.slice(total).every((call) => call.range === "5d"));
  });
});
