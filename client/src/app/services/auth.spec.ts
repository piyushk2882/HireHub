import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { User, AuthResponse } from '../models/user.model';

@Component({ template: '' })
class DummyComponent {}

describe('AuthService (Cookie-Only Authentication)', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  const mockUser: User = {
    id: 'user123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'job_seeker',
    isActive: true,
    createdAt: '2026-11-06T00:00:00.000Z'
  };

  const mockAuthResponse: AuthResponse = {
    success: true,
    data: {
      user: mockUser
    },
    message: 'Authentication successful'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'auth/login', component: DummyComponent },
          { path: 'seeker/dashboard', component: DummyComponent },
          { path: 'recruiter/dashboard', component: DummyComponent },
          { path: 'admin/dashboard', component: DummyComponent }
        ])
      ]
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created and have initial unauthenticated state', () => {
    expect(service).toBeTruthy();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.userRole()).toBeNull();
    expect(service.isLoading()).toBe(false);
  });

  describe('register()', () => {
    it('should POST to /api/auth/register with credentials and update state on success', () => {
      const payload = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Password123!',
        role: 'job_seeker' as const
      };

      service.register(payload).subscribe((res) => {
        expect(res.success).toBe(true);
        expect(res.data?.user.email).toBe('jane@example.com');
      });

      const req = httpTesting.expectOne('/api/auth/register');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.withCredentials).toBe(true);
      req.flush(mockAuthResponse);

      expect(service.currentUser()?.name).toBe('Jane Doe');
      expect(service.isAuthenticated()).toBe(true);
      expect(service.userRole()).toBe('job_seeker');
      expect(service.isLoading()).toBe(false);
    });

    it('should set isLoading to false on error', () => {
      let errorOccurred = false;
      service.register({
        name: 'Jane',
        email: 'jane@test.com',
        password: 'short',
        role: 'job_seeker'
      }).subscribe({
        next: () => {
          throw new Error('Should have failed');
        },
        error: (err) => {
          errorOccurred = true;
          expect(err.status).toBe(400);
          expect(service.isLoading()).toBe(false);
        }
      });

      const req = httpTesting.expectOne('/api/auth/register');
      req.flush({ message: 'Validation failed' }, { status: 400, statusText: 'Bad Request' });
      expect(errorOccurred).toBe(true);
    });
  });

  describe('login()', () => {
    it('should POST to /api/auth/login and save user state without storing token in localStorage', () => {
      const creds = { email: 'jane@example.com', password: 'Password123!' };

      service.login(creds).subscribe((res) => {
        expect(res.success).toBe(true);
      });

      const req = httpTesting.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(creds);
      expect(req.request.withCredentials).toBe(true);
      req.flush(mockAuthResponse);

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('logout()', () => {
    it('should POST to /api/auth/logout with credentials and clear user state', () => {
      service.currentUser.set(mockUser);

      service.logout().subscribe();

      const req = httpTesting.expectOne('/api/auth/logout');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ success: true });

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('checkAuth() (Session Restoration)', () => {
    it('should GET /api/auth/me with credentials and restore user on valid session cookie', () => {
      service.checkAuth().subscribe((user) => {
        expect(user).toEqual(mockUser);
      });

      const req = httpTesting.expectOne('/api/auth/me');
      expect(req.request.method).toBe('GET');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ success: true, data: { user: mockUser } });

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.authInitialized()).toBe(true);
    });

    it('should reset user on session check failure without crashing', () => {
      service.checkAuth().subscribe((user) => {
        expect(user).toBeNull();
      });

      const req = httpTesting.expectOne('/api/auth/me');
      req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(service.currentUser()).toBeNull();
      expect(service.authInitialized()).toBe(true);
    });
  });

  describe('getDashboardUrl()', () => {
    it('should route to /recruiter/dashboard for recruiter', () => {
      expect(service.getDashboardUrl('recruiter')).toBe('/recruiter/dashboard');
    });

    it('should route to /admin/dashboard for admin', () => {
      expect(service.getDashboardUrl('admin')).toBe('/admin/dashboard');
    });

    it('should route to /seeker/dashboard for job_seeker and default', () => {
      expect(service.getDashboardUrl('job_seeker')).toBe('/seeker/dashboard');
      expect(service.getDashboardUrl(null)).toBe('/seeker/dashboard');
    });
  });
});
