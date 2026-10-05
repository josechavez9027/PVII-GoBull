import { loadNewsConfig, newsLog } from './news.config';
import { MarketauxProvider, NewsProviderError, normalizeArticle } from './news.provider';
import { PrismaNewsStore } from './news.repository';
import type {
  BudgetScope,
  FetchNewsParams,
  MarketauxArticle,
  NewsConfig,
  NewsStore,
  NewsSyncHook,
  NewsSyncJob,
  NewsSyncResult,
  NewsSyncStateRecord,
} from './news.types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const USAGE_HISTORY_DAYS = 30;
const MAX_TARGETED_SYMBOLS = 20;

/** Dia UTC (00:00) usado como clave del presupuesto diario. */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface NewsSyncStatusDto {
  configured: boolean;
  running: NewsSyncJob | null;
  lastUpdatedAt: Date | null;
  latestPublishedAt: Date | null;
  budget: {
    day: string;
    used: number;
    limit: number;
    remaining: number;
    symbolUsed: number;
    symbolLimit: number;
  };
  jobs: NewsSyncStateRecord[];
}

interface RunContext {
  day: Date;
  scope: BudgetScope;
  requests: number;
  fetched: number;
  created: number;
  updated: number;
  pages: number;
  purged?: number;
}

export interface NewsSyncServiceDeps {
  store: NewsStore;
  /** `null` cuando no hay `MARKETAUX_API_KEY`: no se llama al proveedor. */
  provider: MarketauxProvider | null;
  config: NewsConfig;
  now?: () => Date;
}

/**
 * Orquesta la ingesta programada: presupuesto diario, lock unico, upsert
 * idempotente, retencion y ganchos para las fases de feed y notificaciones.
 * Nunca lanza: cualquier fallo queda en el resultado y en el log estructurado.
 */
export class NewsSyncService {
  private running: NewsSyncJob | null = null;
  private readonly hooks: Record<'freshness' | 'depth', NewsSyncHook[]> = {
    freshness: [],
    depth: [],
  };
  private readonly store: NewsStore;
  private readonly provider: MarketauxProvider | null;
  private readonly config: NewsConfig;
  private readonly now: () => Date;

  constructor(deps: NewsSyncServiceDeps) {
    this.store = deps.store;
    this.provider = deps.provider;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
  }

  /** Tras cada corrida de frescura (score < 72 h y notificaciones, fase de notificaciones). */
  onFreshnessComplete(hook: NewsSyncHook): void {
    this.hooks.freshness.push(hook);
  }

  /** Tras cada corrida de profundidad (agregados de 7 dias, fase de feed y favoritos). */
  onDepthComplete(hook: NewsSyncHook): void {
    this.hooks.depth.push(hook);
  }

  get isConfigured(): boolean {
    return this.provider !== null;
  }

  get runningJob(): NewsSyncJob | null {
    return this.running;
  }

  // ── Corridas ─────────────────────────────────────────────────

  /** Frescura: 1 pagina desde la ultima ingesta con 60 min de solapamiento. */
  async runFreshness(): Promise<NewsSyncResult> {
    const result = await this.execute('freshness', 'general', async (ctx) => {
      const state = await this.store.getSyncState('freshness');
      const anchor =
        state?.lastSuccessAt ??
        (await this.store.latestPublishedAt()) ??
        new Date(this.now().getTime() - DAY_MS);
      const publishedAfter = new Date(anchor.getTime() - this.config.overlapMinutes * 60_000);
      await this.ingestPage(ctx, { page: 1, publishedAfter });
    });
    await this.runHooks('freshness', result);
    return result;
  }

  /** Profundidad: hasta 4 paginas adicionales y, siempre, la purga de retencion. */
  async runDepth(): Promise<NewsSyncResult> {
    const result = await this.execute(
      'depth',
      'general',
      async (ctx) => {
        const state = await this.store.getSyncState('depth');
        const anchor = state?.lastSuccessAt ?? new Date(this.now().getTime() - DAY_MS);
        const publishedAfter = new Date(anchor.getTime() - this.config.overlapMinutes * 60_000);

        for (let i = 0; i < this.config.depthPages; i++) {
          // La pagina 1 la cubre la corrida de frescura.
          const returned = await this.ingestPage(ctx, { page: i + 2, publishedAfter });
          if (returned < this.config.pageLimit) break; // fin del resultado
        }
      },
      // La retencion es local: se aplica aunque el proveedor falle o no haya cupo.
      async (ctx) => {
        ctx.purged = await this.purgeRetention();
      },
    );
    await this.runHooks('depth', result);
    return result;
  }

