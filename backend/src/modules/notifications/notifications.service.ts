import type { PrismaClient, NewsNotificationStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../../services/prisma.service";
import { pushService, type PushService } from "./push.service";

export interface NotificationDto {
  id: string;
  articleId: string;
  title: string;
  snippet: string | null;
  imageUrl: string | null;
  category: string;
  url: string;
  publishedAt: Date;
  score: number;
  status: NewsNotificationStatus;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface UserSettingsDto {
  pushEnabled: boolean;
  minScore: number;
  maxPerDay: number;
  publicKey: string;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Umbral por defecto = peso de "cartera" (45): toda noticia sobre una posicion
// abierta notifica; engagement/recencia/afinidad solo ordenan prioridad.
const DEFAULT_MIN_SCORE = 45;

export class NotificationsService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly push: PushService = pushService,
  ) {}

  /**
   * Calcula engagement a 7 días: min(1, (vistas_7d + 2 * favoritos_7d) / 50)
   */
  async calculateEngagement7d(
    articleId: string,
    now = new Date(),
  ): Promise<number> {
    const since = new Date(now.getTime() - SEVEN_DAYS_MS);
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
   * Calcula el score de relevancia (0 a 100) según las reglas de Sprint 5:
   * score = 45 * cartera + 30 * engagement + 15 * recencia + 10 * afinidad
   * La relevancia solo reconoce posiciones ABIERTAS (sin bonus histórico).
   */
  calculateScore(
    article: {
      category: string;
      publishedAt: Date;
      symbols: { symbol: string }[];
    },
    openSymbols: Set<string>,
    categoryAffinity: Map<string, number>,
    engagement: number,
    now = new Date(),
  ): number {
    // 1. Cartera (45 pts): 1 si tiene posición abierta, 0 si no
    const upperSymbols = article.symbols.map((s) => s.symbol.toUpperCase());
    const carteraFactor = upperSymbols.some((sym) => openSymbols.has(sym))
      ? 1
      : 0;
    const carteraScore = 45 * carteraFactor;

    // 2. Engagement (30 pts)
    const engagementScore = 30 * Math.max(0, Math.min(1, engagement));

    // 3. Recencia (15 pts): <6h -> 1, <24h -> 0.6, <72h -> 0.3, >=72h -> 0
    const ageMs = now.getTime() - new Date(article.publishedAt).getTime();
    let recenciaFactor = 0;
    if (ageMs < SIX_HOURS_MS) {
      recenciaFactor = 1;
    } else if (ageMs < TWENTY_FOUR_HOURS_MS) {
      recenciaFactor = 0.6;
    } else if (ageMs < SEVENTY_TWO_HOURS_MS) {
      recenciaFactor = 0.3;
    }
    const recenciaScore = 15 * recenciaFactor;

    // 4. Afinidad de categoría (10 pts)
    const afinidadFactor = categoryAffinity.get(article.category) ?? 0;
    const afinidadScore = 10 * Math.max(0, Math.min(1, afinidadFactor));

    const total =
      carteraScore + engagementScore + recenciaScore + afinidadScore;
    return Math.min(100, Math.max(0, Math.round(total)));
  }

  /**
   * Obtiene la afinidad de categorías del usuario basada en sus vistas en los últimos 30 días.
   */
  async getUserCategoryAffinity(
    userId: string,
    now = new Date(),
  ): Promise<Map<string, number>> {
    const since = new Date(now.getTime() - THIRTY_DAYS_MS);
    const views = await this.db.newsView.findMany({
      where: { userId, viewedAt: { gte: since } },
      select: {
        article: {
          select: { category: true },
        },
      },
    });

    const affinity = new Map<string, number>();
    const totalViews = views.length;
    if (totalViews === 0) {
      return affinity;
    }

    const counts = new Map<string, number>();
    for (const v of views) {
      const cat = v.article.category;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }

    for (const [cat, count] of counts.entries()) {
      affinity.set(cat, count / totalViews);
    }

    return affinity;
  }

  /**
   * Obtiene los símbolos con posición abierta del usuario (neto BUY-SELL > 0).
   */
  async getUserSymbols(userId: string): Promise<{ openSymbols: Set<string> }> {
    const operations = await this.db.operation.findMany({
      where: { userId },
      select: { type: true, symbol: true, qty: true },
    });

    const openSymbols = new Set<string>();
    const qtyMap = new Map<string, number>();

    for (const op of operations) {
      if (!op.symbol) continue;
      const sym = op.symbol.toUpperCase();

      const current = qtyMap.get(sym) || 0;
      if (op.type === "BUY") {
        qtyMap.set(sym, current + op.qty);
      } else if (op.type === "SELL") {
        qtyMap.set(sym, Math.max(0, current - op.qty));
      }
    }

    for (const [sym, qty] of qtyMap.entries()) {
      if (qty > 0) {
        openSymbols.add(sym);
      }
    }

    return { openSymbols };
  }

  /**
   * Obtiene o crea las preferencias del usuario.
   */
  async getSettings(userId: string): Promise<UserSettingsDto> {
    const setting = await this.db.userNewsSetting.findUnique({
      where: { userId },
    });

    const defaultMinScore = Number(process.env.NEWS_PUSH_MIN_SCORE || DEFAULT_MIN_SCORE);
    const defaultMaxPerDay = Number(process.env.NEWS_PUSH_MAX_PER_DAY || 5);

    return {
      pushEnabled: setting ? setting.pushEnabled : true,
      minScore: setting ? setting.minScore : defaultMinScore,
      maxPerDay: setting ? setting.maxPerDay : defaultMaxPerDay,
      publicKey: this.push.getPublicKey(),
    };
  }

  /**
   * Actualiza las preferencias del usuario.
   */
  async updateSettings(
    userId: string,
    data: { pushEnabled?: boolean; minScore?: number; maxPerDay?: number },
  ): Promise<UserSettingsDto> {
    const defaultMinScore = Number(process.env.NEWS_PUSH_MIN_SCORE || DEFAULT_MIN_SCORE);
    const defaultMaxPerDay = Number(process.env.NEWS_PUSH_MAX_PER_DAY || 5);

    const setting = await this.db.userNewsSetting.upsert({
      where: { userId },
      create: {
        userId,
        pushEnabled: data.pushEnabled ?? true,
        minScore: data.minScore ?? defaultMinScore,
        maxPerDay: data.maxPerDay ?? defaultMaxPerDay,
      },
      update: {
        ...(data.pushEnabled !== undefined
          ? { pushEnabled: data.pushEnabled }
          : {}),
        ...(data.minScore !== undefined ? { minScore: data.minScore } : {}),
        ...(data.maxPerDay !== undefined ? { maxPerDay: data.maxPerDay } : {}),
      },
    });

    return {
      pushEnabled: setting.pushEnabled,
      minScore: setting.minScore,
      maxPerDay: setting.maxPerDay,
      publicKey: this.push.getPublicKey(),
    };
  }

  /**
   * Registra una suscripción Web Push para el usuario.
   */
  async subscribePush(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<{ success: boolean }> {
    await this.db.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
        revokedAt: null,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
        revokedAt: null,
      },
    });

    return { success: true };
  }

  /**
   * Revoca una suscripción Web Push (o todas las del usuario).
   */
  async revokePush(
    userId: string,
    endpoint?: string,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const now = new Date();
    if (endpoint) {
      const res = await this.db.pushSubscription.updateMany({
        where: { userId, endpoint, revokedAt: null },
        data: { revokedAt: now },
      });
      return { success: true, revokedCount: res.count };
    }

    const res = await this.db.pushSubscription.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { success: true, revokedCount: res.count };
  }

  /**
   * Lista notificaciones del usuario (bandeja in-app, no leídas primero).
   */
  async listNotifications(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{
    items: NotificationDto[];
    total: number;
    unreadCount: number;
  }> {
    const [total, unreadCount, rows] = await Promise.all([
      this.db.newsNotification.count({ where: { userId } }),
      this.db.newsNotification.count({ where: { userId, readAt: null } }),
      this.db.newsNotification.findMany({
        where: { userId },
        include: {
          article: {
            select: {
              title: true,
              snippet: true,
              imageUrl: true,
              category: true,
              url: true,
              publishedAt: true,
            },
          },
        },
        orderBy: [
          // En Prisma, podemos ordenar por readAt ascendente (nulls first) y luego createdAt desc
          { readAt: "asc" },
          { createdAt: "desc" },
        ],
        skip: offset,
        take: limit,
      }),
    ]);

    const items: NotificationDto[] = rows.map((r) => ({
      id: r.id,
      articleId: r.articleId,
      title: r.article.title,
      snippet: r.article.snippet,
      imageUrl: r.article.imageUrl,
      category: r.article.category,
      url: r.article.url,
      publishedAt: r.article.publishedAt,
      score: r.score,
      status: r.status,
      sentAt: r.sentAt,
      readAt: r.readAt,
      createdAt: r.createdAt,
    }));

    return { items, total, unreadCount };
  }

  /**
   * Conteo de no leídas para la campana del header.
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.db.newsNotification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * Marca una notificación como leída.
   */
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDto> {
    const existing = await this.db.newsNotification.findFirst({
      where: { id: notificationId, userId },
      include: {
        article: {
          select: {
            title: true,
            snippet: true,
            imageUrl: true,
            category: true,
            url: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new Error("NOTIFICATION_NOT_FOUND");
    }

    const now = new Date();
    const updated = await this.db.newsNotification.update({
      where: { id: notificationId },
      data: {
        readAt: existing.readAt || now,
        status: "READ",
      },
      include: {
        article: {
          select: {
            title: true,
            snippet: true,
            imageUrl: true,
            category: true,
            url: true,
            publishedAt: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      articleId: updated.articleId,
      title: updated.article.title,
      snippet: updated.article.snippet,
      imageUrl: updated.article.imageUrl,
      category: updated.article.category,
      url: updated.article.url,
      publishedAt: updated.article.publishedAt,
      score: updated.score,
      status: updated.status,
      sentAt: updated.sentAt,
      readAt: updated.readAt,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Marca todas las notificaciones del usuario como leídas.
   */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const now = new Date();
    const result = await this.db.newsNotification.updateMany({
      where: { userId, readAt: null },
      data: {
        readAt: now,
        status: "READ",
      },
    });

    return { updated: result.count };
  }

  /**
   * Evalúa y despacha notificaciones para artículos recientes (<72h) y usuarios elegibles.
   */
  async evaluateAndDispatch(now = new Date()): Promise<{
    evaluatedUsers: number;
    notificationsCreated: number;
    pushSent: number;
    pushFailed: number;
  }> {
    const since72h = new Date(now.getTime() - SEVENTY_TWO_HOURS_MS);

    // 1. Obtener artículos con menos de 72h
    const articles = await this.db.newsArticle.findMany({
      where: { publishedAt: { gte: since72h } },
      include: { symbols: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    if (articles.length === 0) {
      return {
        evaluatedUsers: 0,
        notificationsCreated: 0,
        pushSent: 0,
        pushFailed: 0,
      };
    }

    // 2. Precalcular engagement para cada artículo
    const articleEngagementMap = new Map<string, number>();
    await Promise.all(
      articles.map(async (art) => {
        const eng = await this.calculateEngagement7d(art.id, now);
        articleEngagementMap.set(art.id, eng);
      }),
    );

    // 3. Obtener todos los usuarios activos
    const users = await this.db.user.findMany({
      select: {
        id: true,
        newsSetting: true,
        pushSubscriptions: {
          where: { revokedAt: null },
        },
      },
    });

    const defaultMinScore = Number(process.env.NEWS_PUSH_MIN_SCORE || DEFAULT_MIN_SCORE);
    const defaultMaxPerDay = Number(process.env.NEWS_PUSH_MAX_PER_DAY || 5);
    const since24h = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

    let notificationsCreated = 0;
    let pushSent = 0;
    let pushFailed = 0;

    for (const user of users) {
      const pushEnabled = user.newsSetting
        ? user.newsSetting.pushEnabled
        : true;
      if (!pushEnabled) {
        continue;
      }

      const minScore = user.newsSetting
        ? user.newsSetting.minScore
        : defaultMinScore;
      const maxPerDay = user.newsSetting
        ? user.newsSetting.maxPerDay
        : defaultMaxPerDay;

      // Contar notificaciones enviadas/creadas en las últimas 24h (excluyendo FAILED)
      const recentCount = await this.db.newsNotification.count({
        where: {
          userId: user.id,
          createdAt: { gte: since24h },
          status: { not: "FAILED" },
        },
      });

      let remainingDailyQuota = Math.max(0, maxPerDay - recentCount);
      if (remainingDailyQuota <= 0) {
        continue;
      }

      // Obtener datos del usuario para el cálculo de score
      const [{ openSymbols }, categoryAffinity] = await Promise.all([
        this.getUserSymbols(user.id),
        this.getUserCategoryAffinity(user.id, now),
      ]);

      // Evaluar cada artículo
      for (const article of articles) {
        if (remainingDailyQuota <= 0) {
          break;
        }

        // Verificar si ya fue notificado previamente
        const alreadyNotified = await this.db.newsNotification.findUnique({
          where: {
            userId_articleId: {
              userId: user.id,
              articleId: article.id,
            },
          },
        });

        if (alreadyNotified) {
          continue;
        }

        // Puerta dura: la relevancia (y la push) solo aplica a posiciones abiertas.
        const mentionsOpenPosition = article.symbols.some((s) =>
          openSymbols.has(s.symbol.toUpperCase()),
        );
        if (!mentionsOpenPosition) {
          continue;
        }

        const engagement = articleEngagementMap.get(article.id) || 0;
        const score = this.calculateScore(
          article,
          openSymbols,
          categoryAffinity,
          engagement,
          now,
        );

        if (score < minScore) {
          continue;
        }

        // Crear la notificación
        const activeSubscriptions = user.pushSubscriptions;
        let initialStatus: NewsNotificationStatus = "PENDING";
        let sentAt: Date | null = null;

        if (activeSubscriptions.length > 0 && this.push.isConfigured()) {
          // Intentar envío push
          let delivered = false;
          let anyFatal = true;

          for (const sub of activeSubscriptions) {
            const pushResult = await this.push.sendNotification(
              {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
              {
                title: "GoBull",
                body: article.title,
                url: `/noticias/${article.id}`,
              },
            );

            if (pushResult.success) {
              delivered = true;
              anyFatal = false;
            } else if (pushResult.shouldRevoke) {
              await this.db.pushSubscription.update({
                where: { id: sub.id },
                data: { revokedAt: new Date() },
              });
            } else {
              anyFatal = false;
            }
          }

          if (delivered) {
            initialStatus = "SENT";
            sentAt = new Date();
            pushSent++;
          } else {
            initialStatus = "FAILED";
            pushFailed++;
          }
        }

        try {
          await this.db.newsNotification.create({
            data: {
              userId: user.id,
              articleId: article.id,
              score,
              status: initialStatus,
              sentAt,
            },
          });

          notificationsCreated++;
          if (initialStatus !== "FAILED") {
            remainingDailyQuota--;
          }
        } catch {
          // Concurrencia o duplicado ignorado
        }
      }
    }

    return {
      evaluatedUsers: users.length,
      notificationsCreated,
      pushSent,
      pushFailed,
    };
  }
}

export const notificationsService = new NotificationsService();
