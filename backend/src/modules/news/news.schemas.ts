import { z } from 'zod';

// Validacion tolerante de la respuesta de Marketaux: los campos opcionales pueden
// venir como null y los desconocidos se descartan.

export const marketauxEntitySchema = z.object({
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  industry: z.string().nullish(),
  match_score: z.number().nullish(),
  sentiment_score: z.number().nullish(),
});

export const marketauxArticleSchema = z.object({
  uuid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  snippet: z.string().nullish(),
  url: z.string().min(1),
  image_url: z.string().nullish(),
  language: z.string().nullish(),
  published_at: z.string().min(1),
  source: z.string().nullish(),
  entities: z.array(marketauxEntitySchema).nullish(),
});

export const marketauxResponseSchema = z.object({
  meta: z
    .object({
      found: z.number().nullish(),
      returned: z.number().nullish(),
      limit: z.number().nullish(),
      page: z.number().nullish(),
    })
    .nullish(),
  // Cada articulo se valida por separado para no perder la pagina por uno defectuoso.
  data: z.array(z.unknown()).default([]),
});

export const marketauxErrorSchema = z.object({
  error: z.object({
    code: z.string().nullish(),
    message: z.string().nullish(),
  }),
});

// ── Schemas de endpoints REST (Sprint 4) ───────────────────────

export const NEWS_CATEGORIES_TUPLE = [
  'MERCADOS',
  'EMPRESAS',
  'ECONOMIA',
  'CRIPTO',
  'DIVISAS',
  'ENERGIA',
  'TECNOLOGIA',
  'SALUD',
  'OTROS',
] as const;

export const listNewsQuerySchema = z.object({
  category: z.enum(NEWS_CATEGORIES_TUPLE).optional(),
  q: z.string().trim().max(100).optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  to: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  symbol: z.string().trim().max(20).optional(),
  sort: z.enum(['recent', 'relevance']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const listFavoritesQuerySchema = z.object({
  category: z.enum(NEWS_CATEGORIES_TUPLE).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const articleIdParamSchema = z.object({
  id: z.string().min(1, 'El ID de la noticia es obligatorio'),
});

