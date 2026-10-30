export type QuoteGroup = "indices" | "forex" | "crypto" | "commodities";

export type IndicatorCategory =
  | "VOLATILITY"
  | "DOLLAR"
  | "RATES"
  | "EQUITY"
  | "COMMODITY"
  | "CRYPTO"
  | "FOREX"
  | "MACRO";

export type IndicatorSource = "FMP_QUOTE" | "FMP_TREASURY" | "FMP_ECON" | "COMPUTED";

export type TreasuryField = "year2" | "year10" | "year30";

export interface TreasuryFieldValues {
  year2: number | null;
  year10: number | null;
  year30: number | null;
}

export interface IndicatorDefinition {
  code: string;
  name: string;
  category: IndicatorCategory;
  unit: "index" | "pct" | "usd" | "fx" | "ratio";
  decimals: number;
  source: IndicatorSource;
  sourceSymbol?: string;
  quoteGroup?: QuoteGroup;
  treasuryField?: TreasuryField;
  freeTier: boolean;
  sortOrder: number;
}

export interface IndicatorPoint {
  t: string;
  v: number;
}

export type IndicatorStatus = "fresh" | "stale" | "unavailable";

export interface IndicatorItemDto {
  code: string;
  name: string;
  category: IndicatorCategory;
  unit: string;
  decimals: number;
  value: number | null;
  changePct: number | null;
  asOf: string | null;
  status: IndicatorStatus;
  sparkline: IndicatorPoint[];
  /** true si el indicador acumula snapshots intradia propios (quotes y DXY). */
  intraday: boolean;
}

export interface IndicatorsPanelDto {
  generatedAt: string;
  stale: boolean;
  configured: boolean;
  quota: { used: number; budget: number };
  groups: { category: IndicatorCategory; items: IndicatorItemDto[] }[];
}

export interface HistoryDto {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  range: string;
  granularity: "intraday" | "daily";
  bucketMinutes: number | null;
  points: IndicatorPoint[];
}

export interface CompareSeriesDto {
  code: string;
  name: string;
  decimals: number;
  unit: string;
  base100: IndicatorPoint[];
  changePeriodPct: number | null;
}

export interface CompareDto {
  range: string;
  series: CompareSeriesDto[];
  missing: string[];
}

export interface SyncJobState {
  job: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string;
  lastError: string | null;
}

export interface SyncStatusDto {
  config: { enabled: boolean; providerConfigured: boolean; budget: number };
  quota: { used: number; budget: number };
  jobs: SyncJobState[];
}
