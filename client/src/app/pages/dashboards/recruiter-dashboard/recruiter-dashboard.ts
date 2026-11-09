import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { JobService } from '../../../services/job.service';
import { CompanyService } from '../../../services/company.service';
import { NavbarComponent } from '../../../components/navbar/navbar';
import { FooterComponent } from '../../../components/footer/footer';
import { Job, Company, PaginationMetadata, formatSalary } from '../../../models/job.model';

@Component({
  selector: 'app-recruiter-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe, NavbarComponent, FooterComponent],
  templateUrl: './recruiter-dashboard.html',
  styleUrl: './recruiter-dashboard.scss'
})
export class RecruiterDashboardComponent implements OnInit {
  authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private jobService = inject(JobService);
  private companyService = inject(CompanyService);
  private fb = inject(FormBuilder);

  // Active navigation tab: 'jobs' | 'post-job' | 'company'
  activeTab = signal<'jobs' | 'post-job' | 'company'>('jobs');

  // Job management state
  myJobs = signal<Job[]>([]);
  isLoadingJobs = signal<boolean>(false);
  jobsErrorMessage = signal<string | null>(null);
  pagination = signal<PaginationMetadata | null>(null);
  selectedStatus = signal<string>('All');
  currentPage = signal<number>(1);
  editingJobId = signal<string | null>(null);

  // Company management state
  company = signal<Company | null>(null);
  isLoadingCompany = signal<boolean>(false);
  companyErrorMessage = signal<string | null>(null);

  // User feedback toast / banner
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  isSubmitting = signal<boolean>(false);

  // Forms
  jobForm!: FormGroup;
  companyForm!: FormGroup;

  categories = ['Development', 'Design', 'Marketing', 'Data Science', 'Business', 'Other'];
  employmentTypes = ['Full Time', 'Part Time', 'Contract', 'Remote', 'Hybrid', 'Internship'];
  experienceLevels = ['Entry', 'Mid', 'Senior', 'Lead', 'Executive'];
  statuses = ['Active', 'Draft', 'Closed', 'Archived'];

  constructor() {
    this.initForms();
  }

  ngOnInit(): void {
    this.loadCompany();
    this.loadMyJobs();

    // Check for query param or route URL (e.g. /recruiter/post-job or ?tab=post-job)
    if (this.router.url.includes('post-job')) {
      this.activeTab.set('post-job');
    }

    this.route.queryParamMap.subscribe(params => {
      const tabParam = params.get('tab');
      if (tabParam === 'post-job' || tabParam === 'company' || tabParam === 'jobs') {
        this.activeTab.set(tabParam);
      }
    });
  }

