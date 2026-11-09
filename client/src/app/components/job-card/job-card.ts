import { Component, Input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Job, formatSalary, getCompanyAvatarInfo, getCompanyName } from '../../models/job.model';

@Component({
  selector: 'app-job-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './job-card.html',
  styleUrl: './job-card.scss'
})
export class JobCardComponent {
  @Input({ required: true }) job!: Job;

  get jobId(): string {
    return (this.job._id || this.job.id || '').toString();
  }

  get companyName(): string {
    return getCompanyName(this.job);
  }

  get displaySalary(): string {
    if (this.job.salary) return this.job.salary;
    return formatSalary(this.job.salaryMin, this.job.salaryMax);
  }

  get employmentTypeDisplay(): string {
    return this.job.employmentType || this.job.type || 'Full Time';
  }

  get avatarInfo(): { text: string; bg: string; color: string } {
    if (this.job.logoText && this.job.logoBg && this.job.logoColor) {
      return {
        text: this.job.logoText,
        bg: this.job.logoBg,
        color: this.job.logoColor
      };
    }
    return getCompanyAvatarInfo(this.companyName);
  }
}
