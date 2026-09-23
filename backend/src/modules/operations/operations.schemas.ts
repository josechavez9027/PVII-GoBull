import { z } from 'zod';

export const operationTypeSchema = z.enum(['DIV', 'DEP', 'RET', 'BUY', 'SELL', 'TAX']);

export const createOperationSchema = z
  .object({
    type: operationTypeSchema,
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
    symbol: z.string().trim().max(20).toUpperCase().nullable().optional(),
    date: z.string().optional(),
    qty: z.number().positive().optional(),
    totalPrice: z.coerce.number().positive('El valor total debe ser mayor a 0'),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'BUY' || data.type === 'SELL') {
      if (!data.symbol) {
        ctx.addIssue({
          code: 'custom',
          message: 'El simbolo es obligatorio para compras y ventas',
          path: ['symbol'],
        });
      }
      if (!data.qty) {
        ctx.addIssue({
          code: 'custom',
          message: 'La cantidad es obligatoria para compras y ventas',
          path: ['qty'],
        });
      }
    }
    if (data.type === 'DIV' && !data.symbol) {
      ctx.addIssue({
        code: 'custom',
        message: 'El simbolo es obligatorio para registrar un dividendo',
        path: ['symbol'],
      });
    }
  });

export const listOperationsQuerySchema = z.object({
  type: operationTypeSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().trim().optional(),
});