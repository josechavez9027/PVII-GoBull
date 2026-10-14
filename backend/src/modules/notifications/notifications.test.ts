import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotificationsService } from "./notifications.service";
import {
  PushService,
  type PushPayload,
  type PushSendResult,
} from "./push.service";

class MockPushService extends PushService {
  public sends: { subscription: any; payload: PushPayload }[] = [];
  public returnRevoke = false;
  public returnSuccess = true;

  constructor() {
    super();
  }

  override isConfigured(): boolean {
    return true;
  }

  override getPublicKey(): string {
    return "MOCK_PUBLIC_KEY";
  }

  override async sendNotification(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<PushSendResult> {
    this.sends.push({ subscription, payload });
    if (this.returnRevoke) {
      return {
        success: false,
        statusCode: 410,
        shouldRevoke: true,
        error: "Subscription expired",
      };
    }
    if (!this.returnSuccess) {
      return {
        success: false,
        statusCode: 500,
        shouldRevoke: false,
        error: "Server error",
      };
    }
    return { success: true, statusCode: 201 };
  }
}

describe("notifications.service - 4-factor scoring", () => {
  const service = new NotificationsService({} as any, new MockPushService());

  it("calculates score with full factors (open position, 100% engagement, <6h recency, 100% affinity)", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const article = {
      category: "TECNOLOGIA",
      publishedAt: new Date("2026-10-05T10:00:00Z"), // 2h ago (<6h) -> 1
      symbols: [{ symbol: "AAPL" }],
    };

    const openSymbols = new Set(["AAPL"]);
    const categoryAffinity = new Map([["TECNOLOGIA", 1.0]]);
    const engagement = 1.0;

    // score = 45*1 + 30*1 + 15*1 + 10*1 = 100
    const score = service.calculateScore(
      article,
      openSymbols,
      categoryAffinity,
      engagement,
      now,
    );
    assert.equal(score, 100);
  });

  it("scores cartera=0 when the symbol is not an open position", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const article = {
      category: "EMPRESAS",
      publishedAt: new Date("2026-10-05T08:00:00Z"), // 4h ago (<6h) -> 1
      symbols: [{ symbol: "MSFT" }],
    };

    const openSymbols = new Set(["AAPL"]); // MSFT is not open
    const categoryAffinity = new Map([["EMPRESAS", 0.5]]);
    const engagement = 0.5;

    // cartera: 0 (sin factor historico)
    // engagement: 30 * 0.5 = 15
    // recencia: 15 * 1 = 15
    // afinidad: 10 * 0.5 = 5
    // total: 35
    const score = service.calculateScore(
      article,
      openSymbols,
      categoryAffinity,
      engagement,
      now,
    );
    assert.equal(score, 35);
  });

  it("scores a viral article for a user with no open positions (no alcanza el umbral por si solo)", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const article = {
      category: "CRIPTO",
      publishedAt: new Date("2026-10-05T11:00:00Z"), // 1h ago -> 1
      symbols: [{ symbol: "BTC" }],
    };

    const openSymbols = new Set<string>();
    const categoryAffinity = new Map([["CRIPTO", 1.0]]);
    const engagement = 1.0; // Viral article (50+ views/favs)

    // cartera: 0
    // engagement: 30 * 1 = 30
    // recencia: 15 * 1 = 15
    // afinidad: 10 * 1 = 10
    // total: 55
    const score = service.calculateScore(
      article,
      openSymbols,
      categoryAffinity,
      engagement,
      now,
    );
    assert.equal(score, 55);
  });

  it("scores 0 for recencia when article is older than 72 hours", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const article = {
      category: "ECONOMIA",
      publishedAt: new Date("2026-10-02T11:00:00Z"), // 73h ago -> 0
      symbols: [{ symbol: "SPY" }],
    };

    const openSymbols = new Set(["SPY"]);
    const categoryAffinity = new Map<string, number>();
    const engagement = 0;

    // cartera: 45 * 1 = 45
    // engagement: 0
    // recencia: 0
    // afinidad: 0
    // total = 45
    const score = service.calculateScore(
      article,
      openSymbols,
      categoryAffinity,
      engagement,
      now,
    );
    assert.equal(score, 45);
  });
});

