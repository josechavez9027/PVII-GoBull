import { futuresLog } from "./futures.config";
import { yahooChartResponseSchema } from "./futures.schemas";

export type FuturesProviderErrorKind =
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "BAD_REQUEST"
  | "INVALID_RESPONSE";

export class FuturesProviderError extends Error {
  constructor(
    message: string,
    readonly kind: FuturesProviderErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FuturesProviderError";
  }
}

export interface YahooCloseRow {
  date: Date;
  close: number;
}

export type YahooRange = "5d" | "1mo" | "1y";

export interface YahooProviderOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

/** Normaliza el timestamp del proveedor a la medianoche UTC del dia de mercado. */
function utcDate(timestampSeconds: number): Date | null {
  const ms = timestampSeconds * 1000;
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export class YahooFuturesProvider {
  constructor(private options: YahooProviderOptions) {}

  async fetchDaily(symbol: string, range: YahooRange): Promise<YahooCloseRow[]> {
    const url = new URL(
      `${this.options.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}`,
    );
    url.searchParams.set("range", range);
    url.searchParams.set("interval", "1d");

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      });
    } catch (error) {
      throw new FuturesProviderError(
        error instanceof Error ? error.message : String(error),
        "NETWORK_ERROR",
      );
    }

    if (response.status === 429) {
      throw new FuturesProviderError("Rate limit del proveedor", "RATE_LIMITED", 429);
    }
    if (response.status === 404) {
      throw new FuturesProviderError(`Simbolo no disponible: ${symbol}`, "BAD_REQUEST", 404);
    }
    if (response.status >= 500) {
      throw new FuturesProviderError("Error del proveedor", "SERVER_ERROR", response.status);
    }
    if (!response.ok) {
      throw new FuturesProviderError(
        `Respuesta ${response.status} del proveedor`,
        "INVALID_RESPONSE",
        response.status,
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = await response.json();
    } catch {
      throw new FuturesProviderError("Respuesta no JSON del proveedor", "INVALID_RESPONSE");
    }

    const parsed = yahooChartResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new FuturesProviderError("Respuesta invalida del proveedor", "INVALID_RESPONSE");
    }

    const chart = parsed.data.chart;
    if (chart.error) {
      futuresLog("warn", "FUTURES_PROVIDER_ERROR", { symbol, error: chart.error });
      throw new FuturesProviderError(`Error del proveedor para ${symbol}`, "BAD_REQUEST");
    }
    const result = chart.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    if (timestamps.length === 0 || closes.length === 0) {
      throw new FuturesProviderError(`Sin datos historicos para ${symbol}`, "INVALID_RESPONSE");
    }

    const rows: YahooCloseRow[] = [];
    const limit = Math.min(timestamps.length, closes.length);
    for (let index = 0; index < limit; index += 1) {
      const close = closes[index];
      const timestamp = timestamps[index];
      if (close === null || close === undefined || !Number.isFinite(close)) continue;
      if (timestamp === undefined) continue;
      const date = utcDate(timestamp);
      if (!date) continue;
      rows.push({ date, close });
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return dedupeByDate(rows);
  }
}

function dedupeByDate(rows: YahooCloseRow[]): YahooCloseRow[] {
  const byDate = new Map<number, YahooCloseRow>();
  for (const row of rows) {
    byDate.set(row.date.getTime(), row);
  }
  return [...byDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
