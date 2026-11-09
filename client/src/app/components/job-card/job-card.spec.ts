import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JobCardComponent } from './job-card';
import { SAMPLE_JOBS } from '../../data/jobs.data';

describe('JobCardComponent', () => {
  let component: JobCardComponent;
  let fixture: ComponentFixture<JobCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JobCardComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(JobCardComponent);
    component = fixture.componentInstance;
    component.job = SAMPLE_JOBS[0];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create the job card', () => {
    expect(component).toBeTruthy();
  });

  it('should render job title and company correctly', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job-title')?.textContent).toContain('Frontend Developer');
    expect(el.querySelector('.company-name')?.textContent).toContain('TechNova Solutions');
  });

  it('should render salary and location', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.salary-amount')?.textContent).toContain('₹6–9 LPA');
    expect(el.textContent).toContain('Bangalore');
  });
});

