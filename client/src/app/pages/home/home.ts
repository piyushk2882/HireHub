import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NavbarComponent } from '../../components/navbar/navbar';
import { JobCardComponent } from '../../components/job-card/job-card';
import { FooterComponent } from '../../components/footer/footer';
import { CATEGORIES } from '../../data/jobs.data';
import { Job, JobFilters, PaginationMetadata } from '../../models/job.model';
import { JobService } from '../../services/job.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, NavbarComponent, JobCardComponent, FooterComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit, OnDestroy {
  private jobService = inject(JobService);

  // Master reactive state signals
  jobs = signal<Job[]>([]);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  pagination = signal<PaginationMetadata | null>(null);

  // Filter signals
  searchTerm = signal<string>('');
  locationTerm = signal<string>('');
  selectedCategory = signal<string>('All');
  selectedEmploymentType = signal<string>('All');
  selectedExperienceLevel = signal<string>('All');
  selectedSort = signal<'newest' | 'oldest' | 'salary_asc' | 'salary_desc'>('newest');
  currentPage = signal<number>(1);
  pageSize = signal<number>(6);

  categories = CATEGORIES;
  employmentTypes = ['All', 'Full Time', 'Part Time', 'Contract', 'Remote', 'Hybrid', 'Internship'];
  experienceLevels = ['All', 'Entry', 'Mid', 'Senior', 'Lead', 'Executive'];

  // Debounced search subjects
  private searchSubject = new Subject<string>();
  private locationSubject = new Subject<string>();
  private subs: Subscription[] = [];

  constructor() {
    this.subs.push(
      this.searchSubject
        .pipe(debounceTime(350), distinctUntilChanged())
        .subscribe(term => {
          this.searchTerm.set(term);
          this.currentPage.set(1);
          this.loadJobs();
        })
    );

    this.subs.push(
      this.locationSubject
        .pipe(debounceTime(350), distinctUntilChanged())
        .subscribe(loc => {
          this.locationTerm.set(loc);
          this.currentPage.set(1);
          this.loadJobs();
        })
    );
  }

  ngOnInit(): void {
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /**
   * Fetches live published Active jobs from MongoDB via JobService.
   */
  loadJobs(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const filters: JobFilters = {
      search: this.searchTerm() || undefined,
      location: this.locationTerm() || undefined,
      category: this.selectedCategory() !== 'All' ? this.selectedCategory() : undefined,
      employmentType: this.selectedEmploymentType() !== 'All' ? this.selectedEmploymentType() : undefined,
      experienceLevel: this.selectedExperienceLevel() !== 'All' ? this.selectedExperienceLevel() : undefined,
      sort: this.selectedSort(),
      page: this.currentPage(),
      limit: this.pageSize()
    };

    this.jobService.getJobs(filters).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.jobs.set(res.data.jobs || []);
          this.pagination.set(res.data.pagination || null);
        } else {
          this.jobs.set([]);
          this.pagination.set(null);
        }
        this.isLoading.set(false);
      },
      error: err => {
        console.error('[Home API Error]:', err);
        this.isLoading.set(false);
        this.errorMessage.set(
          'Unable to connect to live job listings. Please ensure the backend server is running and try again.'
        );
        this.jobs.set([]);
        this.pagination.set(null);
      }
    });
  }

  // Filter actions
  updateSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchSubject.next(input.value);
  }

  updateLocation(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.locationSubject.next(input.value);
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.currentPage.set(1);
    this.loadJobs();
  }

  setEmploymentType(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedEmploymentType.set(select.value);
    this.currentPage.set(1);
    this.loadJobs();
  }

  setExperienceLevel(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedExperienceLevel.set(select.value);
    this.currentPage.set(1);
    this.loadJobs();
  }

  setSort(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedSort.set(select.value as any);
    this.currentPage.set(1);
    this.loadJobs();
  }

  setPopularSearch(query: string): void {
    this.searchTerm.set(query);
    this.currentPage.set(1);
    this.loadJobs();
    this.scrollToSection('jobs');
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.locationTerm.set('');
    this.selectedCategory.set('All');
    this.selectedEmploymentType.set('All');
    this.selectedExperienceLevel.set('All');
    this.selectedSort.set('newest');
    this.currentPage.set(1);
    this.loadJobs();
  }

  searchJobs(): void {
    this.currentPage.set(1);
    this.loadJobs();
    this.scrollToSection('jobs');
  }

  goToPage(page: number): void {
    const pag = this.pagination();
    if (!pag || page < 1 || page > pag.totalPages) return;
    this.currentPage.set(page);
    this.loadJobs();
    this.scrollToSection('jobs');
  }

  // Computed helper to check if any filters are currently active
  hasActiveFilters = computed(() => {
    return (
      !!this.searchTerm() ||
      !!this.locationTerm() ||
      this.selectedCategory() !== 'All' ||
      this.selectedEmploymentType() !== 'All' ||
      this.selectedExperienceLevel() !== 'All' ||
      this.selectedSort() !== 'newest'
    );
  });

  private scrollToSection(sectionId: string): void {
    if (typeof document !== 'undefined') {
      const element = document.getElementById(sectionId);
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}
