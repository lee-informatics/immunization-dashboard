// Author: Preston Lee

import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ToastrService } from 'ngx-toastr';

import { SettingsService } from './settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [FormsModule]
})
export class SettingsComponent implements OnInit {

  constructor(protected toastrService: ToastrService, protected settingsService: SettingsService) {
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.settingsService.reload();
  }

  save() {
    this.settingsService.saveSettings();
    this.toastrService.success("Settings are local to your browser only.", "Settings Saved")
  }

  restore() {
    this.settingsService.forceResetToDefaults();
    this.toastrService.success("All settings have been restored to their defaults.", "Settings Restored")

  }

}
