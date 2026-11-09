import { Job, PaginationMetadata } from './job.model';
import { User } from './user.model';

export type ApplicationStatus = 'Pending' | 'Reviewed' | 'Shortlisted' | 'Rejected' | 'Accepted';

export interface ApplicationStatusHistory {
  status: ApplicationStatus;
  changedBy: string | Partial<User>;
  changedAt: string;
  note?: string;
}

export interface ApplicationApplicantInfo {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
}

export interface ApplicationJobInfo extends Partial<Job> {
  _id: string;
  title: string;
  status?: string;
  location?: string;
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  category?: string;
  companyId?: any;
}

export interface Application {
  _id: string;
  id?: string;
  jobId: string | ApplicationJobInfo;
  applicantId: string | ApplicationApplicantInfo;
  resumeUrl: string;
  resumeOriginalName?: string;
  resumeMimeType?: string;
  resumeStorageKey?: string;
  resumeSize?: number;
  coverLetter?: string;
  status: ApplicationStatus;
  appliedAt: string;
  statusHistory?: ApplicationStatusHistory[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ApplicationFilters {
  status?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest';
}

export interface ApplicationsResponse {
  success: boolean;
  message?: string;
  data: {
    job?: {
      _id: string;
      title: string;
      status: string;
    };
    applications: Application[];
    pagination: PaginationMetadata;
  };
}

export interface SingleApplicationResponse {
  success: boolean;
  message?: string;
  data: {
    application: Application;
  };
}

export interface ApplicationSubmissionResponse {
  success: boolean;
  message?: string;
  data: {
    application: Application;
  };
}

/**
 * Returns accessible CSS badge class and display label for application statuses.
 */
export function getApplicationStatusBadge(status: ApplicationStatus | string): {
  badgeClass: string;
  label: string;
  bg: string;
  color: string;
} {
  switch (status) {
    case 'Reviewed':
      return {
        badgeClass: 'badge-reviewed',
        label: 'Reviewed',
        bg: '#EFF6FF',
        color: '#1D4ED8'
      };
    case 'Shortlisted':
      return {
        badgeClass: 'badge-shortlisted',
        label: 'Shortlisted',
        bg: '#F5F3FF',
        color: '#6D28D9'
      };
    case 'Accepted':
      return {
        badgeClass: 'badge-accepted',
        label: 'Accepted',
        bg: '#ECFDF5',
        color: '#047857'
      };
    case 'Rejected':
      return {
        badgeClass: 'badge-rejected',
        label: 'Rejected',
        bg: '#FEF2F2',
        color: '#B91C1C'
      };
    case 'Pending':
    default:
      return {
        badgeClass: 'badge-pending',
        label: 'Pending',
        bg: '#FFFBEB',
        color: '#B45309'
      };
  }
}

