import { Routes } from '@angular/router';
import { BrowserComponent } from './browser-component/browser-component';
import { SettingsComponent } from './settings/settings.component';
import { PatientListComponent } from './patient-list/patient-list.component';
import { PatientDetailComponent } from './patient-detail/patient-detail.component';
import { AdministerComponent } from './administer/administer.component';

export const routes: Routes = [
    {
        path: '',
        component: PatientListComponent
    },
    { path: 'patient/:id', component: PatientDetailComponent },
    { path: 'patient/:id/administer', component: AdministerComponent },
    { path: 'patient/:id/administer-immunization', component: AdministerComponent },
    { path: 'patient/:id/administer-medication', component: AdministerComponent },
    { path: 'settings', component: SettingsComponent },
];
