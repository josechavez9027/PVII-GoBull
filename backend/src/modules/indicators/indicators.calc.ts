import type { IndicatorPoint, IndicatorStatus } from "./indicators.types";

export type IntradayRange = "5MIN" | "1HR";
export type DailyRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y";
export type TimeRange = IntradayRange | DailyRange;

export const DAILY_RANGES: DailyRange[] = ["1W", "1M", "3M", "6M", "1Y", "2Y", "5Y"];
export const INTRADAY_RANGES: IntradayRange[] = ["5MIN", "1HR"];

export const RANGE_DAYS: Record<TimeRange, number> = {
  "5MIN": 1,
  "1HR": 5,
  "1W": 7,
  "1M": 31,
  "3M": 92,
  "6M": 183,
  "1Y": 366,
  "2Y": 731,
  "5Y": 1827,
};

/** Ancho de cada vela/punto de las series intradia. */
export const INTRADAY_BUCKET_MS: Record<IntradayRange, number> = {
  "5MIN": 5 * 60 * 1000,
  "1HR": 60 * 60 * 1000,
};

/** Dias de historico diario que se piden al proveedor en cada backfill. */
export const DAILY_BACKFILL_DAYS = 731;
export const DAILY_COVERAGE_TTL_MS = 6 * 60 * 60 * 1000;

export const RANGE_TTL_MS: Record<TimeRange, number> = {
  "5MIN": 0,
  "1HR": 0,
  "1W": DAILY_COVERAGE_TTL_MS,
  "1M": DAILY_COVERAGE_TTL_MS,
  "3M": DAILY_COVERAGE_TTL_MS,
  "6M": DAILY_COVERAGE_TTL_MS,
  "1Y": DAILY_COVERAGE_TTL_MS,
  "2Y": DAILY_COVERAGE_TTL_MS,
  "5Y": 7 * 24 * 60 * 60 * 1000,
};

export function isIntradayRange(range: TimeRange): range is IntradayRange {
  return range === "5MIN" || range === "1HR";
}

/**
 * Agrupa snapshots ascendentes en cubetas de `bucketMs` conservando el
 * ultimo valor de cada cubeta. `t` es el inicio de la cubeta en ISO.
 */
export function bucketSnapshots(
  rows: { asOf: Date; value: number }[],
  bucketMs: number,
): IndicatorPoint[] {
  const buckets = new Map<number, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const key = Math.floor(row.asOf.getTime() / bucketMs) * bucketMs;
    buckets.set(key, row.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, v]) => ({ t: new Date(key).toISOString(), v }));
}

const DXY_CONSTANT = 50.14348112;

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function computeDxyProxy(input: {
  eurusd: number;
  usdjp: number;
  gbpusd: number;
  usdcad: number;
  usdchf: number;
}): number {
  // Parte de la formula ICE del Dollar Index (50.14348112 x EUR^-0.576 x JPY^0.136
  // x GBP^-0.119 x CAD^0.091 x SEK^0.048 x CHF^0.048). El par USDSEK no esta en el
  // plan gratuito, asi que los exponentes restantes se renormalizan a suma 1.
  return (
    DXY_CONSTANT *
    Math.pow(input.eurusd, -0.5938) *
    Math.pow(input.usdjp, 0.1402) *
    Math.pow(input.gbpusd, -0.1227) *
    Math.pow(input.usdcad, 0.0938) *
    Math.pow(input.usdchf, 0.0495)
  );
}

export function computeSpreadTenYearTwoYear(y10: number, y2: number): number {
  return y10 - y2;
}

export function computeBase100(
  points: IndicatorPoint[],
): { series: IndicatorPoint[]; changePeriodPct: number | null } {
  const first = points[0];
  if (!first || points.length < 2 || first.v <= 0) {
    return { series: points.map((p) => ({ t: p.t, v: 100 })), changePeriodPct: null };
  }
  const base = first.v;
  const series = points.map((p) => ({ t: p.t, v: (p.v / base) * 100 }));
  const last = points[points.length - 1]!;
  return { series, changePeriodPct: pctChange(last.v, base) };
}

export function rangeStart(now: Date, range: TimeRange): Date {
  return new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function freshOrStale(
  asOf: Date,
  intervalMinutes: number,
  margin: number,
  now = new Date(),
): IndicatorStatus {
  if (intervalMinutes === 0) return "stale";
  const ageMs = now.getTime() - asOf.getTime();
  return ageMs <= intervalMinutes * margin * 60 * 1000 ? "fresh" : "stale";
}

/**
 * Convierte filas ascendentes en puntos de sparkline, conservando los
 * `maxPoints` mas recientes.
 */
export function sparklineFrom(
  rows: { asOf: Date; value: number }[],
  maxPoints = 24,
): IndicatorPoint[] {
  const points = rows.map((row) => ({
    t: row.asOf.toISOString(),
    v: row.value,
  }));
  if (points.length <= maxPoints) return points;
  return points.slice(points.length - maxPoints);
}
