import { Component, effect } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SettingsService } from '../settings/settings.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataApiService } from '../service/data-api.service';
import { PatientService } from '../service/patient.service';
import { TOAST_TIMEOUT } from '../constants';

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
  notification = { message: '', type: '', show: false };
  showResetPopup = false;
  

  constructor(
    public settingsService: SettingsService,
    public dataApiService: DataApiService,
    private http: HttpClient,
    private patientService: PatientService
  ) {
    // Load help text toggle state from localStorage
    const stored = localStorage.getItem('helpTextEnabled');
    this.helpTextEnabled = stored === 'true';

    // Reactively update developerMode when settings change
    effect(() => {
      this.developerMode = this.settingsService.settingsSignal().developer;
    });
  }

  showNotification(message: string, type: 'success' | 'error') {
    this.notification = { message, type, show: true };
    setTimeout(() => {
      this.notification.show = false;
    }, TOAST_TIMEOUT);
  }

  toggleHelpText() {
    this.helpTextEnabled = !this.helpTextEnabled;
    localStorage.setItem('helpTextEnabled', String(this.helpTextEnabled));
  }

  goToLanding() {
    window.location.pathname = '/';
  }

  async clearClientCache() {
    try {
      // Store settings before clearing
      const settings = localStorage.getItem('settings');
      const settingsForceReset = localStorage.getItem('settings_force_reset');
      
      // Clear local cache
      localStorage.clear();
      sessionStorage.clear();
      
      // Restore settings
      if (settings) {
        localStorage.setItem('settings', settings);
      }
      if (settingsForceReset) {
        localStorage.setItem('settings_force_reset', settingsForceReset);
      }
      
      console.log('Client cache cleared successfully');
      this.showNotification('Client cache cleared successfully', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to clear client cache:', error);
      this.showNotification('Failed to clear client cache', 'error');
    }
  }

  async clearServerCache() {
    try {
      // Clear server cache
      await firstValueFrom(this.http.delete(`${this.dataApiService.serverURL}/api/cache`));
      console.log('Server cache cleared successfully');
      this.showNotification('Server cache cleared successfully', 'success');
    } catch (error) {
      console.error('Failed to clear server cache:', error);
      this.showNotification('Failed to clear server cache', 'error');
    }
  }

  async clearBothCaches() {
    await this.patientService.clearBothCaches();
  }

  async clearClientSettings() {
    try {
      // Clear settings by removing them from localStorage
      localStorage.removeItem('settings');
      localStorage.removeItem('settings_force_reset');
      
      // Reset the settings service to defaults
      this.settingsService.forceResetToDefaults();
      
      console.log('Client settings cleared successfully');
      this.showNotification('Client settings cleared successfully', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to clear client settings:', error);
      this.showNotification('Failed to clear client settings', 'error');
    }
  }

  resetDashboard() {
    this.showResetPopup = true;
  }

  async confirmReset() {
    this.showResetPopup = false;
    
    try {
      // Call the reset API
      await firstValueFrom(this.http.post(`${this.dataApiService.serverURL}/api/reset`, {}));
      console.log('Dashboard reset successfully');
      this.showNotification('Dashboard reset successfully', 'success');
      
      // Clear client cache and reload after a delay
      setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Failed to reset dashboard:', error);
      this.showNotification('Failed to reset dashboard', 'error');
    }
  }

  cancelReset() {
    this.showResetPopup = false;
  }

  // Legacy method for backward compatibility
  async clearCache() {
    await this.clearBothCaches();
  }
} 