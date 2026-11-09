import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegisterComponent } from './register';
import { AuthService } from '../../../services/auth.service';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        provideHttpClient()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  it('should create the register component', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form initially', () => {
    expect(component.registerForm.valid).toBe(false);
  });

  it('should validate minimum password length of 8 characters', () => {
    const passwordControl = component.registerForm.get('password');
    passwordControl?.setValue('1234567');
    expect(passwordControl?.valid).toBe(false);

    passwordControl?.setValue('12345678');
    expect(passwordControl?.valid).toBe(true);
  });

  it('should validate password match', () => {
    component.registerForm.patchValue({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'StrongPassword123',
      confirmPassword: 'DifferentPassword123',
      role: 'job_seeker'
    });

    expect(component.registerForm.hasError('passwordMismatch')).toBe(true);
    expect(component.registerForm.get('confirmPassword')?.hasError('passwordMismatch')).toBe(true);

    component.registerForm.patchValue({
      confirmPassword: 'StrongPassword123'
    });

    expect(component.registerForm.hasError('passwordMismatch')).toBe(false);
  });

  it('should default role to job_seeker', () => {
    expect(component.registerForm.get('role')?.value).toBe('job_seeker');
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);
  });

  it('should call authService.register and navigate on success', () => {
    const mockRes = {
      success: true,
      data: {
        user: {
          id: '2',
          name: 'Bob Recruiter',
          email: 'bob@company.com',
          role: 'recruiter' as const,
          isActive: true
        }
      }
    };

    vi.spyOn(authService, 'register').mockReturnValue(of(mockRes));
    const navSpy = vi.spyOn(router, 'navigateByUrl');

    component.registerForm.patchValue({
      name: 'Bob Recruiter',
      email: 'bob@company.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'recruiter'
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith({
      name: 'Bob Recruiter',
      email: 'bob@company.com',
      password: 'Password123!',
      role: 'recruiter'
    });
    expect(navSpy).toHaveBeenCalledWith('/recruiter/dashboard');
  });

  it('should set error message when email is duplicate', () => {
    vi.spyOn(authService, 'register').mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { message: 'An account with this email address already exists.' }
      }))
    );

    component.registerForm.patchValue({
      name: 'Duplicate User',
      email: 'existing@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'job_seeker'
    });

    component.onSubmit();

    expect(component.errorMessage()).toBe('An account with this email address already exists.');
    expect(component.isLoading()).toBe(false);
  });
});
