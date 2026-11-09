import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { NotificationPreferences } from '../../../models/notification.model';

@Component({
  selector: 'app-notifications-settings',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './notifications-settings.html',
  styleUrl: './notifications-settings.scss'
})
export class NotificationsSettingsComponent implements OnInit {
  notificationService = inject(NotificationService);
  authService = inject(AuthService);

  preferences = signal<NotificationPreferences>({
    emailNotificationsEnabled: true,
    applicationStatusEmails: true,
    recruiterNewApplicationEmails: true
  });

  loading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  private feedbackTimeout: any = null;

  ngOnInit(): void {
    this.loadPreferences();
  }

  loadPreferences(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.notificationService.fetchPreferences().subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success && res.data?.preferences) {
          this.preferences.set(res.data.preferences);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load preferences.');
      }
    });
  }

  togglePreference(key: keyof NotificationPreferences): void {
    if (this.isSaving() || this.loading()) {
      return;
    }

    const currentPrefs = this.preferences();
    const previousVal = currentPrefs[key];
    const newVal = !previousVal;

    // Optimistically update
    this.preferences.set({
      ...currentPrefs,
      [key]: newVal
    });

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.notificationService.updatePreferences({ [key]: newVal }).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.success && res.data?.preferences) {
          this.preferences.set(res.data.preferences);
        }
        this.showSuccess('Notification preferences saved successfully.');
      },
      error: (err) => {
        this.isSaving.set(false);
        // Revert local value on error
        this.preferences.set({
          ...this.preferences(),
          [key]: previousVal
        });
        this.errorMessage.set(err.error?.message || 'Failed to save preference change.');
      }
    });
  }

  private showSuccess(msg: string): void {
    this.successMessage.set(msg);
    if (this.feedbackTimeout) {
      clearTimeout(this.feedbackTimeout);
    }
    this.feedbackTimeout = setTimeout(() => {
      this.successMessage.set(null);
    }, 4000);
  }
}

