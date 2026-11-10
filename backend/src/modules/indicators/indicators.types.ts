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

export type AnalysisBias = "alcista" | "neutral" | "bajista";

export type AnalysisRiskLevel = "bajo" | "moderado" | "alto" | "extremo";

export type AnalysisSeverity = "info" | "alerta" | "critica";

export type AnalysisStance = "positivo" | "neutral" | "negativo";

export type AnalysisNewsLabel = "positivo" | "neutral" | "negativo";

export interface AnalysisSignalDto {
  code: string;
  indicator: string;
  severity: AnalysisSeverity;
  title: string;
  message: string;
}

export interface IndicatorInterpretationDto {
  code: string;
  name: string;
  stance: AnalysisStance;
  text: string;
}

export interface AnalysisNewsItemDto {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: number | null;
}

export interface AnalysisNewsDto {
  count: number;
  label: AnalysisNewsLabel;
  averageSentiment: number | null;
  items: AnalysisNewsItemDto[];
}

export interface AnalysisDto {
  asOf: string;
  bias: AnalysisBias;
  riskLevel: AnalysisRiskLevel;
  summary: string;
  signals: AnalysisSignalDto[];
  interpretations: IndicatorInterpretationDto[];
  news: AnalysisNewsDto;
  disclaimer: string;
}
