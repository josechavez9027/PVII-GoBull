/**
 * Script diario de ingesta de noticias (CLI, una sola corrida).
 *
 * Uso:
 *   npm run news:fetch            # desde backend/
 *   npm run news:fetch --prefix backend   # desde la raiz
 *
 * Prioriza AAPL y MCD (top-up de 7 dias por simbolo) y luego continua el
 * backfill historico de 90 dias con los dominios hispanos configurados.
 * Hereda NEWS_LANGUAGES ("es"), el presupuesto diario (90/60) y la clave
 * de Marketaux de backend/.env. Si el presupuesto ya esta agotado, sale
 * limpio sin gastar peticiones.
 */
import "dotenv/config";
import { createNewsSyncService } from "../modules/news/news.service";
import type { NewsSyncResult } from "../modules/news/news.types";
import { prisma } from "../services/prisma.service";

const PRIORITY_SYMBOLS = ["AAPL", "MCD"];

function printResult(label: string, result: NewsSyncResult): void {
  const parts = [
    `status=${result.status}`,
    `peticiones=${result.requests}`,
    `traidas=${result.fetched}`,
    `creadas=${result.created}`,
    `actualizadas=${result.updated}`,
  ];
  if (result.error) parts.push(`error=${result.error}`);
  console.log(`[${label}] ${parts.join(" ")}`);
}

async function main(): Promise<void> {
  const service = createNewsSyncService();
  if (!service.isConfigured) {
    console.error(
      "MARKETAUX_API_KEY vacia o proveedor no configurado: revisa backend/.env",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Ingesta diaria de noticias (simbolos: ${PRIORITY_SYMBOLS.join(", ")})`,
  );

  // 1) Top-up: lo mas reciente de cada simbolo priorizado (ultimos 7 dias).
  const symbolsResult = await service.runSymbols(PRIORITY_SYMBOLS);
  printResult("simbolos/7d", symbolsResult);

  // 2) Backfill: continuidad de la ventana de 90 dias (retoma el cursor de la DB).
  const backfillResult = await service.runBackfill();
  printResult("backfill/90d", backfillResult);

  // 3) Resumen de presupuesto del dia.
  const status = await service.getStatus();
  const b = status.budget;
  console.log(
    `Presupuesto ${b.day}: ${b.used}/${b.limit} peticiones, ` +
      `${b.symbolUsed}/${b.symbolLimit} de simbolos (quedan ${b.remaining})`,
  );

  const totalCreated = symbolsResult.created + backfillResult.created;
  console.log(`Listo: ${totalCreated} noticias nuevas en la base.`);

  // Presupuesto agotado o corte parcial no es un fallo: son cortes legitimos.
  const failed =
    symbolsResult.status === "FAILED" || backfillResult.status === "FAILED";
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Fallo inesperado:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
