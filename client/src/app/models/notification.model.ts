import { PaginationMetadata } from './job.model';

export type NotificationType =
  | 'NEW_APPLICATION'
  | 'APPLICATION_REVIEWED'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_ACCEPTED';

export interface AppNotification {
  _id: string;
  id?: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType: 'Application' | 'Job' | string;
  relatedEntityId: string;
  relatedJobId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationPreferences {
  emailNotificationsEnabled: boolean;
  applicationStatusEmails: boolean;
  recruiterNewApplicationEmails: boolean;
}

export interface NotificationsResponse {
  success: boolean;
  message?: string;
  data: {
    notifications: AppNotification[];
    pagination: PaginationMetadata;
  };
}

export interface UnreadCountResponse {
  success: boolean;
  message?: string;
  data: {
    unreadCount: number;
  };
}

export interface SingleNotificationResponse {
  success: boolean;
  message?: string;
  data: {
    notification: AppNotification;
  };
}

export interface ReadAllResponse {
  success: boolean;
  message?: string;
  data: {
    modifiedCount: number;
  };
}

export interface NotificationPreferencesResponse {
  success: boolean;
  message?: string;
  data: {
    preferences: NotificationPreferences;
  };
}

