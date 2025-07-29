import { Component, effect } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SettingsService } from '../settings/settings.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataApiService } from '../service/data-api.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: true,
  imports: [RouterModule, CommonModule]
})
export class NavbarComponent {
  helpTextEnabled = false;
  developerMode = false;
  

  constructor(
    public settingsService: SettingsService,
    public dataApiService: DataApiService,
    private http: HttpClient
  ) {
    // Load help text toggle state from localStorage
    const stored = localStorage.getItem('helpTextEnabled');
    this.helpTextEnabled = stored === 'true';

    // Reactively update developerMode when settings change
    effect(() => {
      this.developerMode = this.settingsService.settingsSignal().developer;
    });
  }

  toggleHelpText() {
    this.helpTextEnabled = !this.helpTextEnabled;
    localStorage.setItem('helpTextEnabled', String(this.helpTextEnabled));
  }

  goToLanding() {
    window.location.pathname = '/';
  }

  async clearCache() {
    try {
      // Clear server cache
      await firstValueFrom(this.http.delete(`${this.dataApiService.serverURL}/api/cache`));
      console.log('Server cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear server cache:', error);
    }
    
    // Clear local cache and reload
    localStorage.clear();
    window.location.reload();
  }
} 