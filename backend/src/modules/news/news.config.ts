import type { NewsConfig } from "./news.types";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function strEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

/** Dominios hispanos de alto impacto (medidos: cubren 98% del pool es de AAPL+MCD/90d: 47/48). */
const DEFAULT_PREFERRED_DOMAINS = [
  "businessinsider.es",
  "merca2.es",
  "economista.mx",
  "elconfidencial.com",
  "expansion.com",
  "lavanguardia.com",
  "elpais.com",
  "estrategiasdeinversion.com",
  "infobae.com",
  "ambito.com",
  "finance.yahoo.com",
  "investing.com",
];

/**
 * Configuracion del modulo de noticias. Se lee de forma perezosa (tras
 * `dotenv.config()`) y solo en el backend: la clave nunca sale de este proceso.
 */
export function loadNewsConfig(): NewsConfig {
  const backfillCronRaw = process.env.NEWS_SYNC_BACKFILL_CRON?.trim();
  const preferredDomainsRaw = process.env.NEWS_PREFERRED_DOMAINS?.trim();
  return {
    apiKey: (process.env.MARKETAUX_API_KEY ?? "").trim(),
    baseUrl: strEnv("MARKETAUX_BASE_URL", "https://api.marketaux.com"),
    // Solo espanol por defecto: el feed y el backfill son en espanol.
    languages: strEnv("NEWS_LANGUAGES", "es")
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    // Hourly por defecto: libera presupuesto diario para el backfill (tope 100/dia).
    freshnessCron: strEnv("NEWS_SYNC_FRESHNESS_CRON", "0 * * * *"),
    depthCron: strEnv("NEWS_SYNC_DEPTH_CRON", "0 */6 * * *"),
    backfillCron:
      process.env.NEWS_BACKFILL_ENABLED === "false"
        ? null
        : strEnv("NEWS_SYNC_BACKFILL_CRON", "20 */6 * * *"),
    retentionDays: intEnv("NEWS_RETENTION_DAYS", 90),
    backfillDays: intEnv("NEWS_BACKFILL_DAYS", 90),
    pageLimit: 3, // maximo del plan gratuito
    depthPages: 4,
    overlapMinutes: 60,
    // Limite real medido del plan gratuito: ~90 peticiones/dia (402 usage_limit_reached).
    budget: { daily: 90, symbols: 60 },
    preferredDomains: preferredDomainsRaw
      ? preferredDomainsRaw
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_PREFERRED_DOMAINS,
    backoffMs: [60_000, 5 * 60_000, 15 * 60_000],
    schedulerEnabled: process.env.NEWS_SYNC_ENABLED !== "false",
  };
}

type LogLevel = "info" | "warn" | "error";

/** Log estructurado (una linea JSON) para diagnostico de la sincronizacion. */
export function newsLog(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module: "news",
    event,
    ...data,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
