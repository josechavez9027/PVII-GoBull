import { prisma } from "../../services/prisma.service";

function utcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Persistencia minima usada por el guard de cuota. Se inyecta para poder
 * probar el guard sin base de datos.
 */
export interface QuotaStore {
  ensureDay(day: Date): Promise<void>;
  /** Incrementa solo si el total tras el incremento no supera el presupuesto. */
  incrementIfAtMost(day: Date, maxUsedBefore: number, count: number): Promise<number>;
  read(day: Date): Promise<number | null>;
}

const prismaQuotaStore: QuotaStore = {
  async ensureDay(day) {
    await prisma.indicatorProviderUsage.upsert({
      where: { day },
      create: { day, requests: 0 },
      update: {},
    });
  },
  async incrementIfAtMost(day, maxUsedBefore, count) {
    const updated = await prisma.indicatorProviderUsage.updateMany({
      where: { day, requests: { lte: Math.max(0, maxUsedBefore) } },
      data: { requests: { increment: count } },
    });
    return updated.count;
  },
  async read(day) {
    const row = await prisma.indicatorProviderUsage.findUnique({ where: { day } });
    return row?.requests ?? null;
  },
};

export class IndicatorQuotaService {
  constructor(
    private dailyBudget: number,
    private store: QuotaStore = prismaQuotaStore,
  ) {}

  /**
   * Reserva `count` peticiones contra el presupuesto diario persistido.
   * Devuelve false cuando la reserva excederia el presupuesto.
   */
  async reserve(count = 1): Promise<boolean> {
    if (this.dailyBudget <= 0) return true;
    const day = utcDay();
    await this.store.ensureDay(day);
    const updated = await this.store.incrementIfAtMost(day, this.dailyBudget - count, count);
    return updated > 0;
  }

  async usage(): Promise<{ used: number; budget: number }> {
    const used = await this.store.read(utcDay());
    return { used: used ?? 0, budget: this.dailyBudget };
  }

  async exhausted(): Promise<boolean> {
    const { used, budget } = await this.usage();
    return budget > 0 && used >= budget;
  }
}

export { utcDay };
