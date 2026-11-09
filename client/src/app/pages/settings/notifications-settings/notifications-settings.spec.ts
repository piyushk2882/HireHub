import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { NotificationsSettingsComponent } from './notifications-settings';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { NotificationPreferences } from '../../../models/notification.model';

@Component({ template: '' })
class DummyComponent {}

describe('NotificationsSettingsComponent', () => {
  let component: NotificationsSettingsComponent;
  let fixture: ComponentFixture<NotificationsSettingsComponent>;
  let notificationService: NotificationService;
  let authService: AuthService;

  const mockPreferences: NotificationPreferences = {
    emailNotificationsEnabled: true,
    applicationStatusEmails: true,
    recruiterNewApplicationEmails: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsSettingsComponent],
      providers: [
        provideRouter([
          { path: 'notifications', component: DummyComponent }
        ]),
        provideHttpClient()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsSettingsComponent);
    component = fixture.componentInstance;
    notificationService = TestBed.inject(NotificationService);
    authService = TestBed.inject(AuthService);

    await fixture.whenStable();
  });

  afterEach(() => {
    notificationService.stopPolling();
    TestBed.resetTestingModule();
  });

  it('should create the notification settings component', () => {
    expect(component).toBeTruthy();
  });

  it('should load preferences on init', () => {
    const fetchSpy = vi.spyOn(notificationService, 'fetchPreferences').mockReturnValue(of({
      success: true,
      data: { preferences: mockPreferences }
    }));

    component.ngOnInit();

    expect(fetchSpy).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
    expect(component.preferences()).toEqual(mockPreferences);
  });

  it('should handle error when loading preferences fails', () => {
    vi.spyOn(notificationService, 'fetchPreferences').mockReturnValue(throwError(() => ({
      error: { message: 'Network error occurred.' }
    })));

    component.loadPreferences();

    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('Network error occurred.');
  });

  it('should optimistically update preference and call updatePreferences', () => {
    component.preferences.set(mockPreferences);

    const updateSpy = vi.spyOn(notificationService, 'updatePreferences').mockReturnValue(of({
      success: true,
      data: {
        preferences: {
          ...mockPreferences,
          emailNotificationsEnabled: false
        }
      }
    }));

    component.togglePreference('emailNotificationsEnabled');

    expect(updateSpy).toHaveBeenCalledWith({ emailNotificationsEnabled: false });
    expect(component.preferences().emailNotificationsEnabled).toBe(false);
    expect(component.successMessage()).toContain('saved successfully');
  });

  it('should rollback preference on error when update fails', () => {
    component.preferences.set(mockPreferences);

    const updateSpy = vi.spyOn(notificationService, 'updatePreferences').mockReturnValue(throwError(() => ({
      error: { message: 'Database connection failed.' }
    })));

    component.togglePreference('emailNotificationsEnabled');

    expect(updateSpy).toHaveBeenCalledWith({ emailNotificationsEnabled: false });
    expect(component.preferences().emailNotificationsEnabled).toBe(true);
    expect(component.errorMessage()).toBe('Database connection failed.');
    expect(component.isSaving()).toBe(false);
  });
});
