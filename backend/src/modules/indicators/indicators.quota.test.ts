import { describe, it } from "node:test";
import assert from "node:assert";
import { IndicatorQuotaService, type QuotaStore } from "./indicators.quota";

function memoryStore(initial = 0) {
  const state = { requests: initial };
  const store: QuotaStore = {
    async ensureDay() {
      // no-op
    },
    async incrementIfAtMost(_day, maxUsedBefore, count) {
      if (state.requests > maxUsedBefore) return 0;
      state.requests += count;
      return 1;
    },
    async read() {
      return state.requests;
    },
  };
  return { store, state };
}

describe("indicators.quota", () => {
  it("permite reservar hasta el presupuesto y bloquea el exceso", async () => {
    const { store } = memoryStore();
    const quota = new IndicatorQuotaService(3, store);

    assert.strictEqual(await quota.reserve(), true);
    assert.strictEqual(await quota.reserve(), true);
    assert.strictEqual(await quota.reserve(), true);
    assert.strictEqual(await quota.reserve(), false);

    const usage = await quota.usage();
    assert.deepStrictEqual(usage, { used: 3, budget: 3 });
    assert.strictEqual(await quota.exhausted(), true);
  });

  it("no bloquea cuando el presupuesto es 0 (sin limite)", async () => {
    const { store } = memoryStore();
    const quota = new IndicatorQuotaService(0, store);
    for (let i = 0; i < 10; i += 1) {
      assert.strictEqual(await quota.reserve(), true);
    }
    assert.strictEqual(await quota.exhausted(), false);
  });

  it("reserva multiple respeta el limite", async () => {
    const { store, state } = memoryStore(2);
    const quota = new IndicatorQuotaService(5, store);
    assert.strictEqual(await quota.reserve(3), true);
    assert.strictEqual(state.requests, 5);
    assert.strictEqual(await quota.reserve(1), false);
    assert.strictEqual(state.requests, 5);
  });

  it("arranca agotado si ya se consumio el presupuesto", async () => {
    const { store } = memoryStore(5);
    const quota = new IndicatorQuotaService(5, store);
    assert.strictEqual(await quota.exhausted(), true);
    assert.strictEqual(await quota.reserve(), false);
  });
});
