export interface FuturesConfig {
  enabled: boolean;
  baseUrl: string;
  refreshMinutes: number;
  backfillDays: number;
}

function strEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadFuturesConfig(): FuturesConfig {
  return {
    enabled: process.env.FUTURES_ENABLED !== "false",
    baseUrl: strEnv("FUTURES_YAHOO_BASE_URL", "https://query1.finance.yahoo.com"),
    refreshMinutes: intEnv("FUTURES_REFRESH_MINUTES", 5),
    backfillDays: intEnv("FUTURES_BACKFILL_DAYS", 365),
  };
}

type LogLevel = "info" | "warn" | "error";

export function futuresLog(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module: "futures",
    event,
    ...data,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const FUTURES_DISCLAIMER =
  "Rendimiento informativo con datos diarios. Las series son contratos continuos y pueden incluir saltos por roll; los renglones 10Y, DX, DY, EX y VX usan el indice spot del subyacente (Yahoo no publica el futuro). No constituye asesoria financiera.";
