import { Injectable, inject, signal, effect, OnDestroy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subscription, timer, fromEvent, of } from 'rxjs';
import { catchError, filter, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import {
  AppNotification,
  NotificationPreferences,
  NotificationsResponse,
  UnreadCountResponse,
  SingleNotificationResponse,
  ReadAllResponse,
  NotificationPreferencesResponse
} from '../models/notification.model';
import { PaginationMetadata } from '../models/job.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = 'http://localhost:5000/api/notifications';

  // Reactive Signals
  notifications = signal<AppNotification[]>([]);
  unreadCount = signal<number>(0);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  preferences = signal<NotificationPreferences | null>(null);
  pagination = signal<PaginationMetadata | null>(null);

  // Polling management
  private pollingSub: Subscription | null = null;
  private visibilitySub: Subscription | null = null;
  private readonly POLL_INTERVAL_MS = 30000; // 30 seconds

  constructor() {
    // Monitor auth changes reactively using Angular Signals effect
    effect(() => {
      const isAuth = this.authService.isAuthenticated();
      if (isAuth) {
        this.startPolling();
        this.fetchUnreadCount().subscribe();
      } else {
        this.stopPolling();
        this.clearState();
      }
    });

    // Listen to document visibility changes to pause/resume or wake on active tab
    if (typeof document !== 'undefined') {
      this.visibilitySub = fromEvent(document, 'visibilitychange').subscribe(() => {
        if (document.visibilityState === 'visible' && this.authService.isAuthenticated()) {
          this.fetchUnreadCount().subscribe();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.visibilitySub) {
      this.visibilitySub.unsubscribe();
      this.visibilitySub = null;
    }
  }

  /**
   * Starts periodic polling for unread notifications count every 30 seconds.
   * Ensures only a single active polling subscription exists.
   */
  startPolling(): void {
    if (this.pollingSub) {
      return; // Already polling
    }

    this.pollingSub = timer(this.POLL_INTERVAL_MS, this.POLL_INTERVAL_MS)
      .pipe(
        // Skip polling if document is hidden or user logged out
        filter(() => {
          const isDocVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
          return isDocVisible && this.authService.isAuthenticated();
        }),
        switchMap(() =>
          this.fetchUnreadCount().pipe(
            catchError(() => of(null)) // Silent fail on background polling; never throw or loop redirect
          )
        )
      )
      .subscribe();
  }

  /**
   * Stops polling and clears active subscription.
   */
  stopPolling(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = null;
    }
  }

  /**
   * Resets internal notification signals when user logs out.
   */
  clearState(): void {
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.loading.set(false);
    this.error.set(null);
    this.preferences.set(null);
    this.pagination.set(null);
  }

  /**
   * Fetches paginated notifications for authenticated user.
   * GET /api/notifications
   */
  getNotifications(page = 1, limit = 10, unreadOnly = false): Observable<NotificationsResponse> {
    this.loading.set(true);
    this.error.set(null);

    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }

    return this.http
      .get<NotificationsResponse>(this.apiUrl, {
        params,
        withCredentials: true
      })
      .pipe(
        tap((res) => {
          this.loading.set(false);
          if (res.success && res.data) {
            this.notifications.set(res.data.notifications || []);
            this.pagination.set(res.data.pagination || null);
          }
        }),
        catchError((err) => {
          this.loading.set(false);
          const errorMsg = err.error?.message || 'Failed to load notifications.';
          this.error.set(errorMsg);
          throw err;
        })
      );
  }

  /**
   * Alias for getNotifications.
   */
  fetchNotifications(page = 1, limit = 10, unreadOnly = false): Observable<NotificationsResponse> {
    return this.getNotifications(page, limit, unreadOnly);
  }

  /**
   * Fetches unread notification count.
   * GET /api/notifications/unread-count
   */
  fetchUnreadCount(): Observable<UnreadCountResponse> {
    return this.http
      .get<UnreadCountResponse>(`${this.apiUrl}/unread-count`, {
        withCredentials: true
      })
      .pipe(
        tap((res) => {
          if (res.success && typeof res.data?.unreadCount === 'number') {
            this.unreadCount.set(res.data.unreadCount);
          }
        }),
        catchError((err) => {
          // Keep current count on error without throwing redirect loop
          return of({ success: false, data: { unreadCount: this.unreadCount() } });
        })
      );
  }

  /**
   * Marks a single notification as read.
   * PATCH /api/notifications/:id/read
   */
  markAsRead(notificationId: string): Observable<SingleNotificationResponse> {
    return this.http
      .patch<SingleNotificationResponse>(
        `${this.apiUrl}/${notificationId}/read`,
        {},
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          if (res.success && res.data?.notification) {
            // Update local signals
            const updated = res.data.notification;
            this.notifications.update((list) =>
              list.map((item) => (item._id === notificationId ? { ...item, isRead: true, readAt: updated.readAt } : item))
            );
            this.unreadCount.update((count) => Math.max(0, count - 1));
          }
        })
      );
  }

  /**
   * Marks all notifications of the authenticated user as read.
   * PATCH /api/notifications/read-all
   */
  markAllAsRead(): Observable<ReadAllResponse> {
    return this.http
      .patch<ReadAllResponse>(`${this.apiUrl}/read-all`, {}, { withCredentials: true })
      .pipe(
        tap((res) => {
          if (res.success) {
            this.notifications.update((list) =>
              list.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() }))
            );
            this.unreadCount.set(0);
          }
        })
      );
  }

  /**
   * Deletes a single notification.
   * DELETE /api/notifications/:id
   */
  deleteNotification(notificationId: string): Observable<any> {
    return this.http
      .delete<any>(`${this.apiUrl}/${notificationId}`, { withCredentials: true })
      .pipe(
        tap((res) => {
          if (res.success) {
            let wasUnread = false;
            this.notifications.update((list) => {
              const target = list.find((item) => item._id === notificationId);
              if (target && !target.isRead) {
                wasUnread = true;
              }
              return list.filter((item) => item._id !== notificationId);
            });
            if (wasUnread) {
              this.unreadCount.update((c) => Math.max(0, c - 1));
            }
          }
        })
      );
  }

  /**
   * Fetches user's notification preferences.
   * GET /api/notifications/preferences
   */
  fetchPreferences(): Observable<NotificationPreferencesResponse> {
    this.loading.set(true);
    this.error.set(null);

    return this.http
      .get<NotificationPreferencesResponse>(`${this.apiUrl}/preferences`, {
        withCredentials: true
      })
      .pipe(
        tap((res) => {
          this.loading.set(false);
          if (res.success && res.data?.preferences) {
            this.preferences.set(res.data.preferences);
          }
        }),
        catchError((err) => {
          this.loading.set(false);
          const errorMsg = err.error?.message || 'Failed to load preferences.';
          this.error.set(errorMsg);
          throw err;
        })
      );
  }

  /**
   * Updates user's notification preferences.
   * PATCH /api/notifications/preferences
   */
  updatePreferences(
    prefs: Partial<NotificationPreferences>
  ): Observable<NotificationPreferencesResponse> {
    this.loading.set(true);
    this.error.set(null);

    return this.http
      .patch<NotificationPreferencesResponse>(`${this.apiUrl}/preferences`, prefs, {
        withCredentials: true
      })
      .pipe(
        tap((res) => {
          this.loading.set(false);
          if (res.success && res.data?.preferences) {
            this.preferences.set(res.data.preferences);
          }
        }),
        catchError((err) => {
          this.loading.set(false);
          const errorMsg = err.error?.message || 'Failed to update preferences.';
          this.error.set(errorMsg);
          throw err;
        })
      );
  }

  /**
   * Returns human-readable relative time string (e.g. "Just now", "5 minutes ago", "2 hours ago").
   */
  formatRelativeTime(dateInput: string | Date | undefined): string {
    if (!dateInput) return '';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return 'Just now';
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else if (diffHour < 24) {
      return `${diffHour}h ago`;
    } else if (diffDay === 1) {
      return 'Yesterday';
    } else if (diffDay < 7) {
      return `${diffDay}d ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Determines target routing URL based on notification event type and role.
   */
  getDestinationUrl(notification: AppNotification): string {
    const role = this.authService.userRole();

    switch (notification.type) {
      case 'NEW_APPLICATION':
        if (notification.relatedJobId) {
          return `/recruiter/jobs/${notification.relatedJobId}/applications`;
        }
        return role === 'recruiter' ? '/recruiter/dashboard' : '/candidate/my-applications';

      case 'APPLICATION_REVIEWED':
      case 'APPLICATION_SHORTLISTED':
      case 'APPLICATION_REJECTED':
      case 'APPLICATION_ACCEPTED':
      default:
        return role === 'job_seeker' ? '/candidate/my-applications' : '/notifications';
    }
  }
}
