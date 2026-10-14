import { describe, it } from "node:test";
import assert from "node:assert";
import { NewsFeedService } from "./news.feed.service";
import type { NewsCategory } from "./news.types";

describe("news.feed (engagement & relevance scoring)", () => {
  const feedService = new NewsFeedService({} as any, {} as any);

  it("calculates 7-day engagement using formula min(1, (views + 2 * favs) / 50)", () => {
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

  it("calculates relevance score: 45*cartera + 30*engagement + 15*recencia + 10*afinidad", () => {
    const userPortfolioSymbols = new Set(["AAPL", "TSLA"]);
    const userCategoryAffinity = new Map<NewsCategory, number>([
      ["TECNOLOGIA", 0.8], // 80% affinity
      ["MERCADOS", 0.2],
    ]);

    const now = new Date();
    // 1. Article with open portfolio symbol, high engagement, fresh (< 1h), tech category
    const scoreA = feedService.calculateScore(
      {
        category: "TECNOLOGIA",
        publishedAt: new Date(now.getTime() - 1000 * 60 * 30), // 30 min ago
        symbols: [{ symbol: "AAPL" }],
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
        category: "SALUD",
        publishedAt: new Date(now.getTime() - 1000 * 3600 * 90), // 90h ago
        symbols: [{ symbol: "PFE" }],
      },
      userPortfolioSymbols,
      userCategoryAffinity,
      0,
    );

    // cartera: 0, engagement: 0, recencia: 0 (> 72h), afinidad: 0
    assert.strictEqual(scoreB, 0);
  });
});

describe('news.feed - "Para ti" solo con posiciones abiertas', () => {
  const baseArticle = {
    id: "art-1",
    providerId: "prov-1",
    title: "Apple sube tras resultados",
    description: null,
    snippet: null,
    url: "https://news.com/a",
    imageUrl: null,
    source: "reuters.com",
    language: "en",
    publishedAt: new Date(Date.now() - 60 * 60 * 1000),
    category: "TECNOLOGIA",
    sentiment: 0.3,
    viewCount: 0,
    favoriteCount: 0,
    symbols: [{ symbol: "AAPL", matchScore: 90, sentiment: 0.3 }],
    favorites: [] as { userId: string }[],
  };

  function makeFeed(
    positions: { symbol: string; qty: number }[],
    findManyResult: any[] = [],
  ) {
    const findManyCalls: any[] = [];
    const db: any = {
      newsView: { count: async () => 0, findMany: async () => [] },
      favoriteNews: {
        count: async () => 0,
        findMany: async () => [],
        findUnique: async () => null,
      },
      newsArticle: {
        findMany: async (args: any) => {
          findManyCalls.push(args);
          return findManyResult;
        },
        findUnique: async () => findManyResult[0] ?? null,
      },
    };
    const ops: any = { positions: async () => positions };
    return { service: new NewsFeedService(db, ops), findManyCalls };
  }

  it("returns empty feed without querying articles when the user has no open positions", async () => {
    const { service, findManyCalls } = makeFeed([]);
    const result = await service.listRelevantNews("u-1");
    assert.deepStrictEqual(result.news, []);
    assert.strictEqual(result.pagination.total, 0);
    assert.strictEqual(findManyCalls.length, 0);
  });

  it("filters the query to open-position symbols and scores matching articles", async () => {
    const { service, findManyCalls } = makeFeed(
      [{ symbol: "AAPL", qty: 10 }],
      [baseArticle],
    );

    const result = await service.listRelevantNews("u-1");

    const where = findManyCalls[0].where;
    assert.deepStrictEqual(where.AND[0], {
      symbols: { some: { symbol: { in: ["AAPL"] } } },
    });

    assert.strictEqual(result.news.length, 1);
    const dto = result.news[0]!;
    assert.strictEqual(dto.inPortfolio, true);
    // cartera 45 + recencia (1h) ≈ 14.8 -> ~60
    assert.ok(
      (dto.score ?? 0) >= 59 && (dto.score ?? 0) <= 61,
      `score inesperado: ${dto.score}`,
    );
  });

  it("computes score in getArticleById only when the article mentions an open position", async () => {
    const inPortfolioFeed = makeFeed(
      [{ symbol: "AAPL", qty: 10 }],
      [baseArticle],
    );
    const withScore = await inPortfolioFeed.service.getArticleById(
      "u-1",
      "art-1",
    );
    assert.strictEqual(withScore?.inPortfolio, true);
    assert.ok(typeof withScore?.score === "number");

    const otherArticle = {
      ...baseArticle,
      id: "art-2",
      symbols: [{ symbol: "PFE", matchScore: 80, sentiment: -0.2 }],
    };
    const outOfPortfolioFeed = makeFeed(
      [{ symbol: "AAPL", qty: 10 }],
      [otherArticle],
    );
    const withoutScore = await outOfPortfolioFeed.service.getArticleById(
      "u-1",
      "art-2",
    );
    assert.strictEqual(withoutScore?.inPortfolio, false);
    assert.strictEqual(withoutScore?.score, undefined);
  });
});
