import { Request, Response } from "express";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  pushSubscriptionSchema,
  revokeSubscriptionSchema,
  userNewsSettingSchema,
} from "./notifications.schemas";
import {
  notificationsService,
  type NotificationsService,
} from "./notifications.service";

export class NotificationsController {
  constructor(
    private readonly service: NotificationsService = notificationsService,
  ) {
    this.list = this.list.bind(this);
    this.unreadCount = this.unreadCount.bind(this);
    this.markRead = this.markRead.bind(this);
    this.markAllRead = this.markAllRead.bind(this);
    this.getSettings = this.getSettings.bind(this);
    this.updateSettings = this.updateSettings.bind(this);
    this.subscribePush = this.subscribePush.bind(this);
    this.revokePush = this.revokePush.bind(this);
    this.dispatch = this.dispatch.bind(this);
  }

  /** GET /api/v1/notifications */
  async list(req: Request, res: Response) {
    const parseQuery = listNotificationsQuerySchema.safeParse(req.query);
    if (!parseQuery.success) {
      const msg =
        parseQuery.error.issues?.[0]?.message || "Parámetros inválidos";
      return res.status(400).json({
        error: { code: "INVALID_QUERY", message: msg },
      });
    }

    try {
      const result = await this.service.listNotifications(
        req.user.id,
        parseQuery.data.limit,
        parseQuery.data.offset,
      );
      return res.json(result);
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudieron consultar las notificaciones",
        },
      });
    }
  }

  /** GET /api/v1/notifications/unread-count */
  async unreadCount(req: Request, res: Response) {
    try {
      const result = await this.service.getUnreadCount(req.user.id);
      return res.json(result);
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo consultar el contador de no leídas",
        },
      });
    }
  }

  /** POST /api/v1/notifications/:id/read */
  async markRead(req: Request, res: Response) {
    const parseParams = notificationIdParamSchema.safeParse(req.params);
    if (!parseParams.success) {
      const msg = parseParams.error.issues?.[0]?.message || "ID inválido";
      return res.status(400).json({
        error: { code: "INVALID_ID", message: msg },
      });
    }

    try {
      const result = await this.service.markAsRead(
        req.user.id,
        parseParams.data.id,
      );
      return res.json({ notification: result });
    } catch (err: any) {
      if (err?.message === "NOTIFICATION_NOT_FOUND") {
        return res.status(404).json({
          error: {
            code: "NOTIFICATION_NOT_FOUND",
            message: "Notificación no encontrada",
          },
        });
      }
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo actualizar la notificación",
        },
      });
    }
  }

  /** POST /api/v1/notifications/read-all */
  async markAllRead(req: Request, res: Response) {
    try {
      const result = await this.service.markAllAsRead(req.user.id);
      return res.json(result);
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudieron marcar todas como leídas",
        },
      });
    }
  }

  /** GET /api/v1/notifications/settings */
  async getSettings(req: Request, res: Response) {
    try {
      const result = await this.service.getSettings(req.user.id);
      return res.json({ settings: result });
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudieron obtener las preferencias",
        },
      });
    }
  }

  /** PUT /api/v1/notifications/settings */
  async updateSettings(req: Request, res: Response) {
    const parseBody = userNewsSettingSchema.safeParse(req.body);
    if (!parseBody.success) {
      const msg =
        parseBody.error.issues?.[0]?.message || "Preferencias inválidas";
      return res.status(400).json({
        error: { code: "INVALID_SETTINGS", message: msg },
      });
    }

    try {
      const updateData: {
        pushEnabled?: boolean;
        minScore?: number;
        maxPerDay?: number;
      } = {};
      if (parseBody.data.pushEnabled !== undefined)
        updateData.pushEnabled = parseBody.data.pushEnabled;
      if (parseBody.data.minScore !== undefined)
        updateData.minScore = parseBody.data.minScore;
      if (parseBody.data.maxPerDay !== undefined)
        updateData.maxPerDay = parseBody.data.maxPerDay;

      const result = await this.service.updateSettings(req.user.id, updateData);
      return res.json({ settings: result });
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudieron guardar las preferencias",
        },
      });
    }
  }

  /** POST /api/v1/notifications/push-subscription */
  async subscribePush(req: Request, res: Response) {
    const parseBody = pushSubscriptionSchema.safeParse(req.body);
    if (!parseBody.success) {
      const msg =
        parseBody.error.issues?.[0]?.message || "Suscripción inválida";
      return res.status(400).json({
        error: { code: "INVALID_SUBSCRIPTION", message: msg },
      });
    }

    try {
      const userAgent = (req.headers["user-agent"] as string) || undefined;
      const result = await this.service.subscribePush(
        req.user.id,
        parseBody.data,
        userAgent,
      );
      return res.status(201).json(result);
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo guardar la suscripción push",
        },
      });
    }
  }

  /** DELETE /api/v1/notifications/push-subscription */
  async revokePush(req: Request, res: Response) {
    const parseBody = revokeSubscriptionSchema.safeParse(req.body || req.query);
    const endpoint = parseBody.success ? parseBody.data.endpoint : undefined;

    try {
      const result = await this.service.revokePush(req.user.id, endpoint);
      return res.json(result);
    } catch {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo revocar la suscripción push",
        },
      });
    }
  }

  /** POST /api/v1/notifications/dispatch (opcional/manual trigger) */
  async dispatch(_req: Request, res: Response) {
    try {
      const result = await this.service.evaluateAndDispatch();
      return res.json({ result });
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Error en dispatch",
        },
      });
    }
  }
}

export const notificationsController = new NotificationsController();
