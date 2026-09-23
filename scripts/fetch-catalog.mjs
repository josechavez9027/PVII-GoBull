// Descarga el listado completo de Alpha Vantage (LISTING_STATUS, 1 llamada)
// y genera el catalogo normalizado en prisma/seed-data/catalogo.json (versionado,
// para que el seed funcione en cualquier clon sin consumir cuota de la API).
// Solo instrumentos con status=Active + bloque curado BMV.
// Uso: node scripts/fetch-catalog.mjs [--reuse]  (--reuse reusa el CSV ya descargado)
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(rootDir, 'prisma', 'seed-data');
mkdirSync(dataDir, { recursive: true });

const RAW_CSV = join(dataDir, 'listing-status.csv');
const CATALOG_JSON = join(dataDir, 'catalogo.json');

// Carga simple de .env raiz (sin dependencias)
const envPath = join(rootDir, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const REUSE = process.argv.includes('--reuse');

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function mapKind(assetType) {
  const t = (assetType || '').trim().toUpperCase();
  if (t === 'ETF') return 'ETF';
  if (t === 'STOCK') return 'STOCK';
  return 'OTHER';
}

// Bloque curado BMV (~40 emisoras + fibras + 1 ETF local)
const BMV = [
  ['FEMSAUBD', 'Fomento Economico Mexicano UBD', 'STOCK'],
  ['WALMEX', 'Wal Mart de Mexico', 'STOCK'],
  ['GFNORTEO', 'Grupo Financiero Banorte O', 'STOCK'],
  ['CEMEXCPO', 'Cemex CPO', 'STOCK'],
  ['AMXB', 'America Movil L', 'STOCK'],
  ['GMEXICOB', 'Grupo Mexico B', 'STOCK'],
  ['BIMBOA', 'Grupo Bimbo A', 'STOCK'],
  ['ELEKTRA', 'Grupo Elektra', 'STOCK'],
  ['TLEVISACPO', 'Grupo Televisa CPO', 'STOCK'],
  ['ORBIA', 'Orbia Advance Corporation', 'STOCK'],
  ['KIMBERA', 'Kimberly Clark de Mexico A', 'STOCK'],
  ['ALPEKA', 'Alpek A', 'STOCK'],
  ['GCC', 'Grupo Cementos de Chihuahua', 'STOCK'],
  ['OMA', 'Grupo Aeroportuario del Centro Norte B', 'STOCK'],
  ['ASURB', 'Grupo Aeroportuario del Sureste B', 'STOCK'],
  ['GAPB', 'Grupo Aeroportuario del Pacifico B', 'STOCK'],
  ['ALSEA', 'Alsea', 'STOCK'],
  ['GRUMAB', 'Gruma B', 'STOCK'],
  ['HERDEZ', 'Grupo Herdez', 'STOCK'],
  ['AC', 'Arca Continental', 'STOCK'],
  ['KOFUBL', 'Coca Cola Femsa UBL', 'STOCK'],
  ['CUERVO', 'Becle', 'STOCK'],
  ['LIVEPOLC1', 'El Puerto de Liverpool C1', 'STOCK'],
  ['SORIANAB', 'Organizacion Soriana B', 'STOCK'],
  ['CHDRAUIB', 'Grupo Comercial Chedraui B', 'STOCK'],
  ['LABB', 'Genomma Lab Internacional B', 'STOCK'],
  ['BOLSAA', 'Bolsa Mexicana de Valores A', 'STOCK'],
  ['GFINBURO', 'Grupo Financiero Inbursa O', 'STOCK'],
  ['ICHB', 'Industrias CH B', 'STOCK'],
  ['SIMECB', 'Grupo Simec B', 'STOCK'],
  ['PE&OLES', 'Industrias Penoles', 'STOCK'],
  ['ALFAA', 'Alfa A', 'STOCK'],
  ['VISTAA', 'Vista Energy', 'STOCK'],
  ['VOLARA', 'Controladora Vuela Compania de Aviacion A', 'STOCK'],
  ['AEROMEX', 'Grupo Aeromexico', 'STOCK'],
  ['PINFRA', 'Promotora y Operadora de Infraestructura', 'STOCK'],
  ['AGUA', 'Grupo Rotoplas', 'STOCK'],
  ['NEMAKA', 'Nemak A', 'STOCK'],
  ['FUNO11', 'Fibra Uno', 'STOCK'],
  ['FIBRAPL14', 'Fibra Prologis', 'STOCK'],
  ['FIBRAHD15', 'Fibra HD', 'STOCK'],
  ['FSHOP13', 'Fibra Shop', 'STOCK'],
  ['TERRA13', 'Fibra Terrafina', 'STOCK'],
  ['DANHOS13', 'Fibra Danhos', 'STOCK'],
  ['FIBRAMQ12', 'Fibra Macquarie Mexico', 'STOCK'],
  ['FINN13', 'Fibra Inn', 'STOCK'],
  ['NAFTRACISHRS', 'Naftrac TRAC ISHRS', 'ETF'],
];

async function main() {
  let csv;
  if (REUSE && existsSync(RAW_CSV)) {
    console.log('Reusando CSV existente (sin consumir cuota).');
    csv = readFileSync(RAW_CSV, 'utf8');
  } else {
    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key) {
      console.error('Falta ALPHAVANTAGE_API_KEY en .env');
      process.exit(1);
    }
    console.log('Descargando LISTING_STATUS (1 llamada)...');
    const res = await fetch(`https://www.alphavantage.co/query?function=LISTING_STATUS&apikey=${key}`);
    csv = await res.text();
    if (csv.trimStart().startsWith('{') || !csv.includes('symbol')) {
      console.error('Respuesta inesperada de Alpha Vantage:', csv.slice(0, 300));
      process.exit(1);
    }
    writeFileSync(RAW_CSV, csv);
    console.log(`Snapshot guardado: ${RAW_CSV} (${(csv.length / 1024).toFixed(0)} KB)`);
  }

  const rows = parseCsv(csv);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iSymbol = idx('symbol');
  const iName = idx('name');
  const iExchange = idx('exchange');
  const iType = idx('assettype');
  const iStatus = idx('status');
  if (iSymbol < 0 || iName < 0) {
    console.error('CSV sin columnas esperadas:', rows[0]);
    process.exit(1);
  }

  const seen = new Set();
  const catalog = [];
  let skippedInactive = 0;
  let skippedEmpty = 0;
  for (const r of rows.slice(1)) {
    const status = (r[iStatus] || '').trim();
    if (status !== 'Active') {
      skippedInactive++;
      continue;
    }
    const symbol = (r[iSymbol] || '').trim().toUpperCase();
    const name = (r[iName] || '').trim();
    if (!symbol || !name) {
      skippedEmpty++;
      continue;
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    catalog.push({
      symbol,
      name,
      market: (r[iExchange] || '').trim(),
      kind: mapKind(r[iType]),
      isActive: true,
    });
  }

  let bmvAdded = 0;
  for (const [symbol, name, kind] of BMV) {
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    catalog.push({ symbol, name, market: 'BMV', kind, isActive: true });
    bmvAdded++;
  }

  catalog.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  writeFileSync(CATALOG_JSON, JSON.stringify(catalog, null, 1));

  const etfs = catalog.filter((c) => c.kind === 'ETF').length;
  console.log(`Catalogo generado: ${CATALOG_JSON}`);
  console.log(`  Total: ${catalog.length} (US: ${catalog.length - bmvAdded}, BMV: ${bmvAdded}, ETFs: ${etfs})`);
  console.log(`  Omitidos: inactivos=${skippedInactive}, vacios/duplicados=${skippedEmpty}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
