import { describe, it } from 'node:test';
import assert from 'node:assert';
import { categorizeArticle, hasEconomyKeyword, dominantEntity } from './news.categorize';

describe('news.categorize', () => {
  it('identifies economy keywords in Spanish and English with diacritics normalization', () => {
    assert.strictEqual(hasEconomyKeyword('La inflación sube este mes'), true);
    assert.strictEqual(hasEconomyKeyword('Suben las tasas de interés'), true);
    assert.strictEqual(hasEconomyKeyword('El Banco Central fija la postura'), true);
    assert.strictEqual(hasEconomyKeyword('Federal Reserve signals pause'), true);
    assert.strictEqual(hasEconomyKeyword('GDP increased by 2%'), true);
    assert.strictEqual(hasEconomyKeyword('Desempleo en mínimos históricos'), true);
    assert.strictEqual(hasEconomyKeyword('Random news without economic terms'), false);
  });

  it('selects dominant entity based on highest match_score', () => {
    const dominant = dominantEntity([
      { symbol: 'AAPL', match_score: 10.5, industry: 'Technology' },
      { symbol: 'MSFT', match_score: 85.2, industry: 'Technology' },
      { symbol: 'TSLA', match_score: 45.0, industry: 'Consumer Cyclical' },
    ]);
    assert.strictEqual(dominant?.symbol, 'MSFT');
  });

  it('Rule 1: entity type cryptocurrency maps to CRIPTO', () => {
    const category = categorizeArticle({
      title: 'Bitcoin rallies past $90k',
      entities: [{ symbol: 'BTC', type: 'cryptocurrency' }],
    });
    assert.strictEqual(category, 'CRIPTO');
  });

  it('Rule 2: entity type currency maps to DIVISAS', () => {
    const category = categorizeArticle({
      title: 'Euro advances against dollar',
      entities: [{ symbol: 'EUR/USD', type: 'currency' }],
    });
    assert.strictEqual(category, 'DIVISAS');
  });

  it('Rule 1 & 2 precede economy keywords', () => {
    const category = categorizeArticle({
      title: 'Inflación impacta precio de Bitcoin y tasas de interés',
      entities: [{ symbol: 'BTC', type: 'cryptocurrency' }],
    });
    assert.strictEqual(category, 'CRIPTO');
  });

  it('Rule 3: economy keywords map to ECONOMIA', () => {
    const category = categorizeArticle({
      title: 'La Fed mantiene la tasa de interés sin cambios',
      entities: [{ symbol: 'SPY', type: 'equity', industry: 'Financial Services' }],
    });
    assert.strictEqual(category, 'ECONOMIA');
  });

  it('Rule 4: index entity type maps to MERCADOS when no economy keyword', () => {
    const category = categorizeArticle({
      title: 'Wall Street cierra mixto en jornada tranquila',
      entities: [{ symbol: 'S&P 500', type: 'index' }],
    });
    assert.strictEqual(category, 'MERCADOS');
  });

  it('Rule 5: Technology / Information Technology maps to TECNOLOGIA', () => {
    const category = categorizeArticle({
      title: 'Nvidia presenta nueva arquitectura de chips',
      entities: [{ symbol: 'NVDA', type: 'equity', industry: 'Information Technology', match_score: 90 }],
    });
    assert.strictEqual(category, 'TECNOLOGIA');
  });

  it('Rule 5: Healthcare maps to SALUD', () => {
    const category = categorizeArticle({
      title: 'Pfizer inicia fase 3 de nuevo tratamiento',
      entities: [{ symbol: 'PFE', type: 'equity', industry: 'Healthcare', match_score: 95 }],
    });
    assert.strictEqual(category, 'SALUD');
  });

  it('Rule 5: Energy maps to ENERGIA', () => {
    const category = categorizeArticle({
      title: 'ExxonMobil expande operaciones de refinación',
      entities: [{ symbol: 'XOM', type: 'equity', industry: 'Energy', match_score: 80 }],
    });
    assert.strictEqual(category, 'ENERGIA');
  });

  it('Rule 5: other industries map to EMPRESAS', () => {
    const category = categorizeArticle({
      title: 'Walmart reporta ventas trimestrales récord',
      entities: [{ symbol: 'WMT', type: 'equity', industry: 'Consumer Defensive', match_score: 75 }],
    });
    assert.strictEqual(category, 'EMPRESAS');
  });

  it('Rule 6: without entities and without keywords maps to OTROS', () => {
    const category = categorizeArticle({
      title: 'Un reporte general de fin de semana',
      entities: [],
    });
    assert.strictEqual(category, 'OTROS');
  });
});
