import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NotificationsService,
  UserNotificationSettings,
} from '../../core/services/notifications.service';

@Component({
  selector: 'app-news-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './news-preferences.component.html',
  styleUrl: './news-preferences.component.css',
})
export class NewsPreferencesComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  isLoading = true;
  isSaving = false;
  isSubscribing = false;
  saveSuccess = false;
  errorMessage = '';

  pushEnabled = true;
  minScore = 70;
  maxPerDay = 5;

  pushPermission: NotificationPermission = 'default';

  constructor(public notificationsService: NotificationsService) {}

  ngOnInit(): void {
    this.pushPermission = this.notificationsService.pushPermission();
    this.loadSettings();
  }

  loadSettings(): void {
    this.isLoading = true;
    this.notificationsService.getSettings().subscribe({
      next: (res) => {
        this.pushEnabled = res.settings.pushEnabled;
        this.minScore = res.settings.minScore;
        this.maxPerDay = res.settings.maxPerDay;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'No se pudieron cargar las preferencias';
        this.isLoading = false;
      },
    });
  }

  async togglePushSubscription(): Promise<void> {
    this.isSubscribing = true;
    this.errorMessage = '';

    if (this.pushPermission === 'granted') {
      await this.notificationsService.revokePushSubscription();
      this.pushPermission = this.notificationsService.pushPermission();
    } else {
      const res = await this.notificationsService.requestPushSubscription();
      this.pushPermission = this.notificationsService.pushPermission();
      if (!res.success && res.error) {
        if (res.error === 'PERMISSION_DENIED') {
          this.errorMessage =
            'Permiso denegado. Permite las notificaciones en la barra de direcciones de tu navegador.';
        } else {
          this.errorMessage = 'No se pudo activar el servicio push en este navegador.';
        }
      }
    }
    this.isSubscribing = false;
  }

  save(): void {
    this.isSaving = true;
    this.saveSuccess = false;
    this.errorMessage = '';

    this.notificationsService
      .updateSettings({
        pushEnabled: this.pushEnabled,
        minScore: Number(this.minScore),
        maxPerDay: Number(this.maxPerDay),
      })
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.saveSuccess = true;
          setTimeout(() => {
            this.saveSuccess = false;
          }, 3000);
        },
        error: () => {
          this.isSaving = false;
          this.errorMessage = 'Ocurrió un error al guardar los cambios';
        },
      });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
