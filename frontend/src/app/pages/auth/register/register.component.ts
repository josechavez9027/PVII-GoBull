import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  template: `
    <div class="form-header">
      <h2 class="text-display">Crear cuenta</h2>
      <p class="text-body text-secondary">Regístrate para comenzar a utilizar GoBull.</p>
    </div>

    <form class="auth-form" (submit)="onSubmit($event)">
      <div *ngIf="errorMsg" class="error-msg" style="color: red; margin-bottom: 10px;">
        {{ errorMsg }}
      </div>

      <div class="form-group">
        <label for="name" class="form-label">Nombre completo</label>
        <input type="text" id="name" name="name" class="form-control" placeholder="Juan Pérez" required [(ngModel)]="name">
      </div>

      <div class="form-group">
        <label for="email" class="form-label">Correo electrónico</label>
        <input type="email" id="email" name="email" class="form-control" placeholder="nombre@ejemplo.com" required [(ngModel)]="email">
      </div>

      <div class="form-group">
        <label for="password" class="form-label">Contraseña</label>
        <input type="password" id="password" name="password" class="form-control" placeholder="Mínimo 8 caracteres" required [(ngModel)]="password">
      </div>

      <button type="submit" class="btn btn-primary btn-block">Registrar cuenta</button>
    </form>

    <div class="form-footer">
      <p class="text-body text-secondary">¿Ya tienes una cuenta? <a routerLink="/login" class="link-primary">Inicia sesión</a></p>
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
export class RegisterComponent {
  authService = inject(AuthService);
  router = inject(Router);

  name = '';
  email = '';
  password = '';
  errorMsg = '';

  onSubmit(event: Event) {
    event.preventDefault();
    this.errorMsg = '';

    this.authService.register({ name: this.name, email: this.email, password: this.password }).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Error al crear la cuenta';
        console.error(err);
      }
    });
  }
}
