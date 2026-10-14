import { describe, it } from "node:test";
import assert from "node:assert";
import { NewsSyncService, utcDay } from "./news.service";
import { MarketauxProvider } from "./news.provider";
import type {
  BudgetScope,
  MarketauxArticle,
  MarketauxPage,
  NewsBudgetLimits,
  NewsConfig,
  NewsStore,
  NewsSyncJob,
  NewsSyncResult,
  NewsSyncStateRecord,
  NewsUsageRecord,
  NormalizedArticle,
  NormalizedSymbol,
  UpsertOutcome,
} from "./news.types";

interface StoredArticleRecord extends NormalizedArticle {
  id: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

class InMemoryNewsStore implements NewsStore {
  articles = new Map<string, StoredArticleRecord>();
  usages = new Map<string, NewsUsageRecord>();
  states = new Map<string, NewsSyncStateRecord>();

  async upsertArticle(article: NormalizedArticle): Promise<UpsertOutcome> {
    const existing = this.articles.get(article.providerId);
    if (!existing) {
      this.articles.set(article.providerId, {
        ...article,
        id: `id-${article.providerId}`,
        viewCount: 0,
        favoriteCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { created: true, changed: true };
    }

    // Preserve counters
    const currentViews = existing.viewCount;
    const currentFavorites = existing.favoriteCount;

    // Check if updated
    const changed =
      existing.title !== article.title ||
      existing.sentiment !== article.sentiment ||
      existing.symbols.length !== article.symbols.length;

    this.articles.set(article.providerId, {
      ...article,
      id: existing.id,
      viewCount: currentViews,
      favoriteCount: currentFavorites,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    return { created: false, changed };
  }

  async latestPublishedAt(): Promise<Date | null> {
    let max: Date | null = null;
    for (const a of this.articles.values()) {
      if (!max || a.publishedAt > max) max = a.publishedAt;
    }
    return max;
  }

  async minPublishedAtForSymbols(symbols: string[]): Promise<Date | null> {
    let min: Date | null = null;
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    for (const a of this.articles.values()) {
      if (!a.symbols.some((s) => wanted.has(s.symbol.toUpperCase()))) continue;
      if (!min || a.publishedAt < min) min = a.publishedAt;
    }
    return min;
  }

  async purgeExpired(cutoff: Date): Promise<number> {
    let count = 0;
    for (const [id, a] of this.articles.entries()) {
      if (
        a.publishedAt < cutoff &&
        a.favoriteCount === 0 &&
        a.viewCount === 0
      ) {
        this.articles.delete(id);
        count++;
      }
    }
    return count;
  }

  async getUsage(day: Date): Promise<NewsUsageRecord> {
    const key = day.toISOString().slice(0, 10);
    return this.usages.get(key) ?? { requests: 0, symbolRequests: 0 };
  }

  async tryConsumeRequest(
    day: Date,
    scope: BudgetScope,
    limits: NewsBudgetLimits,
  ): Promise<boolean> {
    const key = day.toISOString().slice(0, 10);
    const curr = this.usages.get(key) ?? { requests: 0, symbolRequests: 0 };
    if (curr.requests >= limits.daily) return false;
    if (scope === "symbols" && curr.symbolRequests >= limits.symbols)
      return false;

    this.usages.set(key, {
      requests: curr.requests + 1,
      symbolRequests:
        scope === "symbols" ? curr.symbolRequests + 1 : curr.symbolRequests,
    });
    return true;
  }

  async purgeUsageBefore(_day: Date): Promise<void> {}

  async getSyncState(job: NewsSyncJob): Promise<NewsSyncStateRecord | null> {
    return this.states.get(job) ?? null;
  }

  async listSyncStates(): Promise<NewsSyncStateRecord[]> {
    return [...this.states.values()];
  }

  async saveSyncResult(result: NewsSyncResult): Promise<void> {
    const ok = result.status === "OK";
    this.states.set(result.job, {
      job: result.job,
      lastRunAt: result.startedAt,
      lastSuccessAt: ok
        ? result.startedAt
        : (this.states.get(result.job)?.lastSuccessAt ?? null),
      lastStatus: result.status,
      lastError: result.error ?? null,
      lastFetched: result.fetched,
      lastCreated: result.created,
      lastUpdated: result.updated,
    });
  }
}

describe("news.service (sync engine)", () => {
  const baseConfig: NewsConfig = {
    apiKey: "valid-key",
    baseUrl: "https://api.marketaux.com",
    languages: ["es", "en"],
    freshnessCron: "0 * * * *",
    depthCron: "0 */6 * * *",
    backfillCron: "20 */6 * * *",
    retentionDays: 90,
    backfillDays: 90,
    pageLimit: 3,
    depthPages: 4,
    overlapMinutes: 60,
    budget: { daily: 100, symbols: 70 },
    preferredDomains: ["reuters.com", "bloomberg.com"],
    backoffMs: [10],
    schedulerEnabled: true,
  };

  const articleA: MarketauxArticle = {
    uuid: "art-1",
    title: "Noticia A Original",
    url: "https://news.com/a",
    published_at: new Date("2026-10-01T10:00:00Z").toISOString(),
    source: "news.com",
    entities: [
      {
        symbol: "AAPL",
        match_score: 50,
        sentiment_score: 0.2,
        type: "equity",
        industry: "Technology",
      },
    ],
  };

  it("runs freshness sync with idempotent upsert and no duplicates upon repeating", async () => {
    const store = new InMemoryNewsStore();
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          meta: { found: 1, returned: 1, limit: 3, page: 1 },
          data: [articleA],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
    });

    // First run: created 1
    const run1 = await service.runFreshness();
    assert.strictEqual(run1.status, "OK");
    assert.strictEqual(run1.created, 1);
    assert.strictEqual(run1.updated, 0);
    assert.strictEqual(store.articles.size, 1);

    // Second run with same article: created 0, updated 0, no duplicates
    const run2 = await service.runFreshness();
    assert.strictEqual(run2.status, "OK");
    assert.strictEqual(run2.created, 0);
    assert.strictEqual(run2.updated, 0);
    assert.strictEqual(store.articles.size, 1);
  });

  it("upserts article updating title and sentiment without touching viewCount or favoriteCount", async () => {
    const store = new InMemoryNewsStore();
    // Pre-populate article with views and favorites
    store.articles.set("art-1", {
      providerId: "art-1",
      title: "Noticia A Vieja",
      description: null,
      snippet: null,
      url: "https://news.com/a",
      imageUrl: null,
      source: "news.com",
      language: "es",
      publishedAt: new Date("2026-10-01T10:00:00Z"),
      category: "TECNOLOGIA",
      sentiment: 0.1,
      symbols: [{ symbol: "AAPL", matchScore: 50, sentiment: 0.1 }],
      id: "id-art-1",
      viewCount: 42,
      favoriteCount: 15,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      updatedAt: new Date("2026-10-01T10:00:00Z"),
    });

    const updatedArticleA: MarketauxArticle = {
      ...articleA,
      title: "Noticia A Actualizada",
      entities: [
        {
          symbol: "AAPL",
          match_score: 90,
          sentiment_score: 0.8,
          type: "equity",
          industry: "Technology",
        },
        {
          symbol: "GOOGL",
          match_score: 30,
          sentiment_score: 0.5,
          type: "equity",
          industry: "Technology",
        },
      ],
    };

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          meta: { found: 1, returned: 1, limit: 3, page: 1 },
          data: [updatedArticleA],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
    });
    const run = await service.runFreshness();

    assert.strictEqual(run.status, "OK");
    assert.strictEqual(run.created, 0);
    assert.strictEqual(run.updated, 1);

    const stored = store.articles.get("art-1");
    assert.ok(stored);
    assert.strictEqual(stored.title, "Noticia A Actualizada");
    // Symbols rebuilt
    assert.strictEqual(stored.symbols.length, 2);
    // Counters preserved!
    assert.strictEqual(stored.viewCount, 42);
    assert.strictEqual(stored.favoriteCount, 15);
  });

  it("skips sync when daily budget is exhausted (SKIPPED_BUDGET)", async () => {
    const store = new InMemoryNewsStore();
    const today = utcDay(new Date());
    // Exhaust budget (tope diario = 100)
    store.usages.set(today.toISOString().slice(0, 10), {
      requests: 100,
      symbolRequests: 0,
    });

    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
    });
    const run = await service.runFreshness();

    assert.strictEqual(run.status, "SKIPPED_BUDGET");
    assert.strictEqual(fetchCalled, false);
  });

