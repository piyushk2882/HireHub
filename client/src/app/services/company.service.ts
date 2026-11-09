import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CompaniesResponse,
  Company,
  SingleCompanyResponse
} from '../models/job.model';

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private apiUrl = 'http://localhost:5000/api/companies';

  constructor(private http: HttpClient) {}

  /**
   * Retrieves public list of companies or filters by recruiterId / search.
   */
  getCompanies(query: { search?: string; companyName?: string; industry?: string; location?: string; recruiterId?: string; page?: number; limit?: number } = {}): Observable<CompaniesResponse> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    if (query.companyName) params = params.set('companyName', query.companyName);
    if (query.industry) params = params.set('industry', query.industry);
    if (query.location) params = params.set('location', query.location);
    if (query.recruiterId) params = params.set('recruiterId', query.recruiterId);
    if (query.page) params = params.set('page', query.page.toString());
    if (query.limit) params = params.set('limit', query.limit.toString());

    return this.http.get<CompaniesResponse>(this.apiUrl, {
      params,
      withCredentials: true
    });
  }

  /**
   * Retrieves single company details by ID.
   */
  getCompanyById(id: string): Observable<SingleCompanyResponse> {
    return this.http.get<SingleCompanyResponse>(`${this.apiUrl}/${id}`, {
      withCredentials: true
    });
  }

  /**
   * Creates a new company profile for authenticated recruiter.
   */
  createCompany(payload: Partial<Company>): Observable<SingleCompanyResponse> {
    return this.http.post<SingleCompanyResponse>(this.apiUrl, payload, {
      withCredentials: true
    });
  }

  /**
   * Updates an existing company profile owned by authenticated recruiter.
   */
  updateCompany(id: string, payload: Partial<Company>): Observable<SingleCompanyResponse> {
    return this.http.put<SingleCompanyResponse>(`${this.apiUrl}/${id}`, payload, {
      withCredentials: true
    });
  }
}

