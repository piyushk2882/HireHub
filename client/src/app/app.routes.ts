import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { LoginComponent } from './pages/auth/login/login';
import { RegisterComponent } from './pages/auth/register/register';
import { SeekerDashboardComponent } from './pages/dashboards/seeker-dashboard/seeker-dashboard';
import { RecruiterDashboardComponent } from './pages/dashboards/recruiter-dashboard/recruiter-dashboard';
import { AdminDashboardComponent } from './pages/dashboards/admin-dashboard/admin-dashboard';
import { PlaceholderComponent } from './pages/placeholder/placeholder';
import { JobDetailsComponent } from './pages/jobs/job-details/job-details';
import { MyApplicationsComponent } from './pages/candidate/my-applications/my-applications';
import { JobApplicantsComponent } from './pages/recruiter/job-applicants/job-applicants';
import { NotificationsPageComponent } from './pages/notifications/notifications';
import { NotificationsSettingsComponent } from './pages/settings/notifications-settings/notifications-settings';
import { authGuard, roleGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    title: 'HireHub – Find a Job That Moves You Forward'
  },
  {
    path: 'auth/login',
    component: LoginComponent,
    canActivate: [guestGuard],
    title: 'Sign In – HireHub'
  },
  {
    path: 'auth/register',
    component: RegisterComponent,
    canActivate: [guestGuard],
    title: 'Create Account – HireHub'
  },
  {
    path: 'seeker/dashboard',
    component: SeekerDashboardComponent,
    canActivate: [authGuard, roleGuard(['job_seeker'])],
    title: 'Job Seeker Dashboard – HireHub'
  },
  {
    path: 'candidate/my-applications',
    component: MyApplicationsComponent,
    canActivate: [authGuard, roleGuard(['job_seeker'])],
    title: 'My Applications – HireHub'
  },
  {
    path: 'recruiter/dashboard',
    component: RecruiterDashboardComponent,
    canActivate: [authGuard, roleGuard(['recruiter'])],
    title: 'Recruiter Dashboard – HireHub'
  },
  {
    path: 'recruiter/jobs/:jobId/applications',
    component: JobApplicantsComponent,
    canActivate: [authGuard, roleGuard(['recruiter', 'admin'])],
    title: 'Job Applicants – HireHub'
  },
  {
    path: 'notifications',
    component: NotificationsPageComponent,
    canActivate: [authGuard],
    title: 'Notifications – HireHub'
  },
  {
    path: 'settings/notifications',
    component: NotificationsSettingsComponent,
    canActivate: [authGuard],
    title: 'Notification Settings – HireHub'
  },
  {
    path: 'admin/dashboard',
    component: AdminDashboardComponent,
    canActivate: [authGuard, roleGuard(['admin'])],
    title: 'Admin Console – HireHub'
  },
  {
    path: 'jobs/:id',
    component: JobDetailsComponent,
    title: 'Job Details – HireHub'
  },
  {
    path: 'recruiter/post-job',
    component: RecruiterDashboardComponent,
    canActivate: [authGuard, roleGuard(['recruiter'])],
    title: 'Post a Job – HireHub'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
