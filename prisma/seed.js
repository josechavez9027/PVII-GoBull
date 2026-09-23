// Seed del catalogo de instrumentos (prisma/seed-data/catalogo.json).
// Refresco total e idempotente: borra y reinserta en lotes.
// Uso: npm run prisma:seed  (requiere ALPHAVANTAGE? no; solo DATABASE_URL)
// Con --if-empty solo siembra si la tabla Instrument esta vacia (bootstrap en compose).
const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const CATALOG = join(__dirname, 'seed-data', 'catalogo.json');
const BATCH = 1000;
const IF_EMPTY = process.argv.includes('--if-empty');

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const prisma = new PrismaClient();
  try {
    if (IF_EMPTY) {
      const existing = await prisma.instrument.count();
      if (existing > 0) {
        console.log(`Seed omitido: ya hay ${existing} instrumentos`);
        return;
      }
    }
    await prisma.instrument.deleteMany({});
    let inserted = 0;
    for (let i = 0; i < catalog.length; i += BATCH) {
      const batch = catalog.slice(i, i + BATCH).map((c) => ({
        symbol: String(c.symbol).toUpperCase(),
        name: String(c.name),
        market: String(c.market || ''),
        kind: c.kind === 'ETF' ? 'ETF' : c.kind === 'STOCK' ? 'STOCK' : 'OTHER',
        isActive: c.isActive !== false,
      }));
      const res = await prisma.instrument.createMany({ data: batch, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`Seed listo: ${inserted}/${catalog.length} instrumentos`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
