import cron, { type ScheduledTask } from "node-cron";
import { indicatorsLog, type IndicatorsConfig } from "./indicators.config";
import type { IndicatorsService } from "./indicators.service";

function safeExpression(value: string, fallback: string, name: string): string {
  if (cron.validate(value)) return value;
  indicatorsLog("warn", "INDICATORS_CRON_INVALID", { name, value, fallback });
  return fallback;
}

export function startIndicatorsScheduler(
  service: IndicatorsService,
  config: IndicatorsConfig,
): ScheduledTask[] {
  if (!config.enabled) {
    indicatorsLog("info", "INDICATORS_DISABLED");
    return [];
  }
  if (!service.isConfigured) {
    indicatorsLog("warn", "INDICATORS_PROVIDER_NOT_CONFIGURED", {
      detail: "FMP_API_KEY vacia: el modulo sirve solo datos ya almacenados.",
    });
    return [];
  }

  const tickCron = safeExpression(config.tickCron, "*/10 * * * *", "quote-tick");
  const treasuryCron = safeExpression(config.treasuryCron, "0 22 * * *", "treasury");
  const tasks: ScheduledTask[] = [];

  tasks.push(
    cron.schedule(tickCron, () => service.tick().catch((error) => {
      indicatorsLog("error", "INDICATORS_TICK_ERROR", {
        message: error instanceof Error ? error.message : String(error),
      });
    }), { name: "indicators-quote-tick", noOverlap: true }),
  );

  tasks.push(
    cron.schedule(treasuryCron, () => service.refreshTreasury().catch((error) => {
      indicatorsLog("error", "INDICATORS_TREASURY_ERROR", {
        message: error instanceof Error ? error.message : String(error),
      });
    }), { name: "indicators-treasury", noOverlap: true }),
  );

  if (config.backfillEnabled) {
    const backfillCron = safeExpression(config.backfillCron, "30 2 * * *", "backfill");
    tasks.push(
      cron.schedule(backfillCron, () => service.refreshRecentHistory().catch((error) => {
        indicatorsLog("error", "INDICATORS_BACKFILL_ERROR", {
          message: error instanceof Error ? error.message : String(error),
        });
      }), { name: "indicators-backfill", noOverlap: true }),
    );
  }

  return tasks;
}
