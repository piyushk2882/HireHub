import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar';
import { FooterComponent } from '../../../components/footer/footer';
import { Job, formatSalary, getCompanyAvatarInfo, getCompanyName } from '../../../models/job.model';
import { JobService } from '../../../services/job.service';
import { AuthService } from '../../../services/auth.service';
import { ApplicationService } from '../../../services/application.service';

@Component({
  selector: 'app-job-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './job-details.html',
  styleUrl: './job-details.scss'
})
export class JobDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private jobService = inject(JobService);
  private applicationService = inject(ApplicationService);
  authService = inject(AuthService);

  job = signal<Job | null>(null);
  isLoading = signal<boolean>(true);
  isNotFound = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Application Modal state
  showApplyModal = signal<boolean>(false);
  isRoleRestricted = signal<boolean>(false);

  // Form fields & submission state
  selectedResumeFile = signal<File | null>(null);
  resumeFileError = signal<string | null>(null);
  coverLetter = signal<string>('');
  isSubmitting = signal<boolean>(false);
  submitError = signal<string | null>(null);
  isSubmittedSuccess = signal<boolean>(false);
  submittedApplicationId = signal<string | null>(null);

  ngOnInit(): void {
    const jobId = this.route.snapshot.paramMap.get('id');
    if (!jobId) {
      this.isNotFound.set(true);
      this.isLoading.set(false);
      return;
    }
    this.fetchJob(jobId);
  }

  fetchJob(id: string): void {
    this.isLoading.set(true);
    this.isNotFound.set(false);
    this.errorMessage.set(null);

    this.jobService.getJobById(id).subscribe({
      next: (res) => {
        if (res.success && res.data?.job) {
          this.job.set(res.data.job);
        } else {
          this.isNotFound.set(true);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 404 || err.status === 400) {
          this.isNotFound.set(true);
        } else {
          this.errorMessage.set('An error occurred while loading job details. Please try again.');
        }
      }
    });
  }

  get companyName(): string {
    const currentJob = this.job();
    if (!currentJob) return 'Company Confidential';
    return getCompanyName(currentJob);
  }

  get formattedSalary(): string {
    const currentJob = this.job();
    if (!currentJob) return 'Competitive';
    if (currentJob.salary) return currentJob.salary;
    return formatSalary(currentJob.salaryMin, currentJob.salaryMax);
  }

  get avatarInfo(): { text: string; bg: string; color: string } {
    const currentJob = this.job();
    if (currentJob?.logoText && currentJob?.logoBg && currentJob?.logoColor) {
      return {
        text: currentJob.logoText,
        bg: currentJob.logoBg,
        color: currentJob.logoColor
      };
    }
    return getCompanyAvatarInfo(this.companyName);
  }

  get postedDateDisplay(): string {
    const currentJob = this.job();
    if (!currentJob) return '';
    if (currentJob.postedDate) return currentJob.postedDate;
    if (currentJob.createdAt) {
      const date = new Date(currentJob.createdAt);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return 'Recently posted';
  }

  get deadlineDisplay(): string | null {
    const currentJob = this.job();
    if (!currentJob?.applicationDeadline) return null;
    const date = new Date(currentJob.applicationDeadline);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  handleApply(): void {
    if (!this.authService.isAuthenticated()) {
      const currentUrl = this.router.url;
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: currentUrl }
      });
      return;
    }

    if (this.authService.userRole() !== 'job_seeker') {
      this.isRoleRestricted.set(true);
      this.showApplyModal.set(true);
      return;
    }

    this.isRoleRestricted.set(false);
    this.resetApplicationForm();
    this.showApplyModal.set(true);
  }

  closeApplyModal(): void {
    this.showApplyModal.set(false);
    this.resetApplicationForm();
  }

  resetApplicationForm(): void {
    this.selectedResumeFile.set(null);
    this.resumeFileError.set(null);
    this.coverLetter.set('');
    this.isSubmitting.set(false);
    this.submitError.set(null);
    this.isSubmittedSuccess.set(false);
    this.submittedApplicationId.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.validateAndSetFile(file);
  }

  validateAndSetFile(file: File): void {
    this.resumeFileError.set(null);
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];

    if (!allowed.includes(ext)) {
      this.resumeFileError.set('Unsupported file format. Only PDF, DOC, and DOCX files are allowed.');
      this.selectedResumeFile.set(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.resumeFileError.set('File size exceeds the 5 MB limit. Please select a smaller file.');
      this.selectedResumeFile.set(null);
      return;
    }

    this.selectedResumeFile.set(file);
  }

  removeFile(): void {
    this.selectedResumeFile.set(null);
    this.resumeFileError.set(null);
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  submitApplication(): void {
    const file = this.selectedResumeFile();
    if (!file) {
      this.resumeFileError.set('Please upload your resume before submitting.');
      return;
    }

    const currentJob = this.job();
    const jobId = currentJob?._id || (currentJob?.id as string);
    if (!jobId) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);

    const formData = new FormData();
    formData.append('resume', file, file.name);
    if (this.coverLetter().trim()) {
      formData.append('coverLetter', this.coverLetter().trim());
    }

    this.applicationService.submitApplication(jobId, formData).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.isSubmittedSuccess.set(true);
        this.submittedApplicationId.set(res.data.application._id);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        if (err.status === 409) {
          this.submitError.set('You have already submitted an application for this job.');
        } else if (err.status === 401) {
          this.submitError.set('Your session has expired. Please log in again.');
        } else if (err.error?.message) {
          this.submitError.set(err.error.message);
        } else {
          this.submitError.set('An error occurred while submitting your application. Please try again.');
        }
      }
    });
  }
}
