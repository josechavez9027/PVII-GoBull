import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  template: `
    <div class="form-header">
      <h2 class="text-display">Recuperar contraseña</h2>
      <p class="text-body text-secondary">
        Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
      </p>
    </div>

    <form class="auth-form" (submit)="onSubmit($event)">
      <div
        *ngIf="errorMsg"
        class="error-msg"
        style="color: var(--state-danger, red); margin-bottom: 10px;"
      >
        {{ errorMsg }}
      </div>

      <div class="form-group">
        <label for="email" class="form-label">Correo electrónico</label>
        <input
          type="email"
          id="email"
          name="email"
          class="form-control"
          placeholder="nombre@ejemplo.com"
          required
          [(ngModel)]="email"
          [disabled]="isLoading"
        />
      </div>

      <button type="submit" class="btn btn-primary btn-block" [disabled]="isLoading">
        Enviar enlace
      </button>
    </form>

    <div class="form-footer">
      <p class="text-body text-secondary">
        <a routerLink="/login" class="link-primary">Volver al inicio de sesión</a>
      </p>
    </div>
  `,
  styles: [
    `
      .form-header {
        margin-bottom: var(--space-8);
      }
      .form-header h2 {
        margin-bottom: var(--space-2);
        color: var(--text-primary);
      }
      .text-secondary {
        color: var(--text-secondary);
      }
      .auth-form {
        margin-bottom: var(--space-8);
      }
      .link-primary {
        color: var(--border-accent-blue);
        text-decoration: none;
        font-weight: 500;
      }
      .link-primary:hover {
        text-decoration: underline;
      }
      .form-footer {
        text-align: center;
      }
    `,
  ],
})
export class ForgotPasswordComponent {
  authService = inject(AuthService);

  email = '';
  errorMsg = '';
  isLoading = false;

  onSubmit(event: Event) {
    event.preventDefault();
    if (this.isLoading) return;

    this.errorMsg = '';
    this.isLoading = true;

    this.authService.forgotPassword(this.email).subscribe({
      next: (res) => {
        this.isLoading = false;
        alert('Mensaje enviado');
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err.error?.message || 'Error al procesar la solicitud.';
      },
    });
  }
}
