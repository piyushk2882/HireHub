import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { AppNotification, NotificationPreferences } from '../models/notification.model';
import { vi } from 'vitest';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpTesting: HttpTestingController;
  let authService: any;

  const mockNotification: AppNotification = {
    _id: '6650abc1234567890abcdef1',
    recipientId: '65e21a1234567890abcdef22',
    type: 'NEW_APPLICATION',
    title: 'New Application Received',
    message: 'Alice submitted an application for Frontend Developer.',
    relatedEntityType: 'Application',
    relatedEntityId: '6640abc1234567890abcdef1',
    relatedJobId: '65f42c1234567890abcdef11',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  const mockPreferences: NotificationPreferences = {
    emailNotificationsEnabled: true,
    applicationStatusEmails: true,
    recruiterNewApplicationEmails: true
  };

  beforeEach(() => {
    authService = {
      currentUser: vi.fn(() => ({ id: '65e21a1234567890abcdef22', role: 'recruiter' })),
      userRole: vi.fn(() => 'recruiter'),
      isAuthenticated: vi.fn(() => true)
    };

    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: authService
        }
      ]
    });

    service = TestBed.inject(NotificationService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stopPolling();
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch notifications with pagination and update signals', () => {
    service.fetchNotifications(1, 10, false).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.notifications.length).toBe(1);
      expect(service.notifications().length).toBe(1);
      expect(service.loading()).toBe(false);
    });

    expect(service.loading()).toBe(true);

    const req = httpTesting.expectOne('/api/notifications?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);

    req.flush({
      success: true,
      data: {
        notifications: [mockNotification],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });
  });

  it('should fetch unread count and update unreadCount signal', () => {
    service.fetchUnreadCount().subscribe((res) => {
      expect(res.data.unreadCount).toBe(5);
      expect(service.unreadCount()).toBe(5);
    });

    const req = httpTesting.expectOne('/api/notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { unreadCount: 5 } });
  });

  it('should mark single notification as read and decrement unread count', () => {
    service.notifications.set([{ ...mockNotification, isRead: false }]);
    service.unreadCount.set(2);

    service.markAsRead(mockNotification._id).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.notifications()[0].isRead).toBe(true);
      expect(service.unreadCount()).toBe(1);
    });

    const req = httpTesting.expectOne(`/api/notifications/${mockNotification._id}/read`);
    expect(req.request.method).toBe('PATCH');
    req.flush({
      success: true,
      data: {
        notification: { ...mockNotification, isRead: true, readAt: new Date().toISOString() }
      }
    });
  });

  it('should mark all notifications as read and reset unread count to 0', () => {
    service.notifications.set([
      { ...mockNotification, isRead: false },
      { ...mockNotification, _id: '6650abc1234567890abcdef2', isRead: false }
    ]);
    service.unreadCount.set(2);

    service.markAllAsRead().subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.notifications().every((n) => n.isRead)).toBe(true);
      expect(service.unreadCount()).toBe(0);
    });

    const req = httpTesting.expectOne('/api/notifications/read-all');
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { modifiedCount: 2 } });
  });

  it('should delete a notification and remove it from notifications signal', () => {
    service.notifications.set([{ ...mockNotification, isRead: false }]);
    service.unreadCount.set(1);

    service.deleteNotification(mockNotification._id).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.notifications().length).toBe(0);
      expect(service.unreadCount()).toBe(0);
    });

    const req = httpTesting.expectOne(`/api/notifications/${mockNotification._id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Notification deleted successfully' });
  });

  it('should fetch preferences and update preferences signal', () => {
    service.fetchPreferences().subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.preferences.emailNotificationsEnabled).toBe(true);
      expect(service.preferences()?.emailNotificationsEnabled).toBe(true);
    });

    const req = httpTesting.expectOne('/api/notifications/preferences');
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: { preferences: mockPreferences }
    });
  });

  it('should update preferences and update preferences signal', () => {
    const updated = { ...mockPreferences, emailNotificationsEnabled: false };

    service.updatePreferences({ emailNotificationsEnabled: false }).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.preferences()?.emailNotificationsEnabled).toBe(false);
    });

    const req = httpTesting.expectOne('/api/notifications/preferences');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ emailNotificationsEnabled: false });

    req.flush({
      success: true,
      data: { preferences: updated }
    });
  });

  describe('formatRelativeTime', () => {
    it('should format timestamps correctly', () => {
      const now = new Date();
      expect(service.formatRelativeTime(now.toISOString())).toBe('Just now');

      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(service.formatRelativeTime(fiveMinsAgo.toISOString())).toBe('5m ago');

      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
      expect(service.formatRelativeTime(twoHoursAgo.toISOString())).toBe('2h ago');

      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
      expect(service.formatRelativeTime(threeDaysAgo.toISOString())).toBe('3d ago');
    });

    it('should return empty string for null or invalid date', () => {
      expect(service.formatRelativeTime('')).toBe('');
    });
  });

  describe('getDestinationUrl', () => {
    it('should navigate recruiter to /recruiter/jobs/:jobId/applications for NEW_APPLICATION', () => {
      const url = service.getDestinationUrl(mockNotification);
      expect(url).toBe(`/recruiter/jobs/${mockNotification.relatedJobId}/applications`);
    });

    it('should fallback recruiter to /recruiter/dashboard when relatedJobId is missing', () => {
      const notificationWithoutJob = { ...mockNotification, relatedJobId: undefined };
      const url = service.getDestinationUrl(notificationWithoutJob);
      expect(url).toBe('/recruiter/dashboard');
    });

    it('should navigate candidate to /candidate/my-applications for status changes', () => {
      authService.userRole.mockReturnValue('job_seeker');
      const statusNotification: AppNotification = {
        ...mockNotification,
        type: 'APPLICATION_SHORTLISTED'
      };
      const url = service.getDestinationUrl(statusNotification);
      expect(url).toBe('/candidate/my-applications');
    });

    it('should navigate candidate to /candidate/my-applications for APPLICATION_ACCEPTED', () => {
      authService.userRole.mockReturnValue('job_seeker');
      const statusNotification: AppNotification = {
        ...mockNotification,
        type: 'APPLICATION_ACCEPTED'
      };
      const url = service.getDestinationUrl(statusNotification);
      expect(url).toBe('/candidate/my-applications');
    });
  });
});
