import type { NewsCategory } from '@prisma/client';

export type { NewsCategory };

export const NEWS_CATEGORIES = [
  'MERCADOS',
  'EMPRESAS',
  'ECONOMIA',
  'CRIPTO',
  'DIVISAS',
  'ENERGIA',
  'TECNOLOGIA',
  'SALUD',
  'OTROS',
] as const satisfies readonly NewsCategory[];

// ── Proveedor (Marketaux) ──────────────────────────────────────

export interface MarketauxEntity {
  symbol?: string | null | undefined;
  name?: string | null | undefined;
  type?: string | null | undefined;
  industry?: string | null | undefined;
  match_score?: number | null | undefined;
  sentiment_score?: number | null | undefined;
}

export interface MarketauxArticle {
  uuid: string;
  title: string;
  description?: string | null | undefined;
  snippet?: string | null | undefined;
  url: string;
  image_url?: string | null | undefined;
  language?: string | null | undefined;
  published_at: string;
  source?: string | null | undefined;
  entities?: MarketauxEntity[] | null | undefined;
}

export interface MarketauxPage {
  found: number;
  returned: number;
  limit: number;
  page: number;
  articles: MarketauxArticle[];
}

export interface FetchNewsParams {
  page?: number;
  publishedAfter?: Date;
  symbols?: string[];
  mustHaveEntities?: boolean;
}

/** Tipo de peticion para el presupuesto diario (las dirigidas tienen sub-cupo). */
export type BudgetScope = 'general' | 'symbols';

// ── Modelo normalizado ─────────────────────────────────────────

export interface NormalizedSymbol {
  symbol: string;
  matchScore: number | null;
  sentiment: number | null;
}

export interface NormalizedArticle {
  providerId: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  language: string;
  publishedAt: Date;
  category: NewsCategory;
  sentiment: number | null;
  symbols: NormalizedSymbol[];
}

// ── Sincronizacion ─────────────────────────────────────────────

export type NewsSyncJob = 'freshness' | 'depth' | 'symbols';

export type NewsSyncStatus =
  | 'NEVER'
  | 'OK'
  | 'SKIPPED_BUDGET'
  | 'SKIPPED_LOCKED'
  | 'SKIPPED_NO_API_KEY'
  | 'PARTIAL'
  | 'FAILED';

export interface UpsertOutcome {
  created: boolean;
  /** `true` si era nuevo o si cambio algun campo/simbolo; `false` si ya estaba igual. */
  changed: boolean;
}

export interface NewsSyncResult {
  job: NewsSyncJob;
  status: NewsSyncStatus;
  requests: number;
  fetched: number;
  created: number;
  updated: number;
  purged?: number;
  error?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface NewsSyncStateRecord {
  job: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string;
  lastError: string | null;
  lastFetched: number;
  lastCreated: number;
  lastUpdated: number;
}

export interface NewsUsageRecord {
  requests: number;
  symbolRequests: number;
}

/**
 * Persistencia que necesita la sincronizacion. La implementacion real usa Prisma
 * (`news.repository.ts`); los tests usan una version en memoria.
 */
export interface NewsStore {
  upsertArticle(article: NormalizedArticle): Promise<UpsertOutcome>;
  latestPublishedAt(): Promise<Date | null>;
  purgeExpired(cutoff: Date): Promise<number>;
  getUsage(day: Date): Promise<NewsUsageRecord>;
  /** Reserva atomicamente una peticion si queda cupo. Devuelve `false` si se agoto. */
  tryConsumeRequest(day: Date, scope: BudgetScope, limits: NewsBudgetLimits): Promise<boolean>;
  purgeUsageBefore(day: Date): Promise<void>;
  getSyncState(job: NewsSyncJob): Promise<NewsSyncStateRecord | null>;
  listSyncStates(): Promise<NewsSyncStateRecord[]>;
  saveSyncResult(result: NewsSyncResult): Promise<void>;
}

export interface NewsBudgetLimits {
  /** Tope diario de peticiones (todas). */
  daily: number;
  /** Sub-tope diario de consultas dirigidas por simbolo. */
  symbols: number;
}

export interface NewsConfig {
  apiKey: string;
  baseUrl: string;
  languages: string[];
  freshnessCron: string;
  depthCron: string;
  retentionDays: number;
  pageLimit: number;
  depthPages: number;
  overlapMinutes: number;
  budget: NewsBudgetLimits;
  /** Esperas entre reintentos ante 429/5xx (ms). */
  backoffMs: number[];
  schedulerEnabled: boolean;
}

/** Ganchos para fases posteriores (score/notificaciones y agregados 7d). */
export type NewsSyncHook = (result: NewsSyncResult) => void | Promise<void>;

// ── DTOs y Filtros de consumo (Sprint 4) ───────────────────────

export interface NewsArticleDto {
  id: string;
  providerId: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  language: string;
  publishedAt: Date;
  category: NewsCategory;
  sentiment: number | null;
  viewCount: number;
  favoriteCount: number;
  isFavorite: boolean;
  inPortfolio: boolean;
  score?: number;
  symbols: NormalizedSymbol[];
}

export interface ListNewsFilters {
  category?: NewsCategory | undefined;
  q?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  symbol?: string | undefined;
  sort?: 'recent' | 'relevance' | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface ListFavoritesFilters {
  category?: NewsCategory | undefined;
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface NewsCategoryCount {
  category: NewsCategory;
  count: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedNewsResponse {
  news: NewsArticleDto[];
  pagination: PaginationMeta;
}

export interface FavoriteToggleResponse {
  isFavorite: boolean;
  favoriteCount: number;
}

export interface ViewRecordResponse {
  viewed: boolean;
  viewCount: number;
}

