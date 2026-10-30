import type { Indicator } from "@prisma/client";
import {
  CATEGORY_ORDER,
  indicatorsLog,
  isMarketOpen,
  type IndicatorsConfig,
} from "./indicators.config";
import {
  DXY_INPUT_SYMBOLS,
  GROUP_ORDER,
  QUOTE_GROUP_SYMBOLS,
} from "./indicators.catalog";
import {
  DAILY_BACKFILL_DAYS,
  DAILY_COVERAGE_TTL_MS,
  INTRADAY_BUCKET_MS,
  RANGE_DAYS,
  RANGE_TTL_MS,
  bucketSnapshots,
  isIntradayRange,
  computeBase100,
  computeDxyProxy,
  computeSpreadTenYearTwoYear,
  pctChange,
  freshOrStale,
  rangeStart,
  roundTo,
  sparklineFrom,
  toDateKey,
  type TimeRange,
} from "./indicators.calc";
import type { FmpProvider, FmpHistoryRow, FmpTreasuryRow } from "./indicators.provider";
import { IndicatorsProviderError } from "./indicators.provider";
import type { IndicatorQuotaService } from "./indicators.quota";
import type { SnapshotRow, UpsertSnapshotInput } from "./indicators.repository";
import * as repo from "./indicators.repository";
import type {
  CompareDto,
  CompareSeriesDto,
  HistoryDto,
  IndicatorCategory,
  IndicatorItemDto,
  IndicatorPoint,
  IndicatorStatus,
  IndicatorsPanelDto,
  QuoteGroup,
  SyncJobState,
  SyncStatusDto,
} from "./indicators.types";

type PrismaIndicator = Indicator;

const COMPARISON_MAX_CODES = 6;
const SPARKLINE_SINCE_DAYS = 3;
const TREASURY_FRESH_MINUTES = 3 * 24 * 60;
const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
const DAY_MS = 24 * 60 * 60 * 1000;

export type ManualSyncResult = "STARTED" | "BUSY" | "THROTTLED";

interface SyncOutcome {
  ok: number;
  failed: number;
  premium: number;
  quotaBlocked: boolean;
}

interface DxyPairs {
  eurusd: number;
  usdjp: number;
  gbpusd: number;
  usdcad: number;
  usdchf: number;
}

function truncateToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function errorText(error: unknown): string {
  return error instanceof IndicatorsProviderError
    ? `${error.kind}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}

function pairsFromRows(pairs: Map<string, SnapshotRow>): DxyPairs {
  return {
    eurusd: pairs.get("EURUSD")!.value,
    usdjp: pairs.get("USDJPY")!.value,
    gbpusd: pairs.get("GBPUSD")!.value,
    usdcad: pairs.get("USDCAD")!.value,
    usdchf: pairs.get("USDCHF")!.value,
  };
}

export class IndicatorsService {
  private busyGroups = new Set<QuoteGroup>();
  private budgetBlockedUntil = 0;
  private rateLimitedUntil = 0;
  private rateLimitAttempt = 0;
  private runAllBusy = false;
  private lastManualSyncAt = 0;

  constructor(
    private config: IndicatorsConfig,
    private provider: FmpProvider,
    private quota: IndicatorQuotaService,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  private freshIntervalMinutes(source: string, quoteGroup: QuoteGroup | null): number {
    if (source === "FMP_TREASURY") return TREASURY_FRESH_MINUTES;
    if (quoteGroup) return this.config.intervals[quoteGroup];
    if (source === "COMPUTED") return 24 * 60 * 2;
    return 24 * 60 * 3;
  }

  private statusOfIndicator(
    indicator: PrismaIndicator,
    latest: SnapshotRow | null,
    now: Date,
  ): IndicatorStatus {
    if (!latest) return "unavailable";
    const group =
      indicator.source === "FMP_QUOTE" ? (indicator.quoteGroup as QuoteGroup | null) : null;
    const interval = this.freshIntervalMinutes(indicator.source, group);
    return freshOrStale(latest.asOf, interval, this.config.freshnessMargin, now);
  }

  private get providerBlocked(): boolean {
    return Date.now() < this.budgetBlockedUntil || Date.now() < this.rateLimitedUntil;
  }

  async tick(): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.isConfigured) {
      indicatorsLog("warn", "INDICATORS_PROVIDER_NOT_CONFIGURED");
      return;
    }
    if (this.providerBlocked) return;

    const now = new Date();
    const marketOpen = isMarketOpen(
      now,
      this.config.marketStartUtc,
      this.config.marketEndUtc,
    );

    for (const group of GROUP_ORDER) {
      if (this.busyGroups.has(group)) continue;
      const interval = marketOpen
        ? this.config.intervals[group]
        : this.config.offHoursIntervalMinutes;
      const marketOnly = group === "indices" || group === "forex";
      if (!marketOpen && (interval <= 0 || marketOnly)) continue;

      if (!(await this.isGroupDue(group, interval))) continue;
      await this.syncGroup(group);
    }
  }

  private async isGroupDue(group: QuoteGroup, intervalMinutes: number): Promise<boolean> {
    if (intervalMinutes <= 0) return false;
    const state = await repo.getSyncState(`group:${group}`);
    if (!state?.lastSuccessAt) return true;
    if (state.lastStatus === "ERROR") return true;
    return Date.now() - state.lastSuccessAt.getTime() >= intervalMinutes * 60 * 1000;
  }

  private async reserveQuota(): Promise<boolean> {
    const allowed = await this.quota.reserve(1);
    if (!allowed && Date.now() >= this.budgetBlockedUntil) {
      this.budgetBlockedUntil = Date.now() + 30 * 60 * 1000;
      indicatorsLog("warn", "INDICATORS_BUDGET_EXHAUSTED", {
        budget: this.config.dailyBudget,
      });
    }
    return allowed;
  }

  private registerRateLimit(): void {
    const ms = RATE_LIMIT_BACKOFF_MS[Math.min(this.rateLimitAttempt, RATE_LIMIT_BACKOFF_MS.length - 1)]!;
    this.rateLimitAttempt += 1;
    this.rateLimitedUntil = Date.now() + ms;
    indicatorsLog("warn", "INDICATORS_PROVIDER_BACKOFF", {
      attempt: this.rateLimitAttempt,
      ms,
    });
  }

  private resetRateLimit(): void {
    this.rateLimitAttempt = 0;
    this.rateLimitedUntil = 0;
  }

  private logProviderError(scope: string, subject: string, error: unknown): void {
    if (error instanceof IndicatorsProviderError) {
      indicatorsLog(
        error.kind === "PREMIUM" ? "warn" : "error",
        "INDICATORS_PROVIDER_ERROR",
        {
          scope,
          subject,
          kind: error.kind,
          status: error.status,
          message: error.message,
        },
      );
    } else {
      indicatorsLog("error", "INDICATORS_SYNC_ERROR", {
        scope,
        subject,
        message: errorText(error),
      });
    }
  }

  async syncGroup(group: QuoteGroup): Promise<SyncOutcome> {
    const skipped: SyncOutcome = { ok: 0, failed: 0, premium: 0, quotaBlocked: false };
    if (this.busyGroups.has(group)) return skipped;

    this.busyGroups.add(group);
    const outcome: SyncOutcome = { ok: 0, failed: 0, premium: 0, quotaBlocked: false };
    try {
      const indicators = await repo.listActiveIndicators();
      const bySymbol = new Map(
        indicators
          .filter(
            (i) => i.source === "FMP_QUOTE" && i.quoteGroup === group && i.sourceSymbol,
          )
          .map((i) => [i.sourceSymbol as string, i]),
      );
      const symbols = QUOTE_GROUP_SYMBOLS[group].filter((symbol) => bySymbol.has(symbol));

      for (const symbol of symbols) {
        if (this.providerBlocked) break;
        if (!(await this.reserveQuota())) {
          outcome.quotaBlocked = true;
          break;
        }
        const indicator = bySymbol.get(symbol);
        try {
          const quote = await this.provider.fetchQuote(symbol);
          this.resetRateLimit();
          if (!indicator) {
            indicatorsLog("warn", "INDICATORS_ENTRY_MISSING", { group, symbol });
            continue;
          }
          await repo.upsertSnapshot({
            indicatorId: indicator.id,
            asOf: truncateToSecond(quote.ts),
            value: quote.price,
            changePct: quote.changePct,
          });
          outcome.ok += 1;
        } catch (error) {
          this.logProviderError(`group:${group}`, symbol, error);
          if (error instanceof IndicatorsProviderError) {
            if (error.kind === "PREMIUM") {
              outcome.premium += 1;
              continue;
            }
            if (error.kind === "RATE_LIMITED") {
              outcome.failed += 1;
              this.registerRateLimit();
              break;
            }
          }
          outcome.failed += 1;
        }
      }

      if (group === "forex" && outcome.ok > 0) {
        await this.recomputeDxy();
      }

      const status: "OK" | "PARTIAL" | "ERROR" =
        outcome.ok > 0
          ? outcome.failed > 0 || outcome.premium > 0 || outcome.quotaBlocked
            ? "PARTIAL"
            : "OK"
          : "ERROR";
      await repo.markSyncRun(`group:${group}`, status);
      indicatorsLog("info", "INDICATORS_GROUP_SYNCED", {
        group,
        ok: outcome.ok,
        failed: outcome.failed,
        premium: outcome.premium,
        quotaBlocked: outcome.quotaBlocked,
      });
      return outcome;
    } finally {
      this.busyGroups.delete(group);
    }
  }

  async recomputeDxy(): Promise<void> {
    if (!this.isConfigured) return;
    try {
      const indicators = await repo.listActiveIndicators();
      const idBySymbol = new Map<string, string>();
      for (const row of indicators) {
        if (row.source === "FMP_QUOTE" && row.sourceSymbol) {
          idBySymbol.set(row.sourceSymbol, row.id);
        }
      }
      const latestByIndicator = await repo.latestSnapshotsFor([...idBySymbol.values()]);
      const pairs = new Map<string, SnapshotRow>();
      for (const symbol of DXY_INPUT_SYMBOLS) {
        const id = idBySymbol.get(symbol);
        const latest = id ? latestByIndicator.get(id) : null;
        if (!latest) {
          pairs.clear();
          break;
        }
        pairs.set(symbol, latest);
      }
      const dxy = indicators.find((i) => i.code === "DXY");
      if (pairs.size !== DXY_INPUT_SYMBOLS.length || !dxy) return;

      const value = roundTo(computeDxyProxy(pairsFromRows(pairs)), 2);
      const asOf = truncateToSecond(
        new Date(Math.max(...[...pairs.values()].map((row) => row.asOf.getTime()))),
      );
      const previous = await repo.findPreviousSnapshot(dxy.id, asOf);
      await repo.upsertSnapshot({
        indicatorId: dxy.id,
        asOf,
        value,
        changePct: previous ? pctChange(value, previous.value) : null,
      });
    } catch (error) {
      this.logProviderError("computed", "DXY", error);
    }
  }

  async refreshTreasury(): Promise<void> {
    if (!this.config.enabled || !this.isConfigured) return;
    if (!(await this.reserveQuota())) return;

    let rows: FmpTreasuryRow[];
    try {
      rows = await this.provider.fetchTreasury(260);
      this.resetRateLimit();
    } catch (error) {
      this.logProviderError("treasury", "fmp", error);
      if (error instanceof IndicatorsProviderError && error.kind === "RATE_LIMITED") {
        this.registerRateLimit();
      }
      await repo.markSyncRun("treasury", "ERROR", errorText(error));
      return;
    }
    if (rows.length === 0) {
      await repo.markSyncRun("treasury", "ERROR", "Respuesta vacia de treasury-rates");
      return;
    }
    const updated = await this.applyTreasuryRows(rows);
    await repo.markSyncRun("treasury", "OK");
    indicatorsLog("info", "INDICATORS_TREASURY_SYNCED", { rows: rows.length, updated });
  }

  private async applyTreasuryRows(rows: FmpTreasuryRow[]): Promise<number> {
    const indicators = (await repo.listActiveIndicators()).filter(
      (i) => i.source === "FMP_TREASURY" || i.code === "SPREAD_10Y2Y",
    );
    const byField = new Map(
      indicators
        .filter((i) => i.treasuryField)
        .map((i) => [i.treasuryField as "year2" | "year10" | "year30", i]),
    );
    const spread = indicators.find((i) => i.code === "SPREAD_10Y2Y");

    const inputs: UpsertSnapshotInput[] = [];
    let prevSpread: number | null = null;
    for (const row of rows) {
      for (const [field, indicator] of byField.entries()) {
        const value = (row as unknown as Record<string, number | null>)[field];
        if (value !== null && value !== undefined) {
          inputs.push({
            indicatorId: indicator.id,
            asOf: row.date,
            value,
            changePct: null,
          });
        }
      }
      if (spread && row.year10 !== null && row.year2 !== null) {
        const value = roundTo(computeSpreadTenYearTwoYear(row.year10, row.year2), 2);
        inputs.push({
          indicatorId: spread.id,
          asOf: row.date,
          value,
          changePct: prevSpread !== null ? pctChange(value, prevSpread) : null,
        });
        prevSpread = value;
      }
    }
    if (inputs.length === 0) return 0;
    return repo.upsertSnapshots(inputs);
  }

  async panel(): Promise<IndicatorsPanelDto> {
    const indicators = await repo.listActiveIndicators();
    const ids = indicators.map((indicator) => indicator.id);
    const since = new Date(Date.now() - SPARKLINE_SINCE_DAYS * DAY_MS);
    const now = new Date();

    const [latestByIndicator, windowRows, usage] = await Promise.all([
      repo.latestSnapshotsFor(ids),
      repo.snapshotsInWindowFor(ids, since, now),
      this.quota.usage(),
    ]);

    const windowByIndicator = new Map<string, { asOf: Date; value: number }[]>();
    for (const row of windowRows) {
      if (!Number.isFinite(row.value)) continue;
      const list = windowByIndicator.get(row.indicatorId) ?? [];
      list.push({ asOf: row.asOf, value: row.value });
      windowByIndicator.set(row.indicatorId, list);
    }

    const groups = new Map<IndicatorCategory, IndicatorItemDto[]>();
    for (const category of CATEGORY_ORDER) groups.set(category, []);

    for (const indicator of indicators) {
      const latest = latestByIndicator.get(indicator.id) ?? null;
      const sparkline = sparklineFrom(windowByIndicator.get(indicator.id) ?? []);
      groups.get(indicator.category)!.push({
        code: indicator.code,
        name: indicator.name,
        category: indicator.category,
        unit: indicator.unit,
        decimals: indicator.decimals,
        value: latest ? roundTo(latest.value, indicator.decimals) : null,
        changePct: latest?.changePct ?? null,
        asOf: latest ? latest.asOf.toISOString() : null,
        status: this.statusOfIndicator(indicator, latest, now),
        sparkline,
        intraday: indicator.source === "FMP_QUOTE" || indicator.code === "DXY",
      });
    }

    const groupList = CATEGORY_ORDER.map((category) => ({
      category,
      items: groups.get(category)!,
    }));
    return {
      generatedAt: now.toISOString(),
      stale: groupList.some((group) =>
        group.items.some((item) => item.status === "stale"),
      ),
      configured: this.isConfigured,
      quota: usage,
      groups: groupList,
    };
  }

  async history(code: string, range: TimeRange): Promise<HistoryDto> {
    const indicator = await repo.getIndicatorByCode(code);
    if (!indicator || !indicator.isActive) {
      throw new IndicatorsProviderError("Indicador no encontrado", "BAD_REQUEST");
    }
    const now = new Date();
    const from = rangeStart(now, range);

    if (isIntradayRange(range)) {
      // El plan gratuito de FMP no ofrece intradia: se sirven los snapshots propios.
      const bucketMs = INTRADAY_BUCKET_MS[range];
      const rows = await repo.listSnapshots(indicator.id, from, now);
      const quotes = rows
        .filter((row) => row.asOf.getTime() % DAY_MS !== 0)
        .map((row) => ({ asOf: row.asOf, value: Number(row.value) }));
      return {
        code: indicator.code,
        name: indicator.name,
        unit: indicator.unit,
        decimals: indicator.decimals,
        range,
        granularity: "intraday",
        bucketMinutes: bucketMs / 60_000,
        points: bucketSnapshots(quotes, bucketMs),
      };
    }

    if (this.config.enabled && this.isConfigured) {
      try {
        await this.ensureHistoryCoverage(indicator, range, from, now);
      } catch (error) {
        this.logProviderError(`hist:${code}`, range, error);
      }
    }

    const points = await this.readPoints(indicator.id, from, now);
    return {
      code: indicator.code,
      name: indicator.name,
      unit: indicator.unit,
      decimals: indicator.decimals,
      range,
      granularity: "daily",
      bucketMinutes: null,
      points: dedupePoints(points),
    };
  }

  private async ensureHistoryCoverage(
    indicator: PrismaIndicator,
    range: TimeRange,
    from: Date,
    to: Date,
  ): Promise<void> {
    // Todos los rangos diarios comparten un unico backfill de 2 anos; 5Y tiene el suyo.
    const deep = range === "5Y";
    const job = `hist:${indicator.code}:${deep ? "5Y" : "daily"}`;
    const ttl = deep ? RANGE_TTL_MS["5Y"] : DAILY_COVERAGE_TTL_MS;
    const state = await repo.getSyncState(job);
    const fresh =
      state?.lastStatus === "OK" &&
      state.lastSuccessAt !== null &&
      Date.now() - state.lastSuccessAt.getTime() < ttl;
    if (fresh) return;

    const fetchFrom = deep ? from : new Date(to.getTime() - DAILY_BACKFILL_DAYS * DAY_MS);
    const attempted = await this.backfillRange(indicator, range, fetchFrom, to);
    if (!attempted) return;

    const pointsAfter = await this.readPoints(indicator.id, from, to);
    if (pointsAfter.length > 0) {
      await repo.markSyncRun(job, "OK");
    } else {
      await repo.markSyncRun(job, "ERROR", "Sin datos del proveedor");
    }
  }

  private async backfillRange(
    indicator: PrismaIndicator,
    range: TimeRange,
    from: Date,
    to: Date,
  ): Promise<boolean> {
    if (indicator.source === "FMP_QUOTE") {
      if (!indicator.sourceSymbol) return false;
      if (!(await this.reserveQuota())) return false;
      try {
        const rows = await this.provider.fetchHistory(
          indicator.sourceSymbol,
          toDateKey(from),
          toDateKey(to),
        );
        this.resetRateLimit();
        await repo.upsertSnapshots(this.historyInputs(indicator.id, rows));
        indicatorsLog("info", "INDICATORS_HISTORY_BACKFILL", {
          code: indicator.code,
          range,
          rows: rows.length,
        });
      } catch (error) {
        this.logProviderError(`hist:${indicator.code}`, indicator.sourceSymbol, error);
      }
      return true;
    }

    if (indicator.source === "FMP_TREASURY" || indicator.code === "SPREAD_10Y2Y") {
      if (!(await this.reserveQuota())) return false;
      try {
        const rows = await this.provider.fetchTreasury(
          range === "5Y" ? RANGE_DAYS["5Y"] : DAILY_BACKFILL_DAYS,
        );
        await this.applyTreasuryRows(rows);
      } catch (error) {
        this.logProviderError(`hist:${indicator.code}`, "treasury", error);
      }
      return true;
    }

    if (indicator.source === "COMPUTED" && indicator.code === "DXY") {
      const byDate = new Map<string, Map<string, FmpHistoryRow>>();
      let attempted = false;
      for (const symbol of DXY_INPUT_SYMBOLS) {
        if (!(await this.reserveQuota())) break;
        attempted = true;
        try {
          const rows = await this.provider.fetchHistory(
            symbol,
            toDateKey(from),
            toDateKey(to),
          );
          for (const row of rows) {
            const day = byDate.get(toDateKey(row.date)) ?? new Map<string, FmpHistoryRow>();
            day.set(symbol, row);
            byDate.set(toDateKey(row.date), day);
          }
        } catch (error) {
          this.logProviderError(`hist:${indicator.code}`, symbol, error);
        }
      }
      if (!attempted) return false;

      const inputs: UpsertSnapshotInput[] = [];
      let prev: number | null = null;
      for (const day of [...byDate.keys()].sort()) {
        const dayRows = byDate.get(day)!;
        if (!DXY_INPUT_SYMBOLS.every((symbol) => dayRows.has(symbol))) continue;
        const value = roundTo(
          computeDxyProxy({
            eurusd: dayRows.get("EURUSD")!.price,
            usdjp: dayRows.get("USDJPY")!.price,
            gbpusd: dayRows.get("GBPUSD")!.price,
            usdcad: dayRows.get("USDCAD")!.price,
            usdchf: dayRows.get("USDCHF")!.price,
          }),
          2,
        );
        inputs.push({
          indicatorId: indicator.id,
          asOf: new Date(`${day}T00:00:00.000Z`),
          value,
          changePct: prev !== null ? pctChange(value, prev) : null,
        });
        prev = value;
      }
      if (inputs.length > 0) await repo.upsertSnapshots(inputs);
      return true;
    }

    return false;
  }

  private historyInputs(
    indicatorId: string,
    rows: FmpHistoryRow[],
  ): UpsertSnapshotInput[] {
    const inputs: UpsertSnapshotInput[] = [];
    let previous: number | null = null;
    for (const row of rows) {
      inputs.push({
        indicatorId,
        asOf: row.date,
        value: row.price,
        changePct: previous !== null ? pctChange(row.price, previous) : null,
      });
      previous = row.price;
    }
    return inputs;
  }

  /**
   * Job nocturno: refresca el historico reciente de los indicadores con
   * proveedor propio (quotes + DXY). No toca treasury, que tiene su cron.
   */
  async refreshRecentHistory(days = this.config.backfillDays): Promise<void> {
    if (!this.config.enabled || !this.isConfigured || !this.config.backfillEnabled) return;
    if (this.providerBlocked) return;

    const now = new Date();
    const from = new Date(now.getTime() - days * DAY_MS);
    const indicators = await repo.listActiveIndicators();
    let updated = 0;
    let failures = 0;
    let blocked = false;

    for (const indicator of indicators) {
      if (blocked) break;
      if (indicator.source !== "FMP_QUOTE" || !indicator.sourceSymbol) continue;
      if (!(await this.reserveQuota())) {
        blocked = true;
        break;
      }
      try {
        const rows = await this.provider.fetchHistory(
          indicator.sourceSymbol,
          toDateKey(from),
          toDateKey(now),
        );
        this.resetRateLimit();
        await repo.upsertSnapshots(this.historyInputs(indicator.id, rows));
        updated += rows.length;
      } catch (error) {
        failures += 1;
        this.logProviderError(`backfill:${indicator.code}`, indicator.sourceSymbol, error);
        if (error instanceof IndicatorsProviderError && error.kind === "RATE_LIMITED") {
          this.registerRateLimit();
          blocked = true;
        }
      }
    }

    const dxy = indicators.find((indicator) => indicator.code === "DXY");
    if (dxy && !blocked) {
      try {
        const attempted = await this.backfillRange(dxy, "1M", from, now);
        if (attempted) updated += 1;
      } catch (error) {
        failures += 1;
        this.logProviderError("backfill", "DXY", error);
      }
    }

    if (updated > 0) {
      await repo.markSyncRun(
        "backfill",
        failures > 0 || blocked ? "PARTIAL" : "OK",
        blocked ? "Cuota o rate limit del proveedor" : undefined,
      );
    } else {
      await repo.markSyncRun(
        "backfill",
        "ERROR",
        blocked ? "Cuota o rate limit del proveedor" : "Sin datos nuevos",
      );
    }
    indicatorsLog("info", "INDICATORS_HISTORY_BACKFILL", {
      days,
      updated,
      failures,
      blocked,
    });
  }

  private async readPoints(
    indicatorId: string,
    from: Date,
    to: Date,
  ): Promise<IndicatorPoint[]> {
    const rows = await repo.listSnapshots(indicatorId, from, to);
    return rows
      .map((row) => ({ t: row.asOf.toISOString().slice(0, 10), v: Number(row.value) }))
      .filter((point) => Number.isFinite(point.v));
  }

  async compare(codes: string[], range: TimeRange): Promise<CompareDto> {
    if (codes.length === 0) {
      throw new IndicatorsProviderError("Sin codigos para comparar", "BAD_REQUEST");
    }
    if (codes.length > COMPARISON_MAX_CODES) {
      throw new IndicatorsProviderError(
        `Maximo ${COMPARISON_MAX_CODES} indicadores por comparacion`,
        "BAD_REQUEST",
      );
    }
    const series: CompareSeriesDto[] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const code of codes) {
      if (seen.has(code)) continue;
      seen.add(code);
      try {
        const history = await this.history(code, range);
        if (history.points.length < 2) {
          missing.push(code);
          continue;
        }
        const normalized = computeBase100(history.points);
        series.push({
          code: history.code,
          name: history.name,
          decimals: history.decimals,
          unit: history.unit,
          base100: normalized.series,
          changePeriodPct: normalized.changePeriodPct,
        });
      } catch {
        missing.push(code);
      }
    }
    if (series.length === 0) {
      throw new IndicatorsProviderError("Ningun codigo valido", "BAD_REQUEST");
    }
    return { range, series, missing };
  }

  async syncStatus(): Promise<SyncStatusDto> {
    const jobNames = [
      "group:indices",
      "group:forex",
      "group:crypto",
      "group:commodities",
      "treasury",
      "backfill",
    ];
    const rows = await repo.listSyncStates(jobNames);
    const jobs: SyncJobState[] = jobNames.map((job) => {
      const row = rows.find((entry) => entry.job === job);
      return {
        job,
        lastRunAt: row?.lastRunAt?.toISOString() ?? null,
        lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
        lastStatus: row?.lastStatus ?? "NEVER",
        lastError: row?.lastError ?? null,
      };
    });
    return {
      config: {
        enabled: this.config.enabled,
        providerConfigured: this.isConfigured,
        budget: this.config.dailyBudget,
      },
      quota: await this.quota.usage(),
      jobs,
    };
  }

  async budgetExhausted(): Promise<boolean> {
    return this.quota.exhausted();
  }

  /** Diagnostico manual: con cooldown y sin solaparse con otra corrida. */
  claimManualSync(): ManualSyncResult {
    if (this.runAllBusy) return "BUSY";
    if (Date.now() - this.lastManualSyncAt < MANUAL_SYNC_COOLDOWN_MS) {
      return "THROTTLED";
    }
    this.runAllBusy = true;
    this.lastManualSyncAt = Date.now();
    void this.runAllInternal()
      .catch((error) => this.logProviderError("sync", "manual", error))
      .finally(() => {
        this.runAllBusy = false;
      });
    return "STARTED";
  }

  private async runAllInternal(): Promise<void> {
    for (const group of GROUP_ORDER) {
      await this.syncGroup(group);
    }
    await this.recomputeDxy();
    await this.refreshTreasury();
  }

  async runAll(): Promise<void> {
    await this.runAllInternal();
  }
}

function dedupePoints(points: IndicatorPoint[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.t === point.t) {
      out[out.length - 1] = point;
    } else {
      out.push(point);
    }
  }
  return out;
}
