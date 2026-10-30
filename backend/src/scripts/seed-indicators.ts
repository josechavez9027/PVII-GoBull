import { prisma } from "../services/prisma.service";
import { INDICATORS_CATALOG } from "../modules/indicators/indicators.catalog";
import { indicatorsLog } from "../modules/indicators/indicators.config";

async function seedIndicators(): Promise<void> {
  const definitions = INDICATORS_CATALOG.filter(
    (definition) => definition.freeTier && definition.source !== "FMP_ECON",
  );
  for (const definition of definitions) {
    await prisma.indicator.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        name: definition.name,
        category: definition.category,
        unit: definition.unit,
        decimals: definition.decimals,
        source: definition.source,
        ...(definition.sourceSymbol ? { sourceSymbol: definition.sourceSymbol } : {}),
        ...(definition.quoteGroup ? { quoteGroup: definition.quoteGroup } : {}),
        ...(definition.treasuryField ? { treasuryField: definition.treasuryField } : {}),
        isActive: true,
        sortOrder: definition.sortOrder,
      },
      update: {
        name: definition.name,
        category: definition.category,
        unit: definition.unit,
        decimals: definition.decimals,
        source: definition.source,
        ...(definition.sourceSymbol ? { sourceSymbol: definition.sourceSymbol } : {}),
        ...(definition.quoteGroup ? { quoteGroup: definition.quoteGroup } : {}),
        ...(definition.treasuryField ? { treasuryField: definition.treasuryField } : {}),
        isActive: true,
        sortOrder: definition.sortOrder,
      },
    });
  }
  indicatorsLog("info", "INDICATORS_SEED_DONE", { count: definitions.length });
}

seedIndicators()
  .catch((error) => {
    indicatorsLog("error", "INDICATORS_SEED_ERROR", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
