import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar';
import { FooterComponent } from '../../../components/footer/footer';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import {
  Application,
  ApplicationJobInfo,
  ApplicationStatus,
  getApplicationStatusBadge
} from '../../../models/application.model';
import { PaginationMetadata, formatSalary, getCompanyAvatarInfo } from '../../../models/job.model';

@Component({
  selector: 'app-my-applications',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, NavbarComponent, FooterComponent],
  templateUrl: './my-applications.html',
  styleUrl: './my-applications.scss'
})
export class MyApplicationsComponent implements OnInit {
  private applicationService = inject(ApplicationService);
  authService = inject(AuthService);
  private router = inject(Router);

  // Data signals
  applications = signal<Application[]>([]);
  pagination = signal<PaginationMetadata | null>(null);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Filters & Pagination signals
  selectedStatus = signal<string>('All');
  selectedSort = signal<'newest' | 'oldest'>('newest');
  currentPage = signal<number>(1);

  // Details Modal signals
  selectedApplication = signal<Application | null>(null);
  isLoadingDetails = signal<boolean>(false);
  isDownloadingResume = signal<boolean>(false);

  statuses = ['All', 'Pending', 'Reviewed', 'Shortlisted', 'Accepted', 'Rejected'];

  ngOnInit(): void {
    this.loadApplications();
  }

  loadApplications(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const query: { status?: string; sort?: 'newest' | 'oldest'; page?: number; limit?: number } = {
      page: this.currentPage(),
      limit: 10,
      sort: this.selectedSort()
    };

    if (this.selectedStatus() !== 'All') {
      query.status = this.selectedStatus();
    }

    this.applicationService.getMyApplications(query).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          this.applications.set(res.data.applications || []);
          this.pagination.set(res.data.pagination || null);
        } else {
          this.applications.set([]);
          this.pagination.set(null);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err.error?.message || 'Unable to retrieve your applications. Please check your connection and try again.'
        );
      }
    });
  }

  filterByStatus(status: string): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadApplications();
  }

  changeSort(sort: 'newest' | 'oldest'): void {
    this.selectedSort.set(sort);
    this.currentPage.set(1);
    this.loadApplications();
  }

  goToPage(page: number): void {
    const pag = this.pagination();
    if (!pag || page < 1 || page > pag.totalPages) return;
    this.currentPage.set(page);
    this.loadApplications();
  }

  openDetails(app: Application): void {
    this.selectedApplication.set(app);
    this.isLoadingDetails.set(true);

    // Fetch full details with populated history
    this.applicationService.getApplicationById(app._id).subscribe({
      next: (res) => {
        this.isLoadingDetails.set(false);
        if (res.success && res.data?.application) {
          this.selectedApplication.set(res.data.application);
        }
      },
      error: () => {
        this.isLoadingDetails.set(false);
      }
    });
  }

  closeDetails(): void {
    this.selectedApplication.set(null);
  }

  downloadResume(app: Application): void {
    this.isDownloadingResume.set(true);
    const filename = app.resumeOriginalName || 'my_resume.pdf';

    this.applicationService.downloadResumeAndSave(app._id, filename).subscribe({
      next: () => {
        this.isDownloadingResume.set(false);
      },
      error: () => {
        this.isDownloadingResume.set(false);
        alert('Could not download resume. Please try again.');
      }
    });
  }

  getJobInfo(app: Application): ApplicationJobInfo | null {
    if (app.jobId && typeof app.jobId === 'object') {
      return app.jobId as ApplicationJobInfo;
    }
    return null;
  }

  getJobTitle(app: Application): string {
    const job = this.getJobInfo(app);
    return job?.title || 'Job Opportunity';
  }

  getCompanyName(app: Application): string {
    const job = this.getJobInfo(app);
    if (job?.companyId && typeof job.companyId === 'object' && job.companyId.companyName) {
      return job.companyId.companyName;
    }
    return 'Company Confidential';
  }

  getCompanyLocation(app: Application): string {
    const job = this.getJobInfo(app);
    return job?.location || 'Remote';
  }

  getEmploymentType(app: Application): string {
    const job = this.getJobInfo(app);
    return job?.employmentType || 'Full Time';
  }

  getSalaryDisplay(app: Application): string {
    const job = this.getJobInfo(app);
    if (!job) return 'Competitive';
    return formatSalary(job.salaryMin, job.salaryMax);
  }

  getAvatar(app: Application): { text: string; bg: string; color: string } {
    return getCompanyAvatarInfo(this.getCompanyName(app));
  }

  getStatusBadge(status: ApplicationStatus | string) {
    return getApplicationStatusBadge(status);
  }
}

