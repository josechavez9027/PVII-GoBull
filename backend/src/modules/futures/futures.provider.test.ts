import { describe, it } from "node:test";
import assert from "node:assert";
import { FuturesProviderError, YahooFuturesProvider } from "./futures.provider";

function chartBody(timestamps: number[], closes: (number | null)[]) {
  return {
    chart: {
      result: [
        {
          timestamp: timestamps,
          indicators: { quote: [{ close: closes }] },
        },
      ],
      error: null,
    },
  };
}

function providerWith(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetchFn = (async (input: URL | RequestInfo) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { provider: new YahooFuturesProvider({ baseUrl: "https://example.test", fetchFn }), calls };
}

describe("YahooFuturesProvider", () => {
  it("parsea cierres, normaliza el dia UTC y descarta nulos", async () => {
    const { provider, calls } = providerWith(
      chartBody([1767225600, 1767312000, 1767398400], [100.5, null, 102.25]),
    );
    const rows = await provider.fetchDaily("CL=F", "5d");
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0]!.date.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.strictEqual(rows[0]!.close, 100.5);
    assert.strictEqual(rows[1]!.close, 102.25);
    assert.match(calls[0]!, /v8\/finance\/chart\/CL%3DF/);
    assert.match(calls[0]!, /range=5d/);
  });

  it("lanza error tipado cuando el proveedor responde 429 o sin datos", async () => {
    const rateLimited = providerWith({}, 429).provider;
    await assert.rejects(
      () => rateLimited.fetchDaily("GC=F", "1y"),
      (error: unknown) =>
        error instanceof FuturesProviderError && error.kind === "RATE_LIMITED",
    );

    const empty = providerWith({ chart: { result: [], error: null } }).provider;
    await assert.rejects(
      () => empty.fetchDaily("GC=F", "1y"),
      (error: unknown) =>
        error instanceof FuturesProviderError && error.kind === "INVALID_RESPONSE",
    );
  });
});
