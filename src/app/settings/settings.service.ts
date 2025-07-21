// Author: Preston Lee

import { Injectable, OnInit } from '@angular/core';
import { Settings } from './settings';

@Injectable({
  providedIn: 'root'
}) export class SettingsService {

  public static SETTINGS_KEY: string = "settings";
  public static FORCE_RESET_KEY: string = "settings_force_reset";

  public settings: Settings = new Settings();
  public force_reset: boolean = false;


  constructor() {
    this.reload();
  }

  reload() {
    this.force_reset = (localStorage.getItem(SettingsService.FORCE_RESET_KEY) == 'true' ? true : false);
    if (this.force_reset) {
      this.forceResetToDefaults();
    }
    let tmp = localStorage.getItem(SettingsService.SETTINGS_KEY);
    if (tmp) {
      try {
        this.settings = JSON.parse(tmp)
      } catch (e) {
        console.log("Settings could not be parsed and are likely not valid JSON. They will be ignored.");
        console.log(e);
      }
    } else {
      this.settings = new Settings();
    }
  }

  forceResetToDefaults() {
    localStorage.clear();
    this.settings = new Settings();
    this.force_reset = false;
    this.saveSettings();
    this.reload();
    console.log("All application settings have been restored to their defaults.");
  }

  saveSettings() {
    localStorage.setItem(SettingsService.SETTINGS_KEY, JSON.stringify(this.settings));
    console.log("Your settings have been saved to local browser storage on this device. They will not be sync'd to any other system, even if your browser supports such features.");
  }

  // clearLocalStorage() {
  //   localStorage.clear();
  //   this.forceResetToDefaults();
  //   this.reload();
  //   console.log("All application settings have been restored to their defaults.");
  // }

}
