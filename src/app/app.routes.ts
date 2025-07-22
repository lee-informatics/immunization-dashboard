import { Routes } from '@angular/router';
import { BrowserComponent } from './browser-component/browser-component';
import { SettingsComponent } from './settings/settings.component';
import { PatientListComponent } from './patient-list/patient-list.component';
import { PatientDetailComponent } from './patient-detail/patient-detail.component';

export const routes: Routes = [
    {
        path: '',
        component: PatientListComponent
    },
    { path: 'patient/:id', component: PatientDetailComponent },
    { path: 'settings', component: SettingsComponent },
];
