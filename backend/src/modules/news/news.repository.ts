import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../services/prisma.service';
import type {
  BudgetScope,
  NewsBudgetLimits,
  NewsStore,
  NewsSyncJob,
  NewsSyncResult,
  NewsSyncStateRecord,
  NewsUsageRecord,
  NormalizedArticle,
  NormalizedSymbol,
  UpsertOutcome,
} from './news.types';

/** Campos que la sincronizacion puede actualizar en un articulo existente. */
export interface StoredArticleSnapshot {
  title: string;
  description: string | null;
  snippet: string | null;
  imageUrl: string | null;
  source: string;
  language: string;
  publishedAt: Date;
  category: NormalizedArticle['category'];
  sentiment: number | null;
  symbols: NormalizedSymbol[];
}

function symbolKey(symbols: NormalizedSymbol[]): string {
  return symbols
    .map((s) => `${s.symbol}|${s.matchScore ?? ''}|${s.sentiment ?? ''}`)
    .sort()
    .join(';');
}

/** `true` si el articulo entrante difiere de lo almacenado (contadores excluidos). */
export function articleDiffers(stored: StoredArticleSnapshot, incoming: NormalizedArticle): boolean {
  return (
    stored.title !== incoming.title ||
    stored.description !== incoming.description ||
    stored.snippet !== incoming.snippet ||
    stored.imageUrl !== incoming.imageUrl ||
    stored.source !== incoming.source ||
    stored.language !== incoming.language ||
    stored.publishedAt.getTime() !== incoming.publishedAt.getTime() ||
    stored.category !== incoming.category ||
    stored.sentiment !== incoming.sentiment ||
    symbolKey(stored.symbols) !== symbolKey(incoming.symbols)
  );
}

/** Campos escribibles del articulo. Nunca incluye `viewCount` ni `favoriteCount`. */
function mutableFields(article: NormalizedArticle) {
  return {
    title: article.title,
    description: article.description,
    snippet: article.snippet,
    imageUrl: article.imageUrl,
    source: article.source,
    language: article.language,
    publishedAt: article.publishedAt,
    category: article.category,
    sentiment: article.sentiment,
  };
}

export class PrismaNewsStore implements NewsStore {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async upsertArticle(article: NormalizedArticle): Promise<UpsertOutcome> {
    return this.db.$transaction(async (tx) => {
      const select = {
        id: true,
        title: true,
        description: true,
        snippet: true,
        imageUrl: true,
        source: true,
        language: true,
        publishedAt: true,
        category: true,
        sentiment: true,
        symbols: { select: { symbol: true, matchScore: true, sentiment: true } },
      } as const;

      // Idempotencia por providerId; la url (tambien unica) cubre reediciones del proveedor.
      const existing =
        (await tx.newsArticle.findUnique({ where: { providerId: article.providerId }, select })) ??
        (await tx.newsArticle.findUnique({ where: { url: article.url }, select }));

      if (!existing) {
        await tx.newsArticle.create({
          data: {
            providerId: article.providerId,
            url: article.url,
            ...mutableFields(article),
            symbols: { create: article.symbols },
          },
        });
        return { created: true, changed: true };
      }

      if (!articleDiffers(existing, article)) return { created: false, changed: false };

      await tx.newsArticle.update({ where: { id: existing.id }, data: mutableFields(article) });
      // Reconstruccion completa de las menciones.
      await tx.newsArticleSymbol.deleteMany({ where: { articleId: existing.id } });
      if (article.symbols.length) {
        await tx.newsArticleSymbol.createMany({
          data: article.symbols.map((s) => ({ ...s, articleId: existing.id })),
        });
      }
      return { created: false, changed: true };
    });
  }

  async latestPublishedAt(): Promise<Date | null> {
    const result = await this.db.newsArticle.aggregate({ _max: { publishedAt: true } });
    return result._max.publishedAt;
  }

  async purgeExpired(cutoff: Date): Promise<number> {
    // Los favoritos nunca caducan por antiguedad.
    const result = await this.db.newsArticle.deleteMany({
      where: { publishedAt: { lt: cutoff }, favoriteCount: 0, viewCount: 0 },
    });
    return result.count;
  }

  async getUsage(day: Date): Promise<NewsUsageRecord> {
    const row = await this.db.newsProviderUsage.findUnique({ where: { day } });
    return { requests: row?.requests ?? 0, symbolRequests: row?.symbolRequests ?? 0 };
  }

  async tryConsumeRequest(day: Date, scope: BudgetScope, limits: NewsBudgetLimits): Promise<boolean> {
    await this.db.newsProviderUsage.upsert({ where: { day }, create: { day }, update: {} });
    // UPDATE condicional: atomico a nivel de fila, sin carreras entre corridas.
    const result = await this.db.newsProviderUsage.updateMany({
      where: {
        day,
        requests: { lt: limits.daily },
        ...(scope === 'symbols' ? { symbolRequests: { lt: limits.symbols } } : {}),
      },
      data: {
        requests: { increment: 1 },
        ...(scope === 'symbols' ? { symbolRequests: { increment: 1 } } : {}),
      },
    });
    return result.count === 1;
  }

  async purgeUsageBefore(day: Date): Promise<void> {
    await this.db.newsProviderUsage.deleteMany({ where: { day: { lt: day } } });
  }

  async getSyncState(job: NewsSyncJob): Promise<NewsSyncStateRecord | null> {
    return this.db.newsSyncState.findUnique({ where: { job } });
  }

  async listSyncStates(): Promise<NewsSyncStateRecord[]> {
    return this.db.newsSyncState.findMany({ orderBy: { job: 'asc' } });
  }

  async saveSyncResult(result: NewsSyncResult): Promise<void> {
    const ok = result.status === 'OK';
    const data = {
      lastRunAt: result.startedAt,
      lastStatus: result.status,
      lastError: result.error ?? null,
      lastFetched: result.fetched,
      lastCreated: result.created,
      lastUpdated: result.updated,
      ...(ok ? { lastSuccessAt: result.startedAt } : {}),
    };
    await this.db.newsSyncState.upsert({
      where: { job: result.job },
      create: { job: result.job, ...data },
      update: data,
    });
  }
}
