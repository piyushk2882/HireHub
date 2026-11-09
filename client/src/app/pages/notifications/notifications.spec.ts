import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NotificationsPageComponent } from './notifications';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { AppNotification } from '../../models/notification.model';
import { PaginationMetadata } from '../../models/job.model';

@Component({ template: '' })
class DummyComponent {}

describe('NotificationsPageComponent', () => {
  let component: NotificationsPageComponent;
  let fixture: ComponentFixture<NotificationsPageComponent>;
  let mockNotificationService: any;
  let mockAuthService: any;
  let router: Router;

  const mockNotification: AppNotification = {
    _id: '6650abc1234567890abcdef1',
    recipientId: '65e21a1234567890abcdef22',
    type: 'APPLICATION_REVIEWED',
    title: 'Application Reviewed',
    message: 'Your application for Senior Frontend Engineer was reviewed.',
    relatedEntityType: 'Application',
    relatedEntityId: '6640abc1234567890abcdef1',
    relatedJobId: '65f42c1234567890abcdef11',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  const mockPagination: PaginationMetadata = {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  };

  beforeEach(async () => {
    mockNotificationService = {
      notifications: signal<AppNotification[]>([mockNotification]),
      unreadCount: signal<number>(1),
      loading: signal<boolean>(false),
      error: signal<string | null>(null),
      pagination: signal<PaginationMetadata | null>(mockPagination),
      getNotifications: vi.fn().mockReturnValue(of({
        success: true,
        data: {
          notifications: [mockNotification],
          pagination: mockPagination
        }
      })),
      fetchUnreadCount: vi.fn().mockReturnValue(of({
        success: true,
        data: { unreadCount: 1 }
      })),
      markAsRead: vi.fn().mockReturnValue(of({
        success: true,
        data: { notification: { ...mockNotification, isRead: true } }
      })),
      markAllAsRead: vi.fn().mockReturnValue(of({
        success: true,
        data: { modifiedCount: 1 }
      })),
      deleteNotification: vi.fn().mockReturnValue(of({
        success: true,
        message: 'Deleted'
      })),
      getDestinationUrl: vi.fn().mockReturnValue('/candidate/my-applications'),
      formatRelativeTime: vi.fn().mockReturnValue('Just now')
    };

    mockAuthService = {
      currentUser: signal({ id: 'candidate123', role: 'job_seeker' }),
      userRole: vi.fn(() => 'job_seeker'),
      isAuthenticated: vi.fn(() => true)
    };

    await TestBed.configureTestingModule({
      imports: [NotificationsPageComponent],
      providers: [
        provideRouter([
          { path: 'candidate/my-applications', component: DummyComponent },
          { path: 'recruiter/jobs/:jobId/applications', component: DummyComponent },
          { path: 'settings/notifications', component: DummyComponent }
        ]),
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsPageComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create the notifications page component', () => {
    expect(component).toBeTruthy();
  });

  it('should load notifications on init', () => {
    component.ngOnInit();
    expect(mockNotificationService.getNotifications).toHaveBeenCalledWith(1, 10, false);
  });

  it('should switch tabs and reload notifications', () => {
    component.setFilter('unread');

    expect(component.activeFilter()).toBe('unread');
    expect(component.currentPage()).toBe(1);
    expect(mockNotificationService.getNotifications).toHaveBeenCalledWith(1, 10, true);
  });

  it('should navigate between pages on loadPage()', () => {
    mockNotificationService.pagination.set({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false
    });

    component.loadPage(2);

    expect(component.currentPage()).toBe(2);
    expect(mockNotificationService.getNotifications).toHaveBeenCalledWith(2, 10, false);
  });

  it('should mark an individual notification as read', () => {
    const fakeEvent = new MouseEvent('click');
    vi.spyOn(fakeEvent, 'stopPropagation');

    component.markAsRead(mockNotification, fakeEvent);

    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(mockNotificationService.markAsRead).toHaveBeenCalledWith(mockNotification._id);
  });

  it('should mark all notifications as read', () => {
    component.markAllAsRead();
    expect(mockNotificationService.markAllAsRead).toHaveBeenCalled();
  });

  it('should delete a notification and reload list if current page is empty', () => {
    const fakeEvent = new MouseEvent('click');
    vi.spyOn(fakeEvent, 'stopPropagation');

    component.deleteNotification(mockNotification, fakeEvent);

    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(mockNotificationService.deleteNotification).toHaveBeenCalledWith(mockNotification._id);
  });

  it('should navigate to candidate destination on notification click', () => {
    const routerSpy = vi.spyOn(router, 'navigateByUrl').mockImplementation(() => Promise.resolve(true));

    component.openNotification(mockNotification);

    expect(mockNotificationService.markAsRead).toHaveBeenCalledWith(mockNotification._id);
    expect(routerSpy).toHaveBeenCalledWith('/candidate/my-applications');
  });
});
