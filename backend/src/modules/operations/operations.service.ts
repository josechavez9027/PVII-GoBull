import { Operation, Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma.service';
import {
  CapitalSummary,
  CreateOperationInput,
  ListOperationsFilters,
  OperationDto,
  OperationType as OpType,
  Position,
} from './operations.types';

const TRADE_TYPES: OpType[] = ['BUY', 'SELL'];

const DEFAULT_NAMES: Record<Exclude<OpType, 'BUY' | 'SELL'>, string> = {
  DIV: 'Dividendo',
  DEP: 'Deposito',
  RET: 'Retiro',
  TAX: 'Impuesto',
};

const EPSILON = 1e-6;

function toDto(op: Operation): OperationDto {
  return {
    id: op.id,
    type: op.type as OpType,
    name: op.name,
    symbol: op.symbol,
    date: op.date.toISOString(),
    qty: op.qty,
    totalPrice: Number(op.totalPrice),
    createdAt: op.createdAt.toISOString(),
  };
}

interface RunningPosition {
  symbol: string;
  qty: number;
  cost: number;
  name: string;
}

export class OperationsService {
  async list(userId: string, filters: ListOperationsFilters = {}): Promise<OperationDto[]> {
    const where: Prisma.OperationWhereInput = { userId };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) {
        const fromStr = filters.from.includes('T') ? filters.from : `${filters.from}T00:00:00`;
        (where.date as Prisma.DateTimeFilter).gte = new Date(fromStr);
      }
      if (filters.to) {
        const toStr = filters.to.includes('T') ? filters.to : `${filters.to}T23:59:59.999`;
        (where.date as Prisma.DateTimeFilter).lte = new Date(toStr);
      }
    }

    if (filters.q) {
      where.OR = [
        { symbol: { contains: filters.q } },
        { name: { contains: filters.q } },
      ];
    }

    const operations = await prisma.operation.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return operations.map(toDto);
  }

  async create(userId: string, input: CreateOperationInput): Promise<OperationDto> {
    const type: OpType = input.type;
    const isTrade = TRADE_TYPES.includes(type);

    const symbol = (isTrade || type === 'DIV') && input.symbol ? input.symbol : null;
    const qty = isTrade ? (input.qty ?? 1) : 1;
    const name =
      input.name.trim() ||
      (symbol ?? DEFAULT_NAMES[type as Exclude<OpType, 'BUY' | 'SELL'>]);
    const date = input.date ? new Date(input.date) : new Date();

    if (isTrade && (!symbol || qty <= 0)) {
      const error = new Error(
        'Las operaciones de compra y venta requieren simbolo y cantidad mayor a 0'
      ) as Error & { code?: string; status?: number };
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }

    if (type === 'SELL') {
      await this.assertSellAllowed(userId, symbol as string, qty);
    }

    if (['BUY', 'RET', 'TAX'].includes(type)) {
      await this.assertCashAvailable(userId, input.totalPrice);
    }

    if (symbol) {
      await this.assertSymbolInCatalog(symbol);
    }

    const operation = await prisma.operation.create({
      data: {
        userId,
        type,
        name,
        symbol,
        date,
        qty,
        totalPrice: new Prisma.Decimal(input.totalPrice.toFixed(2)),
      },
    });

    return toDto(operation);
  }

  async remove(userId: string, id: string): Promise<void> {
    const operation = await prisma.operation.findFirst({ where: { id, userId } });

    if (!operation) {
      const error = new Error('Operacion no encontrada') as Error & { code?: string; status?: number };
      error.code = 'NOT_FOUND';
      error.status = 404;
      throw error;
    }

    await prisma.operation.delete({ where: { id } });
  }

  async positions(userId: string): Promise<Position[]> {
    const operations = await prisma.operation.findMany({
      where: {
        userId,
        type: { in: ['BUY', 'SELL'] },
        symbol: { not: null },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    return this.runningPositions(operations)
      .filter((p) => p.qty > EPSILON)
      .map((p) => ({
        symbol: p.symbol as string,
        name: p.name,
        qty: this.round(p.qty),
        avgCost: p.qty > 0 ? this.round2(p.cost / p.qty) : 0,
        totalCost: this.round2(p.cost),
      }));
  }

  async summary(userId: string): Promise<CapitalSummary> {
    const operations = await prisma.operation.findMany({
      where: { userId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const positions = this.runningPositions(operations);
    let caja = 0;
    let neutral = 0;

    for (const op of operations) {
      const value = Number(op.totalPrice);
      switch (op.type) {
        case 'DEP':
          caja += value;
          neutral += value;
          break;
        case 'DIV':
          caja += value;
          break;
        case 'SELL':
          caja += value;
          break;
        case 'RET':
          caja -= value;
          neutral -= value;
          break;
        case 'BUY':
          caja -= value;
          break;
        case 'TAX':
          caja -= value;
          break;
      }
    }

    const patrimonioPorPosiciones = positions.reduce((acc, p) => acc + p.cost, 0);

    return {
      caja: this.round2(caja),
      patrimonio: this.round2(caja + patrimonioPorPosiciones),
      neutral: this.round2(neutral),
    };
  }

  private runningPositions(operations: Operation[]): RunningPosition[] {
    const map = new Map<string, RunningPosition>();

    for (const op of operations) {
      if (op.type === 'BUY') {
        const current = map.get(op.symbol as string) ?? { symbol: op.symbol as string, qty: 0, cost: 0, name: op.name };
        current.qty += op.qty;
        current.cost += Number(op.totalPrice);
        current.name = op.name;
        map.set(op.symbol as string, current);
      } else if (op.type === 'SELL') {
        const current = map.get(op.symbol as string);
        if (current && current.qty > 0) {
          const avgCost = current.qty > 0 ? current.cost / current.qty : 0;
          current.cost -= avgCost * op.qty;
          current.qty -= op.qty;
          if (current.qty <= EPSILON) {
            current.qty = 0;
            current.cost = 0;
          }
        }
      }
    }

    return Array.from(map.values());
  }

  private async assertSellAllowed(userId: string, symbol: string, qty: number) {
    const operations = await prisma.operation.findMany({
      where: {
        userId,
        type: { in: ['BUY', 'SELL'] },
        symbol,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const position = this.runningPositions(operations).find((p) => p.symbol === symbol);

    if (!position || position.qty + EPSILON < qty) {
      const error = new Error(
        `No se puede vender: la posicion abierta de ${symbol} es de ${
          position ? this.round(position.qty) : 0
        } acciones`
      ) as Error & { code?: string; status?: number };
      error.code = 'POSITION_EXCEEDED';
      error.status = 400;
      throw error;
    }
  }

  private async assertCashAvailable(userId: string, totalPrice: number): Promise<void> {
    const { caja } = await this.summary(userId);
    if (totalPrice > caja + EPSILON) {
      const formattedPrice = totalPrice.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedCaja = caja.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const error = new Error(
        `No se puede registrar la operación: el monto ($${formattedPrice} MXN) supera la caja disponible ($${formattedCaja} MXN)`
      ) as Error & { code?: string; status?: number };
      error.code = 'INSUFFICIENT_FUNDS';
      error.status = 400;
      throw error;
    }
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private async assertSymbolInCatalog(symbol: string): Promise<void> {
    const normalized = symbol.trim().toUpperCase();
    const instrument = await prisma.instrument.findUnique({ where: { symbol: normalized } });
    if (!instrument || !instrument.isActive) {
      const error = new Error(
        `El símbolo ${normalized} no está en el catálogo de instrumentos`
      ) as Error & { code?: string; status?: number };
      error.code = 'SYMBOL_NOT_FOUND';
      error.status = 400;
      throw error;
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}