  /** Consulta dirigida (bajo demanda) a simbolos con posicion abierta. Sub-cupo diario. */
  async runSymbols(symbols: string[]): Promise<NewsSyncResult> {
    const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_TARGETED_SYMBOLS,
    );
    if (!unique.length) {
      const now = this.now();
      return this.emptyResult('symbols', 'OK', now);
    }
    return this.execute('symbols', 'symbols', async (ctx) => {
      await this.ingestPage(ctx, {
        page: 1,
        symbols: unique,
        mustHaveEntities: true,
        publishedAfter: new Date(this.now().getTime() - 7 * DAY_MS),
      });
    });
  }

  /** Purga articulos > N dias sin favoritos ni vistas (los favoritos no caducan). */
  async purgeRetention(): Promise<number> {
    const now = this.now();
    const cutoff = new Date(now.getTime() - this.config.retentionDays * DAY_MS);
    const purged = await this.store.purgeExpired(cutoff);
    await this.store.purgeUsageBefore(new Date(utcDay(now).getTime() - USAGE_HISTORY_DAYS * DAY_MS));
    newsLog('info', 'NEWS_RETENTION_PURGE', { cutoff: cutoff.toISOString(), purged });
    return purged;
  }

  async getStatus(): Promise<NewsSyncStatusDto> {
    const day = utcDay(this.now());
    const [usage, jobs, latestPublishedAt] = await Promise.all([
      this.store.getUsage(day),
      this.store.listSyncStates(),
      this.store.latestPublishedAt(),
    ]);
    const lastUpdatedAt = jobs.reduce<Date | null>(
      (acc, j) => (j.lastSuccessAt && (!acc || j.lastSuccessAt > acc) ? j.lastSuccessAt : acc),
      null,
    );
    return {
      configured: this.isConfigured,
      running: this.running,
      lastUpdatedAt,
      latestPublishedAt,
      budget: {
        day: day.toISOString().slice(0, 10),
        used: usage.requests,
        limit: this.config.budget.daily,
        remaining: Math.max(0, this.config.budget.daily - usage.requests),
        symbolUsed: usage.symbolRequests,
        symbolLimit: this.config.budget.symbols,
      },
      jobs,
    };
  }

  // ── Infraestructura comun ────────────────────────────────────

  private async execute(
    job: NewsSyncJob,
    scope: BudgetScope,
    fetchStep: (ctx: RunContext) => Promise<void>,
    localStep?: (ctx: RunContext) => Promise<void>,
  ): Promise<NewsSyncResult> {
    const startedAt = this.now();

    if (this.running) {
      newsLog('warn', 'NEWS_SYNC_LOCKED', { job, runningJob: this.running });
      return this.emptyResult(job, 'SKIPPED_LOCKED', startedAt);
    }
    this.running = job;

    const ctx: RunContext = {
      day: utcDay(startedAt),
      scope,
      requests: 0,
      fetched: 0,
      created: 0,
      updated: 0,
      pages: 0,
    };
    let status: NewsSyncResult['status'] = 'OK';
    let error: string | undefined;

    try {
      if (!this.provider) {
        status = 'SKIPPED_NO_API_KEY';
      } else if (await this.budgetExhausted(ctx.day, scope)) {
        status = 'SKIPPED_BUDGET';
        newsLog('warn', 'NEWS_BUDGET_EXHAUSTED', { job, day: ctx.day.toISOString().slice(0, 10) });
      } else {
        try {
          await fetchStep(ctx);
        } catch (err) {
          error = (err as Error)?.message ?? String(err);
          const budget = err instanceof NewsProviderError && err.kind === 'BUDGET_EXHAUSTED';
          if (budget) {
            newsLog('warn', 'NEWS_BUDGET_EXHAUSTED', { job, pagesDone: ctx.pages, detail: error });
            status = ctx.pages > 0 ? 'PARTIAL' : 'SKIPPED_BUDGET';
          } else {
            newsLog('error', 'NEWS_SYNC_FAILED', {
              job,
              kind: err instanceof NewsProviderError ? err.kind : 'UNEXPECTED',
              detail: error,
            });
            status = ctx.pages > 0 ? 'PARTIAL' : 'FAILED';
          }
        }
      }

      if (localStep) {
        try {
          await localStep(ctx);
        } catch (err) {
          const detail = (err as Error)?.message ?? String(err);
          newsLog('error', 'NEWS_LOCAL_STEP_FAILED', { job, detail });
          error = error ? `${error}; ${detail}` : detail;
          if (status === 'OK') status = 'PARTIAL';
        }
      }
    } finally {
      this.running = null;
    }

    const result: NewsSyncResult = {
      job,
      status,
      requests: ctx.requests,
      fetched: ctx.fetched,
      created: ctx.created,
      updated: ctx.updated,
      ...(ctx.purged !== undefined ? { purged: ctx.purged } : {}),
      ...(error !== undefined ? { error } : {}),
      startedAt,
      finishedAt: this.now(),
    };

    try {
      await this.store.saveSyncResult(result);
    } catch (err) {
      newsLog('error', 'NEWS_SYNC_STATE_SAVE_FAILED', { job, detail: (err as Error)?.message });
    }

    newsLog(status === 'FAILED' ? 'error' : 'info', 'NEWS_SYNC_DONE', {
      ...result,
      startedAt: result.startedAt.toISOString(),
      finishedAt: result.finishedAt.toISOString(),
      durationMs: result.finishedAt.getTime() - result.startedAt.getTime(),
    });
    return result;
  }

  private async budgetExhausted(day: Date, scope: BudgetScope): Promise<boolean> {
    const usage = await this.store.getUsage(day);
    if (usage.requests >= this.config.budget.daily) return true;
    return scope === 'symbols' && usage.symbolRequests >= this.config.budget.symbols;
  }

  /** Trae una pagina, la normaliza y la persiste. Devuelve los articulos devueltos. */
  private async ingestPage(ctx: RunContext, params: FetchNewsParams): Promise<number> {
    const provider = this.provider as MarketauxProvider;
    const page = await provider.fetchNews(params, {
      beforeRequest: async () => {
        const ok = await this.store.tryConsumeRequest(ctx.day, ctx.scope, this.config.budget);
        if (ok) ctx.requests++;
        return ok;
      },
    });
    ctx.pages++;
    ctx.fetched += page.articles.length;
    await this.persist(ctx, page.articles);
    return page.returned;
  }

  private async persist(ctx: RunContext, articles: MarketauxArticle[]): Promise<void> {
    for (const raw of articles) {
      const article = normalizeArticle(raw);
      if (!article) {
        newsLog('warn', 'NEWS_ARTICLE_SKIPPED', { providerId: raw.uuid, reason: 'invalid' });
        continue;
      }
      const outcome = await this.store.upsertArticle(article);
      if (outcome.created) ctx.created++;
      else if (outcome.changed) ctx.updated++;
    }
  }

  private async runHooks(kind: 'freshness' | 'depth', result: NewsSyncResult): Promise<void> {
    if (result.status === 'SKIPPED_LOCKED') return;
    for (const hook of this.hooks[kind]) {
      try {
        await hook(result);
      } catch (err) {
        newsLog('error', 'NEWS_HOOK_FAILED', { kind, detail: (err as Error)?.message });
      }
    }
  }

  private emptyResult(
    job: NewsSyncJob,
    status: NewsSyncResult['status'],
    at: Date,
  ): NewsSyncResult {
    return { job, status, requests: 0, fetched: 0, created: 0, updated: 0, startedAt: at, finishedAt: at };
  }
}

// ── Instancia del proceso ──────────────────────────────────────

let instance: NewsSyncService | null = null;

export function createNewsSyncService(config: NewsConfig = loadNewsConfig()): NewsSyncService {
  const provider = config.apiKey
    ? new MarketauxProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        languages: config.languages,
        pageLimit: config.pageLimit,
        backoffMs: config.backoffMs,
      })
    : null;
  return new NewsSyncService({ store: new PrismaNewsStore(), provider, config });
}

/** Servicio unico del proceso: el lock en memoria solo protege si es compartido. */
export function getNewsSyncService(): NewsSyncService {
  instance ??= createNewsSyncService();
  return instance;
}
