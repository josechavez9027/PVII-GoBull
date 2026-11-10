import { z } from "zod";

const yahooQuoteSchema = z.object({
  close: z.array(z.number().nullable()).optional(),
});

export const yahooChartResponseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          timestamp: z.array(z.number()).optional(),
          indicators: z
            .object({
              quote: z.array(yahooQuoteSchema).optional(),
            })
            .optional(),
        }),
      )
      .nullable()
      .optional(),
    error: z.unknown().nullable().optional(),
  }),
});