  private initForms(): void {
    this.jobForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(120)]],
      description: ['', [Validators.required]],
      requirements: [''],
      responsibilities: [''],
      location: ['', [Validators.required]],
      employmentType: ['Full Time', [Validators.required]],
      experienceLevel: ['Mid', [Validators.required]],
      salaryMin: [null, [Validators.min(0)]],
      salaryMax: [null, [Validators.min(0)]],
      category: ['Development', [Validators.required]],
      skills: [''],
      applicationDeadline: [''],
      status: ['Active', [Validators.required]]
    });

    this.companyForm = this.fb.group({
      companyName: ['', [Validators.required, Validators.maxLength(150)]],
      industry: [''],
      website: [''],
      location: [''],
      description: [''],
      logo: ['']
    });
  }

  /**
   * Loads recruiter's company profile.
   */
  loadCompany(): void {
    this.isLoadingCompany.set(true);
    const recruiterId = this.authService.currentUser()?.id || (this.authService.currentUser() as any)?._id;

    this.companyService.getCompanies({ recruiterId }).subscribe({
      next: res => {
        this.isLoadingCompany.set(false);
        if (res.success && res.data?.companies && res.data.companies.length > 0) {
          const comp = res.data.companies[0];
          this.company.set(comp);
          this.companyForm.patchValue({
            companyName: comp.companyName || '',
            industry: comp.industry || '',
            website: comp.website || '',
            location: comp.location || '',
            description: comp.description || '',
            logo: comp.logo || ''
          });
        } else {
          this.company.set(null);
        }
      },
      error: () => {
        this.isLoadingCompany.set(false);
        this.company.set(null);
      }
    });
  }

  /**
   * Loads recruiter's jobs listing from GET /api/jobs/my-jobs.
   */
  loadMyJobs(): void {
    this.isLoadingJobs.set(true);
    this.jobsErrorMessage.set(null);

    const query: { status?: string; page?: number; limit?: number } = {
      page: this.currentPage(),
      limit: 10
    };

    if (this.selectedStatus() !== 'All') {
      query.status = this.selectedStatus();
    }

    this.jobService.getMyJobs(query).subscribe({
      next: res => {
        this.isLoadingJobs.set(false);
        if (res.success && res.data) {
          this.myJobs.set(res.data.jobs || []);
          this.pagination.set(res.data.pagination || null);
        } else {
          this.myJobs.set([]);
          this.pagination.set(null);
        }
      },
      error: err => {
        this.isLoadingJobs.set(false);
        this.jobsErrorMessage.set('Unable to load your job postings. Please try again.');
      }
    });
  }

  /**
   * Switch tab navigation.
   */
  setTab(tab: 'jobs' | 'post-job' | 'company'): void {
    this.activeTab.set(tab);
    this.feedbackMessage.set(null);
  }

  filterByStatus(status: string): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadMyJobs();
  }

  goToPage(page: number): void {
    const pag = this.pagination();
    if (!pag || page < 1 || page > pag.totalPages) return;
    this.currentPage.set(page);
    this.loadMyJobs();
  }

  /**
   * Initiate job creation form.
   */
  startCreateJob(): void {
    this.editingJobId.set(null);
    this.jobForm.reset({
      employmentType: 'Full Time',
      experienceLevel: 'Mid',
      category: 'Development',
      status: 'Active'
    });
    this.setTab('post-job');
  }

  /**
   * Initiate job editing form.
   */
  startEditJob(job: Job): void {
    this.editingJobId.set(job._id || (job.id ? String(job.id) : null));

    let deadlineString = '';
    if (job.applicationDeadline) {
      const d = new Date(job.applicationDeadline);
      if (!isNaN(d.getTime())) {
        deadlineString = d.toISOString().split('T')[0];
      }
    }

    this.jobForm.patchValue({
      title: job.title,
      description: job.description,
      requirements: Array.isArray(job.requirements) ? job.requirements.join('\n') : '',
      responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities.join('\n') : '',
      location: job.location,
      employmentType: job.employmentType || job.type || 'Full Time',
      experienceLevel: job.experienceLevel || 'Mid',
      salaryMin: job.salaryMin || null,
      salaryMax: job.salaryMax || null,
      category: job.category,
      skills: Array.isArray(job.skills) ? job.skills.join(', ') : '',
      applicationDeadline: deadlineString,
      status: job.status || 'Active'
    });

    this.setTab('post-job');
  }

  /**
   * Submit job form (create or edit).
   */
  submitJob(): void {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    const currentCompany = this.company();
    if (!currentCompany) {
      this.feedbackMessage.set({
        type: 'error',
        text: 'You must set up your Company Profile before posting job opportunities.'
      });
      this.setTab('company');
      return;
    }

    const val = this.jobForm.value;

    if (val.salaryMin && val.salaryMax && Number(val.salaryMin) > Number(val.salaryMax)) {
      this.feedbackMessage.set({
        type: 'error',
        text: 'Minimum salary cannot exceed maximum salary.'
      });
      return;
    }

    this.isSubmitting.set(true);

    const payload: Partial<Job> = {
      title: val.title,
      description: val.description,
      requirements: val.requirements ? val.requirements.split('\n').map((s: string) => s.trim()).filter(Boolean) : [],
      responsibilities: val.responsibilities ? val.responsibilities.split('\n').map((s: string) => s.trim()).filter(Boolean) : [],
      location: val.location,
      employmentType: val.employmentType,
      experienceLevel: val.experienceLevel,
      salaryMin: val.salaryMin ? Number(val.salaryMin) : undefined,
      salaryMax: val.salaryMax ? Number(val.salaryMax) : undefined,
      category: val.category,
      skills: val.skills ? val.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      applicationDeadline: val.applicationDeadline || undefined,
      status: val.status,
      companyId: currentCompany._id
    };

    const editId = this.editingJobId();

    if (editId) {
      this.jobService.updateJob(editId, payload).subscribe({
        next: res => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'success',
            text: 'Job posting successfully updated.'
          });
          this.loadMyJobs();
          this.setTab('jobs');
        },
        error: err => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'error',
            text: err.error?.message || 'Failed to update job posting.'
          });
        }
      });
    } else {
      this.jobService.createJob(payload).subscribe({
        next: res => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'success',
            text: 'New job posting successfully created and published.'
          });
          this.loadMyJobs();
          this.setTab('jobs');
        },
        error: err => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'error',
            text: err.error?.message || 'Failed to create job posting.'
          });
        }
      });
    }
  }

  /**
   * Update status of job via PATCH /api/jobs/:id/status.
   */
  changeStatus(job: Job, newStatus: string): void {
    const id = (job._id || job.id)?.toString();
    if (!id) return;

    this.jobService.updateJobStatus(id, newStatus).subscribe({
      next: res => {
        this.feedbackMessage.set({
          type: 'success',
          text: `Job status updated to ${newStatus}.`
        });
        // Update locally
        this.myJobs.update(jobs =>
          jobs.map(j => (j._id === id || j.id === id ? { ...j, status: newStatus } : j))
        );
      },
      error: err => {
        this.feedbackMessage.set({
          type: 'error',
          text: err.error?.message || 'Failed to update job status.'
        });
      }
    });
  }

  /**
   * Safely deletes or archives job via DELETE /api/jobs/:id.
   */
  deleteJob(job: Job): void {
    const confirmed = confirm(
      `Are you sure you want to delete "${job.title}"? If candidates have applied, the job will be safely archived instead of removed.`
    );
    if (!confirmed) return;

    const id = (job._id || job.id)?.toString();
    if (!id) return;

    this.jobService.deleteJob(id).subscribe({
      next: res => {
        const actionTaken = res.data?.action === 'archived' ? 'archived' : 'permanently deleted';
        this.feedbackMessage.set({
          type: 'success',
          text: `Job was ${actionTaken} successfully.`
        });
        this.loadMyJobs();
      },
      error: err => {
        this.feedbackMessage.set({
          type: 'error',
          text: err.error?.message || 'Failed to remove job posting.'
        });
      }
    });
  }

  /**
   * Save Company Profile (Create or Update).
   */
  saveCompany(): void {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const formVal = this.companyForm.value;
    const existingComp = this.company();

    if (existingComp) {
      this.companyService.updateCompany(existingComp._id, formVal).subscribe({
        next: res => {
          this.isSubmitting.set(false);
          if (res.success && res.data?.company) {
            this.company.set(res.data.company);
          }
          this.feedbackMessage.set({
            type: 'success',
            text: 'Company profile successfully updated.'
          });
        },
        error: err => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'error',
            text: err.error?.message || 'Failed to update company profile.'
          });
        }
      });
    } else {
      this.companyService.createCompany(formVal).subscribe({
        next: res => {
          this.isSubmitting.set(false);
          if (res.success && res.data?.company) {
            this.company.set(res.data.company);
          }
          this.feedbackMessage.set({
            type: 'success',
            text: 'Company profile created! You can now post job opportunities.'
          });
        },
        error: err => {
          this.isSubmitting.set(false);
          this.feedbackMessage.set({
            type: 'error',
            text: err.error?.message || 'Failed to create company profile.'
          });
        }
      });
    }
  }

  formatJobSalary(job: Job): string {
    if (job.salary) return job.salary;
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  // Dynamic quick metrics
  activeJobsCount = computed(() => {
    return this.myJobs().filter(j => j.status === 'Active').length;
  });

  draftJobsCount = computed(() => {
    return this.myJobs().filter(j => j.status === 'Draft').length;
  });

  totalJobsCount = computed(() => {
    return this.pagination()?.total !== undefined ? this.pagination()!.total : this.myJobs().length;
  });

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => this.router.navigate(['/auth/login'])
    });
  }
}
