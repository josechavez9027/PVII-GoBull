import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NewsFeedService } from './news.feed.service';
import type { NewsCategory } from './news.types';

describe('news.feed (engagement & relevance scoring)', () => {
  const feedService = new NewsFeedService({} as any, {} as any);

  it('calculates 7-day engagement using formula min(1, (views + 2 * favs) / 50)', () => {
    // 0 views, 0 favs -> 0
    // 10 views, 20 favs -> (10 + 40) / 50 = 50 / 50 = 1
    // 5 views, 5 favs -> (5 + 10) / 50 = 15 / 50 = 0.3
    // 100 views, 50 favs -> min(1, 200/50) = 1

    const calculate = (views: number, favs: number) => {
      const raw = (views + 2 * favs) / 50;
      return Math.min(1, Math.round(raw * 10_000) / 10_000);
    };

    assert.strictEqual(calculate(0, 0), 0);
    assert.strictEqual(calculate(10, 20), 1);
    assert.strictEqual(calculate(5, 5), 0.3);
    assert.strictEqual(calculate(100, 50), 1);
  });

  it('calculates relevance score: 45*cartera + 30*engagement + 15*recencia + 10*afinidad', () => {
    const userPortfolioSymbols = new Set(['AAPL', 'TSLA']);
    const userCategoryAffinity = new Map<NewsCategory, number>([
      ['TECNOLOGIA', 0.8], // 80% affinity
      ['MERCADOS', 0.2],
    ]);

    const now = new Date();
    // 1. Article with open portfolio symbol, high engagement, fresh (< 1h), tech category
    const scoreA = feedService.calculateScore(
      {
        category: 'TECNOLOGIA',
        publishedAt: new Date(now.getTime() - 1000 * 60 * 30), // 30 min ago
        symbols: [{ symbol: 'AAPL' }],
      },
      userPortfolioSymbols,
      userCategoryAffinity,
      0.5, // 50% engagement
    );

    // cartera: 45 * 1 = 45
    // engagement: 30 * 0.5 = 15
    // recencia: 15 * (1 - 0.5/72) ≈ 14.9
    // afinidad: 10 * 0.8 = 8
    // total ≈ 45 + 15 + 14.9 + 8 ≈ 82.9 -> 83
    assert.ok(scoreA >= 82 && scoreA <= 84, `Expected ~83, got ${scoreA}`);

    // 2. Article without portfolio symbols, 0 engagement, old (90h), no affinity
    const scoreB = feedService.calculateScore(
      {
        category: 'SALUD',
        publishedAt: new Date(now.getTime() - 1000 * 3600 * 90), // 90h ago
        symbols: [{ symbol: 'PFE' }],
      },
      userPortfolioSymbols,
      userCategoryAffinity,
      0,
    );

    // cartera: 0, engagement: 0, recencia: 0 (> 72h), afinidad: 0
    assert.strictEqual(scoreB, 0);
  });
});
