import type { IndicatorCategory, QuoteGroup } from "./indicators.types";

export interface IndicatorsConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  dailyBudget: number;
  tickCron: string;
  marketStartUtc: string;
  marketEndUtc: string;
  intervals: Record<QuoteGroup, number>;
  offHoursIntervalMinutes: number;
  treasuryCron: string;
  backfillEnabled: boolean;
  backfillCron: string;
  backfillDays: number;
  freshnessMargin: number;
}

function strEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function loadIndicatorsConfig(): IndicatorsConfig {
  return {
    apiKey: (process.env.FMP_API_KEY ?? "").trim(),
    baseUrl: strEnv("FMP_BASE_URL", "https://financialmodelingprep.com/stable"),
    enabled: process.env.INDICATORS_ENABLED !== "false",
    dailyBudget: intEnv("INDICATORS_DAILY_BUDGET", 220),
    tickCron: strEnv("INDICATORS_QUOTE_TICK_CRON", "*/10 * * * *"),
    marketStartUtc: strEnv("INDICATORS_MARKET_START_UTC", "13:30"),
    marketEndUtc: strEnv("INDICATORS_MARKET_END_UTC", "20:00"),
    intervals: {
      indices: intEnv("INDICATORS_INTERVAL_INDICES", 30),
      forex: intEnv("INDICATORS_INTERVAL_FOREX", 60),
      crypto: intEnv("INDICATORS_INTERVAL_CRYPTO", 60),
      commodities: intEnv("INDICATORS_INTERVAL_COMMODITIES", 60),
    },
    offHoursIntervalMinutes: intEnv("INDICATORS_OFFHOURS_INTERVAL", 120),
    treasuryCron: strEnv("INDICATORS_TREASURY_CRON", "0 22 * * *"),
    backfillEnabled: process.env.INDICATORS_BACKFILL_ENABLED !== "false",
    backfillCron: strEnv("INDICATORS_BACKFILL_CRON", "30 2 * * *"),
    backfillDays: intEnv("INDICATORS_BACKFILL_DAYS", 7),
    freshnessMargin: intEnv("INDICATORS_FRESHNESS_MARGIN", 2),
  };
}

type LogLevel = "info" | "warn" | "error";

export function indicatorsLog(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module: "indicators",
    event,
    ...data,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function isMarketOpen(now: Date, startUtc: string, endUtc: string): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= parseHhMm(startUtc) && minutes < parseHhMm(endUtc);
}

function parseHhMm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const CATEGORY_ORDER: IndicatorCategory[] = [
  "VOLATILITY",
  "DOLLAR",
  "RATES",
  "EQUITY",
  "COMMODITY",
  "CRYPTO",
  "FOREX",
  "MACRO",
];
