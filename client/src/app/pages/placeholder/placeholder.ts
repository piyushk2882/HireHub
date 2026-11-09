import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SAMPLE_JOBS } from '../../data/jobs.data';
import { Job } from '../../models/job.model';
import { NavbarComponent } from '../../components/navbar/navbar';
import { FooterComponent } from '../../components/footer/footer';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './placeholder.html',
  styleUrl: './placeholder.scss'
})
export class PlaceholderComponent implements OnInit {
  pageType = signal<'job' | 'login' | 'register' | 'recruiter' | 'general'>('general');
  pageTitle = signal<string>('Page in Progress');
  jobDetails = signal<Job | null>(null);

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path || '';
    const idParam = this.route.snapshot.paramMap.get('id');

    if (path.startsWith('jobs/') && idParam) {
      this.pageType.set('job');
      const numericId = parseInt(idParam, 10);
      const matched = SAMPLE_JOBS.find(j => j.id === numericId);
      if (matched) {
        this.jobDetails.set(matched);
        this.pageTitle.set(`${matched.title} at ${matched.company}`);
      } else {
        this.pageTitle.set('Job Opportunity Details');
      }
    } else if (path.includes('login')) {
      this.pageType.set('login');
      this.pageTitle.set('Sign In to HireHub');
    } else if (path.includes('register')) {
      this.pageType.set('register');
      this.pageTitle.set('Create Your HireHub Account');
    } else if (path.includes('post-job')) {
      this.pageType.set('recruiter');
      this.pageTitle.set('Post a Job Opportunity');
    }
  }
}

