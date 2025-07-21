// Author: Preston Lee

import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SettingsService } from './settings/settings.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('immunization-dashboard');

  settings(): SettingsService { return this.settingsService; }

  constructor(protected http: HttpClient, protected settingsService: SettingsService) {
    console.log("AppComponent has been initialized to establish router element.");
  }


}
