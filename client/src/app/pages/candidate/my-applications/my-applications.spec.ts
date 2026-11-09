import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MyApplicationsComponent } from './my-applications';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import { Application } from '../../../models/application.model';

describe('MyApplicationsComponent', () => {
  let component: MyApplicationsComponent;
  let fixture: ComponentFixture<MyApplicationsComponent>;
  let applicationServiceSpy: any;
  let authServiceSpy: any;

  const mockApp: Application = {
    _id: 'app101',
    jobId: {
      _id: 'job202',
      title: 'Senior Frontend Engineer',
      location: 'San Francisco, CA',
      employmentType: 'Full Time',
      salaryMin: 140000,
      salaryMax: 180000,
      companyId: {
        _id: 'comp303',
        companyName: 'Apex Systems'
      }
    },
    applicantId: 'seeker404',
    resumeUrl: '/api/applications/app101/resume',
    resumeOriginalName: 'candidate_resume.pdf',
    resumeMimeType: 'application/pdf',
    coverLetter: 'Interested in frontend role.',
    status: 'Pending',
    appliedAt: '2026-11-06T10:00:00.000Z',
    statusHistory: [
      {
        status: 'Pending',
        changedBy: 'seeker404',
        changedAt: '2026-11-06T10:00:00.000Z',
        note: 'Submitted'
      }
    ]
  };

  beforeEach(async () => {
    applicationServiceSpy = {
      getMyApplications: vi.fn().mockReturnValue(
        of({
          success: true,
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
        })
      ),
      getApplicationById: vi.fn().mockReturnValue(
        of({
          success: true,
          data: {
            application: {
              ...mockApp,
              statusHistory: [
                {
                  status: 'Pending',
                  changedBy: 'seeker404',
                  changedAt: '2026-11-06T10:00:00.000Z',
                  note: 'Submitted'
                },
                {
                  status: 'Reviewed',
                  changedBy: 'recruiter505',
                  changedAt: '2026-11-06T11:00:00.000Z',
                  note: 'Passed screening'
                }
              ]
            }
          }
        })
      ),
      downloadResumeAndSave: vi.fn().mockReturnValue(of(new Blob()))
    };

    authServiceSpy = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({ name: 'Candidate User', role: 'job_seeker' }),
      userRole: vi.fn().mockReturnValue('job_seeker')
    };

    await TestBed.configureTestingModule({
      imports: [MyApplicationsComponent],
      providers: [
        provideRouter([]),
        { provide: ApplicationService, useValue: applicationServiceSpy },
        { provide: AuthService, useValue: authServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MyApplicationsComponent);
    component = fixture.componentInstance;
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load applications on init and populate signals', () => {
    component.ngOnInit();
    expect(applicationServiceSpy.getMyApplications).toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);
    expect(component.applications().length).toBe(1);
    expect(component.getJobTitle(component.applications()[0])).toBe('Senior Frontend Engineer');
    expect(component.getCompanyName(component.applications()[0])).toBe('Apex Systems');
  });

  it('should support status filtering', () => {
    component.filterByStatus('Reviewed');
    expect(component.selectedStatus()).toBe('Reviewed');
    expect(component.currentPage()).toBe(1);
    expect(applicationServiceSpy.getMyApplications).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Reviewed' })
    );
  });

  it('should support sorting', () => {
    component.changeSort('oldest');
    expect(component.selectedSort()).toBe('oldest');
    expect(component.currentPage()).toBe(1);
    expect(applicationServiceSpy.getMyApplications).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'oldest' })
    );
  });

  it('should handle empty applications list', () => {
    applicationServiceSpy.getMyApplications.mockReturnValue(
      of({
        success: true,
        data: {
          applications: [],
          pagination: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPrevPage: false }
        }
      })
    );

    component.loadApplications();
    expect(component.applications().length).toBe(0);
    expect(component.isLoading()).toBe(false);
  });

  it('should handle API errors and allow retry', () => {
    applicationServiceSpy.getMyApplications.mockReturnValue(
      throwError(() => ({ error: { message: 'Network offline' } }))
    );

    component.loadApplications();
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Network offline');
  });

  it('should open and populate application details modal', () => {
    component.openDetails(mockApp);
    expect(component.selectedApplication()).toBeTruthy();
    expect(applicationServiceSpy.getApplicationById).toHaveBeenCalledWith(mockApp._id);

    component.closeDetails();
    expect(component.selectedApplication()).toBeNull();
  });

  it('should trigger secure resume download', () => {
    component.downloadResume(mockApp);
    expect(applicationServiceSpy.downloadResumeAndSave).toHaveBeenCalledWith(
      mockApp._id,
      mockApp.resumeOriginalName
    );
  });
});