  it("prevents overlapping runs with single in-memory lock (SKIPPED_LOCKED)", async () => {
    const store = new InMemoryNewsStore();

    // Slow fetch
    const mockFetch = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          meta: { found: 0, returned: 0, limit: 3, page: 1 },
          data: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
    });

    // Launch first run
    const p1 = service.runFreshness();
    // Immediately attempt second run
    const run2 = await service.runDepth();

    assert.strictEqual(run2.status, "SKIPPED_LOCKED");
    const run1 = await p1;
    assert.strictEqual(run1.status, "OK");
  });

  it("purges articles older than 90 days with 0 views/favs, protecting articles with favorites or views", async () => {
    const store = new InMemoryNewsStore();
    const now = new Date("2026-10-05T12:00:00Z");
    const oldDate = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000); // 95 days old

    // Old article without views or favorites -> should be purged
    store.articles.set("old-unpopular", {
      id: "1",
      providerId: "old-unpopular",
      title: "Vieja sin lecturas",
      description: null,
      snippet: null,
      url: "https://news.com/1",
      imageUrl: null,
      source: "news.com",
      language: "es",
      publishedAt: oldDate,
      category: "OTROS",
      sentiment: null,
      symbols: [],
      viewCount: 0,
      favoriteCount: 0,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    // Old article with 1 favorite -> PROTECTED
    store.articles.set("old-favorite", {
      id: "2",
      providerId: "old-favorite",
      title: "Vieja favorita",
      description: null,
      snippet: null,
      url: "https://news.com/2",
      imageUrl: null,
      source: "news.com",
      language: "es",
      publishedAt: oldDate,
      category: "OTROS",
      sentiment: null,
      symbols: [],
      viewCount: 0,
      favoriteCount: 1,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    // Old article with 1 view -> PROTECTED
    store.articles.set("old-viewed", {
      id: "3",
      providerId: "old-viewed",
      title: "Vieja leída",
      description: null,
      snippet: null,
      url: "https://news.com/3",
      imageUrl: null,
      source: "news.com",
      language: "es",
      publishedAt: oldDate,
      category: "OTROS",
      sentiment: null,
      symbols: [],
      viewCount: 1,
      favoriteCount: 0,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    const service = new NewsSyncService({
      store,
      provider: null,
      config: baseConfig,
      now: () => now,
    });

    const purged = await service.purgeRetention();
    assert.strictEqual(purged, 1);
    assert.strictEqual(store.articles.has("old-unpopular"), false);
    assert.strictEqual(store.articles.has("old-favorite"), true);
    assert.strictEqual(store.articles.has("old-viewed"), true);
  });

  it("runs targeted symbols query with mustHaveEntities and sub-budget reservation", async () => {
    const store = new InMemoryNewsStore();
    let requestedParams: string | undefined;

    const mockFetch = async (url: any) => {
      requestedParams = url.toString();
      return new Response(
        JSON.stringify({
          meta: { found: 0, returned: 0, limit: 3, page: 1 },
          data: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
    });
    const run = await service.runSymbols(["aapl", "tsla"]);

    assert.strictEqual(run.status, "OK");
    assert.ok(requestedParams?.includes("symbols=AAPL%2CTSLA"));
    assert.ok(requestedParams?.includes("must_have_entities=true"));

    const today = utcDay(new Date());
    const usage = await store.getUsage(today);
    assert.strictEqual(usage.requests, 1);
    assert.strictEqual(usage.symbolRequests, 1);
  });

  it("backfill: top-up por simbolo primero y luego caminata hacia atras con published_before y domains", async () => {
    const store = new InMemoryNewsStore();
    const requestedUrls: string[] = [];
    const now = new Date("2026-10-14T12:00:00Z");

    const mcdArticle: MarketauxArticle = {
      uuid: "mcd-1",
      title: "McDonalds resultados",
      url: "https://news.com/mcd",
      published_at: "2026-10-12T10:00:00Z",
      source: "reuters.com",
      entities: [
        {
          symbol: "MCD",
          match_score: 90,
          sentiment_score: 0.1,
          type: "equity",
        },
      ],
    };
    const aaplArticle: MarketauxArticle = {
      uuid: "aapl-1",
      title: "Apple novedades",
      url: "https://news.com/aapl",
      published_at: "2026-10-13T10:00:00Z",
      source: "bloomberg.com",
      entities: [
        {
          symbol: "AAPL",
          match_score: 90,
          sentiment_score: 0.3,
          type: "equity",
        },
      ],
    };
    const olderAaplArticle: MarketauxArticle = {
      uuid: "aapl-0",
      title: "Apple antigua",
      url: "https://news.com/aapl0",
      published_at: "2026-08-01T10:00:00Z",
      source: "cnbc.com",
      entities: [
        {
          symbol: "AAPL",
          match_score: 80,
          sentiment_score: -0.1,
          type: "equity",
        },
      ],
    };

    const responses: MarketauxArticle[][] = [
      [mcdArticle],
      [aaplArticle],
      [olderAaplArticle],
      [],
    ];
    let call = 0;
    const mockFetch = async (url: any) => {
      requestedUrls.push(url.toString());
      const data = responses[Math.min(call, responses.length - 1)]!;
      call++;
      return new Response(
        JSON.stringify({
          meta: {
            found: data.length,
            returned: data.length,
            limit: 3,
            page: 1,
          },
          data,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
      now: () => now,
      openPositionSymbols: async () => ["MCD", "AAPL"],
    });

    const run = await service.runBackfill();

    assert.strictEqual(run.status, "OK");
    assert.strictEqual(run.created, 3);
    assert.strictEqual(store.articles.size, 3);

    // 1) Top-up MCD: solo ese simbolo, sin published_before (lo mas reciente).
    assert.ok(requestedUrls[0]!.includes("symbols=MCD"));
    assert.ok(!requestedUrls[0]!.includes("published_before"));
    // 2) Top-up AAPL.
    assert.ok(requestedUrls[1]!.includes("symbols=AAPL"));
    assert.ok(!requestedUrls[1]!.includes("published_before"));
    // 3) Caminata: ambos simbolos + published_before (cursor) + domains preferidos.
    assert.ok(requestedUrls[2]!.includes("symbols=MCD%2CAAPL"));
    assert.ok(requestedUrls[2]!.includes("published_before="));
    assert.ok(
      requestedUrls[2]!.includes("domains=reuters.com%2Cbloomberg.com"),
    );
    // 4) Respuesta vacia → corta la caminata.
    assert.strictEqual(requestedUrls.length, 4);
  });

  it("backfill: no-op sin peticiones cuando la ventana de 90 dias ya esta cubierta", async () => {
    const store = new InMemoryNewsStore();
    const now = new Date("2026-10-14T12:00:00Z");
    const olderThanWindow = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);

    store.articles.set("aapl-old", {
      providerId: "aapl-old",
      title: "Apple historica",
      description: null,
      snippet: null,
      url: "https://news.com/aapl-old",
      imageUrl: null,
      source: "reuters.com",
      language: "en",
      publishedAt: olderThanWindow,
      category: "TECNOLOGIA",
      sentiment: null,
      symbols: [{ symbol: "AAPL", matchScore: 90, sentiment: null }],
      id: "id-aapl-old",
      viewCount: 0,
      favoriteCount: 0,
      createdAt: olderThanWindow,
      updatedAt: olderThanWindow,
    });

    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };
    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
      now: () => now,
      openPositionSymbols: async () => ["AAPL"],
    });

    const run = await service.runBackfill();

    // Cursor (min publishedAt) ya <= windowStart → corta antes del top-up tambien?
    // El top-up corre siempre (noticias nuevas pueden existir); la caminata no.
    assert.strictEqual(run.status, "OK");
    assert.strictEqual(fetchCalled, true); // solo top-up del simbolo
    assert.strictEqual(run.requests, 1);
    const today = utcDay(now);
    const usage = await store.getUsage(today);
    assert.strictEqual(usage.symbolRequests, 1);
  });

  it("backfill: corta sin peticiones cuando el sub-cupo de simbolos esta agotado", async () => {
    const store = new InMemoryNewsStore();
    const now = new Date("2026-10-14T12:00:00Z");
    const today = utcDay(now);
    store.usages.set(today.toISOString().slice(0, 10), {
      requests: 30,
      symbolRequests: 70,
    });

    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };
    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
      now: () => now,
      openPositionSymbols: async () => ["AAPL"],
    });

    const run = await service.runBackfill();
    assert.strictEqual(run.status, "SKIPPED_BUDGET");
    assert.strictEqual(fetchCalled, false);
    assert.strictEqual(run.requests, 0);
  });

  it("backfill: OK sin peticiones cuando no hay posiciones abiertas", async () => {
    const store = new InMemoryNewsStore();
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };
    const provider = new MarketauxProvider({
      apiKey: "valid-key",
      baseUrl: "https://api.marketaux.com",
      languages: ["es", "en"],
      pageLimit: 3,
      backoffMs: [10],
      fetchFn: mockFetch as any,
    });

    const service = new NewsSyncService({
      store,
      provider,
      config: baseConfig,
      openPositionSymbols: async () => [],
    });

    const run = await service.runBackfill();
    assert.strictEqual(run.status, "OK");
    assert.strictEqual(fetchCalled, false);
  });

  it("backfill: SKIPPED_DISABLED cuando NEWS_BACKFILL_ENABLED=false (backfillCron null)", async () => {
    const store = new InMemoryNewsStore();
    const service = new NewsSyncService({
      store,
      provider: null,
      config: { ...baseConfig, backfillCron: null },
      openPositionSymbols: async () => ["AAPL"],
    });

    const run = await service.runBackfill();
    assert.strictEqual(run.status, "SKIPPED_DISABLED");
  });
});
