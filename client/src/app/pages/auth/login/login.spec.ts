import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginComponent } from './login';
import { AuthService } from '../../../services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  it('should create the login component', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form when empty', () => {
    expect(component.loginForm.valid).toBe(false);
  });

  it('should validate email format', () => {
    const emailControl = component.loginForm.get('email');
    emailControl?.setValue('invalid-email');
    expect(emailControl?.valid).toBe(false);

    emailControl?.setValue('valid@example.com');
    expect(emailControl?.valid).toBe(true);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(false);
  });

  it('should not call authService.login if form is invalid', () => {
    const loginSpy = vi.spyOn(authService, 'login');
    component.onSubmit();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('should call authService.login and navigate on success', () => {
    const mockRes = {
      success: true,
      data: {
        user: {
          id: '1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'job_seeker' as const,
          isActive: true
        }
      }
    };

    vi.spyOn(authService, 'login').mockReturnValue(of(mockRes));
    const navSpy = vi.spyOn(router, 'navigateByUrl');

    component.loginForm.patchValue({
      email: 'jane@example.com',
      password: 'password123'
    });

    component.onSubmit();

    expect(authService.login).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'password123'
    });
    expect(navSpy).toHaveBeenCalledWith('/seeker/dashboard');
  });

  it('should set errorMessage on login error', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      throwError(() => ({
        error: { message: 'Invalid credentials' }
      }))
    );

    component.loginForm.patchValue({
      email: 'wrong@example.com',
      password: 'wrongpassword'
    });

    component.onSubmit();

    expect(component.errorMessage()).toBe('Invalid credentials');
    expect(component.isLoading()).toBe(false);
  });
});
