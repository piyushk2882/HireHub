import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { JobService } from './job.service';
import { Job } from '../models/job.model';

describe('JobService', () => {
  let service: JobService;
  let httpTesting: HttpTestingController;

  const mockJob: Job = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Senior Angular Developer',
    description: 'We are seeking an experienced Angular developer.',
    requirements: ['5+ years Angular', 'RxJS mastery'],
    responsibilities: ['Build reactive UI', 'Write unit tests'],
    companyId: {
      _id: '507f1f77bcf86cd799439022',
      companyName: 'TechCorp Solutions',
      location: 'New York, NY'
    },
    location: 'Remote',
    employmentType: 'Full Time',
    experienceLevel: 'Senior',
    salaryMin: 120000,
    salaryMax: 160000,
    category: 'Development',
    skills: ['Angular', 'TypeScript', 'RxJS'],
    status: 'Active'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        JobService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(JobService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch public jobs with GET /api/jobs and active filters', () => {
    const mockResponse = {
      success: true,
      message: 'Jobs retrieved successfully.',
      data: {
        jobs: [mockJob],
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

    service.getJobs({ search: 'Angular', category: 'Development', page: 1, limit: 10 }).subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.jobs.length).toBe(1);
      expect(res.data.jobs[0].title).toBe('Senior Angular Developer');
    });

    const req = httpTesting.expectOne(r =>
      r.url === '/api/jobs' &&
      r.params.get('search') === 'Angular' &&
      r.params.get('category') === 'Development' &&
      r.params.get('page') === '1'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('should fetch job details by ID via GET /api/jobs/:id', () => {
    const mockResponse = {
      success: true,
      message: 'Job retrieved successfully.',
      data: { job: mockJob }
    };

    service.getJobById('507f1f77bcf86cd799439011').subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.job._id).toBe('507f1f77bcf86cd799439011');
    });

    const req = httpTesting.expectOne('/api/jobs/507f1f77bcf86cd799439011');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('should fetch recruiter jobs via GET /api/jobs/my-jobs', () => {
    const mockResponse = {
      success: true,
      message: 'Jobs retrieved successfully.',
      data: {
        jobs: [mockJob],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      }
    };

    service.getMyJobs({ status: 'Active', page: 1 }).subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.jobs.length).toBe(1);
    });

    const req = httpTesting.expectOne(r =>
      r.url === '/api/jobs/my-jobs' &&
      r.params.get('status') === 'Active'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockResponse);
  });

  it('should create a job posting via POST /api/jobs', () => {
    const newJobPayload: Partial<Job> = {
      title: 'UI Designer',
      description: 'Design UI for web apps',
      location: 'Remote',
      category: 'Design',
      companyId: '507f1f77bcf86cd799439022'
    };

    service.createJob(newJobPayload).subscribe(res => {
      expect(res.success).toBe(true);
    });

    const req = httpTesting.expectOne('/api/jobs');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body.title).toBe('UI Designer');
    req.flush({ success: true, message: 'Created', data: { job: { ...newJobPayload, _id: 'newId' } } });
  });

  it('should update a job posting via PUT /api/jobs/:id', () => {
    service.updateJob('507f1f77bcf86cd799439011', { title: 'Lead Angular Developer' }).subscribe(res => {
      expect(res.success).toBe(true);
    });

    const req = httpTesting.expectOne('/api/jobs/507f1f77bcf86cd799439011');
    expect(req.request.method).toBe('PUT');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ success: true, message: 'Updated', data: { job: { ...mockJob, title: 'Lead Angular Developer' } } });
  });

  it('should update job status via PATCH /api/jobs/:id/status', () => {
    service.updateJobStatus('507f1f77bcf86cd799439011', 'Closed').subscribe(res => {
      expect(res.success).toBe(true);
    });

    const req = httpTesting.expectOne('/api/jobs/507f1f77bcf86cd799439011/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ status: 'Closed' });
    req.flush({ success: true, message: 'Status updated', data: { job: { ...mockJob, status: 'Closed' } } });
  });

  it('should delete a job via DELETE /api/jobs/:id', () => {
    service.deleteJob('507f1f77bcf86cd799439011').subscribe(res => {
      expect(res.success).toBe(true);
      expect(res.data.action).toBe('deleted');
    });

    const req = httpTesting.expectOne('/api/jobs/507f1f77bcf86cd799439011');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ success: true, message: 'Deleted', data: { action: 'deleted' } });
  });
});

