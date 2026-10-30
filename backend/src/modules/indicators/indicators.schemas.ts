import { z } from "zod";

export const fmpQuoteSchema = z.object({
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price: z.number(),
  changePercentage: z.number().nullish(),
  change: z.number().nullish(),
  previousClose: z.number().nullish(),
  timestamp: z.number().nullish(),
});

export const fmpTreasuryRowSchema = z.object({
  date: z.string().min(1),
  year2: z.number().nullish(),
  year10: z.number().nullish(),
  year30: z.number().nullish(),
});

export const fmpHistoricalRowSchema = z.object({
  symbol: z.string().nullish(),
  date: z.string().min(1),
  price: z.number(),
  volume: z.number().nullish(),
});

export const indicatorRangeSchema = z.enum(["1W", "1M", "3M", "6M", "1Y", "2Y", "5Y"]);
export const historyRangeSchema = z.enum(["5MIN", "1HR", "1W", "1M", "3M", "6M", "1Y", "2Y", "5Y"]);

export const compareQuerySchema = z.object({
  codes: z
    .string()
    .min(1)
    .transform((raw) =>
      raw
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 6),
    ),
  range: indicatorRangeSchema.default("1Y"),
});

export const historyQuerySchema = z.object({
  range: historyRangeSchema.default("3M"),
});
