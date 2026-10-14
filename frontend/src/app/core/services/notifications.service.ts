import { Injectable, Inject, Optional, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, tap, catchError } from 'rxjs';
import { SwPush } from '@angular/service-worker';

export interface NotificationItem {
  id: string;
  articleId: string;
  title: string;
  snippet: string | null;
  imageUrl: string | null;
  category: string;
  url: string;
  publishedAt: string;
  score: number;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

export interface UserNotificationSettings {
  pushEnabled: boolean;
  minScore: number;
  maxPerDay: number;
  publicKey: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private readonly baseUrl = 'http://localhost:3000/api/v1/notifications';
  private readonly isBrowser: boolean;

  readonly unreadCount = signal<number>(0);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly pushPermission = signal<NotificationPermission>('default');
  readonly isSubscribedToPush = signal<boolean>(false);

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
    @Optional() private readonly swPush?: SwPush,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser && 'Notification' in window) {
      this.pushPermission.set(Notification.permission);
    }
  }

  loadUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/unread-count`).pipe(
      tap((res) => {
        this.unreadCount.set(res.count);
      }),
      catchError(() => of({ count: 0 })),
    );
  }

  loadNotifications(limit = 20, offset = 0): Observable<NotificationsResponse> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http
      .get<NotificationsResponse>(`${this.baseUrl}?limit=${limit}&offset=${offset}`)
      .pipe(
        tap((res) => {
          this.notifications.set(res.items);
          this.unreadCount.set(res.unreadCount);
          this.isLoading.set(false);
        }),
        catchError((err) => {
          this.error.set('No se pudieron cargar las notificaciones');
          this.isLoading.set(false);
          return of({ items: [], total: 0, unreadCount: 0 });
        }),
      );
  }

  markAsRead(id: string): Observable<{ notification: NotificationItem }> {
    return this.http.post<{ notification: NotificationItem }>(`${this.baseUrl}/${id}/read`, {}).pipe(
      tap((res) => {
        // Actualizar el estado local
        this.notifications.update((items) =>
          items.map((item) => (item.id === id ? { ...item, status: 'READ', readAt: new Date().toISOString() } : item)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      }),
    );
  }

  markAllAsRead(): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.baseUrl}/read-all`, {}).pipe(
      tap(() => {
        this.notifications.update((items) =>
          items.map((item) => ({ ...item, status: 'READ', readAt: new Date().toISOString() })),
        );
        this.unreadCount.set(0);
      }),
    );
  }

  getSettings(): Observable<{ settings: UserNotificationSettings }> {
    return this.http.get<{ settings: UserNotificationSettings }>(`${this.baseUrl}/settings`);
  }

  updateSettings(data: {
    pushEnabled?: boolean;
    minScore?: number;
    maxPerDay?: number;
  }): Observable<{ settings: UserNotificationSettings }> {
    return this.http.put<{ settings: UserNotificationSettings }>(`${this.baseUrl}/settings`, data);
  }

  async requestPushSubscription(): Promise<{ success: boolean; error?: string }> {
    if (!this.isBrowser) {
      return { success: false, error: 'NOT_BROWSER' };
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { success: false, error: 'PUSH_NOT_SUPPORTED' };
    }

    try {
      const permission = await Notification.requestPermission();
      this.pushPermission.set(permission);

      if (permission !== 'granted') {
        return { success: false, error: 'PERMISSION_DENIED' };
      }

      // Obtener llave pública del backend
      const settingsRes = await this.getSettings().toPromise();
      const serverPublicKey = settingsRes?.settings?.publicKey;

      if (!serverPublicKey) {
        return { success: false, error: 'MISSING_PUBLIC_KEY' };
      }

      let subJson: PushSubscriptionJSON | null = null;

      // Intentar suscripción con SwPush si está activo o con navigator.serviceWorker
      if (this.swPush?.isEnabled) {
        const sub = await this.swPush.requestSubscription({
          serverPublicKey,
        });
        subJson = sub.toJSON();
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(serverPublicKey) as unknown as BufferSource,
        });
        subJson = sub.toJSON();
      }

      const keys = subJson?.keys as Record<string, string> | undefined;
      const p256dh = keys?.['p256dh'];
      const auth = keys?.['auth'];

      if (!subJson?.endpoint || !p256dh || !auth) {
        return { success: false, error: 'INVALID_SUBSCRIPTION_DATA' };
      }

      await this.http
        .post(`${this.baseUrl}/push-subscription`, {
          endpoint: subJson.endpoint,
          keys: {
            p256dh,
            auth,
          },
        })
        .toPromise();

      this.isSubscribedToPush.set(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'SUBSCRIPTION_ERROR' };
    }
  }

  async revokePushSubscription(): Promise<{ success: boolean }> {
    if (!this.isBrowser) {
      return { success: false };
    }

    try {
      if (this.swPush?.isEnabled) {
        await this.swPush.unsubscribe();
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      }

      await this.http.delete(`${this.baseUrl}/push-subscription`).toPromise();
      this.isSubscribedToPush.set(false);
      return { success: true };
    } catch {
      return { success: false };
    }
  }
}
