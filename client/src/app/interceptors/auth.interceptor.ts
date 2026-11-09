import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Extracts a cookie value by name from document.cookie in browser context.
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Always enable withCredentials so HttpOnly cookies (hirehub_token) are passed to backend
  let modifiedReq = req.clone({
    withCredentials: true
  });

  // Attach XSRF header if XSRF-TOKEN cookie exists and header is not already set
  const xsrfToken = getCookie('XSRF-TOKEN');
  if (xsrfToken && !modifiedReq.headers.has('X-XSRF-TOKEN')) {
    modifiedReq = modifiedReq.clone({
      setHeaders: {
        'X-XSRF-TOKEN': xsrfToken
      }
    });
  }

  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Never auto-redirect on auth endpoints or background notification polling
      const isExcludedFromRedirect =
        req.url.includes('/api/auth/') || req.url.includes('/api/notifications/unread-count');

      if (error.status === 401 && !isExcludedFromRedirect) {
        // Clear user state for expired session on a protected resource
        authService.currentUser.set(null);
        if (!router.url.includes('/auth/')) {
          router.navigate(['/auth/login'], {
            queryParams: { returnUrl: router.url }
          });
        }
      }
      return throwError(() => error);
    })
  );
};
