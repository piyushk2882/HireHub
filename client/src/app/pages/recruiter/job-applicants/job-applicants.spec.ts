import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { JobApplicantsComponent } from './job-applicants';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import { Application } from '../../../models/application.model';

describe('JobApplicantsComponent', () => {
  let component: JobApplicantsComponent;
  let fixture: ComponentFixture<JobApplicantsComponent>;
  let applicationServiceSpy: any;
  let authServiceSpy: any;

  const mockApplicant: Application = {
    _id: 'app901',
    jobId: 'job555',
    applicantId: {
      _id: 'user777',
      name: 'Taylor Swift',
      email: 'taylor@example.com',
      phone: '+1-555-8888'
    },
    resumeUrl: '/api/applications/app901/resume',
    resumeOriginalName: 'taylor_resume.pdf',
    resumeMimeType: 'application/pdf',
    coverLetter: 'Passionate about engineering systems.',
    status: 'Pending',
    appliedAt: '2026-11-06T11:00:00.000Z',
    statusHistory: [
      {
        status: 'Pending',
        changedBy: 'user777',
        changedAt: '2026-11-06T11:00:00.000Z',
        note: 'Applied'
      }
    ]
  };

  beforeEach(async () => {
    applicationServiceSpy = {
      getJobApplications: vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            job: { _id: 'job555', title: 'Lead Architect', status: 'Active' },
            applications: [mockApplicant],
            pagination: {
              total: 1,
              page: 1,
              limit: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false
            }
          }
        })
      ),
      getApplicationById: vi.fn().mockReturnValue(
        of({
          success: true,
          data: { application: mockApplicant }
        })
      ),
      downloadResumeAndSave: vi.fn().mockReturnValue(of(new Blob())),
      updateApplicationStatus: vi.fn().mockReturnValue(
        of({
          success: true,
          message: "Application status updated to 'Reviewed' successfully.",
          data: {
            application: {
              ...mockApplicant,
              status: 'Reviewed',
              statusHistory: [
                ...mockApplicant.statusHistory!,
                {
                  status: 'Reviewed',
                  changedBy: 'recruiterId',
                  changedAt: '2026-11-06T12:00:00.000Z',
                  note: 'Passed initial review'
                }
              ]
            }
          }
        })
      )
    };

    authServiceSpy = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({ name: 'Recruiter Bob', role: 'recruiter' }),
      userRole: vi.fn().mockReturnValue('recruiter')
    };

    await TestBed.configureTestingModule({
      imports: [JobApplicantsComponent],
      providers: [
        provideRouter([]),
        { provide: ApplicationService, useValue: applicationServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'jobId' ? 'job555' : null)
              }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(JobApplicantsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('should create the recruiter job applicants component', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch applicants for the job and populate signals', () => {
    component.ngOnInit();
    expect(applicationServiceSpy.getJobApplications).toHaveBeenCalledWith('job555', expect.any(Object));
    expect(component.isLoading()).toBe(false);
    expect(component.job()?.title).toBe('Lead Architect');
    expect(component.applicants().length).toBe(1);
    expect(component.getCandidateName(component.applicants()[0])).toBe('Taylor Swift');
    expect(component.getCandidateEmail(component.applicants()[0])).toBe('taylor@example.com');
  });

  it('should handle 403 Forbidden access denial for non-owned jobs', () => {
    applicationServiceSpy.getJobApplications.mockReturnValue(
      throwError(() => ({ status: 403 }))
    );

    component.loadApplicants();
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toContain('Access denied');
  });

  it('should support status filtering on applicants', () => {
    component.filterByStatus('Reviewed');
    expect(component.selectedStatus()).toBe('Reviewed');
    expect(component.currentPage()).toBe(1);
    expect(applicationServiceSpy.getJobApplications).toHaveBeenCalledWith('job555', expect.objectContaining({
      status: 'Reviewed'
    }));
  });

  it('should trigger resume download for candidate', () => {
    component.downloadResume(mockApplicant);
    expect(applicationServiceSpy.downloadResumeAndSave).toHaveBeenCalledWith(
      mockApplicant._id,
      mockApplicant.resumeOriginalName
    );
  });

  it('should prompt status change confirmation modal', () => {
    component.promptStatusChange(mockApplicant, 'Reviewed');
    expect(component.statusChangeModal()).toEqual({ app: mockApplicant, targetStatus: 'Reviewed' });
    expect(component.statusNote()).toBe('');
  });

  it('should update application status and update list without page reload', () => {
    component.applicants.set([mockApplicant]);
    component.promptStatusChange(mockApplicant, 'Reviewed');
    component.statusNote.set('Candidate has solid architecture experience');

    component.confirmStatusChange();
    expect(applicationServiceSpy.updateApplicationStatus).toHaveBeenCalledWith(
      mockApplicant._id,
      'Reviewed',
      'Candidate has solid architecture experience'
    );
    expect(component.statusChangeModal()).toBeNull();
    expect(component.applicants()[0].status).toBe('Reviewed');
    expect(component.feedbackMessage()?.type).toBe('success');
  });

  it('should display error when backend rejects status change', () => {
    applicationServiceSpy.updateApplicationStatus.mockReturnValue(
      throwError(() => ({ error: { message: 'Invalid status transition' } }))
    );

    component.promptStatusChange(mockApplicant, 'Accepted');
    component.confirmStatusChange();

    expect(component.statusUpdateError()).toBe('Invalid status transition');
    expect(component.isUpdatingStatus()).toBe(false);
  });
});
