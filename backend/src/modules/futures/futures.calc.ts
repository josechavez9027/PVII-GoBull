import type { FuturesPeriod } from "./futures.types";

export const FUTURES_PERIODS: FuturesPeriod[] = ["1D", "1M", "3M", "YTD"];

export interface ClosePoint {
  date: Date;
  close: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function futuresPctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Fecha de referencia para un periodo movil. `YTD` usa el ultimo dia del ano
 * anterior (31 de diciembre), el resto resta dias naturales desde la ultima
 * observacion disponible.
 */
export function periodReferenceDate(period: Exclude<FuturesPeriod, "1D">, lastDate: Date): Date {
  if (period === "YTD") {
    return new Date(Date.UTC(lastDate.getUTCFullYear() - 1, 11, 31));
  }
  const days = period === "1M" ? 30 : 91;
  return new Date(lastDate.getTime() - days * DAY_MS);
}

/**
 * Rendimiento porcentual del periodo a partir de cierres diarios ascendentes.
 * Usa la ultima observacion <= fecha de referencia (el cierre previo al inicio
 * del periodo); devuelve null si no hay base suficiente.
 */
export function periodChange(rows: ClosePoint[], period: FuturesPeriod): number | null {
  const points = rows.filter((row) => Number.isFinite(row.close));
  if (points.length < 2) return null;

  const last = points[points.length - 1]!;
  if (period === "1D") {
    const previous = points[points.length - 2]!;
    return futuresPctChange(last.close, previous.close);
  }

  const target = periodReferenceDate(period, last.date);
  let base: ClosePoint | null = null;
  for (const point of points) {
    if (point.date.getTime() <= target.getTime()) {
      base = point;
    } else {
      break;
    }
  }
  if (!base || base.date.getTime() === last.date.getTime()) return null;
  return futuresPctChange(last.close, base.close);
}

/** Ordena por rendimiento descendente; los activos sin dato van al final. */
export function sortByChangeDesc<T extends { changePct: number | null; name: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.changePct === null && b.changePct === null) return a.name.localeCompare(b.name);
    if (a.changePct === null) return 1;
    if (b.changePct === null) return -1;
    return b.changePct - a.changePct;
  });
}
