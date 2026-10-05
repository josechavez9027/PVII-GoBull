import type { MarketauxEntity, NewsCategory } from './news.types';

/**
 * Palabras clave economicas (regla 3). Se comparan sin acentos, en minusculas y
 * por palabra completa. Se incluyen los equivalentes en ingles porque la ingesta
 * trae articulos `es` y `en`.
 */
export const ECONOMY_KEYWORDS: readonly string[] = [
  // es
  'fed',
  'tasa de interes',
  'tasas de interes',
  'inflacion',
  'pib',
  'banco central',
  'politica monetaria',
  'empleo',
  'desempleo',
  // en
  'federal reserve',
  'interest rate',
  'interest rates',
  'inflation',
  'gdp',
  'central bank',
  'monetary policy',
  'employment',
  'unemployment',
];

const TECH_INDUSTRIES = new Set(['technology', 'information technology']);
const HEALTH_INDUSTRIES = new Set(['healthcare', 'health care']);
const ENERGY_INDUSTRIES = new Set(['energy']);

export interface CategorizeInput {
  title: string;
  description?: string | null | undefined;
  entities?: readonly MarketauxEntity[] | null | undefined;
}

/** Minusculas y sin diacriticos (inflación -> inflacion). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KEYWORD_PATTERN = new RegExp(
  `(^|[^a-z0-9])(${ECONOMY_KEYWORDS.map((k) => escapeRegExp(normalizeText(k))).join('|')})(?=$|[^a-z0-9])`,
);

export function hasEconomyKeyword(text: string): boolean {
  return KEYWORD_PATTERN.test(normalizeText(text));
}

function entityType(entity: MarketauxEntity): string {
  return (entity.type ?? '').trim().toLowerCase();
}

/** Entidad con mayor `match_score` (la primera en caso de empate). */
export function dominantEntity(entities: readonly MarketauxEntity[]): MarketauxEntity | undefined {
  let best: MarketauxEntity | undefined;
  for (const entity of entities) {
    if (!best || (entity.match_score ?? -Infinity) > (best.match_score ?? -Infinity)) {
      best = entity;
    }
  }
  return best;
}

/**
 * Taxonomia GoBull (seccion 4.2), en orden de precedencia. Funcion pura y
 * deterministica: misma entrada, misma categoria.
 */
export function categorizeArticle(input: CategorizeInput): NewsCategory {
  const entities = input.entities ?? [];
  const types = new Set(entities.map(entityType));

  // 1-2. Tipo de entidad cripto / divisa.
  if (types.has('cryptocurrency')) return 'CRIPTO';
  if (types.has('currency')) return 'DIVISAS';

  // 3. Palabras clave economicas en titulo o descripcion.
  const text = `${input.title} ${input.description ?? ''}`;
  if (hasEconomyKeyword(text)) return 'ECONOMIA';

  // 4. Indices.
  if (types.has('index')) return 'MERCADOS';

  // 6. Sin entidades identificadas.
  const dominant = dominantEntity(entities);
  if (!dominant) return 'OTROS';

  // 5. Industria de la entidad dominante.
  const industry = (dominant.industry ?? '').trim().toLowerCase();
  if (TECH_INDUSTRIES.has(industry)) return 'TECNOLOGIA';
  if (HEALTH_INDUSTRIES.has(industry)) return 'SALUD';
  if (ENERGY_INDUSTRIES.has(industry)) return 'ENERGIA';
  return 'EMPRESAS';
}
