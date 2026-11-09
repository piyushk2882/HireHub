import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { NavbarComponent } from '../../../components/navbar/navbar';
import { FooterComponent } from '../../../components/footer/footer';

@Component({
  selector: 'app-seeker-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, NavbarComponent, FooterComponent],
  templateUrl: './seeker-dashboard.html',
  styleUrl: './seeker-dashboard.scss'
})
export class SeekerDashboardComponent {
  authService = inject(AuthService);
  private router = inject(Router);

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/auth/login']);
      },
      error: () => {
        this.router.navigate(['/auth/login']);
      }
    });
  }
}
