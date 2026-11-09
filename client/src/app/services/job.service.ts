import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Job,
  JobFilters,
  JobsResponse,
  SingleJobResponse
} from '../models/job.model';

@Injectable({
  providedIn: 'root'
})
export class JobService {
  private apiUrl = 'http://localhost:5000/api/jobs';

  constructor(private http: HttpClient) {}

  /**
   * Retrieves public published Active jobs with search, filtering, sorting, and pagination.
   */
  getJobs(filters: JobFilters = {}): Observable<JobsResponse> {
    let params = new HttpParams();

    if (filters.search && filters.search.trim()) {
      params = params.set('search', filters.search.trim());
    }
    if (filters.location && filters.location.trim()) {
      params = params.set('location', filters.location.trim());
    }
    if (filters.category && filters.category !== 'All') {
      params = params.set('category', filters.category);
    }
    if (filters.employmentType && filters.employmentType !== 'All') {
      params = params.set('employmentType', filters.employmentType);
    }
    if (filters.experienceLevel && filters.experienceLevel !== 'All') {
      params = params.set('experienceLevel', filters.experienceLevel);
    }
    if (filters.minSalary !== undefined && filters.minSalary !== null && filters.minSalary > 0) {
      params = params.set('minSalary', filters.minSalary.toString());
    }
    if (filters.maxSalary !== undefined && filters.maxSalary !== null && filters.maxSalary > 0) {
      params = params.set('maxSalary', filters.maxSalary.toString());
    }
    if (filters.companyId) {
      params = params.set('companyId', filters.companyId);
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

    return this.http.get<JobsResponse>(this.apiUrl, {
      params,
      withCredentials: true
    });
  }

  /**
   * Retrieves single published job details by ID.
   */
  getJobById(id: string): Observable<SingleJobResponse> {
    return this.http.get<SingleJobResponse>(`${this.apiUrl}/${id}`, {
      withCredentials: true
    });
  }

  /**
   * Retrieves jobs owned by the authenticated recruiter (supports status filter and pagination).
   */
  getMyJobs(params: { status?: string; page?: number; limit?: number } = {}): Observable<JobsResponse> {
    let httpParams = new HttpParams();
    if (params.status && params.status !== 'All') {
      httpParams = httpParams.set('status', params.status);
    }
    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    return this.http.get<JobsResponse>(`${this.apiUrl}/my-jobs`, {
      params: httpParams,
      withCredentials: true
    });
  }

  /**
   * Creates a new job posting for recruiter's company.
   */
  createJob(payload: Partial<Job>): Observable<SingleJobResponse> {
    return this.http.post<SingleJobResponse>(this.apiUrl, payload, {
      withCredentials: true
    });
  }

  /**
   * Updates an existing job posting owned by recruiter.
   */
  updateJob(id: string, payload: Partial<Job>): Observable<SingleJobResponse> {
    return this.http.put<SingleJobResponse>(`${this.apiUrl}/${id}`, payload, {
      withCredentials: true
    });
  }

  /**
   * Updates status of an existing job posting (Active, Draft, Closed, Archived).
   */
  updateJobStatus(id: string, status: string): Observable<SingleJobResponse> {
    return this.http.patch<SingleJobResponse>(
      `${this.apiUrl}/${id}/status`,
      { status },
      { withCredentials: true }
    );
  }

  /**
   * Safely deletes or archives a job posting based on application existence.
   */
  deleteJob(id: string): Observable<{ success: boolean; message: string; data: { action: string; job?: Job } }> {
    return this.http.delete<{ success: boolean; message: string; data: { action: string; job?: Job } }>(
      `${this.apiUrl}/${id}`,
      { withCredentials: true }
    );
  }
}

