import { fmpHistoricalRowSchema, fmpQuoteSchema, fmpTreasuryRowSchema } from "./indicators.schemas";
import { indicatorsLog } from "./indicators.config";

export type IndicatorsProviderErrorKind =
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "PREMIUM"
  | "BAD_REQUEST"
  | "INVALID_RESPONSE";

export class IndicatorsProviderError extends Error {
  constructor(
    message: string,
    readonly kind: IndicatorsProviderErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "IndicatorsProviderError";
  }
}

export interface FmpQuoteRow {
  symbol: string;
  name: string | null;
  price: number;
  changePct: number | null;
  ts: Date;
}

export interface FmpTreasuryRow {
  date: Date;
  year2: number | null;
  year10: number | null;
  year30: number | null;
}

export interface FmpHistoryRow {
  symbol: string | null;
  date: Date;
  price: number;
}

export interface FmpProviderOptions {
  apiKey: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class FmpProvider {
  constructor(private options: FmpProviderOptions) {}

  private async request(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.options.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("apikey", this.options.apiKey);

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(url, {
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw new IndicatorsProviderError(
        error instanceof Error ? error.message : String(error),
        "NETWORK_ERROR",
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new IndicatorsProviderError("FMP key invalida o bloqueada", "AUTH_ERROR", response.status);
    }
    if (response.status === 402) {
      throw new IndicatorsProviderError("Endpoint premium", "PREMIUM", response.status);
    }
    if (response.status === 429) {
      throw new IndicatorsProviderError("Rate limit del proveedor", "RATE_LIMITED", response.status);
    }
    if (response.status >= 500) {
      throw new IndicatorsProviderError("Error del proveedor", "SERVER_ERROR", response.status);
    }
    if (response.status === 400) {
      throw new IndicatorsProviderError("Peticion invalida", "BAD_REQUEST", response.status);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (/premium/i.test(text)) {
        throw new IndicatorsProviderError("Endpoint premium", "PREMIUM", response.status);
      }
      if (/restricted/i.test(text)) {
        throw new IndicatorsProviderError("Endpoint restringido para el plan actual", "PREMIUM", response.status);
      }
      if (/usage limit|exceeded|429/i.test(text)) {
        throw new IndicatorsProviderError("Presupuesto agotado del proveedor", "RATE_LIMITED", response.status);
      }
      if (/api.?key/i.test(text)) {
        throw new IndicatorsProviderError("FMP key invalida", "AUTH_ERROR", response.status);
      }
      throw new IndicatorsProviderError("Respuesta invalida del proveedor", "INVALID_RESPONSE", response.status);
    }
    return parsed;
  }

  async fetchQuote(symbol: string): Promise<FmpQuoteRow> {
    const parsed = await this.request("quote", { symbol });
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new IndicatorsProviderError(`Sin datos de quote para ${symbol}`, "INVALID_RESPONSE");
    }
    const row = fmpQuoteSchema.safeParse(parsed[0]);
    if (!row.success) {
      throw new IndicatorsProviderError(`Quote invalida para ${symbol}`, "INVALID_RESPONSE");
    }
    const { price, changePercentage, timestamp, name, symbol: sym } = row.data;
    return {
      symbol: sym ?? symbol,
      name: name ?? null,
      price,
      changePct: changePercentage ?? null,
      ts: timestamp ? new Date(timestamp * 1000) : new Date(),
    };
  }

  async fetchTreasury(limit?: number): Promise<FmpTreasuryRow[]> {
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    const parsed = await this.request("treasury-rates", params);
    if (!Array.isArray(parsed)) {
      throw new IndicatorsProviderError("Respuesta invalida de treasury-rates", "INVALID_RESPONSE");
    }
    const rows: FmpTreasuryRow[] = [];
    for (const raw of parsed) {
      const row = fmpTreasuryRowSchema.safeParse(raw);
      if (row.success) {
        rows.push({
          date: new Date(`${row.data.date}T00:00:00.000Z`),
          year2: row.data.year2 ?? null,
          year10: row.data.year10 ?? null,
          year30: row.data.year30 ?? null,
        });
      }
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return rows;
  }

  async fetchHistory(
    symbol: string,
    from: string,
    to: string,
  ): Promise<FmpHistoryRow[]> {
    const parsed = await this.request("historical-price-eod/light", { symbol, from, to });
    if (!Array.isArray(parsed)) {
      throw new IndicatorsProviderError(`Respuesta historica invalida para ${symbol}`, "INVALID_RESPONSE");
    }
    const rows: FmpHistoryRow[] = [];
    for (const raw of parsed) {
      const row = fmpHistoricalRowSchema.safeParse(raw);
      if (row.success) {
        rows.push({
          symbol: row.data.symbol ?? symbol,
          date: new Date(`${row.data.date}T00:00:00.000Z`),
          price: row.data.price,
        });
      }
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return rows;
  }

  /** Espera antes de reintentos ante rate limit. */
  static async backoff(attempt: number): Promise<void> {
    const delays = [60_000, 5 * 60_000, 15 * 60_000];
    const ms = delays[Math.min(attempt, delays.length - 1)] ?? 60_000;
    await sleep(ms);
    indicatorsLog("warn", "INDICATORS_PROVIDER_BACKOFF", { attempt, ms });
  }
}
