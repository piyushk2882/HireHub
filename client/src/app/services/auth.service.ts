import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { AuthResponse, User, UserRole } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/api/auth';
  private checkAuthInProgress$: Observable<User | null> | null = null;

  // Reactive state signals
  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => !!this.currentUser());
  userRole = computed<UserRole | null>(() => this.currentUser()?.role || null);
  isLoading = signal<boolean>(false);
  authInitialized = signal<boolean>(false);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  /**
   * Registers a new user (job_seeker or recruiter).
   * Session is established via HttpOnly cookie set by server.
   */
  register(payload: {
    name: string;
    email: string;
    password: string;
    role: 'job_seeker' | 'recruiter';
  }): Observable<AuthResponse> {
    this.isLoading.set(true);
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/register`, payload, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.isLoading.set(false);
          if (res.success && res.data?.user) {
            this.handleAuthSuccess(res.data.user);
          }
        }),
        catchError((err) => {
          this.isLoading.set(false);
          throw err;
        })
      );
  }

  /**
   * Logs in an existing user.
   * Session is established via HttpOnly cookie set by server.
   */
  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    this.isLoading.set(true);
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/login`, credentials, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.isLoading.set(false);
          if (res.success && res.data?.user) {
            this.handleAuthSuccess(res.data.user);
          }
        }),
        catchError((err) => {
          this.isLoading.set(false);
          throw err;
        })
      );
  }

  /**
   * Logs out the current user and clears session cookie.
   */
  logout(): Observable<any> {
    return this.http
      .post<any>(`${this.apiUrl}/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => {
          this.clearSession();
          this.router.navigate(['/auth/login']);
        }),
        catchError(() => {
          this.clearSession();
          this.router.navigate(['/auth/login']);
          return of({ success: true });
        })
      );
  }

  /**
   * Verifies current session against backend via HttpOnly cookie and restores user state.
   * Caches in-flight requests and avoids duplicate calls.
   */
  checkAuth(): Observable<User | null> {
    if (this.authInitialized()) {
      return of(this.currentUser());
    }

    if (this.checkAuthInProgress$) {
      return this.checkAuthInProgress$;
    }

    this.checkAuthInProgress$ = this.http
      .get<{ success: boolean; data: { user: User } }>(`${this.apiUrl}/me`, {
        withCredentials: true
      })
      .pipe(
        map((res) => {
          if (res.success && res.data?.user) {
            this.currentUser.set(res.data.user);
            this.authInitialized.set(true);
            return res.data.user;
          }
          this.currentUser.set(null);
          this.authInitialized.set(true);
          return null;
        }),
        catchError(() => {
          this.currentUser.set(null);
          this.authInitialized.set(true);
          return of(null);
        }),
        finalize(() => {
          this.checkAuthInProgress$ = null;
        }),
        shareReplay(1)
      );

    return this.checkAuthInProgress$;
  }

  /**
   * Helper to determine appropriate dashboard redirect based on role.
   */
  getDashboardUrl(role?: UserRole | null): string {
    const targetRole = role || this.userRole();
    switch (targetRole) {
      case 'recruiter':
        return '/recruiter/dashboard';
      case 'admin':
        return '/admin/dashboard';
      case 'job_seeker':
      default:
        return '/seeker/dashboard';
    }
  }

  private handleAuthSuccess(user: User): void {
    this.currentUser.set(user);
    this.authInitialized.set(true);
  }

  private clearSession(): void {
    this.currentUser.set(null);
    this.authInitialized.set(true);
  }
}
