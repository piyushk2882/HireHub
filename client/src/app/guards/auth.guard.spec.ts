import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authGuard, roleGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model';

describe('Auth Guards', () => {
  let authService: AuthService;
  let router: Router;

  const mockUser: User = {
    id: 'user1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'job_seeker',
    isActive: true,
    createdAt: '2026-11-06T00:00:00.000Z'
  };

  const mockRecruiter: User = {
    ...mockUser,
    id: 'recruiter1',
    role: 'recruiter'
  };

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = { url: '/protected-url' } as RouterStateSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        {
          provide: Router,
          useValue: {
            createUrlTree: vi.fn((commands: any[]) => {
              return { url: commands.join('/') } as unknown as UrlTree;
            }),
            navigateByUrl: vi.fn()
          }
        }
      ]
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  describe('authGuard', () => {
    it('should allow access if user is already authenticated', () => {
      authService.currentUser.set(mockUser);
      authService.authInitialized.set(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(dummyRoute, dummyState)
      );

      expect(result).toBe(true);
    });

    it('should redirect to login if initialized and not authenticated', () => {
      authService.currentUser.set(null);
      authService.authInitialized.set(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(dummyRoute, dummyState)
      );

      expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/protected-url' }
      });
    });

    it('should checkAuth if not initialized and allow access if valid', async () => {
      authService.authInitialized.set(false);
      vi.spyOn(authService, 'checkAuth').mockReturnValue(of(mockUser));

      const result = TestBed.runInInjectionContext(() =>
        authGuard(dummyRoute, dummyState)
      );

      if (typeof result === 'object' && 'subscribe' in result) {
        return new Promise<void>((resolve) => {
          result.subscribe((allowed) => {
            expect(allowed).toBe(true);
            resolve();
          });
        });
      } else {
        expect.unreachable('Expected observable');
      }
    });
  });

  describe('roleGuard', () => {
    it('should allow access when user role matches allowed roles', () => {
      authService.currentUser.set(mockRecruiter);
      authService.authInitialized.set(true);

      const guard = roleGuard(['recruiter']);
      const result = TestBed.runInInjectionContext(() =>
        guard(dummyRoute, dummyState)
      );

      expect(result).toBe(true);
    });

    it('should redirect to designated dashboard if role does not match', () => {
      authService.currentUser.set(mockUser); // role: job_seeker
      authService.authInitialized.set(true);

      const guard = roleGuard(['recruiter']);
      TestBed.runInInjectionContext(() =>
        guard(dummyRoute, dummyState)
      );

      expect(router.createUrlTree).toHaveBeenCalledWith(['/seeker/dashboard']);
    });
  });

  describe('guestGuard', () => {
    it('should allow access if user is unauthenticated', () => {
      authService.currentUser.set(null);
      authService.authInitialized.set(true);

      const result = TestBed.runInInjectionContext(() =>
        guestGuard(dummyRoute, dummyState)
      );

      expect(result).toBe(true);
    });

    it('should redirect authenticated user to their role dashboard', () => {
      authService.currentUser.set(mockUser); // role: job_seeker
      authService.authInitialized.set(true);

      TestBed.runInInjectionContext(() =>
        guestGuard(dummyRoute, dummyState)
      );

      expect(router.createUrlTree).toHaveBeenCalledWith(['/seeker/dashboard']);
    });
  });
});
