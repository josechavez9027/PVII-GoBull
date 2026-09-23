import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

export type ForgotPasswordState = 'idle' | 'success' | 'not_found';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  template: `
    <div class="form-header">
      <h2 class="text-display">Recuperar contraseña</h2>
      <p class="text-body text-secondary">
        @if (state === 'idle') {
          Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
        } @else if (state === 'success') {
          Hemos procesado tu solicitud de restablecimiento.
        } @else if (state === 'not_found') {
          Verificación de cuenta en la base de datos de GoBull.
        }
      </p>
    </div>

    @if (state === 'idle') {
      <form class="auth-form" (submit)="onSubmit($event)">
        @if (errorMsg) {
          <div class="alert alert--danger" role="alert">
            <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clip-rule="evenodd"
              />
            </svg>
            <div class="alert-message">
              <span>{{ errorMsg }}</span>
            </div>
          </div>
        }

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
            autocomplete="email"
          />
        </div>

        <button type="submit" class="btn btn-primary btn-block" [disabled]="isLoading">
          @if (isLoading) {
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Verificando y enviando...</span>
          } @else {
            <span>Enviar enlace</span>
          }
        </button>
      </form>

      <div class="form-footer">
        <p class="text-body text-secondary">
          <a routerLink="/login" class="link-primary">Volver al inicio de sesión</a>
        </p>
      </div>
    }

    @if (state === 'success') {
      <div class="feedback-card feedback-card--success" role="status">
        <div class="feedback-card__header">
          <div class="feedback-icon feedback-icon--success" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <h3 class="feedback-title">Enlace enviado con éxito</h3>
        </div>

        <div class="feedback-body">
          <p class="feedback-message">
            El mensaje ha sido enviado, revisa tu correo para continuar el proceso.
          </p>
          <p class="feedback-detail">
            Hemos enviado las instrucciones a <strong>{{ submittedEmail }}</strong>. Si no lo ves en tu bandeja de entrada en los próximos minutos, revisa tu carpeta de correo no deseado (spam).
          </p>
        </div>

        <div class="feedback-actions">
          <a routerLink="/login" class="btn btn-primary btn-block">Volver al inicio de sesión</a>
          <button type="button" class="btn btn-secondary btn-block" (click)="resetState()">
            Reintentar con otro correo
          </button>
        </div>
      </div>
    }

    @if (state === 'not_found') {
      <div class="feedback-card feedback-card--danger" role="alert">
        <div class="feedback-card__header">
          <div class="feedback-icon feedback-icon--danger" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <h3 class="feedback-title text-danger">Correo no encontrado</h3>
        </div>

        <div class="feedback-body">
          <p class="feedback-message">
            No se ha encontrado el correo en la lista de usuarios.
          </p>
          <p class="feedback-detail">
            La dirección <strong>{{ submittedEmail }}</strong> no se encuentra registrada en la plataforma. Puedes registrarte ahora para crear tu cuenta y comenzar a operar.
          </p>
        </div>

        <div class="feedback-actions">
          <a
            routerLink="/register"
            [queryParams]="{ email: submittedEmail }"
            class="btn btn-primary btn-block"
          >
            Registrarse en GoBull
          </a>
          <button type="button" class="btn btn-secondary btn-block" (click)="resetState()">
            Intentar con otro correo
          </button>
        </div>

        <div class="feedback-footer">
          <a routerLink="/login" class="link-primary">Volver al inicio de sesión</a>
        </div>
      </div>
    }
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

      /* Alert inline */
      .alert {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        line-height: 1.45;
        margin-bottom: var(--space-4);
      }
      .alert--danger {
        background: #fdf2f2;
        border: 1px solid var(--border-state-danger);
        color: #9b1c1c;
      }
      .alert-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .alert-message {
        flex: 1;
      }

      /* Feedback cards (Success & Not Found) */
      .feedback-card {
        background-color: var(--bg-surface);
        border-radius: var(--radius-md);
        padding: var(--space-6);
        box-sizing: border-box;
        margin-bottom: var(--space-6);
        transition: all 0.2s ease-in-out;
      }
      .feedback-card--success {
        border: 1px solid var(--border-state-success);
        background: rgba(99, 168, 107, 0.05);
      }
      .feedback-card--danger {
        border: 1px solid var(--border-state-danger);
        background: rgba(215, 91, 97, 0.05);
      }

      .feedback-card__header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: var(--space-4);
      }

      .feedback-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .feedback-icon svg {
        width: 22px;
        height: 22px;
      }
      .feedback-icon--success {
        background: rgba(99, 168, 107, 0.15);
        color: var(--border-state-success);
      }
      .feedback-icon--danger {
        background: rgba(215, 91, 97, 0.15);
        color: var(--border-state-danger);
      }

      .feedback-title {
        font-family: 'Inter Tight', 'Inter', sans-serif;
        font-size: 18px;
        font-weight: 700;
        margin: 0;
        color: var(--text-primary);
      }
      .feedback-title.text-danger {
        color: var(--border-state-danger);
      }

      .feedback-body {
        margin-bottom: var(--space-6);
      }
      .feedback-message {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.5;
        margin: 0 0 var(--space-2) 0;
      }
      .feedback-detail {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.5;
        margin: 0;
      }
      .feedback-detail strong {
        color: var(--text-primary);
      }

      .feedback-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        width: 100%;
      }
      .feedback-actions .btn {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        margin: 0;
      }

      .feedback-footer {
        margin-top: var(--space-4);
        text-align: center;
        font-size: 13px;
      }

      .btn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.75s linear infinite;
        margin-right: 8px;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class ForgotPasswordComponent {
  authService = inject(AuthService);
  cd = inject(ChangeDetectorRef);

  email = '';
  submittedEmail = '';
  errorMsg = '';
  isLoading = false;
  state: ForgotPasswordState = 'idle';

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isLoading || !this.email) return;

    this.errorMsg = '';
    this.isLoading = true;
    this.submittedEmail = this.email.trim();
    this.cd.detectChanges();

    this.authService.forgotPassword(this.submittedEmail).subscribe({
      next: () => {
        this.isLoading = false;
        this.state = 'success';
        this.cd.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 404 || err.error?.notFound) {
          this.state = 'not_found';
        } else {
          this.state = 'idle';
          this.errorMsg = err.error?.message || 'Error al procesar la solicitud.';
        }
        this.cd.detectChanges();
      },
    });
  }

  resetState(): void {
    this.state = 'idle';
    this.errorMsg = '';
    this.cd.detectChanges();
  }
}
