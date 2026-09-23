import type { InstrumentKind } from '@prisma/client';

export type { InstrumentKind };

export interface InstrumentDto {
  symbol: string;
  name: string;
  market: string;
  kind: InstrumentKind;
}

export interface SuggestInstrumentsFilters {
  q: string;
  limit: number;
}
