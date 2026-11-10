export type FuturesPeriod = "1D" | "1M" | "3M" | "YTD";

export type FuturesCategory =
  | "RATES"
  | "CURRENCIES"
  | "METALS"
  | "SOFTS"
  | "ENERGY"
  | "INDICES"
  | "GRAINS";

export type FuturesChanges = Record<FuturesPeriod, number | null>;

export interface FuturesDefinition {
  code: string;
  name: string;
  category: FuturesCategory;
  yahooSymbol: string;
  unit: string;
  decimals: number;
  sortOrder: number;
}

export interface FuturesItemDto {
  code: string;
  name: string;
  category: FuturesCategory;
  yahooSymbol: string;
  unit: string;
  decimals: number;
  price: number | null;
  changes: FuturesChanges;
  asOf: string | null;
  available: boolean;
}

export interface FuturesPanelDto {
  generatedAt: string;
  stale: boolean;
  items: FuturesItemDto[];
  disclaimer: string;
}

export interface FuturesSnapshotRow {
  code: string;
  asOf: Date;
  close: number;
}
