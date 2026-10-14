import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationsService, NotificationItem } from '../../core/services/notifications.service';

describe('NotificationBellComponent', () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;
  let notificationsService: NotificationsService;
  let router: Router;

  const sampleNotif: NotificationItem = {
    id: 'n-1',
    articleId: 'art-123',
    title: 'Noticia Importante',
    snippet: 'Snippet de prueba',
    imageUrl: null,
    category: 'MERCADOS',
    url: 'https://example.com',
    publishedAt: new Date().toISOString(),
    score: 90,
    status: 'SENT',
    sentAt: new Date().toISOString(),
    readAt: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        NotificationsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    notificationsService = TestBed.inject(NotificationsService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(async () => true);
    fixture.detectChanges();
  });

  it('should initialize closed and load unread count', () => {
    expect(component.isOpen).toBe(false);
    expect(component.showPreferences).toBe(false);
  });

  it('should toggle tray on toggleTray and load notifications when opening', () => {
    const loadSpy = vi.spyOn(notificationsService, 'loadNotifications').mockReturnValue(
      of({ items: [sampleNotif], total: 1, unreadCount: 1 }),
    );

    component.toggleTray();
    expect(component.isOpen).toBe(true);
    expect(loadSpy).toHaveBeenCalled();

    component.toggleTray();
    expect(component.isOpen).toBe(false);
  });

  it('should navigate to article and mark as read when notification item is clicked', () => {
    const markSpy = vi.spyOn(notificationsService, 'markAsRead').mockReturnValue(
      of({ notification: { ...sampleNotif, status: 'READ' } }),
    );

    component.isOpen = true;
    component.onSelectNotification(sampleNotif);

    expect(markSpy).toHaveBeenCalledWith('n-1');
    expect(component.isOpen).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/noticias', 'art-123']);
  });

  it('should close tray on Escape key', () => {
    component.isOpen = true;
    component.onEscape();
    expect(component.isOpen).toBe(false);
  });

  it('should open and close preferences modal', () => {
    component.openSettings();
    expect(component.isOpen).toBe(false);
    expect(component.showPreferences).toBe(true);

    component.closeSettings();
    expect(component.showPreferences).toBe(false);
  });
});
