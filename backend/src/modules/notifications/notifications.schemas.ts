import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url("Endpoint debe ser una URL válida"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh es obligatorio"),
    auth: z.string().min(1, "auth es obligatorio"),
  }),
});

export const revokeSubscriptionSchema = z.object({
  endpoint: z.string().url().optional(),
});

export const userNewsSettingSchema = z.object({
  pushEnabled: z.boolean().optional(),
  minScore: z
    .number()
    .int("minScore debe ser entero")
    .min(0, "minScore mínimo es 0")
    .max(100, "minScore máximo es 100")
    .optional(),
  maxPerDay: z
    .number()
    .int("maxPerDay debe ser entero")
    .min(0, "maxPerDay mínimo es 0")
    .max(20, "maxPerDay máximo es 20")
    .optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().min(1, "El ID de la notificación es obligatorio"),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
