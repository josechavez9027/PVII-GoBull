import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  template: `
    <div class="form-header">
      <h2 class="text-display">Iniciar sesión</h2>
      <p class="text-body text-secondary">Ingresa a tu cuenta para continuar operando.</p>
    </div>

    <form class="auth-form" (submit)="onSubmit($event)">
      <div *ngIf="errorMsg" class="error-msg" style="color: red; margin-bottom: 10px;">
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
        />
      </div>

      <div class="form-group">
        <div class="label-row">
          <label for="password" class="form-label">Contraseña</label>
          <a routerLink="/forgot-password" class="text-caption link-primary"
            >¿Olvidaste tu contraseña?</a
          >
        </div>
        <input
          type="password"
          id="password"
          name="password"
          class="form-control"
          placeholder="••••••••"
          required
          [(ngModel)]="password"
        />
      </div>

      <button type="submit" class="btn btn-primary btn-block">Ingresar a GoBull</button>
    </form>

    <div class="form-footer">
      <p class="text-body text-secondary">
        ¿No tienes una cuenta? <a routerLink="/register" class="link-primary">Regístrate</a>
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
      .label-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
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
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);

  email = '';
  password = '';
  errorMsg = '';

  onSubmit(event: Event) {
    event.preventDefault();
    this.errorMsg = '';

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Error al iniciar sesión';
        console.error(err);
      },
    });
  }
}
