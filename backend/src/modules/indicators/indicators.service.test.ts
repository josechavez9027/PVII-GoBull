import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert";
import cron from "node-cron";
import { IndicatorsService } from "./indicators.service";
import { IndicatorsProviderError, type FmpProvider } from "./indicators.provider";
import type { IndicatorQuotaService } from "./indicators.quota";
import type { IndicatorsConfig } from "./indicators.config";
import { bucketSnapshots } from "./indicators.calc";
import { startIndicatorsScheduler } from "./indicators.scheduler";
import { QUOTE_GROUP_SYMBOLS } from "./indicators.catalog";
import * as repo from "./indicators.repository";

const SYMBOL = QUOTE_GROUP_SYMBOLS.indices[0]!;

const CONFIG = {
  apiKey: "test-key",
  baseUrl: "http://localhost",
  enabled: true,
  dailyBudget: 220,
  tickCron: "*/10 * * * *",
  marketStartUtc: "13:00",
  marketEndUtc: "21:00",
  intervals: { indices: 10, forex: 10, crypto: 10, commodities: 10 },
  offHoursIntervalMinutes: 60,
  treasuryCron: "0 22 * * *",
  backfillEnabled: true,
  backfillCron: "30 2 * * *",
  backfillDays: 5,
  freshnessMargin: 1.5,
} as unknown as IndicatorsConfig;

const VIX = {
  id: "ind-vix",
  code: "VIX",
  name: "VIX",
  category: "VOLATILITY",
  unit: "index",
  decimals: 2,
  source: "FMP_QUOTE",
  sourceSymbol: SYMBOL,
  quoteGroup: "indices",
  treasuryField: null,
  isActive: true,
  sortOrder: 1,
};

function fakeQuota(allow = true) {
  const calls = { reserve: 0 };
  const quota = {
    async reserve() {
      calls.reserve += 1;
      return allow;
    },
    async usage() {
      return { used: 1, budget: 220 };
    },
    async exhausted() {
      return !allow;
    },
  } as unknown as IndicatorQuotaService;
  return { quota, calls };
}

