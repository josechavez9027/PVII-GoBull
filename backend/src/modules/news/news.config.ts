import type { NewsConfig } from './news.types';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function strEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

/**
 * Configuracion del modulo de noticias. Se lee de forma perezosa (tras
 * `dotenv.config()`) y solo en el backend: la clave nunca sale de este proceso.
 */
export function loadNewsConfig(): NewsConfig {
  return {
    apiKey: (process.env.MARKETAUX_API_KEY ?? '').trim(),
    baseUrl: strEnv('MARKETAUX_BASE_URL', 'https://api.marketaux.com'),
    languages: strEnv('NEWS_LANGUAGES', 'es,en')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    freshnessCron: strEnv('NEWS_SYNC_FRESHNESS_CRON', '*/30 * * * *'),
    depthCron: strEnv('NEWS_SYNC_DEPTH_CRON', '0 */6 * * *'),
    retentionDays: intEnv('NEWS_RETENTION_DAYS', 90),
    pageLimit: 3, // maximo del plan gratuito
    depthPages: 4,
    overlapMinutes: 60,
    budget: { daily: 80, symbols: 16 },
    backoffMs: [60_000, 5 * 60_000, 15 * 60_000],
    schedulerEnabled: process.env.NEWS_SYNC_ENABLED !== 'false',
  };
}

type LogLevel = 'info' | 'warn' | 'error';

/** Log estructurado (una linea JSON) para diagnostico de la sincronizacion. */
export function newsLog(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, module: 'news', event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
