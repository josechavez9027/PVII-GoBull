import { prisma } from "../../services/prisma.service";
import type { IndicatorCategory } from "./indicators.types";

export interface SnapshotRow {
  asOf: Date;
  value: number;
  changePct: number | null;
}

export interface UpsertSnapshotInput extends SnapshotRow {
  indicatorId: string;
}

export interface IndicatorSnapshotRow {
  indicatorId: string;
  asOf: Date;
  value: number;
  changePct: number | null;
}

const UPSERT_CHUNK_SIZE = 100;

function toRow(row: { asOf: Date; value: unknown; changePct: number | null }): SnapshotRow | null {
  const value = Number(row.value);
  if (!Number.isFinite(value)) return null;
  return { asOf: row.asOf, value, changePct: row.changePct };
}

export function listActiveIndicators() {
  return prisma.indicator.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export function getIndicatorByCode(code: string) {
  return prisma.indicator.findUnique({ where: { code } });
}

export async function upsertSnapshot(input: UpsertSnapshotInput): Promise<void> {
  await prisma.indicatorSnapshot.upsert({
    where: {
      indicatorId_asOf: { indicatorId: input.indicatorId, asOf: input.asOf },
    },
    create: {
      indicatorId: input.indicatorId,
      asOf: input.asOf,
      value: input.value,
      changePct: input.changePct,
    },
    update: { value: input.value, changePct: input.changePct },
  });
}

export async function upsertSnapshots(inputs: UpsertSnapshotInput[]): Promise<number> {
  let written = 0;
  for (let index = 0; index < inputs.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = inputs.slice(index, index + UPSERT_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((input) =>
        prisma.indicatorSnapshot.upsert({
          where: {
            indicatorId_asOf: { indicatorId: input.indicatorId, asOf: input.asOf },
          },
          create: {
            indicatorId: input.indicatorId,
            asOf: input.asOf,
            value: input.value,
            changePct: input.changePct,
          },
          update: { value: input.value, changePct: input.changePct },
        }),
      ),
    );
    written += chunk.length;
  }
  return written;
}

export async function findLatestSnapshot(indicatorId: string): Promise<SnapshotRow | null> {
  const row = await prisma.indicatorSnapshot.findFirst({
    where: { indicatorId },
    orderBy: { asOf: "desc" },
  });
  return row ? toRow(row) : null;
}

export async function findPreviousSnapshot(
  indicatorId: string,
  asOf: Date,
): Promise<SnapshotRow | null> {
  const row = await prisma.indicatorSnapshot.findFirst({
    where: { indicatorId, asOf: { lt: asOf } },
    orderBy: { asOf: "desc" },
  });
  return row ? toRow(row) : null;
}

/** Ultimo snapshot de cada indicador en tres consultas fijas (evita N+1). */
export async function latestSnapshotsFor(
  indicatorIds: string[],
): Promise<Map<string, SnapshotRow>> {
  const result = new Map<string, SnapshotRow>();
  if (indicatorIds.length === 0) return result;

  const maxima = await prisma.indicatorSnapshot.groupBy({
    by: ["indicatorId"],
    where: { indicatorId: { in: indicatorIds } },
    _max: { asOf: true },
  });
  const pairs = maxima
    .filter((row) => row._max.asOf !== null)
    .map((row) => ({ indicatorId: row.indicatorId, asOf: row._max.asOf as Date }));
  if (pairs.length === 0) return result;

  const rows = await prisma.indicatorSnapshot.findMany({ where: { OR: pairs } });
  for (const row of rows) {
    const mapped = toRow(row);
    if (mapped) result.set(row.indicatorId, mapped);
  }
  return result;
}

/** Snapshots de varios indicadores dentro de una ventana temporal. */
export function snapshotsInWindowFor(
  indicatorIds: string[],
  from: Date,
  to: Date,
): Promise<IndicatorSnapshotRow[]> {
  if (indicatorIds.length === 0) return Promise.resolve([]);
  return prisma.indicatorSnapshot
    .findMany({
      where: { indicatorId: { in: indicatorIds }, asOf: { gte: from, lte: to } },
      orderBy: { asOf: "asc" },
    })
    .then((rows) =>
      rows.map((row) => ({
        indicatorId: row.indicatorId,
        asOf: row.asOf,
        value: Number(row.value),
        changePct: row.changePct,
      })),
    );
}

/**
 * Devuelve los snapshots de la ventana ordenados de forma ascendente.
 * Cuando se limita, conserva los mas recientes (no los mas antiguos).
 */
export async function listSnapshots(
  indicatorId: string,
  from: Date,
  to: Date,
  limit?: number,
) {
  if (!limit) {
    return prisma.indicatorSnapshot.findMany({
      where: { indicatorId, asOf: { gte: from, lte: to } },
      orderBy: { asOf: "asc" },
    });
  }
  const rows = await prisma.indicatorSnapshot.findMany({
    where: { indicatorId, asOf: { gte: from, lte: to } },
    orderBy: { asOf: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export function groupByCategory<T extends { category: IndicatorCategory }>(
  rows: T[],
): { category: IndicatorCategory; items: T[] }[] {
  const map = new Map<IndicatorCategory, T[]>();
  for (const row of rows) {
    const list = map.get(row.category) ?? [];
    list.push(row);
    map.set(row.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

export function getSyncState(job: string) {
  return prisma.indicatorSyncState.findUnique({ where: { job } });
}

export function listSyncStates(jobs: string[]) {
  return prisma.indicatorSyncState.findMany({ where: { job: { in: jobs } } });
}

export async function markSyncRun(
  job: string,
  status: "OK" | "PARTIAL" | "ERROR",
  error?: string,
): Promise<void> {
  const now = new Date();
  try {
    await prisma.indicatorSyncState.upsert({
      where: { job },
      create: {
        job,
        lastRunAt: now,
        lastSuccessAt: status === "ERROR" ? null : now,
        lastStatus: status,
        lastError: error ?? null,
      },
      update: {
        lastRunAt: now,
        ...(status === "ERROR" ? {} : { lastSuccessAt: now }),
        lastStatus: status,
        lastError: error ?? null,
      },
    });
  } catch {
    // El estado de sincronizacion no debe romper la peticion.
  }
}
