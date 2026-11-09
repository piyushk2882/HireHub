import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import {
  ApplicationFilters,
  ApplicationStatus,
  ApplicationSubmissionResponse,
  ApplicationsResponse,
  SingleApplicationResponse
} from '../models/application.model';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private baseJobsUrl = '/api/jobs';
  private baseApplicationsUrl = '/api/applications';

  constructor(private http: HttpClient) {}

  /**
   * Submits a candidate job application with resume file and optional cover letter.
   * Uses multipart/form-data without setting Content-Type so browser sets boundary.
   */
  submitApplication(jobId: string, formData: FormData): Observable<ApplicationSubmissionResponse> {
    return this.http.post<ApplicationSubmissionResponse>(
      `${this.baseJobsUrl}/${jobId}/applications`,
      formData,
      { withCredentials: true }
    );
  }

  /**
   * Retrieves candidate's personal application history.
   */
  getMyApplications(filters: ApplicationFilters = {}): Observable<ApplicationsResponse> {
    let params = new HttpParams();

    if (filters.status && filters.status !== 'All') {
      params = params.set('status', filters.status);
    }
    if (filters.page) {
      params = params.set('page', filters.page.toString());
    }
    if (filters.limit) {
      params = params.set('limit', filters.limit.toString());
    }
    if (filters.sort) {
      params = params.set('sort', filters.sort);
    }

    return this.http.get<ApplicationsResponse>(`${this.baseApplicationsUrl}/my-applications`, {
      params,
      withCredentials: true
    });
  }

  /**
   * Retrieves applicants for a specific job posting (recruiter owner or admin).
   */
  getJobApplications(jobId: string, filters: ApplicationFilters = {}): Observable<ApplicationsResponse> {
    let params = new HttpParams();

    if (filters.status && filters.status !== 'All') {
      params = params.set('status', filters.status);
    }
    if (filters.page) {
      params = params.set('page', filters.page.toString());
    }
    if (filters.limit) {
      params = params.set('limit', filters.limit.toString());
    }
    if (filters.sort) {
      params = params.set('sort', filters.sort);
    }

    return this.http.get<ApplicationsResponse>(`${this.baseJobsUrl}/${jobId}/applications`, {
      params,
      withCredentials: true
    });
  }

  /**
   * Retrieves individual application details by ID.
   */
  getApplicationById(applicationId: string): Observable<SingleApplicationResponse> {
    return this.http.get<SingleApplicationResponse>(`${this.baseApplicationsUrl}/${applicationId}`, {
      withCredentials: true
    });
  }

  /**
   * Requests resume binary blob for an authorized application.
   */
  downloadResume(applicationId: string): Observable<Blob> {
    return this.http.get(`${this.baseApplicationsUrl}/${applicationId}/resume`, {
      responseType: 'blob',
      withCredentials: true
    });
  }

  /**
   * Downloads resume and triggers browser save dialog with sanitized filename.
   */
  downloadResumeAndSave(applicationId: string, defaultFilename: string = 'resume.pdf'): Observable<Blob> {
    return this.downloadResume(applicationId).pipe(
      tap((blob) => {
        if (typeof window !== 'undefined' && window.URL && document) {
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = defaultFilename;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(url);
        }
      })
    );
  }

  /**
   * Updates application status with optional recruiter note and audit log.
   */
  updateApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
    note?: string
  ): Observable<SingleApplicationResponse> {
    const payload: { status: ApplicationStatus; note?: string } = { status };
    if (note && note.trim()) {
      payload.note = note.trim();
    }

    return this.http.patch<SingleApplicationResponse>(
      `${this.baseApplicationsUrl}/${applicationId}/status`,
      payload,
      { withCredentials: true }
    );
  }
}

