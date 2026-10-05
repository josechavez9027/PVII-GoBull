import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../services/prisma.service';
import { OperationsService } from '../operations/operations.service';
import { NEWS_CATEGORIES } from './news.types';
import type {
  ListFavoritesFilters,
  ListNewsFilters,
  NewsArticleDto,
  NewsCategory,
  NewsCategoryCount,
  PaginatedNewsResponse,
} from './news.types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class NewsFeedService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly operationsService = new OperationsService(),
  ) {}

  /**
   * Calcula engagement según la regla 4.1:
   * engagement = min(1, (vistas_7d + 2 * favoritos_7d) / 50)
   */
  async calculateEngagement7d(articleId: string, since = new Date(Date.now() - SEVEN_DAYS_MS)): Promise<number> {
    const [views, favorites] = await Promise.all([
      this.db.newsView.count({
        where: { articleId, viewedAt: { gte: since } },
      }),
      this.db.favoriteNews.count({
        where: { articleId, createdAt: { gte: since } },
      }),
    ]);

    const raw = (views + 2 * favorites) / 50;
    return Math.min(1, Math.round(raw * 10_000) / 10_000);
  }

  /**
   * Calcula el score de relevancia (0 a 100) combinando:
   * score = 45 * cartera + 30 * engagement + 15 * recencia + 10 * afinidad
   */
  calculateScore(
    article: {
      category: NewsCategory;
      publishedAt: Date;
      symbols: { symbol: string }[];
    },
    userPortfolioSymbols: Set<string>,
    userCategoryAffinity: Map<NewsCategory, number>,
    engagement: number,
  ): number {
    // 1. Cartera (45 pts): mención de símbolo con posición abierta
    const hasPortfolioSymbol = article.symbols.some((s) => userPortfolioSymbols.has(s.symbol.toUpperCase()));
    const cartera = hasPortfolioSymbol ? 1 : 0;

    // 2. Engagement (30 pts)
    const engagementScore = 30 * engagement;

    // 3. Recencia (15 pts): ventana de 72 horas
    const hoursSince = Math.max(0, (Date.now() - article.publishedAt.getTime()) / (1000 * 3600));
    const recencia = hoursSince < 72 ? 15 * (1 - hoursSince / 72) : 0;

    // 4. Afinidad (10 pts): basado en historial de lecturas y favoritos
    const afinidad = 10 * (userCategoryAffinity.get(article.category) ?? 0);

    const total = 45 * cartera + engagementScore + recencia + afinidad;
    return Math.max(0, Math.min(100, Math.round(total)));
  }

  /**
   * Obtiene la afinidad por categoría del usuario en los últimos 30 días [0, 1].
   */
  async getUserCategoryAffinity(userId: string): Promise<Map<NewsCategory, number>> {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const [views, favorites] = await Promise.all([
      this.db.newsView.findMany({
        where: { userId, viewedAt: { gte: since } },
        select: { article: { select: { category: true } } },
      }),
      this.db.favoriteNews.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { article: { select: { category: true } } },
      }),
    ]);

    const counts = new Map<NewsCategory, number>();
    let totalInteractions = 0;

    for (const v of views) {
      const cat = v.article.category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
      totalInteractions++;
    }
    for (const f of favorites) {
      const cat = f.article.category;
      counts.set(cat, (counts.get(cat) ?? 0) + 2); // Favorito pesa el doble
      totalInteractions += 2;
    }

    const affinity = new Map<NewsCategory, number>();
    if (totalInteractions === 0) return affinity;

    for (const [cat, count] of counts.entries()) {
      affinity.set(cat, count / totalInteractions);
    }
    return affinity;
  }

  /**
   * Obtiene los símbolos en los que el usuario tiene posición abierta.
   */
  async getUserPortfolioSymbols(userId: string): Promise<Set<string>> {
    try {
      const positions = await this.operationsService.positions(userId);
      return new Set(positions.filter((p) => p.qty > 0).map((p) => p.symbol.trim().toUpperCase()));
    } catch {
      return new Set();
    }
  }

  /**
   * Listado paginado de noticias con filtros y metadatos de usuario (isFavorite, inPortfolio).
   */
  async listNews(userId: string, filters: ListNewsFilters = {}): Promise<PaginatedNewsResponse> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 12));
    const skip = (page - 1) * limit;

    const userPortfolioSymbols = await this.getUserPortfolioSymbols(userId);

    const where: any = {};

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.q?.trim()) {
      const query = filters.q.trim();
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
        { snippet: { contains: query } },
      ];
    }

    if (filters.from) {
      where.publishedAt = { ...(where.publishedAt ?? {}), gte: new Date(filters.from) };
    }

    if (filters.to) {
      where.publishedAt = { ...(where.publishedAt ?? {}), lte: new Date(filters.to) };
    }

    if (filters.symbol?.trim()) {
      const sym = filters.symbol.trim().toUpperCase();
      where.symbols = { some: { symbol: sym } };
    }

    if (filters.sort === 'relevance') {
      return this.listRelevantNews(userId, { ...filters, page, limit });
    }

    const [total, rows] = await Promise.all([
      this.db.newsArticle.count({ where }),
      this.db.newsArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          symbols: { select: { symbol: true, matchScore: true, sentiment: true } },
          favorites: { where: { userId }, select: { userId: true } },
        },
      }),
    ]);

    const news: NewsArticleDto[] = rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      title: r.title,
      description: r.description,
      snippet: r.snippet,
      url: r.url,
      imageUrl: r.imageUrl,
      source: r.source,
      language: r.language,
      publishedAt: r.publishedAt,
      category: r.category,
      sentiment: r.sentiment,
      viewCount: r.viewCount,
      favoriteCount: r.favoriteCount,
      isFavorite: r.favorites.length > 0,
      inPortfolio: r.symbols.some((s) => userPortfolioSymbols.has(s.symbol.toUpperCase())),
      symbols: r.symbols,
    }));

    return {
      news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Feed personalizado "Para ti" ordenado por score de relevancia.
   */
  async listRelevantNews(userId: string, filters: ListNewsFilters = {}): Promise<PaginatedNewsResponse> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 12));

    const [userPortfolioSymbols, userCategoryAffinity] = await Promise.all([
      this.getUserPortfolioSymbols(userId),
      this.getUserCategoryAffinity(userId),
    ]);

    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.q?.trim()) {
      const query = filters.q.trim();
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
        { snippet: { contains: query } },
      ];
    }
    if (filters.from) {
      where.publishedAt = { ...(where.publishedAt ?? {}), gte: new Date(filters.from) };
    }
    if (filters.to) {
      where.publishedAt = { ...(where.publishedAt ?? {}), lte: new Date(filters.to) };
    }
    if (filters.symbol?.trim()) {
      const sym = filters.symbol.trim().toUpperCase();
      where.symbols = { some: { symbol: sym } };
    }

    // Traemos candidatos para calcular score y ordenar
    const candidates = await this.db.newsArticle.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }],
      take: 200,
      include: {
        symbols: { select: { symbol: true, matchScore: true, sentiment: true } },
        favorites: { where: { userId }, select: { userId: true } },
      },
    });

    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

    // Calculamos score para cada candidato
    const scoredPromises = candidates.map(async (article) => {
      const engagement = await this.calculateEngagement7d(article.id, sevenDaysAgo);
      const score = this.calculateScore(article, userPortfolioSymbols, userCategoryAffinity, engagement);

      const dto: NewsArticleDto = {
        id: article.id,
        providerId: article.providerId,
        title: article.title,
        description: article.description,
        snippet: article.snippet,
        url: article.url,
        imageUrl: article.imageUrl,
        source: article.source,
        language: article.language,
        publishedAt: article.publishedAt,
        category: article.category,
        sentiment: article.sentiment,
        viewCount: article.viewCount,
        favoriteCount: article.favoriteCount,
        isFavorite: article.favorites.length > 0,
        inPortfolio: article.symbols.some((s) => userPortfolioSymbols.has(s.symbol.toUpperCase())),
        score,
        symbols: article.symbols,
      };
      return dto;
    });

    const scoredArticles = await Promise.all(scoredPromises);

    // Ordenamiento por score desc y luego publishedAt desc
    scoredArticles.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.publishedAt.getTime() - a.publishedAt.getTime());

    const total = scoredArticles.length;
    const skip = (page - 1) * limit;
    const paginated = scoredArticles.slice(skip, skip + limit);

    return {
      news: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Conteo de artículos por categoría.
   */
  async getCategoriesCount(): Promise<NewsCategoryCount[]> {
    const groups = await this.db.newsArticle.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    const countMap = new Map<NewsCategory, number>(groups.map((g) => [g.category, g._count.id]));

    return NEWS_CATEGORIES.map((cat) => ({
      category: cat,
      count: countMap.get(cat) ?? 0,
    }));
  }

  /**
   * Detalle de un artículo por ID.
   */
  async getArticleById(userId: string, id: string): Promise<NewsArticleDto | null> {
    const article = await this.db.newsArticle.findUnique({
      where: { id },
      include: {
        symbols: { select: { symbol: true, matchScore: true, sentiment: true } },
        favorites: { where: { userId }, select: { userId: true } },
      },
    });

    if (!article) return null;

    const userPortfolioSymbols = await this.getUserPortfolioSymbols(userId);

    return {
      id: article.id,
      providerId: article.providerId,
      title: article.title,
      description: article.description,
      snippet: article.snippet,
      url: article.url,
      imageUrl: article.imageUrl,
      source: article.source,
      language: article.language,
      publishedAt: article.publishedAt,
      category: article.category,
      sentiment: article.sentiment,
      viewCount: article.viewCount,
      favoriteCount: article.favoriteCount,
      isFavorite: article.favorites.length > 0,
      inPortfolio: article.symbols.some((s) => userPortfolioSymbols.has(s.symbol.toUpperCase())),
      symbols: article.symbols,
    };
  }

  /**
   * Registro de vista (regla 4.3): máximo 1 vista por usuario por artículo por día calendario UTC.
   */
  async recordView(userId: string, articleId: string): Promise<{ viewed: boolean; viewCount: number }> {
    const article = await this.db.newsArticle.findUnique({
      where: { id: articleId },
      select: { id: true, viewCount: true },
    });

    if (!article) {
      const err = new Error('Noticia no encontrada');
      (err as any).code = 'ARTICLE_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    const now = new Date();
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Verificar si ya vio este artículo hoy
    const existingToday = await this.db.newsView.findFirst({
      where: {
        userId,
        articleId,
        viewedAt: { gte: startOfUtcDay },
      },
    });

    if (existingToday) {
      return { viewed: false, viewCount: article.viewCount };
    }

    // Registrar vista e incrementar contador atómicamente
    const updated = await this.db.$transaction(async (tx) => {
      await tx.newsView.create({
        data: {
          userId,
          articleId,
          viewedAt: now,
        },
      });

      return tx.newsArticle.update({
        where: { id: articleId },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });
    });

    return { viewed: true, viewCount: updated.viewCount };
  }

  /**
   * Guardado de favorito (regla 4.2): idempotente.
   */
  async addFavorite(userId: string, articleId: string): Promise<{ isFavorite: boolean; favoriteCount: number }> {
    const article = await this.db.newsArticle.findUnique({
      where: { id: articleId },
      select: { id: true, favoriteCount: true },
    });

    if (!article) {
      const err = new Error('Noticia no encontrada');
      (err as any).code = 'ARTICLE_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    const existing = await this.db.favoriteNews.findUnique({
      where: { userId_articleId: { userId, articleId } },
    });

    if (existing) {
      return { isFavorite: true, favoriteCount: article.favoriteCount };
    }

    const updated = await this.db.$transaction(async (tx) => {
      await tx.favoriteNews.create({
        data: { userId, articleId },
      });

      return tx.newsArticle.update({
        where: { id: articleId },
        data: { favoriteCount: { increment: 1 } },
        select: { favoriteCount: true },
      });
    });

    return { isFavorite: true, favoriteCount: updated.favoriteCount };
  }

  /**
   * Eliminación de favorito (regla 4.2): idempotente.
   */
  async removeFavorite(userId: string, articleId: string): Promise<{ isFavorite: boolean; favoriteCount: number }> {
    const article = await this.db.newsArticle.findUnique({
      where: { id: articleId },
      select: { id: true, favoriteCount: true },
    });

    if (!article) {
      const err = new Error('Noticia no encontrada');
      (err as any).code = 'ARTICLE_NOT_FOUND';
      (err as any).status = 404;
      throw err;
    }

    const existing = await this.db.favoriteNews.findUnique({
      where: { userId_articleId: { userId, articleId } },
    });

    if (!existing) {
      return { isFavorite: false, favoriteCount: article.favoriteCount };
    }

    const updated = await this.db.$transaction(async (tx) => {
      await tx.favoriteNews.delete({
        where: { userId_articleId: { userId, articleId } },
      });

      return tx.newsArticle.update({
        where: { id: articleId },
        data: { favoriteCount: { decrement: 1 } },
        select: { favoriteCount: true },
      });
    });

    return { isFavorite: false, favoriteCount: Math.max(0, updated.favoriteCount) };
  }

  /**
   * Listado de favoritos del usuario autenticado.
   */
  async listFavorites(userId: string, filters: ListFavoritesFilters = {}): Promise<PaginatedNewsResponse> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 12));
    const skip = (page - 1) * limit;

    const userPortfolioSymbols = await this.getUserPortfolioSymbols(userId);

    const articleWhere: any = {};
    if (filters.category) articleWhere.category = filters.category;
    if (filters.q?.trim()) {
      const query = filters.q.trim();
      articleWhere.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
        { snippet: { contains: query } },
      ];
    }

    const where = {
      userId,
      article: articleWhere,
    };

    const [total, favorites] = await Promise.all([
      this.db.favoriteNews.count({ where }),
      this.db.favoriteNews.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          article: {
            include: {
              symbols: { select: { symbol: true, matchScore: true, sentiment: true } },
            },
          },
        },
      }),
    ]);

    const news: NewsArticleDto[] = favorites.map((f) => ({
      id: f.article.id,
      providerId: f.article.providerId,
      title: f.article.title,
      description: f.article.description,
      snippet: f.article.snippet,
      url: f.article.url,
      imageUrl: f.article.imageUrl,
      source: f.article.source,
      language: f.article.language,
      publishedAt: f.article.publishedAt,
      category: f.article.category,
      sentiment: f.article.sentiment,
      viewCount: f.article.viewCount,
      favoriteCount: f.article.favoriteCount,
      isFavorite: true,
      inPortfolio: f.article.symbols.some((s) => userPortfolioSymbols.has(s.symbol.toUpperCase())),
      symbols: f.article.symbols,
    }));

    return {
      news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
