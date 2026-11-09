import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Home } from './home';
import { JobService } from '../../services/job.service';
import { Job } from '../../models/job.model';

describe('Home Component (Live API Integration)', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let jobServiceSpy: any;

  const mockJobs: Job[] = [
    {
      _id: 'job1',
      title: 'Senior Frontend Engineer',
      description: 'Build modern Angular apps.',
      companyId: { _id: 'c1', companyName: 'Stripe Innovations' },
      location: 'San Francisco, CA',
      employmentType: 'Full Time',
      experienceLevel: 'Senior',
      category: 'Development',
      skills: ['Angular', 'TypeScript'],
      status: 'Active',
      salaryMin: 130000,
      salaryMax: 170000
    },
    {
      _id: 'job2',
      title: 'Lead UI/UX Designer',
      description: 'Design intuitive interfaces.',
      companyId: { _id: 'c2', companyName: 'Figma Studio' },
      location: 'Remote',
      employmentType: 'Contract',
      experienceLevel: 'Lead',
      category: 'Design',
      skills: ['Figma', 'Prototyping'],
      status: 'Active',
      salaryMin: 110000,
      salaryMax: 140000
    }
  ];

  const mockJobsResponse = {
    success: true,
    message: 'Jobs retrieved successfully.',
    data: {
      jobs: mockJobs,
      pagination: {
        total: 2,
        page: 1,
        limit: 6,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      }
    }
  };

  beforeEach(async () => {
    jobServiceSpy = {
      getJobs: vi.fn().mockReturnValue(of(mockJobsResponse))
    };

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: jobServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch live jobs on initialization and update signals', () => {
    component.ngOnInit();
    expect(jobServiceSpy.getJobs).toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);
    expect(component.jobs().length).toBe(2);
    expect(component.pagination()?.total).toBe(2);
    expect(component.errorMessage()).toBeNull();
  });

  it('should handle API errors and show error state without mock fallback', () => {
    jobServiceSpy.getJobs.mockReturnValue(throwError(() => new Error('Server down')));
    component.loadJobs();

    expect(component.isLoading()).toBe(false);
    expect(component.jobs().length).toBe(0);
    expect(component.errorMessage()).toContain('Unable to connect to live job listings');
  });

  it('should handle empty results and show empty state', () => {
    jobServiceSpy.getJobs.mockReturnValue(of({
      success: true,
      data: {
        jobs: [],
        pagination: { total: 0, page: 1, limit: 6, totalPages: 0, hasNextPage: false, hasPrevPage: false }
      }
    }));

    component.loadJobs();
    expect(component.isLoading()).toBe(false);
    expect(component.jobs().length).toBe(0);
    expect(component.pagination()?.total).toBe(0);
  });

  it('should filter jobs by category and reset to page 1', () => {
    component.selectCategory('Development');
    expect(component.selectedCategory()).toBe('Development');
    expect(component.currentPage()).toBe(1);
    expect(jobServiceSpy.getJobs).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Development',
      page: 1
    }));
  });

  it('should update sorting option and re-query jobs', () => {
    const event = { target: { value: 'salary_desc' } } as any;
    component.setSort(event);
    expect(component.selectedSort()).toBe('salary_desc');
    expect(jobServiceSpy.getJobs).toHaveBeenCalledWith(expect.objectContaining({
      sort: 'salary_desc'
    }));
  });

  it('should debounce search inputs before querying API', async () => {
    vi.useFakeTimers();
    try {
      component.updateSearch({ target: { value: 'Angular' } } as any);
      expect(jobServiceSpy.getJobs).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'Angular' }));

      vi.advanceTimersByTime(400);
      expect(component.searchTerm()).toBe('Angular');
      expect(jobServiceSpy.getJobs).toHaveBeenCalledWith(expect.objectContaining({
        search: 'Angular'
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should change page when goToPage() is called', () => {
    component.pagination.set({
      total: 20,
      page: 1,
      limit: 6,
      totalPages: 4,
      hasNextPage: true,
      hasPrevPage: false
    });

    component.goToPage(2);
    expect(component.currentPage()).toBe(2);
    expect(jobServiceSpy.getJobs).toHaveBeenCalledWith(expect.objectContaining({
      page: 2
    }));
  });

  it('should reset all filters and reload default jobs on resetFilters()', () => {
    component.searchTerm.set('Senior');
    component.locationTerm.set('Austin');
    component.selectedCategory.set('Design');
    component.selectedSort.set('salary_asc');

    component.resetFilters();

    expect(component.searchTerm()).toBe('');
    expect(component.locationTerm()).toBe('');
    expect(component.selectedCategory()).toBe('All');
    expect(component.selectedSort()).toBe('newest');
    expect(component.currentPage()).toBe(1);
    expect(jobServiceSpy.getJobs).toHaveBeenCalled();
  });
});
