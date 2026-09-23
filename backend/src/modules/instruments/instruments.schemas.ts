import { z } from 'zod';

export const suggestInstrumentsQuerySchema = z.object({
  s: z.string().trim().min(1, 'El término de búsqueda es obligatorio').max(20),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
