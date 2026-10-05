import { categorizeArticle } from './news.categorize';
import { newsLog } from './news.config';
import { marketauxArticleSchema, marketauxErrorSchema, marketauxResponseSchema } from './news.schemas';
import type {
  FetchNewsParams,
  MarketauxArticle,
  MarketauxPage,
  NormalizedArticle,
  NormalizedSymbol,
} from './news.types';

export type NewsProviderErrorKind =
  | 'BUDGET_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'BAD_REQUEST'
  | 'INVALID_RESPONSE';

export class NewsProviderError extends Error {
  constructor(
    message: string,
    readonly kind: NewsProviderErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NewsProviderError';
  }

  /** Errores transitorios que justifican backoff y reintento. */
  get retryable(): boolean {
    return (
      this.kind === 'RATE_LIMITED' || this.kind === 'SERVER_ERROR' || this.kind === 'NETWORK_ERROR'
    );
  }
}

export interface MarketauxProviderOptions {
  apiKey: string;
  baseUrl: string;
  languages: string[];
  pageLimit: number;
  /** Espera antes de cada reintento ante 429/5xx (1, 5 y 15 min por defecto). */
  backoffMs: number[];
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchNewsOptions {
  /**
   * Se invoca antes de CADA peticion HTTP (incluidos reintentos) para reservar
   * presupuesto. Si devuelve `false`, la corrida se corta sin llamar al proveedor.
   */
  beforeRequest?: () => Promise<boolean>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Formato aceptado por Marketaux: `Y-m-d\TH:i:s` (UTC). */
export function formatProviderDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/** Cliente de `GET /v1/news/all`. Solo se usa desde el backend. */
export class MarketauxProvider {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: MarketauxProviderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  buildUrl(params: FetchNewsParams = {}): URL {
    const url = new URL('/v1/news/all', this.options.baseUrl);
    const q = url.searchParams;
    q.set('api_token', this.options.apiKey);
    if (this.options.languages.length) q.set('language', this.options.languages.join(','));
    // Sin `sort`: el orden por defecto de Marketaux ya es `published_at` descendente.
    q.set('limit', String(this.options.pageLimit));
    q.set('page', String(params.page ?? 1));
    q.set('group_similar', 'true');
    if (params.publishedAfter) q.set('published_after', formatProviderDate(params.publishedAfter));
    if (params.mustHaveEntities) q.set('must_have_entities', 'true');
    if (params.symbols?.length) q.set('symbols', params.symbols.join(','));
    return url;
  }

  async fetchNews(params: FetchNewsParams = {}, opts: FetchNewsOptions = {}): Promise<MarketauxPage> {
    const delays = this.options.backoffMs;

    for (let attempt = 0; ; attempt++) {
      if (opts.beforeRequest && !(await opts.beforeRequest())) {
        throw new NewsProviderError('Presupuesto diario de peticiones agotado', 'BUDGET_EXHAUSTED');
      }

      try {
        return await this.request(params);
      } catch (error) {
        const providerError =
          error instanceof NewsProviderError
            ? error
            : new NewsProviderError(
                `Fallo de red al consultar Marketaux: ${(error as Error)?.message ?? error}`,
                'NETWORK_ERROR',
              );

        const delay = delays[attempt];
        if (!providerError.retryable || delay === undefined) throw providerError;

        newsLog('warn', 'NEWS_PROVIDER_RETRY', {
          kind: providerError.kind,
          status: providerError.status,
          attempt: attempt + 1,
          waitMs: delay,
        });
        await this.sleep(delay);
      }
    }
  }

  private async request(params: FetchNewsParams): Promise<MarketauxPage> {
    const response = await this.fetchFn(this.buildUrl(params), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) throw this.toError(response.status, body);

    const parsed = marketauxResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new NewsProviderError('Respuesta de Marketaux con formato inesperado', 'INVALID_RESPONSE');
    }

    const articles: MarketauxArticle[] = [];
    for (const item of parsed.data.data) {
      const article = marketauxArticleSchema.safeParse(item);
      if (article.success) articles.push(article.data);
    }

    const meta = parsed.data.meta;
    return {
      found: meta?.found ?? articles.length,
      returned: meta?.returned ?? parsed.data.data.length,
      limit: meta?.limit ?? this.options.pageLimit,
      page: meta?.page ?? params.page ?? 1,
      articles,
    };
  }

  private toError(status: number, body: unknown): NewsProviderError {
    const parsed = marketauxErrorSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error.code : undefined;
    const detail = parsed.success ? parsed.data.error.message : undefined;
    const message = `Marketaux respondio ${status}${code ? ` (${code})` : ''}${detail ? `: ${detail}` : ''}`;

    if (status === 402) return new NewsProviderError(message, 'BUDGET_EXHAUSTED', status);
    if (status === 429) return new NewsProviderError(message, 'RATE_LIMITED', status);
    if (status >= 500) return new NewsProviderError(message, 'SERVER_ERROR', status);
    if (status === 401 || status === 403) return new NewsProviderError(message, 'AUTH_ERROR', status);
    return new NewsProviderError(message, 'BAD_REQUEST', status);
  }
}

// ── Normalizacion al modelo local ──────────────────────────────

const MAX_TITLE = 512;
const MAX_URL = 768;
const MAX_PROVIDER_ID = 64;
const MAX_SOURCE = 191;
const MAX_SYMBOL = 32;

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Simbolos en mayusculas, sin duplicados (se conserva la mencion mas fuerte). */
export function extractSymbols(article: MarketauxArticle): NormalizedSymbol[] {
  const bySymbol = new Map<string, NormalizedSymbol>();
  for (const entity of article.entities ?? []) {
    const symbol = entity.symbol?.trim().toUpperCase();
    if (!symbol || symbol.length > MAX_SYMBOL) continue;
    const candidate: NormalizedSymbol = {
      symbol,
      matchScore: finiteOrNull(entity.match_score),
      sentiment: finiteOrNull(entity.sentiment_score),
    };
    const current = bySymbol.get(symbol);
    if (!current || (candidate.matchScore ?? -Infinity) > (current.matchScore ?? -Infinity)) {
      bySymbol.set(symbol, candidate);
    }
  }
  return [...bySymbol.values()];
}

/** Promedio del sentimiento de las entidades, acotado a [-1, 1]. */
export function averageSentiment(article: MarketauxArticle): number | null {
  const scores = (article.entities ?? [])
    .map((e) => finiteOrNull(e.sentiment_score))
    .filter((s): s is number => s !== null);
  if (!scores.length) return null;
  const avg = scores.reduce((acc, s) => acc + s, 0) / scores.length;
  return Math.max(-1, Math.min(1, Math.round(avg * 10_000) / 10_000));
}

/**
 * Convierte un articulo de Marketaux al modelo local. Devuelve `null` si no se
 * puede almacenar (sin url valida, fecha invalida o identificadores fuera de rango).
 */
export function normalizeArticle(article: MarketauxArticle): NormalizedArticle | null {
  const providerId = article.uuid.trim();
  const url = article.url.trim();
  const title = article.title.trim();
  const publishedAt = new Date(article.published_at);

  if (!providerId || providerId.length > MAX_PROVIDER_ID) return null;
  if (!/^https?:\/\//i.test(url) || url.length > MAX_URL) return null;
  if (!title || Number.isNaN(publishedAt.getTime())) return null;

  const source = (cleanText(article.source) ?? hostnameOf(url) ?? 'desconocido').slice(0, MAX_SOURCE);
  const language = (cleanText(article.language) ?? 'en').toLowerCase().slice(0, 8);

  return {
    providerId,
    title: title.slice(0, MAX_TITLE),
    description: cleanText(article.description),
    snippet: cleanText(article.snippet),
    url,
    imageUrl: cleanText(article.image_url),
    source,
    language,
    publishedAt,
    category: categorizeArticle({
      title,
      description: article.description,
      entities: article.entities,
    }),
    sentiment: averageSentiment(article),
    symbols: extractSymbols(article),
  };
}
