import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MarketauxProvider,
  NewsProviderError,
  extractSymbols,
  averageSentiment,
  normalizeArticle,
  formatProviderDate,
} from './news.provider';
import type { MarketauxArticle } from './news.types';

describe('news.provider', () => {
  const sampleArticle: MarketauxArticle = {
    uuid: 'uuid-1234',
    title: 'Apple announces new Silicon Mac',
    description: 'Tech giant unveils new hardware.',
    snippet: 'Apple unveiled its latest chip architecture...',
    url: 'https://news.example.com/apple-mac',
    image_url: 'https://news.example.com/img.png',
    language: 'en',
    published_at: '2026-10-05T12:00:00.000Z',
    source: 'example.com',
    entities: [
      { symbol: 'aapl', match_score: 50.0, sentiment_score: 0.8, type: 'equity', industry: 'Technology' },
      { symbol: 'AAPL', match_score: 80.0, sentiment_score: 0.6, type: 'equity', industry: 'Technology' },
      { symbol: 'MSFT', match_score: 20.0, sentiment_score: -0.2, type: 'equity', industry: 'Technology' },
    ],
  };

  it('formats provider date correctly to Y-m-dTH:i:s', () => {
    const d = new Date('2026-10-05T15:30:45.123Z');
    assert.strictEqual(formatProviderDate(d), '2026-10-05T15:30:45');
  });

  it('extracts, normalizes to uppercase, and deduplicates symbols keeping the highest matchScore', () => {
    const symbols = extractSymbols(sampleArticle);
    assert.strictEqual(symbols.length, 2);
    const aapl = symbols.find((s) => s.symbol === 'AAPL');
    assert.ok(aapl);
    assert.strictEqual(aapl.matchScore, 80.0);
    assert.strictEqual(aapl.sentiment, 0.6);
  });

  it('calculates average sentiment rounded between -1 and 1', () => {
    const sentiment = averageSentiment(sampleArticle);
    // (0.8 + 0.6 + (-0.2)) / 3 = 1.2 / 3 = 0.4
    assert.strictEqual(sentiment, 0.4);
  });

  it('normalizes valid article into NormalizedArticle with derived category', () => {
    const normalized = normalizeArticle(sampleArticle);
    assert.ok(normalized);
    assert.strictEqual(normalized.providerId, 'uuid-1234');
    assert.strictEqual(normalized.title, 'Apple announces new Silicon Mac');
    assert.strictEqual(normalized.category, 'TECNOLOGIA');
    assert.strictEqual(normalized.symbols.length, 2);
    assert.strictEqual(normalized.url, 'https://news.example.com/apple-mac');
  });

  it('rejects invalid article (missing url or invalid date)', () => {
    const badUrl = normalizeArticle({ ...sampleArticle, url: 'not-a-url' });
    assert.strictEqual(badUrl, null);

    const badDate = normalizeArticle({ ...sampleArticle, published_at: 'invalid-date' });
    assert.strictEqual(badDate, null);
  });

  it('builds query URL with all options', () => {
    const provider = new MarketauxProvider({
      apiKey: 'test-token',
      baseUrl: 'https://api.marketaux.com',
      languages: ['es', 'en'],
      pageLimit: 3,
      backoffMs: [10],
    });

    const url = provider.buildUrl({
      page: 2,
      publishedAfter: new Date('2026-10-05T10:00:00Z'),
      symbols: ['AAPL', 'TSLA'],
      mustHaveEntities: true,
    });

    assert.strictEqual(url.pathname, '/v1/news/all');
    assert.strictEqual(url.searchParams.get('api_token'), 'test-token');
    assert.strictEqual(url.searchParams.get('language'), 'es,en');
    assert.strictEqual(url.searchParams.get('limit'), '3');
    assert.strictEqual(url.searchParams.get('page'), '2');
    assert.strictEqual(url.searchParams.get('group_similar'), 'true');
    assert.strictEqual(url.searchParams.get('published_after'), '2026-10-05T10:00:00');
    assert.strictEqual(url.searchParams.get('symbols'), 'AAPL,TSLA');
    assert.strictEqual(url.searchParams.get('must_have_entities'), 'true');
  });

  it('handles 429 and retries with backoff, succeeding on subsequent attempt', async () => {
    let callCount = 0;
    const sleeps: number[] = [];

    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { code: 'rate_limit_reached', message: 'Wait' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          meta: { found: 1, returned: 1, limit: 3, page: 1 },
          data: [sampleArticle],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const provider = new MarketauxProvider({
      apiKey: 'test-token',
      baseUrl: 'https://api.marketaux.com',
      languages: ['en'],
      pageLimit: 3,
      backoffMs: [25, 50],
      fetchFn: mockFetch as any,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const page = await provider.fetchNews();
    assert.strictEqual(callCount, 2);
    assert.deepStrictEqual(sleeps, [25]);
    assert.strictEqual(page.articles.length, 1);
    assert.strictEqual(page.articles[0]?.uuid, 'uuid-1234');
  });

  it('throws BUDGET_EXHAUSTED immediately on 402 without retry', async () => {
    let callCount = 0;
    const sleeps: number[] = [];

    const mockFetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: { code: 'usage_limit_reached', message: 'Quota reached' } }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    };

    const provider = new MarketauxProvider({
      apiKey: 'test-token',
      baseUrl: 'https://api.marketaux.com',
      languages: ['en'],
      pageLimit: 3,
      backoffMs: [25, 50],
      fetchFn: mockFetch as any,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await assert.rejects(
      async () => {
        await provider.fetchNews();
      },
      (err: any) => {
        assert.ok(err instanceof NewsProviderError);
        assert.strictEqual(err.kind, 'BUDGET_EXHAUSTED');
        assert.strictEqual(err.status, 402);
        return true;
      },
    );

    assert.strictEqual(callCount, 1);
    assert.strictEqual(sleeps.length, 0);
  });

  it('aborts before fetch if beforeRequest returns false (budget exhaustion)', async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    };

    const provider = new MarketauxProvider({
      apiKey: 'test-token',
      baseUrl: 'https://api.marketaux.com',
      languages: ['en'],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    await assert.rejects(
      async () => {
        await provider.fetchNews({}, { beforeRequest: async () => false });
      },
      (err: any) => {
        assert.ok(err instanceof NewsProviderError);
        assert.strictEqual(err.kind, 'BUDGET_EXHAUSTED');
        return true;
      },
    );

    assert.strictEqual(fetchCalled, false);
  });
});
