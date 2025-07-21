import { Routes } from '@angular/router';
import { BrowserComponent } from './browser-component/browser-component';
import { SettingsComponent } from './settings/settings.component';

export const routes: Routes = [
    {
        path: '',
        component: BrowserComponent
    },
    { path: 'settings', component: SettingsComponent },
];
