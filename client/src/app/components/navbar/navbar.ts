import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class NavbarComponent {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private router = inject(Router);
  private elementRef = inject(ElementRef);

  isMobileMenuOpen = signal(false);
  isNotificationDropdownOpen = signal(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((val) => !val);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  toggleNotificationDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const nextState = !this.isNotificationDropdownOpen();
    this.isNotificationDropdownOpen.set(nextState);

    if (nextState && this.authService.isAuthenticated()) {
      // Refresh notifications when opening dropdown
      this.notificationService.getNotifications(1, 5).subscribe();
      this.notificationService.fetchUnreadCount().subscribe();
    }
  }

  closeNotificationDropdown(): void {
    this.isNotificationDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isNotificationDropdownOpen() && !this.elementRef.nativeElement.contains(target)) {
      this.closeNotificationDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isNotificationDropdownOpen()) {
      this.closeNotificationDropdown();
    }
    if (this.isMobileMenuOpen()) {
      this.closeMobileMenu();
    }
  }

  handleNotificationClick(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    this.closeNotificationDropdown();
    this.closeMobileMenu();

    if (!notification.isRead) {
      this.notificationService.markAsRead(notification._id).subscribe();
    }

    const destination = this.notificationService.getDestinationUrl(notification);
    this.router.navigateByUrl(destination);
  }

  markAsRead(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification._id).subscribe();
    }
  }

  deleteNotification(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(notification._id).subscribe();
  }

  markAllAsRead(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.notificationService.markAllAsRead().subscribe();
  }

  getBadgeText(count: number): string {
    if (count <= 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  }

  logout(): void {
    this.closeMobileMenu();
    this.closeNotificationDropdown();
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
