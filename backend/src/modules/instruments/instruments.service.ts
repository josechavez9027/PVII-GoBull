import { prisma } from '../../services/prisma.service';
import { InstrumentDto, SuggestInstrumentsFilters } from './instruments.types';

function toDto(row: {
  symbol: string;
  name: string;
  market: string;
  kind: InstrumentDto['kind'];
}): InstrumentDto {
  return { symbol: row.symbol, name: row.name, market: row.market, kind: row.kind };
}

export class InstrumentsService {
  async suggest(filters: SuggestInstrumentsFilters): Promise<InstrumentDto[]> {
    const q = filters.q.trim().toUpperCase();
    const limit = filters.limit || 8;

    const candidates = await prisma.instrument.findMany({
      where: {
        isActive: true,
        OR: [{ symbol: { startsWith: q } }, { name: { contains: filters.q.trim() } }],
      },
      orderBy: [{ symbol: 'asc' }],
      take: limit * 4,
      select: { symbol: true, name: true, market: true, kind: true },
    });

    // Prefijo de simbolo primero, luego contiene en simbolo, luego nombre.
    const rank = (symbol: string): number => {
      if (symbol.startsWith(q)) return 0;
      if (symbol.includes(q)) return 1;
      return 2;
    };

    return candidates
      .sort((a, b) => rank(a.symbol) - rank(b.symbol) || (a.symbol < b.symbol ? -1 : 1))
      .slice(0, limit)
      .map(toDto);
  }
}
