import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authServiceSpy: any;

  beforeEach(async () => {
    authServiceSpy = {
      forgotPassword: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize in idle state with email input and submit button', () => {
    expect(component).toBeTruthy();
    expect(component.state).toBe('idle');
    const input = fixture.nativeElement.querySelector('input#email');
    const submitBtn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(input).toBeTruthy();
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.textContent).toContain('Enviar enlace');
  });

  it('should show success notification when email exists in database', () => {
    authServiceSpy.forgotPassword.mockReturnValue(
      of({ success: true, message: 'El mensaje ha sido enviado, revisa tu correo para continuar el proceso.' })
    );

    component.email = 'registered@gobull.com';
    const fakeEvent = new Event('submit');
    component.onSubmit(fakeEvent);
    fixture.detectChanges();

    expect(authServiceSpy.forgotPassword).toHaveBeenCalledWith('registered@gobull.com');
    expect(component.state).toBe('success');
    expect(component.submittedEmail).toBe('registered@gobull.com');

    const successCard = fixture.nativeElement.querySelector('.feedback-card--success');
    expect(successCard).toBeTruthy();
    expect(successCard.textContent).toContain('Enlace enviado con éxito');
    expect(successCard.textContent).toContain('El mensaje ha sido enviado, revisa tu correo para continuar el proceso.');
  });

  it('should show not found notification and registration option when email does not exist in database', () => {
    authServiceSpy.forgotPassword.mockReturnValue(
      throwError(() => ({
        status: 404,
        error: { success: false, notFound: true, message: 'No se ha encontrado el correo en la lista de usuarios.' },
      }))
    );

    component.email = 'unknown@gobull.com';
    const fakeEvent = new Event('submit');
    component.onSubmit(fakeEvent);
    fixture.detectChanges();

    expect(authServiceSpy.forgotPassword).toHaveBeenCalledWith('unknown@gobull.com');
    expect(component.state).toBe('not_found');
    expect(component.submittedEmail).toBe('unknown@gobull.com');

    const dangerCard = fixture.nativeElement.querySelector('.feedback-card--danger');
    expect(dangerCard).toBeTruthy();
    expect(dangerCard.textContent).toContain('Correo no encontrado');
    expect(dangerCard.textContent).toContain('No se ha encontrado el correo en la lista de usuarios.');

    const registerBtn = dangerCard.querySelector('a[href*="/register"]');
    expect(registerBtn).toBeTruthy();
    expect(registerBtn.textContent).toContain('Registrarse en GoBull');
  });

  it('should show inline alert error on non-404 API failure', () => {
    authServiceSpy.forgotPassword.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { message: 'Ingresa un correo electrónico válido' },
      }))
    );

    component.email = 'invalid-email';
    const fakeEvent = new Event('submit');
    component.onSubmit(fakeEvent);
    fixture.detectChanges();

    expect(component.state).toBe('idle');
    expect(component.errorMsg).toBe('Ingresa un correo electrónico válido');

    const alert = fixture.nativeElement.querySelector('.alert--danger');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Ingresa un correo electrónico válido');
  });

  it('should reset state back to idle on resetState()', () => {
    component.state = 'not_found';
    component.errorMsg = 'Error anterior';
    component.resetState();

    expect(component.state).toBe('idle');
    expect(component.errorMsg).toBe('');
  });
});
