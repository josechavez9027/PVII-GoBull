import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationsService, NotificationItem } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let httpTesting: HttpTestingController;

  const mockItem: NotificationItem = {
    id: 'n-1',
    articleId: 'art-1',
    title: 'Apple presenta nuevos chips M4',
    snippet: 'La compañía de Cupertino revela...',
    imageUrl: null,
    category: 'TECNOLOGIA',
    url: 'https://example.com/apple',
    publishedAt: '2026-10-05T10:00:00Z',
    score: 85,
    status: 'SENT',
    sentAt: '2026-10-05T10:05:00Z',
    readAt: null,
    createdAt: '2026-10-05T10:05:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationsService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(NotificationsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should fetch unread count and update signal', () => {
    service.loadUnreadCount().subscribe((res) => {
      expect(res.count).toBe(3);
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 3 });

    expect(service.unreadCount()).toBe(3);
  });

  it('should fetch notifications list and update signals', () => {
    service.loadNotifications().subscribe((res) => {
      expect(res.items.length).toBe(1);
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/notifications?limit=20&offset=0');
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [mockItem],
      total: 1,
      unreadCount: 1,
    });

    expect(service.notifications().length).toBe(1);
    expect(service.unreadCount()).toBe(1);
    expect(service.isLoading()).toBe(false);
  });

  it('should mark an item as read and decrement unreadCount signal', () => {
    service.notifications.set([mockItem]);
    service.unreadCount.set(1);

    service.markAsRead('n-1').subscribe();

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/notifications/n-1/read');
    expect(req.request.method).toBe('POST');
    req.flush({
      notification: { ...mockItem, status: 'READ', readAt: '2026-10-05T12:00:00Z' },
    });

    expect(service.notifications()[0]?.status).toBe('READ');
    expect(service.unreadCount()).toBe(0);
  });

  it('should mark all items as read and reset unreadCount to 0', () => {
    service.notifications.set([mockItem]);
    service.unreadCount.set(5);

    service.markAllAsRead().subscribe();

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/notifications/read-all');
    expect(req.request.method).toBe('POST');
    req.flush({ updated: 5 });

    expect(service.notifications()[0]?.status).toBe('READ');
    expect(service.unreadCount()).toBe(0);
  });

  it('should fetch and update settings', () => {
    service.getSettings().subscribe((res) => {
      expect(res.settings.minScore).toBe(70);
    });

    const getReq = httpTesting.expectOne('http://localhost:3000/api/v1/notifications/settings');
    expect(getReq.request.method).toBe('GET');
    getReq.flush({
      settings: {
        pushEnabled: true,
        minScore: 70,
        maxPerDay: 5,
        publicKey: 'KEY',
      },
    });

    service.updateSettings({ minScore: 80 }).subscribe((res) => {
      expect(res.settings.minScore).toBe(80);
    });

    const putReq = httpTesting.expectOne('http://localhost:3000/api/v1/notifications/settings');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ minScore: 80 });
    putReq.flush({
      settings: {
        pushEnabled: true,
        minScore: 80,
        maxPerDay: 5,
        publicKey: 'KEY',
      },
    });
  });
});
