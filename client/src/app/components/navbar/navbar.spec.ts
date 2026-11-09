import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { NavbarComponent } from './navbar';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

@Component({ template: '' })
class DummyComponent {}

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: AuthService;
  let notificationService: NotificationService;
  let router: Router;

  const mockNotification: AppNotification = {
    _id: '6650abc1234567890abcdef1',
    recipientId: '65e21a1234567890abcdef22',
    type: 'NEW_APPLICATION',
    title: 'New Application',
    message: 'Jane Doe applied for Backend Engineer.',
    relatedEntityType: 'Application',
    relatedEntityId: '6640abc1234567890abcdef1',
    relatedJobId: '65f42c1234567890abcdef11',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([
          { path: 'auth/login', component: DummyComponent },
          { path: 'auth/register', component: DummyComponent },
          { path: 'seeker/dashboard', component: DummyComponent },
          { path: 'recruiter/dashboard', component: DummyComponent },
          { path: 'recruiter/jobs/:jobId/applications', component: DummyComponent },
          { path: 'notifications', component: DummyComponent },
          { path: 'settings/notifications', component: DummyComponent }
        ]),
        provideHttpClient()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    notificationService = TestBed.inject(NotificationService);
    router = TestBed.inject(Router);

    // Set authenticated user by default so auth-dependent navbar features are active
    authService.currentUser.set({
      id: '65e21a1234567890abcdef22',
      name: 'Test Recruiter',
      email: 'recruiter@example.com',
      role: 'recruiter'
    } as any);

    await fixture.whenStable();
  });

  afterEach(() => {
    notificationService.stopPolling();
    TestBed.resetTestingModule();
  });

  it('should create the navbar', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle mobile menu state on toggleMobileMenu()', () => {
    expect(component.isMobileMenuOpen()).toBe(false);
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('should close mobile menu on closeMobileMenu()', () => {
    component.isMobileMenuOpen.set(true);
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('should call authService.logout on logout()', () => {
    const logoutSpy = vi.spyOn(authService, 'logout').mockReturnValue(of({ success: true }));
    component.logout();
    expect(logoutSpy).toHaveBeenCalled();
  });

  describe('Notification Dropdown and Bell', () => {
    it('should format badge count properly: exact if <=99, 99+ if >99', () => {
      expect(component.getBadgeText(0)).toBe('');
      expect(component.getBadgeText(42)).toBe('42');
      expect(component.getBadgeText(100)).toBe('99+');
      expect(component.getBadgeText(999)).toBe('99+');
    });

    it('should toggle notification dropdown and fetch notifications when opening', () => {
      const fetchSpy = vi.spyOn(notificationService, 'getNotifications').mockReturnValue(of({
        success: true,
        data: {
          notifications: [mockNotification],
          pagination: { page: 1, limit: 5, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
        }
      }));

      expect(component.isNotificationDropdownOpen()).toBe(false);

      const fakeEvent = new MouseEvent('click');
      vi.spyOn(fakeEvent, 'stopPropagation');

      component.toggleNotificationDropdown(fakeEvent);
      expect(component.isNotificationDropdownOpen()).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(1, 5);

      component.toggleNotificationDropdown(fakeEvent);
      expect(component.isNotificationDropdownOpen()).toBe(false);
    });

    it('should close notification dropdown on escape key', () => {
      component.isNotificationDropdownOpen.set(true);
      component.onEscapeKey();
      expect(component.isNotificationDropdownOpen()).toBe(false);
    });

    it('should mark single notification as read without closing dropdown', () => {
      const markSpy = vi.spyOn(notificationService, 'markAsRead').mockReturnValue(of({
        success: true,
        data: { notification: { ...mockNotification, isRead: true } }
      }));

      const fakeEvent = new MouseEvent('click');
      vi.spyOn(fakeEvent, 'stopPropagation');

      component.markAsRead(mockNotification, fakeEvent);
      expect(fakeEvent.stopPropagation).toHaveBeenCalled();
      expect(markSpy).toHaveBeenCalledWith(mockNotification._id);
    });

    it('should mark all notifications as read', () => {
      const markAllSpy = vi.spyOn(notificationService, 'markAllAsRead').mockReturnValue(of({
        success: true,
        data: { modifiedCount: 2 }
      }));

      component.markAllAsRead();
      expect(markAllSpy).toHaveBeenCalled();
    });

    it('should delete notification without closing dropdown', () => {
      const deleteSpy = vi.spyOn(notificationService, 'deleteNotification').mockReturnValue(of({
        success: true,
        message: 'Deleted'
      }));

      const fakeEvent = new MouseEvent('click');
      vi.spyOn(fakeEvent, 'stopPropagation');

      component.deleteNotification(mockNotification, fakeEvent);
      expect(fakeEvent.stopPropagation).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith(mockNotification._id);
    });

    it('should mark notification as read and navigate when item is clicked', () => {
      const markSpy = vi.spyOn(notificationService, 'markAsRead').mockReturnValue(of({
        success: true,
        data: { notification: { ...mockNotification, isRead: true } }
      }));
      const routerSpy = vi.spyOn(router, 'navigateByUrl').mockImplementation(() => Promise.resolve(true));

      vi.spyOn(authService, 'userRole').mockReturnValue('recruiter');
      component.isNotificationDropdownOpen.set(true);

      const fakeEvent = new MouseEvent('click');
      vi.spyOn(fakeEvent, 'stopPropagation');

      component.handleNotificationClick(mockNotification, fakeEvent);

      expect(markSpy).toHaveBeenCalledWith(mockNotification._id);
      expect(routerSpy).toHaveBeenCalledWith(`/recruiter/jobs/${mockNotification.relatedJobId}/applications`);
      expect(component.isNotificationDropdownOpen()).toBe(false);
    });
  });
});
