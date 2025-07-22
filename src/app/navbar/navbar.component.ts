import { Component, effect } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SettingsService } from '../settings/settings.service';
import { CommonModule } from '@angular/common';

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

  constructor(public settingsService: SettingsService) {
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

  clearCache() {
    localStorage.clear();
    window.location.reload();
  }
} 