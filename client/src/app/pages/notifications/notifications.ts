import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss'
})
export class NotificationsPageComponent implements OnInit {
  notificationService = inject(NotificationService);
  private router = inject(Router);

  activeFilter = signal<'all' | 'unread'>('all');
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  ngOnInit(): void {
    this.loadPage(1);
    this.notificationService.fetchUnreadCount().subscribe();
  }

  loadPage(page: number): void {
    this.currentPage.set(page);
    this.notificationService
      .getNotifications(page, this.pageSize(), this.activeFilter() === 'unread')
      .subscribe();
  }

  setFilter(filter: 'all' | 'unread'): void {
    if (this.activeFilter() === filter) return;
    this.activeFilter.set(filter);
    this.loadPage(1);
  }

  markAsRead(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification._id).subscribe();
    }
  }

  deleteNotification(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(notification._id).subscribe({
      next: () => {
        // If the current page becomes empty and wasn't page 1, load previous page
        const list = this.notificationService.notifications();
        if (list.length === 0 && this.currentPage() > 1) {
          this.loadPage(this.currentPage() - 1);
        }
      }
    });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe();
  }

  openNotification(notification: AppNotification): void {
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification._id).subscribe();
    }
    const destination = this.notificationService.getDestinationUrl(notification);
    this.router.navigateByUrl(destination);
  }

  formatTime(dateStr: string): string {
    return this.notificationService.formatRelativeTime(dateStr);
  }
}

