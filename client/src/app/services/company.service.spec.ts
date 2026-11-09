import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CompanyService } from './company.service';
import { Company } from '../models/job.model';

describe('CompanyService', () => {
  let service: CompanyService;
  let httpTesting: HttpTestingController;

  const mockCompany: Company = {
    _id: '507f1f77bcf86cd799439022',
    companyName: 'Acme Innovations',
    industry: 'Technology',
    website: 'https://acme.example.com',
    location: 'Austin, TX',
    description: 'Pioneering future tech.'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CompanyService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CompanyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should retrieve companies with query params via GET /api/companies', () => {
    service.getCompanies({ recruiterId: '507f1f77bcf86cd799439099' }).subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.companies.length).toBe(1);
    });

    const req = httpTesting.expectOne(r =>
      r.url === 'http://localhost:5000/api/companies' &&
      r.params.get('recruiterId') === '507f1f77bcf86cd799439099'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      success: true,
      data: {
        companies: [mockCompany],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      }
    });
  });

  it('should retrieve single company by ID via GET /api/companies/:id', () => {
    service.getCompanyById('507f1f77bcf86cd799439022').subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.company.companyName).toBe('Acme Innovations');
    });

    const req = httpTesting.expectOne('http://localhost:5000/api/companies/507f1f77bcf86cd799439022');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { company: mockCompany } });
  });

  it('should create company profile via POST /api/companies', () => {
    service.createCompany({ companyName: 'Acme Innovations' }).subscribe(res => {
      expect(res.success).toBe(true);
    });

    const req = httpTesting.expectOne('http://localhost:5000/api/companies');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ success: true, data: { company: mockCompany } });
  });

  it('should update company profile via PUT /api/companies/:id', () => {
    service.updateCompany('507f1f77bcf86cd799439022', { industry: 'FinTech' }).subscribe(res => {
      expect(res.success).toBe(true);
    });

    const req = httpTesting.expectOne('http://localhost:5000/api/companies/507f1f77bcf86cd799439022');
    expect(req.request.method).toBe('PUT');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ success: true, data: { company: { ...mockCompany, industry: 'FinTech' } } });
  });
});

