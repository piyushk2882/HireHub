import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeekerDashboardComponent } from './seeker-dashboard/seeker-dashboard';
import { RecruiterDashboardComponent } from './recruiter-dashboard/recruiter-dashboard';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AuthService } from '../../services/auth.service';
import { JobService } from '../../services/job.service';
import { CompanyService } from '../../services/company.service';
import { Job, Company } from '../../models/job.model';

@Component({ template: '' })
class DummyComponent {}

describe('Role Dashboards', () => {
  let authService: AuthService;
  let jobService: JobService;
  let companyService: CompanyService;

  const mockCompany: Company = {
    _id: 'comp1',
    companyName: 'Recruiter Hub LLC',
    industry: 'Staffing',
    location: 'Chicago, IL'
  };

  const mockJob: Job = {
    _id: 'job1',
    title: 'Fullstack Developer',
    description: 'Work on fullstack app',
    location: 'Chicago, IL',
    category: 'Development',
    employmentType: 'Full Time',
    status: 'Active',
    companyId: mockCompany,
    skills: ['Angular', 'Node.js']
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SeekerDashboardComponent,
        RecruiterDashboardComponent,
        AdminDashboardComponent
      ],
      providers: [
        provideRouter([
          { path: 'auth/login', component: DummyComponent }
        ]),
        provideHttpClient()
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    jobService = TestBed.inject(JobService);
    companyService = TestBed.inject(CompanyService);
  });

  describe('SeekerDashboardComponent', () => {
    let fixture: ComponentFixture<SeekerDashboardComponent>;
    let component: SeekerDashboardComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(SeekerDashboardComponent);
      component = fixture.componentInstance;
    });

    it('should create the seeker dashboard', () => {
      expect(component).toBeTruthy();
    });

    it('should trigger authService.logout on logout()', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockReturnValue(of({ success: true }));
      component.logout();
      expect(logoutSpy).toHaveBeenCalled();
    });
  });

  describe('RecruiterDashboardComponent', () => {
    let fixture: ComponentFixture<RecruiterDashboardComponent>;
    let component: RecruiterDashboardComponent;

    beforeEach(() => {
      vi.spyOn(companyService, 'getCompanies').mockReturnValue(of({
        success: true,
        data: { companies: [], pagination: {} as any }
      }));
      vi.spyOn(jobService, 'getMyJobs').mockReturnValue(of({
        success: true,
        data: { jobs: [], pagination: {} as any }
      }));

      fixture = TestBed.createComponent(RecruiterDashboardComponent);
      component = fixture.componentInstance;
    });

    it('should create the recruiter dashboard', () => {
      expect(component).toBeTruthy();
    });

    it('should trigger authService.logout on logout()', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockReturnValue(of({ success: true }));
      component.logout();
      expect(logoutSpy).toHaveBeenCalled();
    });

    it('should load company profile and my jobs on init', () => {
      const compSpy = vi.spyOn(companyService, 'getCompanies').mockReturnValue(of({
        success: true,
        data: { companies: [mockCompany], pagination: {} as any }
      }));

      const jobsSpy = vi.spyOn(jobService, 'getMyJobs').mockReturnValue(of({
        success: true,
        data: { jobs: [mockJob], pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } }
      }));

      component.loadCompany();
      component.loadMyJobs();

      expect(compSpy).toHaveBeenCalled();
      expect(component.company()?.companyName).toBe('Recruiter Hub LLC');
      expect(jobsSpy).toHaveBeenCalled();
      expect(component.myJobs().length).toBe(1);
    });

    it('should switch tabs and start job creation', () => {
      component.startCreateJob();
      expect(component.activeTab()).toBe('post-job');
      expect(component.editingJobId()).toBeNull();
      expect(component.jobForm.get('title')?.value).toBeFalsy();
    });

    it('should populate form when startEditJob() is called', () => {
      component.startEditJob(mockJob);
      expect(component.activeTab()).toBe('post-job');
      expect(component.editingJobId()).toBe('job1');
      expect(component.jobForm.get('title')?.value).toBe('Fullstack Developer');
    });

    it('should update status of job posting', () => {
      component.myJobs.set([mockJob]);
      const statusSpy = vi.spyOn(jobService, 'updateJobStatus').mockReturnValue(of({
        success: true,
        data: { job: { ...mockJob, status: 'Closed' } }
      }));

      component.changeStatus(mockJob, 'Closed');
      expect(statusSpy).toHaveBeenCalledWith('job1', 'Closed');
      expect(component.myJobs()[0].status).toBe('Closed');
    });

    it('should call deleteJob when confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteSpy = vi.spyOn(jobService, 'deleteJob').mockReturnValue(of({
        success: true,
        message: 'Deleted',
        data: { action: 'deleted' }
      }));

      component.deleteJob(mockJob);
      expect(deleteSpy).toHaveBeenCalledWith('job1');
    });
  });

  describe('AdminDashboardComponent', () => {
    let fixture: ComponentFixture<AdminDashboardComponent>;
    let component: AdminDashboardComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AdminDashboardComponent);
      component = fixture.componentInstance;
    });

    it('should create the admin dashboard', () => {
      expect(component).toBeTruthy();
    });

    it('should trigger authService.logout on logout()', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockReturnValue(of({ success: true }));
      component.logout();
      expect(logoutSpy).toHaveBeenCalled();
    });
  });
});
