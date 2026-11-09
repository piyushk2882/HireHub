import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class FooterComponent implements OnInit {
  apiStatus = signal<'checking' | 'online' | 'offline'>('checking');
  apiMessage = signal<string>('Connecting to backend...');

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.checkBackendHealth();
  }

  private checkBackendHealth(): void {
    this.apiService.checkHealth().subscribe({
      next: (res) => {
        this.apiStatus.set('online');
        this.apiMessage.set(res?.message || 'API Connected');
      },
      error: () => {
        // Fallback gracefully without breaking UI if server isn't running
        this.apiStatus.set('offline');
        this.apiMessage.set('API Standby (Demo Data Active)');
      }
    });
  }
}

