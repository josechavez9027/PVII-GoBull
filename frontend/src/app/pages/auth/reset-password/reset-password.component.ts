import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  template: `
    <div class="form-header">
      <h2 class="text-display">Nueva contraseña</h2>
      <p class="text-body text-secondary">Crea una nueva contraseña segura para tu cuenta.</p>
    </div>

    <form class="auth-form" (submit)="onSubmit($event)" *ngIf="!successMsg">
      <div *ngIf="errorMsg" class="error-msg" style="color: var(--state-danger, red); margin-bottom: 10px;">
        {{ errorMsg }}
      </div>

      <div class="form-group">
        <label for="password" class="form-label">Nueva contraseña</label>
        <input type="password" id="password" name="password" class="form-control" placeholder="Mínimo 6 caracteres" required [(ngModel)]="newPassword" [disabled]="isLoading">
      </div>

      <button type="submit" class="btn btn-primary btn-block" [disabled]="isLoading">
        {{ isLoading ? 'Guardando...' : 'Guardar contraseña' }}
      </button>
    </form>

    <div *ngIf="successMsg" style="color: var(--state-success, green); margin-bottom: 20px; text-align: center; padding: 15px; border: 1px solid var(--state-success, green); border-radius: 4px;">
      {{ successMsg }}
      <p style="margin-top: 10px; font-size: 14px;">Redirigiendo al inicio de sesión...</p>
    </div>

    <div class="form-footer" *ngIf="successMsg">
      <p class="text-body text-secondary">
        <a routerLink="/login" class="link-primary">Ir a iniciar sesión manualmente</a>
      </p>
    </div>
  `,
  styles: [`
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
  `]
})
export class ResetPasswordComponent implements OnInit {
  authService = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);

  token = '';
  newPassword = '';
  errorMsg = '';
  successMsg = '';
  isLoading = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
      if (!this.token) {
        this.errorMsg = 'No se encontró un token válido en el enlace.';
      }
    });
  }

  onSubmit(event: Event) {
    event.preventDefault();
    if (this.isLoading) return;
    
    this.errorMsg = '';
    this.successMsg = '';

    if (!this.token) {
      this.errorMsg = 'Enlace de recuperación inválido o token faltante.';
      return;
    }

    this.isLoading = true;

    this.authService.resetPassword({ token: this.token, newPassword: this.newPassword }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMsg = res.message || 'Contraseña actualizada correctamente.';
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err.error?.message || 'Error al restablecer la contraseña.';
      }
    });
  }
}
