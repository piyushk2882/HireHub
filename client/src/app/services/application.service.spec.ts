import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationService } from './application.service';
import { Application, ApplicationsResponse, SingleApplicationResponse } from '../models/application.model';

describe('ApplicationService', () => {
  let service: ApplicationService;
  let httpTesting: HttpTestingController;

  const mockApp: Application = {
    _id: '6640abc1234567890abcdef1',
    jobId: '65f42c1234567890abcdef11',
    applicantId: '65e21a1234567890abcdef22',
    resumeUrl: '/api/applications/6640abc1234567890abcdef1/resume',
    resumeOriginalName: 'candidate_resume.pdf',
    resumeMimeType: 'application/pdf',
    resumeSize: 10240,
    coverLetter: 'I have 5 years of frontend development experience.',
    status: 'Pending',
    appliedAt: '2026-11-06T12:00:00.000Z',
    statusHistory: [
      {
        status: 'Pending',
        changedBy: '65e21a1234567890abcdef22',
        changedAt: '2026-11-06T12:00:00.000Z',
        note: 'Initial submission'
      }
    ]
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApplicationService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ApplicationService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should submit an application with multipart FormData via POST /api/jobs/:jobId/applications', () => {
    const formData = new FormData();
    formData.append('coverLetter', 'Cover letter text');
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    formData.append('resume', blob, 'resume.pdf');

    service.submitApplication('65f42c1234567890abcdef11', formData).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.application._id).toBe(mockApp._id);
    });

    const req = httpTesting.expectOne('/api/jobs/65f42c1234567890abcdef11/applications');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      success: true,
      message: 'Application submitted successfully.',
      data: { application: mockApp }
    });
  });

  it('should retrieve candidate application history via GET /api/applications/my-applications with filters', () => {
    const mockResponse: ApplicationsResponse = {
      success: true,
      message: 'Applications retrieved successfully.',
      data: {
        applications: [mockApp],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    };

    service.getMyApplications({ status: 'Pending', page: 1, limit: 10, sort: 'newest' }).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.applications.length).toBe(1);
      expect(res.data.applications[0].status).toBe('Pending');
    });

    const req = httpTesting.expectOne((r) =>
      r.url === '/api/applications/my-applications' &&
      r.params.get('status') === 'Pending' &&
      r.params.get('page') === '1' &&
      r.params.get('sort') === 'newest'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('should retrieve recruiter applicants for a job via GET /api/jobs/:jobId/applications', () => {
    const mockResponse: ApplicationsResponse = {
      success: true,
      message: 'Job applications retrieved successfully.',
      data: {
        job: { _id: '65f42c1234567890abcdef11', title: 'Senior Engineer', status: 'Active' },
        applications: [mockApp],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    };

    service.getJobApplications('65f42c1234567890abcdef11', { status: 'All', page: 2 }).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.job?.title).toBe('Senior Engineer');
      expect(res.data.applications.length).toBe(1);
    });

    const req = httpTesting.expectOne((r) =>
      r.url === '/api/jobs/65f42c1234567890abcdef11/applications' &&
      r.params.get('page') === '2' &&
      !r.params.has('status') // 'All' status should not be appended
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('should retrieve single application details via GET /api/applications/:id', () => {
    service.getApplicationById(mockApp._id).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.application._id).toBe(mockApp._id);
    });

    const req = httpTesting.expectOne(`/api/applications/${mockApp._id}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      success: true,
      data: { application: mockApp }
    });
  });

  it('should download resume blob via GET /api/applications/:id/resume', () => {
    const mockBlob = new Blob(['%PDF-1.4 test resume binary'], { type: 'application/pdf' });

    service.downloadResume(mockApp._id).subscribe((blob) => {
      expect(blob).toBeTruthy();
      expect(blob.type).toBe('application/pdf');
    });

    const req = httpTesting.expectOne(`/api/applications/${mockApp._id}/resume`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockBlob);
  });

  it('should update application status with note via PATCH /api/applications/:id/status', () => {
    const updatedApp = {
      ...mockApp,
      status: 'Reviewed' as const,
      statusHistory: [
        ...mockApp.statusHistory!,
        {
          status: 'Reviewed' as const,
          changedBy: 'recruiterId123',
          changedAt: '2026-11-06T13:00:00.000Z',
          note: 'Looks good'
        }
      ]
    };

    service.updateApplicationStatus(mockApp._id, 'Reviewed', 'Looks good').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.application.status).toBe('Reviewed');
    });

    const req = httpTesting.expectOne(`/api/applications/${mockApp._id}/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Reviewed', note: 'Looks good' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      success: true,
      message: "Application status updated to 'Reviewed' successfully.",
      data: { application: updatedApp }
    });
  });
});

