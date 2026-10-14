import {
  Component,
  OnInit,
  HostListener,
  ElementRef,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  NotificationsService,
  NotificationItem,
} from '../../core/services/notifications.service';
import { NewsPreferencesComponent } from './news-preferences.component';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, NewsPreferencesComponent],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css',
})
export class NotificationBellComponent implements OnInit {
  isOpen = false;
  showPreferences = false;
  private isBrowser: boolean;

  constructor(
    public notificationsService: NotificationsService,
    private router: Router,
    private hostElement: ElementRef,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.notificationsService.loadUnreadCount().subscribe();
    }
  }

  toggleTray(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.notificationsService.loadNotifications().subscribe();
    }
  }

  closeTray(): void {
    this.isOpen = false;
  }

  openSettings(): void {
    this.isOpen = false;
    this.showPreferences = true;
  }

  closeSettings(): void {
    this.showPreferences = false;
  }

  markAllAsRead(): void {
    this.notificationsService.markAllAsRead().subscribe();
  }

  markAsRead(item: NotificationItem, event: MouseEvent): void {
    event.stopPropagation();
    if (item.status !== 'READ') {
      this.notificationsService.markAsRead(item.id).subscribe();
    }
  }

  onSelectNotification(item: NotificationItem): void {
    if (item.status !== 'READ') {
      this.notificationsService.markAsRead(item.id).subscribe();
    }
    this.isOpen = false;
    this.router.navigate(['/noticias', item.articleId]);
  }

  enablePush(): void {
    this.notificationsService.requestPushSubscription();
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMinutes < 1) return 'Ahora mismo';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen) {
      const container = this.hostElement.nativeElement;
      if (container && !container.contains(event.target as Node)) {
        this.isOpen = false;
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.isOpen = false;
    }
    if (this.showPreferences) {
      this.showPreferences = false;
    }
  }
}
