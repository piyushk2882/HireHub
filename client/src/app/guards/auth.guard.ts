import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

/**
 * Ensures user is authenticated before accessing protected routes.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If auth state is already initialized
  if (authService.authInitialized()) {
    if (authService.isAuthenticated()) {
      return true;
    }
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  // Otherwise check session against backend first
  return authService.checkAuth().pipe(
    map((user) => {
      if (user) {
        return true;
      }
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url }
      });
    })
  );
};

/**
 * Ensures user possesses one of the required roles.
 * @param allowedRoles Allowed roles for the target route
 */
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const checkRole = (): boolean | ReturnType<typeof router.createUrlTree> => {
      const currentRole = authService.userRole();
      if (currentRole && allowedRoles.includes(currentRole)) {
        return true;
      }
      // Redirect unauthorized role to their designated dashboard
      const fallbackUrl = authService.getDashboardUrl();
      return router.createUrlTree([fallbackUrl]);
    };

    if (authService.authInitialized()) {
      if (!authService.isAuthenticated()) {
        return router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: state.url }
        });
      }
      return checkRole();
    }

    return authService.checkAuth().pipe(
      map((user) => {
        if (!user) {
          return router.createUrlTree(['/auth/login'], {
            queryParams: { returnUrl: state.url }
          });
        }
        return checkRole();
      })
    );
  };
};

/**
 * Prevents authenticated users from accessing login or registration pages.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.authInitialized()) {
    if (authService.isAuthenticated()) {
      return router.createUrlTree([authService.getDashboardUrl()]);
    }
    return true;
  }

  return authService.checkAuth().pipe(
    map((user) => {
      if (user) {
        return router.createUrlTree([authService.getDashboardUrl(user.role)]);
      }
      return true;
    })
  );
};

