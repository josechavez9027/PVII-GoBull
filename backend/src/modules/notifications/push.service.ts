import webpush from "web-push";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  success: boolean;
  statusCode?: number;
  shouldRevoke?: boolean;
  error?: string;
}

export class PushService {
  private configured = false;
  private publicKey: string;
  private privateKey: string;
  private subject: string;

  constructor() {
    this.publicKey = process.env.VAPID_PUBLIC_KEY || "";
    this.privateKey = process.env.VAPID_PRIVATE_KEY || "";
    this.subject = process.env.VAPID_SUBJECT || "mailto:contacto@gobull.local";

    if (this.publicKey && this.privateKey) {
      try {
        webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
        this.configured = true;
      } catch (err: any) {
        console.warn(
          "[push.service] Failed to set VAPID details:",
          err?.message || err,
        );
      }
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async sendNotification(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<PushSendResult> {
    if (!this.configured) {
      return {
        success: false,
        error: "VAPID_NOT_CONFIGURED",
      };
    }

    const pushSubscription: webpush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      icon: payload.icon || "/favicon.ico",
      data: {
        url: payload.url,
        ...(payload.data || {}),
      },
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/favicon.ico",
        data: {
          url: payload.url,
          onActionClick: {
            default: { operation: "openWindow", url: payload.url },
          },
          ...(payload.data || {}),
        },
      },
    });

    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        payloadString,
      );
      return {
        success: true,
        statusCode: response.statusCode,
      };
    } catch (err: any) {
      const statusCode = err?.statusCode || err?.status;
      const shouldRevoke = statusCode === 404 || statusCode === 410;

      return {
        success: false,
        statusCode,
        shouldRevoke,
        error: err?.message || "PUSH_SEND_FAILED",
      };
    }
  }
}

export const pushService = new PushService();
