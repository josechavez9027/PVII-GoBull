import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-container">
      <div class="auth-content">
        <div class="auth-form-area">
          <div class="auth-form-wrapper">
            <h1 class="brand-text auth-logo">Go<span class="logo-accent">Bull</span></h1>
            <router-outlet></router-outlet>
          </div>
        </div>
        <div class="auth-identity-panel">
          <div class="identity-content">
            <h2 class="identity-title">Precisión y control para tus decisiones.</h2>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-container {
        min-height: 100vh;
        display: flex;
        background-color: var(--bg-canvas, #f5f7f9);
      }
      .auth-content {
        display: flex;
        width: 100%;
        min-height: 100vh;
      }
      .auth-form-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: var(--space-8, 32px);
        background-color: var(--bg-surface, #ffffff);
      }
      .auth-form-wrapper {
        max-width: 400px;
        margin: 0 auto;
        width: 100%;
      }
      .auth-logo {
        font-size: 24px;
        color: var(--border-primary, #087dc9);
        margin-bottom: var(--space-12, 48px);
      }
      .auth-logo .logo-accent {
        color: var(--brand-bull, #3ab576);
      }
      .auth-identity-panel {
        flex: 1.1;
        background: #074773 url('/bg-1.png') no-repeat center center;
        background-size: cover;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        padding: clamp(40px, 6vw, 72px);
        color: #ffffff;
        position: relative;
      }
      .identity-content {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        max-width: 440px;
        width: 100%;
      }
      .identity-title {
        color: #ffffff;
        font-size: clamp(26px, 2.6vw, 34px);
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: -0.5px;
        margin: 0;
        max-width: 380px;
      }
      @media (max-width: 1023px) {
        .auth-identity-panel {
          display: none;
        }
        .auth-form-area {
          background-color: var(--bg-canvas, #f5f7f9);
        }
        .auth-form-wrapper {
          background-color: var(--bg-surface, #ffffff);
          padding: var(--space-8, 32px);
          border-radius: var(--radius-md, 10px);
          border: 1px solid var(--border-subtle, #e3e9ed);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
        }
      }
    `,
  ],
})
export class AuthLayoutComponent {}
