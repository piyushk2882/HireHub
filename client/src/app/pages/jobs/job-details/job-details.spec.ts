import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { JobDetailsComponent } from './job-details';
import { JobService } from '../../../services/job.service';
import { AuthService } from '../../../services/auth.service';
import { ApplicationService } from '../../../services/application.service';
import { Job } from '../../../models/job.model';

describe('JobDetailsComponent', () => {
  let component: JobDetailsComponent;
  let fixture: ComponentFixture<JobDetailsComponent>;
  let jobServiceSpy: any;
  let authServiceSpy: any;
  let applicationServiceSpy: any;
  let router: Router;

  const mockJob: Job = {
    _id: 'job123',
    title: 'Staff Fullstack Architect',
    description: 'Lead architecture for global cloud platforms.',
    requirements: ['10+ years engineering', 'Distributed systems'],
    responsibilities: ['Architecture roadmap', 'Mentorship'],
    companyId: {
      _id: 'comp123',
      companyName: 'CloudScale Inc.',
      industry: 'Cloud Infrastructure',
      website: 'https://cloudscale.example.com',
      description: 'Global cloud solutions.'
    },
    location: 'Seattle, WA',
    employmentType: 'Full Time',
    experienceLevel: 'Lead',
    category: 'Development',
    skills: ['Node.js', 'Angular', 'AWS', 'MongoDB'],
    salaryMin: 180000,
    salaryMax: 230000,
    status: 'Active',
    createdAt: new Date().toISOString()
  };

  beforeEach(async () => {
    jobServiceSpy = {
      getJobById: vi.fn().mockReturnValue(of({ success: true, data: { job: mockJob } }))
    };

    authServiceSpy = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      currentUser: vi.fn().mockReturnValue(null),
      userRole: vi.fn().mockReturnValue(null)
    };

    applicationServiceSpy = {
      submitApplication: vi.fn().mockReturnValue(of({
        success: true,
        message: 'Application submitted successfully.',
        data: {
          application: {
            _id: 'app999',
            jobId: 'job123',
            status: 'Pending'
          }
        }
      }))
    };

    await TestBed.configureTestingModule({
      imports: [JobDetailsComponent],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: jobServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ApplicationService, useValue: applicationServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'job123' : null)
              }
            }
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(JobDetailsComponent);
    component = fixture.componentInstance;
  });

  it('should create the job details component', () => {
    expect(component).toBeTruthy();
  });

  it('should load job details by ID and populate signals', () => {
    component.ngOnInit();
    expect(jobServiceSpy.getJobById).toHaveBeenCalledWith('job123');
    expect(component.isLoading()).toBe(false);
    expect(component.job()).toBeTruthy();
    expect(component.job()?.title).toBe('Staff Fullstack Architect');
    expect(component.companyName).toBe('CloudScale Inc.');
  });

  it('should handle 404 error and display not-found state', () => {
    jobServiceSpy.getJobById.mockReturnValue(throwError(() => ({ status: 404 })));
    component.fetchJob('nonexistentId');

    expect(component.isLoading()).toBe(false);
    expect(component.isNotFound()).toBe(true);
    expect(component.job()).toBeNull();
  });

  it('should redirect unauthenticated users to login when Apply Now is clicked', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));
    authServiceSpy.isAuthenticated.mockReturnValue(false);

    component.handleApply();
    expect(navigateSpy).toHaveBeenCalledWith(['/auth/login'], expect.objectContaining({
      queryParams: expect.any(Object)
    }));
    expect(component.showApplyModal()).toBe(false);
  });

  it('should show role restriction when recruiter or admin attempts to apply', () => {
    authServiceSpy.isAuthenticated.mockReturnValue(true);
    authServiceSpy.userRole.mockReturnValue('recruiter');

    component.handleApply();
    expect(component.showApplyModal()).toBe(true);
    expect(component.isRoleRestricted()).toBe(true);
  });

  it('should open application modal for authenticated job seeker', () => {
    authServiceSpy.isAuthenticated.mockReturnValue(true);
    authServiceSpy.userRole.mockReturnValue('job_seeker');

    component.handleApply();
    expect(component.showApplyModal()).toBe(true);
    expect(component.isRoleRestricted()).toBe(false);
    expect(component.selectedResumeFile()).toBeNull();
  });

  it('should validate resume file extension and size', () => {
    // Unsupported extension
    const txtFile = new File(['hello'], 'resume.txt', { type: 'text/plain' });
    component.validateAndSetFile(txtFile);
    expect(component.selectedResumeFile()).toBeNull();
    expect(component.resumeFileError()).toContain('Unsupported file format');

    // Oversized file (> 5 MB)
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big_resume.pdf', { type: 'application/pdf' });
    component.validateAndSetFile(bigFile);
    expect(component.selectedResumeFile()).toBeNull();
    expect(component.resumeFileError()).toContain('exceeds the 5 MB limit');

    // Valid PDF
    const validFile = new File(['%PDF-1.4 sample'], 'valid_resume.pdf', { type: 'application/pdf' });
    component.validateAndSetFile(validFile);
    expect(component.selectedResumeFile()).toBeTruthy();
    expect(component.resumeFileError()).toBeNull();
  });

  it('should submit application successfully and show confirmation view', () => {
    component.job.set(mockJob);
    const validFile = new File(['%PDF-1.4 sample'], 'my_resume.pdf', { type: 'application/pdf' });
    component.selectedResumeFile.set(validFile);
    component.coverLetter.set('Hello team, I am interested in this role.');

    component.submitApplication();
    expect(applicationServiceSpy.submitApplication).toHaveBeenCalled();
    expect(component.isSubmittedSuccess()).toBe(true);
    expect(component.submittedApplicationId()).toBe('app999');
  });

  it('should handle duplicate application (409 Conflict) gracefully', () => {
    component.job.set(mockJob);
    const validFile = new File(['%PDF-1.4 sample'], 'my_resume.pdf', { type: 'application/pdf' });
    component.selectedResumeFile.set(validFile);

    applicationServiceSpy.submitApplication.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { message: 'You have already submitted an application for this job.' }
      }))
    );

    component.submitApplication();
    expect(component.isSubmittedSuccess()).toBe(false);
    expect(component.submitError()).toContain('already submitted an application');
  });
});
