import cron, { type ScheduledTask } from 'node-cron';
import { loadNewsConfig, newsLog } from './news.config';
import { getNewsSyncService, type NewsSyncService } from './news.service';
import type { NewsConfig } from './news.types';

const DEFAULT_FRESHNESS_CRON = '*/30 * * * *';
const DEFAULT_DEPTH_CRON = '0 */6 * * *';
const STARTUP_DELAY_MS = 5_000;
const STALE_AFTER_MS = 30 * 60 * 1000;

function safeExpression(value: string, fallback: string, name: string): string {
  if (cron.validate(value)) return value;
  newsLog('warn', 'NEWS_CRON_INVALID', { name, value, fallback });
  return fallback;
}

/**
 * Programa los jobs de ingesta dentro del proceso backend (sin servicios
 * externos). Devuelve las tareas para poder detenerlas.
 */
export function startNewsScheduler(
  service: NewsSyncService = getNewsSyncService(),
  config: NewsConfig = loadNewsConfig(),
): ScheduledTask[] {
  if (!config.schedulerEnabled) {
    newsLog('info', 'NEWS_SCHEDULER_DISABLED');
    return [];
  }

  const freshnessCron = safeExpression(config.freshnessCron, DEFAULT_FRESHNESS_CRON, 'freshness');
  const depthCron = safeExpression(config.depthCron, DEFAULT_DEPTH_CRON, 'depth');
  const tasks: ScheduledTask[] = [];

  if (service.isConfigured) {
    tasks.push(
      cron.schedule(freshnessCron, () => service.runFreshness(), {
        name: 'news-freshness',
        noOverlap: true,
      }),
    );
  } else {
    newsLog('warn', 'NEWS_PROVIDER_NOT_CONFIGURED', {
      detail: 'MARKETAUX_API_KEY vacia: no se consulta el proveedor; solo corre la retencion.',
    });
  }

  // Profundidad + retencion (la purga es local y corre aun sin clave).
  tasks.push(
    cron.schedule(depthCron, () => service.runDepth(), { name: 'news-depth', noOverlap: true }),
  );

  newsLog('info', 'NEWS_SCHEDULER_STARTED', {
    freshnessCron: service.isConfigured ? freshnessCron : null,
    depthCron,
    languages: config.languages,
    retentionDays: config.retentionDays,
  });

  if (service.isConfigured) {
    // Primera carga tras arrancar si la ultima frescura es antigua (o nunca corrio).
    const timer = setTimeout(async () => {
      try {
        const status = await service.getStatus();
        const freshness = status.jobs.find((j) => j.job === 'freshness');
        const last = freshness?.lastSuccessAt?.getTime() ?? 0;
        if (Date.now() - last > STALE_AFTER_MS) await service.runFreshness();
      } catch (err) {
        newsLog('error', 'NEWS_STARTUP_SYNC_FAILED', { detail: (err as Error)?.message });
      }
    }, STARTUP_DELAY_MS);
    timer.unref();
  }

  return tasks;
}