function fakeProvider(overrides: Record<string, unknown> = {}) {
  const calls = { fetchQuote: 0, fetchHistory: 0 };
  const provider = {
    async fetchQuote() {
      calls.fetchQuote += 1;
      return { symbol: SYMBOL, name: "VIX", price: 20, changePct: 1, ts: new Date() };
    },
    async fetchHistory() {
      calls.fetchHistory += 1;
      return [];
    },
    async fetchTreasury() {
      return [];
    },
    ...overrides,
  } as unknown as FmpProvider;
  return { provider, calls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r = repo as any;

function stubRepo(extra: Record<string, unknown> = {}) {
  const stubs: Record<string, ReturnType<typeof mock.method>> = {};
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const defaults: Record<string, Function> = {
    listActiveIndicators: async () => [VIX],
    upsertSnapshot: async () => undefined,
    upsertSnapshots: async () => 0,
    markSyncRun: async () => undefined,
    getSyncState: async () => null,
    latestSnapshotsFor: async () => new Map(),
    snapshotsInWindowFor: async () => [],
    getIndicatorByCode: async (code: string) => (code === "VIX" ? VIX : null),
    listSnapshots: async () => [],
    findPreviousSnapshot: async () => null,
    ...(extra as Record<string, Function>),
  };
  for (const [name, impl] of Object.entries(defaults)) {
    stubs[name] = mock.method(r, name, impl);
  }
  return stubs;
}

describe("IndicatorsService", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
  });
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("quota guard: no consulta al proveedor cuando se agota el presupuesto", async () => {
    const stubs = stubRepo();
    const { quota } = fakeQuota(false);
    const { provider, calls } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const outcome = await service.syncGroup("indices");

    assert.strictEqual(outcome.quotaBlocked, true);
    assert.strictEqual(calls.fetchQuote, 0);
    assert.strictEqual(stubs.upsertSnapshot!.mock.callCount(), 0);
  });

  it("402 premium se cuenta aparte y no escribe snapshot", async () => {
    const stubs = stubRepo();
    const { quota } = fakeQuota();
    const { provider } = fakeProvider({
      async fetchQuote() {
        throw new IndicatorsProviderError("Endpoint premium", "PREMIUM", 402);
      },
    });
    const service = new IndicatorsService(CONFIG, provider, quota);

    const outcome = await service.syncGroup("indices");

    assert.strictEqual(outcome.premium, 1);
    assert.strictEqual(outcome.ok, 0);
    assert.strictEqual(stubs.upsertSnapshot!.mock.callCount(), 0);
    assert.deepStrictEqual(stubs.markSyncRun!.mock.calls[0]!.arguments.slice(0, 2), [
      "group:indices",
      "ERROR",
    ]);
  });

  it("402 sin snapshot previo deja el indicador como unavailable en el panel", async () => {
    stubRepo();
    const { quota } = fakeQuota();
    const { provider } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const panel = await service.panel();
    const item = panel.groups.flatMap((g) => g.items).find((i) => i.code === "VIX")!;

    assert.strictEqual(item.status, "unavailable");
    assert.strictEqual(item.value, null);
  });

  it("5xx conserva el ultimo snapshot y no lo sobrescribe", async () => {
    const latest = { asOf: new Date(Date.now() - 60_000), value: 18.5, changePct: 0.5 };
    const stubs = stubRepo({
      latestSnapshotsFor: async () => new Map([[VIX.id, latest]]),
    });
    const { quota } = fakeQuota();
    const { provider } = fakeProvider({
      async fetchQuote() {
        throw new IndicatorsProviderError("Error del proveedor", "SERVER_ERROR", 503);
      },
    });
    const service = new IndicatorsService(CONFIG, provider, quota);

    const outcome = await service.syncGroup("indices");
    assert.strictEqual(outcome.failed, 1);
    assert.strictEqual(stubs.upsertSnapshot!.mock.callCount(), 0);

    const panel = await service.panel();
    const item = panel.groups.flatMap((g) => g.items).find((i) => i.code === "VIX")!;
    assert.strictEqual(item.value, 18.5);
    assert.notStrictEqual(item.status, "unavailable");
  });

  it("429 activa el backoff y detiene el resto de simbolos", async () => {
    stubRepo();
    const { quota } = fakeQuota();
    const { provider } = fakeProvider({
      async fetchQuote() {
        throw new IndicatorsProviderError("Rate limit", "RATE_LIMITED", 429);
      },
    });
    const service = new IndicatorsService(CONFIG, provider, quota);

    await service.syncGroup("indices");
    // Con el backoff activo, un nuevo ciclo no debe llamar al proveedor.
    const second = await service.syncGroup("indices");
    assert.strictEqual(second.ok + second.failed, 0);
  });

  it("syncGroup concurrente: la segunda llamada se omite", async () => {
    stubRepo();
    const { quota } = fakeQuota();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { provider, calls } = fakeProvider({
      async fetchQuote() {
        calls.fetchQuote += 1;
        await gate;
        return { symbol: SYMBOL, name: "VIX", price: 20, changePct: 1, ts: new Date() };
      },
    });
    const service = new IndicatorsService(CONFIG, provider, quota);

    const first = service.syncGroup("indices");
    await new Promise((resolve) => setImmediate(resolve));
    const second = await service.syncGroup("indices");
    release();
    await first;

    assert.deepStrictEqual(second, { ok: 0, failed: 0, premium: 0, quotaBlocked: false });
    assert.strictEqual(calls.fetchQuote, 1);
  });

  it("TTL de historico: no relanza backfill mientras el estado OK siga vigente", async () => {
    const from = new Date(Date.now() - 5 * 60_000);
    const stubs = stubRepo({
      getSyncState: async () => ({
        lastStatus: "OK",
        lastSuccessAt: from,
        lastRunAt: from,
        lastError: null,
      }),
      listSnapshots: async () => [{ asOf: new Date(), value: 20, changePct: null }],
    });
    const { quota, calls: quotaCalls } = fakeQuota();
    const { provider, calls } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const history = await service.history("VIX", "1M");

    assert.strictEqual(calls.fetchHistory, 0);
    assert.strictEqual(quotaCalls.reserve, 0);
    assert.strictEqual(history.points.length, 1);
    assert.strictEqual(stubs.markSyncRun!.mock.callCount(), 0);
  });

  it("TTL de historico: sin estado previo consulta al proveedor y registra el run", async () => {
    const stubs = stubRepo({
      listSnapshots: async () => [{ asOf: new Date(), value: 20, changePct: null }],
    });
    const { quota } = fakeQuota();
    const { provider, calls } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    await service.history("VIX", "1M");

    assert.strictEqual(calls.fetchHistory, 1);
    assert.strictEqual(stubs.markSyncRun!.mock.callCount(), 1);
  });

  it("compare: codigos desconocidos o sin datos van a missing", async () => {
    stubRepo({
      listSnapshots: async () => [
        { asOf: new Date("2026-01-01T00:00:00Z"), value: 10, changePct: null },
        { asOf: new Date("2026-01-02T00:00:00Z"), value: 11, changePct: null },
      ],
    });
    const { quota } = fakeQuota();
    const { provider } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const result = await service.compare(["VIX", "NOPE"], "1M");

    assert.deepStrictEqual(result.missing, ["NOPE"]);
    assert.strictEqual(result.series.length, 1);
    assert.strictEqual(result.series[0]!.base100[0]!.v, 100);
  });

  it("compare: si ningun codigo es valido lanza BAD_REQUEST", async () => {
    stubRepo();
    const { quota } = fakeQuota();
    const { provider } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    await assert.rejects(
      () => service.compare(["NOPE"], "1M"),
      (error: unknown) =>
        error instanceof IndicatorsProviderError && error.kind === "BAD_REQUEST",
    );
  });

  it("intradia: usa snapshots propios en cubetas, sin llamar al proveedor ni usar cuota", async () => {
    const base = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 2 * 3_600_000;
    stubRepo({
      listSnapshots: async () => [
        { asOf: new Date(base - (base % 86_400_000)), value: 99, changePct: null },
        { asOf: new Date(base + 60_000), value: 10, changePct: null },
        { asOf: new Date(base + 120_000), value: 11, changePct: null },
        { asOf: new Date(base + 6 * 60_000), value: 12, changePct: null },
      ],
    });
    const { quota, calls: quotaCalls } = fakeQuota();
    const { provider, calls } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const result = await service.history("VIX", "5MIN");

    assert.strictEqual(result.granularity, "intraday");
    assert.strictEqual(result.bucketMinutes, 5);
    assert.deepStrictEqual(
      result.points.map((p) => p.v),
      [11, 12],
    );
    assert.strictEqual(calls.fetchHistory, 0);
    assert.strictEqual(quotaCalls.reserve, 0);
  });

  it("bucketSnapshots conserva el ultimo valor por cubeta y ordena", () => {
    const rows = [
      { asOf: new Date("2026-01-01T10:07:00Z"), value: 3 },
      { asOf: new Date("2026-01-01T10:01:00Z"), value: 1 },
      { asOf: new Date("2026-01-01T10:04:00Z"), value: 2 },
    ];
    assert.deepStrictEqual(bucketSnapshots(rows, 5 * 60_000), [
      { t: "2026-01-01T10:00:00.000Z", v: 2 },
      { t: "2026-01-01T10:05:00.000Z", v: 3 },
    ]);
  });

  it("scheduler: todos los jobs se registran con noOverlap", () => {
    const schedule = mock.method(cron, "schedule", () => ({ stop() {} }) as never);
    const { quota } = fakeQuota();
    const { provider } = fakeProvider();
    const service = new IndicatorsService(CONFIG, provider, quota);

    const tasks = startIndicatorsScheduler(service, CONFIG);

    assert.strictEqual(tasks.length, 3);
    for (const call of schedule.mock.calls) {
      const options = call.arguments[2] as { noOverlap?: boolean };
      assert.strictEqual(options.noOverlap, true);
    }
  });
});
