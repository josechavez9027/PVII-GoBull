// Seed del catalogo de instrumentos (docs/data/catalogo.json).
// Refresco total e idempotente: borra y reinserta en lotes.
// Uso: npm run prisma:seed  (requiere ALPHAVANTAGE? no; solo DATABASE_URL)
const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const CATALOG = join(__dirname, '..', 'docs', 'data', 'catalogo.json');
const BATCH = 1000;

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const prisma = new PrismaClient();
  try {
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
