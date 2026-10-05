import { Request, Response } from 'express';
import { OperationsService } from '../operations/operations.service';
import { NewsFeedService } from './news.feed.service';
import { articleIdParamSchema, listFavoritesQuerySchema, listNewsQuerySchema } from './news.schemas';
import { getNewsSyncService, type NewsSyncService } from './news.service';

const PORTFOLIO_SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const VIEW_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_VIEWS_PER_WINDOW = 30;

export class NewsController {
  private readonly lastPortfolioSync = new Map<string, number>();
  private readonly userViewTimestamps = new Map<string, number[]>();

  constructor(
    private readonly syncService: () => NewsSyncService = getNewsSyncService,
    private readonly operationsService = new OperationsService(),
    private readonly feedService = new NewsFeedService(),
  ) {
    this.syncStatus = this.syncStatus.bind(this);
    this.syncPortfolio = this.syncPortfolio.bind(this);
    this.list = this.list.bind(this);
    this.categories = this.categories.bind(this);
    this.relevant = this.relevant.bind(this);
    this.favorites = this.favorites.bind(this);
    this.detail = this.detail.bind(this);
    this.view = this.view.bind(this);
    this.addFavorite = this.addFavorite.bind(this);
    this.removeFavorite = this.removeFavorite.bind(this);
  }

  /** GET /api/v1/news/sync-status */
  async syncStatus(_req: Request, res: Response) {
    try {
      const status = await this.syncService().getStatus();
      res.json({ status });
    } catch {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo consultar el estado de las noticias' },
      });
    }
  }

  /** POST /api/v1/news/sync/portfolio */
  async syncPortfolio(req: Request, res: Response) {
    const service = this.syncService();
    if (!service.isConfigured) {
      const code = 'NEWS_PROVIDER_UNAVAILABLE';
      const message = 'El proveedor de noticias no esta configurado';
      return res.status(503).json({ error: { code, message } });
    }

    const userId: string = req.user.id;
    const last = this.lastPortfolioSync.get(userId) ?? 0;
    const waitMs = PORTFOLIO_SYNC_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) {
      const code = 'NEWS_SYNC_COOLDOWN';
      const message = `Espera ${Math.ceil(waitMs / 60000)} min antes de volver a sincronizar`;
      return res.status(429).json({ error: { code, message } });
    }

    try {
      const positions = await this.operationsService.positions(userId);
      const symbols = positions.map((p) => p.symbol);
      this.lastPortfolioSync.set(userId, Date.now());
      const result = await service.runSymbols(symbols);
      res.json({ result: { ...result, symbols: symbols.length } });
    } catch {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo sincronizar las noticias de la cartera' },
      });
    }
  }

  /** GET /api/v1/news */
  async list(req: Request, res: Response) {
    try {
      const filters = listNewsQuerySchema.parse(req.query);
      const result = await this.feedService.listNews(req.user.id, filters);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'Parámetros de búsqueda inválidos');
    }
  }

  /** GET /api/v1/news/categories */
  async categories(_req: Request, res: Response) {
    try {
      const categories = await this.feedService.getCategoriesCount();
      res.json({ categories });
    } catch (error: any) {
      this.sendError(res, error, 'No se pudieron consultar las categorías');
    }
  }

  /** GET /api/v1/news/relevant */
  async relevant(req: Request, res: Response) {
    try {
      const filters = listNewsQuerySchema.parse(req.query);
      const result = await this.feedService.listRelevantNews(req.user.id, filters);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'Parámetros de consulta inválidos');
    }
  }

  /** GET /api/v1/news/favorites */
  async favorites(req: Request, res: Response) {
    try {
      const filters = listFavoritesQuerySchema.parse(req.query);
      const result = await this.feedService.listFavorites(req.user.id, filters);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'Parámetros de consulta de favoritos inválidos');
    }
  }

  /** GET /api/v1/news/:id */
  async detail(req: Request, res: Response) {
    try {
      const { id } = articleIdParamSchema.parse(req.params);
      const article = await this.feedService.getArticleById(req.user.id, id);
      if (!article) {
        return res.status(404).json({
          error: {
            code: 'ARTICLE_NOT_FOUND',
            message: 'Noticia no encontrada',
          },
        });
      }
      res.json({ article });
    } catch (error: any) {
      this.sendError(res, error, 'ID de noticia inválido');
    }
  }

  /** POST /api/v1/news/:id/view */
  async view(req: Request, res: Response) {
    try {
      const { id } = articleIdParamSchema.parse(req.params);
      const userId: string = req.user.id;

      // Rate limiting en memoria por usuario
      const now = Date.now();
      const userViews = (this.userViewTimestamps.get(userId) ?? []).filter(
        (t) => now - t < VIEW_RATE_LIMIT_WINDOW_MS,
      );
      if (userViews.length >= MAX_VIEWS_PER_WINDOW) {
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Demasiadas solicitudes de vista en poco tiempo',
          },
        });
      }
      userViews.push(now);
      this.userViewTimestamps.set(userId, userViews);

      const result = await this.feedService.recordView(userId, id);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'No se pudo registrar la vista');
    }
  }

  /** POST /api/v1/news/:id/favorite */
  async addFavorite(req: Request, res: Response) {
    try {
      const { id } = articleIdParamSchema.parse(req.params);
      const result = await this.feedService.addFavorite(req.user.id, id);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'No se pudo guardar la noticia en favoritos');
    }
  }

  /** DELETE /api/v1/news/:id/favorite */
  async removeFavorite(req: Request, res: Response) {
    try {
      const { id } = articleIdParamSchema.parse(req.params);
      const result = await this.feedService.removeFavorite(req.user.id, id);
      res.json(result);
    } catch (error: any) {
      this.sendError(res, error, 'No se pudo eliminar la noticia de favoritos');
    }
  }

  private sendError(res: Response, error: any, defaultMessage: string) {
    const status = error.status ?? (error.issues || error.errors ? 400 : 500);
    const issues = error.issues ?? error.errors;
    const code = error.code ?? (issues ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
    const message = issues?.[0]?.message ?? error.message ?? defaultMessage;

    res.status(status).json({
      error: {
        code,
        message,
        ...(issues ? { details: issues } : {}),
      },
    });
  }
}
