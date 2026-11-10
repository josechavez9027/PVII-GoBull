import { prisma } from "../../services/prisma.service";
import type { FuturesSnapshotRow } from "./futures.types";

const UPSERT_CHUNK_SIZE = 100;

export interface FutureSnapshotInput {
  code: string;
  asOf: Date;
  close: number;
}

export async function upsertFuturesSnapshots(inputs: FutureSnapshotInput[]): Promise<number> {
  let written = 0;
  for (let index = 0; index < inputs.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = inputs.slice(index, index + UPSERT_CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((input) =>
        prisma.futureSnapshot.upsert({
          where: { code_asOf: { code: input.code, asOf: input.asOf } },
          create: { code: input.code, asOf: input.asOf, close: input.close },
          update: { close: input.close },
        }),
      ),
    );
    written += chunk.length;
  }
  return written;
}

/** Ultimo cierre de cada codigo en dos consultas fijas. */
export async function latestFutureSnapshots(
  codes: string[],
): Promise<Map<string, FuturesSnapshotRow>> {
  const result = new Map<string, FuturesSnapshotRow>();
  if (codes.length === 0) return result;

  const maxima = await prisma.futureSnapshot.groupBy({
    by: ["code"],
    where: { code: { in: codes } },
    _max: { asOf: true },
  });
  const pairs = maxima
    .filter((row) => row._max.asOf !== null)
    .map((row) => ({ code: row.code, asOf: row._max.asOf as Date }));
  if (pairs.length === 0) return result;

  const rows = await prisma.futureSnapshot.findMany({ where: { OR: pairs } });
  for (const row of rows) {
    result.set(row.code, {
      code: row.code,
      asOf: row.asOf,
      close: Number(row.close),
    });
  }
  return result;
}

/** Cierre mas reciente en o antes de `target` (base del periodo). */
export async function referenceSnapshot(
  code: string,
  target: Date,
): Promise<FuturesSnapshotRow | null> {
  const row = await prisma.futureSnapshot.findFirst({
    where: { code, asOf: { lte: target } },
    orderBy: { asOf: "desc" },
  });
  if (!row) return null;
  return { code: row.code, asOf: row.asOf, close: Number(row.close) };
}

/** Cierre inmediatamente anterior a `asOf` (para el cambio diario). */
export async function previousSnapshot(
  code: string,
  asOf: Date,
): Promise<FuturesSnapshotRow | null> {
  const row = await prisma.futureSnapshot.findFirst({
    where: { code, asOf: { lt: asOf } },
    orderBy: { asOf: "desc" },
  });
  if (!row) return null;
  return { code: row.code, asOf: row.asOf, close: Number(row.close) };
}

export async function countFutureSnapshots(code: string): Promise<number> {
  return prisma.futureSnapshot.count({ where: { code } });
}