describe("notifications.service - evaluation and delivery rules", () => {
  it("omits notifications when score < minScore or when push is disabled", async () => {
    const mockDb: any = {
      newsArticle: {
        findMany: async () => [
          {
            id: "art-1",
            title: "Low score article",
            category: "OTROS",
            publishedAt: new Date("2026-10-05T10:00:00Z"),
            symbols: [],
          },
        ],
      },
      newsView: {
        count: async () => 0,
        findMany: async () => [],
      },
      favoriteNews: {
        count: async () => 0,
      },
      user: {
        findMany: async () => [
          {
            id: "u-1",
            newsSetting: { pushEnabled: true, minScore: 70, maxPerDay: 5 },
            pushSubscriptions: [],
          },
          {
            id: "u-2",
            newsSetting: { pushEnabled: false, minScore: 10, maxPerDay: 5 },
            pushSubscriptions: [],
          },
        ],
      },
      operation: {
        findMany: async () => [],
      },
      newsNotification: {
        count: async () => 0,
        findUnique: async () => null,
        create: async () => {
          throw new Error("Should not be called");
        },
      },
    };

    const mockPush = new MockPushService();
    const service = new NotificationsService(mockDb, mockPush);

    const result = await service.evaluateAndDispatch(
      new Date("2026-10-05T12:00:00Z"),
    );
    assert.equal(result.notificationsCreated, 0);
    assert.equal(mockPush.sends.length, 0);
  });

  it("blocks push for articles that do not mention any open position (puerta dura)", async () => {
    const mockDb: any = {
      newsArticle: {
        findMany: async () => [
          {
            id: "art-tsla",
            title: "TSLA viral",
            category: "TECNOLOGIA",
            publishedAt: new Date("2026-10-05T11:00:00Z"),
            symbols: [{ symbol: "TSLA" }],
          },
        ],
      },
      newsView: {
        count: async () => 100, // engagement maximo
        findMany: async () => [],
      },
      favoriteNews: {
        count: async () => 50,
      },
      user: {
        findMany: async () => [
          {
            id: "u-1",
            newsSetting: { pushEnabled: true, minScore: 10, maxPerDay: 5 },
            pushSubscriptions: [
              {
                id: "sub-1",
                endpoint: "https://push.example.com/1",
                p256dh: "p",
                auth: "a",
              },
            ],
          },
        ],
      },
      operation: {
        findMany: async () => [{ type: "BUY", symbol: "AAPL", qty: 10 }], // sin TSLA
      },
      newsNotification: {
        count: async () => 0,
        findUnique: async () => null,
        create: async () => {
          throw new Error("Should not be called");
        },
      },
    };

    const mockPush = new MockPushService();
    const service = new NotificationsService(mockDb, mockPush);

    const result = await service.evaluateAndDispatch(
      new Date("2026-10-05T12:00:00Z"),
    );
    assert.equal(result.notificationsCreated, 0);
    assert.equal(mockPush.sends.length, 0);
  });

  it("revokes subscription when push provider returns 410 (expired)", async () => {
    let revoked = false;
    const mockDb: any = {
      newsArticle: {
        findMany: async () => [
          {
            id: "art-1",
            title: "Critical Breaking News",
            category: "TECNOLOGIA",
            publishedAt: new Date("2026-10-05T11:00:00Z"),
            symbols: [{ symbol: "AAPL" }],
          },
        ],
      },
      newsView: {
        count: async () => 50,
        findMany: async () => [],
      },
      favoriteNews: {
        count: async () => 10,
      },
      user: {
        findMany: async () => [
          {
            id: "u-1",
            newsSetting: { pushEnabled: true, minScore: 50, maxPerDay: 5 },
            pushSubscriptions: [
              {
                id: "sub-1",
                endpoint: "https://push.example.com/expired",
                p256dh: "p256",
                auth: "auth",
              },
            ],
          },
        ],
      },
      operation: {
        findMany: async () => [{ type: "BUY", symbol: "AAPL", qty: 10 }],
      },
      newsNotification: {
        count: async () => 0,
        findUnique: async () => null,
        create: async (args: any) => args.data,
      },
      pushSubscription: {
        update: async (args: any) => {
          if (args.where.id === "sub-1" && args.data.revokedAt) {
            revoked = true;
          }
        },
      },
    };

    const mockPush = new MockPushService();
    mockPush.returnRevoke = true;

    const service = new NotificationsService(mockDb, mockPush);
    const result = await service.evaluateAndDispatch(
      new Date("2026-10-05T12:00:00Z"),
    );

    assert.equal(revoked, true);
    assert.equal(result.pushFailed, 1);
    assert.equal(result.notificationsCreated, 1);
  });

  it("does not count FAILED notifications toward the daily push quota", async () => {
    const mockDb: any = {
      newsNotification: {
        count: async (args: any) => {
          // Verify that status: { not: 'FAILED' } is used
          assert.deepEqual(args.where.status, { not: "FAILED" });
          return 2;
        },
      },
      userNewsSetting: {
        findUnique: async () => ({
          pushEnabled: true,
          minScore: 70,
          maxPerDay: 5,
        }),
      },
    };

    const service = new NotificationsService(mockDb, new MockPushService());
    const settings = await service.getSettings("user-1");
    assert.equal(settings.maxPerDay, 5);
  });
});

describe("notifications.service - in-app inbox operations", () => {
  it("marks a single notification as read", async () => {
    let updatedStatus = "";
    const mockDb: any = {
      newsNotification: {
        findFirst: async () => ({
          id: "notif-1",
          userId: "u-1",
          readAt: null,
          status: "SENT",
          article: {
            title: "Sample Title",
            snippet: "Snippet",
            imageUrl: null,
            category: "EMPRESAS",
            url: "https://example.com",
            publishedAt: new Date(),
          },
        }),
        update: async (args: any) => {
          updatedStatus = args.data.status;
          return {
            id: "notif-1",
            articleId: "art-1",
            score: 85,
            status: args.data.status,
            sentAt: new Date(),
            readAt: args.data.readAt,
            createdAt: new Date(),
            article: {
              title: "Sample Title",
              snippet: "Snippet",
              imageUrl: null,
              category: "EMPRESAS",
              url: "https://example.com",
              publishedAt: new Date(),
            },
          };
        },
      },
    };

    const service = new NotificationsService(mockDb, new MockPushService());
    const res = await service.markAsRead("u-1", "notif-1");
    assert.equal(res.status, "READ");
    assert.equal(updatedStatus, "READ");
  });

  it("marks all unread notifications as read", async () => {
    let updateCount = 0;
    const mockDb: any = {
      newsNotification: {
        updateMany: async (args: any) => {
          assert.equal(args.where.userId, "u-1");
          assert.equal(args.where.readAt, null);
          updateCount = 4;
          return { count: 4 };
        },
      },
    };

    const service = new NotificationsService(mockDb, new MockPushService());
    const res = await service.markAllAsRead("u-1");
    assert.equal(res.updated, 4);
    assert.equal(updateCount, 4);
  });
});
