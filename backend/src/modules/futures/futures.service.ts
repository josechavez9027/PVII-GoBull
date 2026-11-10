import { FUTURES_DEFINITIONS } from "./futures.catalog";
import {
  futuresLog,
  FUTURES_DISCLAIMER,
  type FuturesConfig,
} from "./futures.config";
import { futuresPctChange, periodReferenceDate } from "./futures.calc";
import { FuturesProviderError, type YahooFuturesProvider, type YahooRange } from "./futures.provider";
import * as repo from "./futures.repository";
import type {
  FuturesChanges,
  FuturesItemDto,
  FuturesPanelDto,
  FuturesSnapshotRow,
} from "./futures.types";

const EMPTY_CHANGES: FuturesChanges = { "1D": null, "1M": null, "3M": null, YTD: null };

const REFRESH_BATCH_SIZE = 4;

function errorText(error: unknown): string {
  return error instanceof FuturesProviderError
    ? `${error.kind}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}

/** Ejecuta tareas con concurrencia limitada y aisla los errores por elemento. */
async function refreshAll(
  config: FuturesConfig,
  provider: YahooFuturesProvider,
  backfilled: Set<string>,
): Promise<number> {
  let cursor = 0;
  let succeeded = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const definition = FUTURES_DEFINITIONS[index];
      if (!definition) return;

      const range: YahooRange = backfilled.has(definition.code) ? "5d" : "1y";
      try {
        const rows = await provider.fetchDaily(definition.yahooSymbol, range);
        if (rows.length > 0) {
          await repo.upsertFuturesSnapshots(
            rows.map((row) => ({
              code: definition.code,
              asOf: row.date,
              close: row.close,
            })),
          );
          backfilled.add(definition.code);
          succeeded += 1;
        }
      } catch (error) {
        futuresLog("warn", "FUTURES_SYMBOL_ERROR", {
          code: definition.code,
          symbol: definition.yahooSymbol,
          range,
          message: errorText(error),
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(REFRESH_BATCH_SIZE, FUTURES_DEFINITIONS.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return succeeded;
}

export class FuturesService {
  private refreshPromise: Promise<void> | null = null;
  private lastRefreshAt = 0;
  private lastSuccessfulRefreshAt = 0;
  private backfilled = new Set<string>();

  constructor(
    private config: FuturesConfig,
    private provider: YahooFuturesProvider,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Refresca en segundo plano al arrancar; no bloquea el arranque del API. */
  async warmup(): Promise<void> {
    if (!this.config.enabled) return;
    await this.ensureFresh();
  }

  async panel(): Promise<FuturesPanelDto> {
    if (this.config.enabled) {
      await this.ensureFresh();
    }

    const codes = FUTURES_DEFINITIONS.map((definition) => definition.code);
    const latest = await repo.latestFutureSnapshots(codes);
    const items: FuturesItemDto[] = [];

    for (const definition of FUTURES_DEFINITIONS) {
      const last = latest.get(definition.code) ?? null;
      const changes = await this.changesFor(definition.code, last);
      items.push({
        code: definition.code,
        name: definition.name,
        category: definition.category,
        yahooSymbol: definition.yahooSymbol,
        unit: definition.unit,
        decimals: definition.decimals,
        price: last ? last.close : null,
        changes,
        asOf: last ? last.asOf.toISOString() : null,
        available: Boolean(last),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      stale: this.isStale(),
      items,
      disclaimer: FUTURES_DISCLAIMER,
    };
  }

  private async changesFor(
    code: string,
    last: FuturesSnapshotRow | null,
  ): Promise<FuturesChanges> {
    if (!last) return { ...EMPTY_CHANGES };

    const [previous, month, quarter, ytd] = await Promise.all([
      repo.previousSnapshot(code, last.asOf),
      repo.referenceSnapshot(code, periodReferenceDate("1M", last.asOf)),
      repo.referenceSnapshot(code, periodReferenceDate("3M", last.asOf)),
      repo.referenceSnapshot(code, periodReferenceDate("YTD", last.asOf)),
    ]);

    const pct = (base: FuturesSnapshotRow | null): number | null =>
      base ? futuresPctChange(last.close, base.close) : null;

    return {
      "1D": pct(previous),
      "1M": pct(month),
      "3M": pct(quarter),
      YTD: pct(ytd),
    };
  }

  private isStale(): boolean {
    if (!this.config.enabled) return false;
    if (this.lastSuccessfulRefreshAt === 0) return true;
    const maxAgeMs = this.config.refreshMinutes * 2 * 60 * 1000;
    return Date.now() - this.lastSuccessfulRefreshAt > maxAgeMs;
  }

  private async ensureFresh(): Promise<void> {
    const refreshMs = this.config.refreshMinutes * 60 * 1000;
    if (Date.now() - this.lastRefreshAt < refreshMs) return;
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refresh(): Promise<void> {
    this.lastRefreshAt = Date.now();
    const succeeded = await refreshAll(this.config, this.provider, this.backfilled);
    if (succeeded > 0) {
      this.lastSuccessfulRefreshAt = Date.now();
    }
    futuresLog(succeeded === FUTURES_DEFINITIONS.length ? "info" : "warn", "FUTURES_REFRESH", {
      succeeded,
      total: FUTURES_DEFINITIONS.length,
    });
  }
}
