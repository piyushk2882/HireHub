import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar';
import { FooterComponent } from '../../../components/footer/footer';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import {
  Application,
  ApplicationApplicantInfo,
  ApplicationStatus,
  getApplicationStatusBadge
} from '../../../models/application.model';
import { PaginationMetadata } from '../../../models/job.model';

@Component({
  selector: 'app-job-applicants',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, NavbarComponent, FooterComponent],
  templateUrl: './job-applicants.html',
  styleUrl: './job-applicants.scss'
})
export class JobApplicantsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private applicationService = inject(ApplicationService);
  authService = inject(AuthService);

  jobId = signal<string>('');
  job = signal<{ _id: string; title: string; status: string } | null>(null);
  applicants = signal<Application[]>([]);
  pagination = signal<PaginationMetadata | null>(null);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Filters & sorting
  selectedStatus = signal<string>('All');
  selectedSort = signal<'newest' | 'oldest'>('newest');
  currentPage = signal<number>(1);

  // Application Details Side Panel / Modal
  selectedApplication = signal<Application | null>(null);
  isLoadingDetails = signal<boolean>(false);

  // Status Change Confirmation Modal
  statusChangeModal = signal<{ app: Application; targetStatus: ApplicationStatus } | null>(null);
  statusNote = signal<string>('');
  isUpdatingStatus = signal<boolean>(false);
  statusUpdateError = signal<string | null>(null);

  // Feedback Notification
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  isDownloadingResume = signal<boolean>(false);

  statuses = ['All', 'Pending', 'Reviewed', 'Shortlisted', 'Accepted', 'Rejected'];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('jobId');
    if (!id) {
      this.errorMessage.set('Job ID is missing.');
      this.isLoading.set(false);
      return;
    }
    this.jobId.set(id);
    this.loadApplicants();
  }

  loadApplicants(): void {
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

    this.applicationService.getJobApplications(this.jobId(), query).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.data) {
          if (res.data.job) {
            this.job.set(res.data.job);
          }
          this.applicants.set(res.data.applications || []);
          this.pagination.set(res.data.pagination || null);
        } else {
          this.applicants.set([]);
          this.pagination.set(null);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 403) {
          this.errorMessage.set('Access denied. You can only view applications for your own job postings.');
        } else if (err.status === 404) {
          this.errorMessage.set('Job posting was not found.');
        } else {
          this.errorMessage.set(
            err.error?.message || 'Unable to retrieve applicants for this job. Please try again.'
          );
        }
      }
    });
  }

  filterByStatus(status: string): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadApplicants();
  }

  changeSort(sort: 'newest' | 'oldest'): void {
    this.selectedSort.set(sort);
    this.currentPage.set(1);
    this.loadApplicants();
  }

  goToPage(page: number): void {
    const pag = this.pagination();
    if (!pag || page < 1 || page > pag.totalPages) return;
    this.currentPage.set(page);
    this.loadApplicants();
  }

  openDetails(app: Application): void {
    this.selectedApplication.set(app);
    this.isLoadingDetails.set(true);

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
    const filename = app.resumeOriginalName || 'applicant_resume.pdf';

    this.applicationService.downloadResumeAndSave(app._id, filename).subscribe({
      next: () => {
        this.isDownloadingResume.set(false);
      },
      error: () => {
        this.isDownloadingResume.set(false);
        this.showFeedback('error', 'Failed to download resume file.');
      }
    });
  }

  getAllowedTransitions(status: ApplicationStatus | string): ApplicationStatus[] {
    switch (status) {
      case 'Pending':
        return ['Reviewed', 'Shortlisted', 'Rejected'];
      case 'Reviewed':
        return ['Shortlisted', 'Accepted', 'Rejected'];
      case 'Shortlisted':
        return ['Accepted', 'Rejected'];
      case 'Accepted':
      case 'Rejected':
      default:
        return [];
    }
  }

  promptStatusChange(app: Application, targetStatus: ApplicationStatus): void {
    this.statusChangeModal.set({ app, targetStatus });
    this.statusNote.set('');
    this.statusUpdateError.set(null);
  }

  closeStatusModal(): void {
    this.statusChangeModal.set(null);
    this.statusNote.set('');
    this.statusUpdateError.set(null);
    this.isUpdatingStatus.set(false);
  }

  confirmStatusChange(): void {
    const modalData = this.statusChangeModal();
    if (!modalData) return;

    this.isUpdatingStatus.set(true);
    this.statusUpdateError.set(null);

    const { app, targetStatus } = modalData;
    const note = this.statusNote();

    this.applicationService.updateApplicationStatus(app._id, targetStatus, note).subscribe({
      next: (res) => {
        this.isUpdatingStatus.set(false);
        this.closeStatusModal();

        const updated = res.data.application;

        // Update in applicants list
        const currentList = this.applicants();
        const updatedList = currentList.map((item) => (item._id === updated._id ? { ...item, ...updated } : item));
        this.applicants.set(updatedList);

        // Update selected application if open
        if (this.selectedApplication()?._id === updated._id) {
          this.selectedApplication.set(updated);
        }

        this.showFeedback('success', `Application status successfully updated to '${targetStatus}'.`);
      },
      error: (err) => {
        this.isUpdatingStatus.set(false);
        this.statusUpdateError.set(
          err.error?.message || 'Failed to update application status. Please check your permissions.'
        );
      }
    });
  }

  showFeedback(type: 'success' | 'error', text: string): void {
    this.feedbackMessage.set({ type, text });
    setTimeout(() => {
      this.feedbackMessage.set(null);
    }, 4500);
  }

  getApplicantInfo(app: Application): ApplicationApplicantInfo | null {
    if (app.applicantId && typeof app.applicantId === 'object') {
      return app.applicantId as ApplicationApplicantInfo;
    }
    return null;
  }

  getCandidateName(app: Application): string {
    const candidate = this.getApplicantInfo(app);
    return candidate?.name || 'Applicant';
  }

  getCandidateEmail(app: Application): string {
    const candidate = this.getApplicantInfo(app);
    return candidate?.email || 'N/A';
  }

  getCandidatePhone(app: Application): string | null {
    const candidate = this.getApplicantInfo(app);
    return candidate?.phone || null;
  }

  getStatusBadge(status: ApplicationStatus | string) {
    return getApplicationStatusBadge(status);
  }
}

